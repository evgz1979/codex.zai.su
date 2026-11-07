import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { get } from 'node:http';
import { Store } from '../backend/storage/store.js';
import { passwordHash } from '../backend/auth/auth.js';
import { MessengerService } from '../backend/core/service.js';
import { createApp } from '../backend/http.js';
import { TestAdapter } from './fixtures.js';
test('HTTP: вход, CSRF, Origin/Host, приватные API, безопасные ошибки и выход', async () => {
  const dir = mkdtempSync(join(tmpdir(),'zai-messenger-http-'));
  const store = new Store(dir); store.set('auth.chat',await passwordHash('test-password-only'));store.set('auth.admin',await passwordHash('admin-password-only'));
  const adapter = new TestAdapter(); store.select(adapter.conversations.map(c=>c.id));const service = new MessengerService([adapter],store);
  // Фиксированный тестовый порт, отдельный от реального приложения.
  const origin = 'http://127.0.0.1:14319';
  const server = createApp({ store,service,clientDirectory:dir,origin });
  await new Promise<void>(resolve => server.listen(14319,'127.0.0.1',resolve));
  const request = (path: string, input?: unknown, headers: Record<string,string> = {}) => fetch(origin+path, { method:input === undefined ? 'GET':'POST', headers:{ ...(input === undefined ? {} : {'Content-Type':'application/json',Origin:origin}), ...headers }, ...(input === undefined ? {} : { body:JSON.stringify(input) }) });
  try {
    assert.equal((await request('/api/chat/snapshot')).status,401);
    assert.equal((await request('/api/chat/telegram/secrets')).status,401);
    const badHost = await new Promise<number | undefined>((resolve,reject) => {
      get(origin+'/api/chat/session',{headers:{Host:'evil.example'}},res => { res.resume(); resolve(res.statusCode); }).on('error',reject);
    });
    assert.equal(badHost,403);
    assert.equal((await request('/api/chat/login',{password:'test-password-only'},{Origin:'https://evil.example'})).status,403);
    const login = await request('/api/chat/login',{password:'test-password-only'});
    assert.equal(login.status,200);
    const cookie = login.headers.get('set-cookie')!;
    assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=Strict/);
    const info = await login.json() as { csrfToken:string };
    const headers = { Cookie:cookie.split(';')[0], 'X-CSRF-Token':info.csrfToken };
    assert.equal((await request('/api/chat/refresh',{}, {Cookie:headers.Cookie})).status,403);
    assert.equal((await request('/api/chat/refresh',{},headers)).status,200);
    const opened=await request('/api/chat/open',{conversationId:adapter.conversations[0].id},headers);assert.equal(opened.status,200);
    assert.equal((await opened.json() as {page:{messages:unknown[]}}).page.messages.length,1);
    const snapshot = await request('/api/chat/snapshot',undefined,headers);
    assert.equal(snapshot.headers.get('cache-control'),'no-store');
    assert.ok(snapshot.headers.get('content-security-policy')?.includes("connect-src 'self'"));
    assert.equal((await snapshot.json() as {messages:unknown[]}).messages.length,1);
    assert.equal((await request('/api/chat/send',[],headers)).status,400);
    assert.equal((await request('/api/chat/send',{text:'x'.repeat(21000)},headers)).status,413);
    assert.equal((await request('/api/chat/older',{conversationId:adapter.conversations[0].id},headers)).status,400);
    assert.equal((await request('/api/chat/older',{conversationId:adapter.conversations[0].id,before:'x'},{Cookie:headers.Cookie})).status,403);
    adapter.fail = true;
    const error = await request('/api/chat/refresh',{},headers);
    assert.equal(error.status,503); assert.ok(!(await error.text()).includes('PRIVATE_PROVIDER_ERROR'));
    assert.equal((await request('/api/admin/status',undefined,headers)).status,401);
    assert.equal((await request('/api/admin/dialogs',undefined,headers)).status,401);
    assert.equal((await request('/api/chat/logout',{},headers)).status,200);
    assert.equal((await request('/api/chat/snapshot',undefined,headers)).status,401);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    store.close(); rmSync(dir,{recursive:true,force:true});
  }
});
