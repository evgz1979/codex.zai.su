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
  const store = new Store(dir); store.set('password',await passwordHash('test-password-only'));
  const adapter = new TestAdapter(); const service = new MessengerService([adapter],store);
  // Фиксированный тестовый порт, отдельный от реального приложения.
  const origin = 'http://127.0.0.1:14319';
  const server = createApp({ store,service,clientDirectory:dir,origin });
  await new Promise<void>(resolve => server.listen(14319,'127.0.0.1',resolve));
  const request = (path: string, input?: unknown, headers: Record<string,string> = {}) => fetch(origin+path, { method:input === undefined ? 'GET':'POST', headers:{ ...(input === undefined ? {} : {'Content-Type':'application/json',Origin:origin}), ...headers }, ...(input === undefined ? {} : { body:JSON.stringify(input) }) });
  try {
    assert.equal((await request('/api/snapshot')).status,401);
    assert.equal((await request('/api/telegram/secrets')).status,401);
    const badHost = await new Promise<number | undefined>((resolve,reject) => {
      get(origin+'/api/session',{headers:{Host:'evil.example'}},res => { res.resume(); resolve(res.statusCode); }).on('error',reject);
    });
    assert.equal(badHost,403);
    assert.equal((await request('/api/login',{password:'test-password-only'},{Origin:'https://evil.example'})).status,403);
    const login = await request('/api/login',{password:'test-password-only'});
    assert.equal(login.status,200);
    const cookie = login.headers.get('set-cookie')!;
    assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=Strict/);
    const info = await login.json() as { csrfToken:string };
    const headers = { Cookie:cookie.split(';')[0], 'X-CSRF-Token':info.csrfToken };
    assert.equal((await request('/api/refresh',{}, {Cookie:headers.Cookie})).status,403);
    assert.equal((await request('/api/refresh',{},headers)).status,200);
    const snapshot = await request('/api/snapshot',undefined,headers);
    assert.equal(snapshot.headers.get('cache-control'),'no-store');
    assert.ok(snapshot.headers.get('content-security-policy')?.includes("connect-src 'self'"));
    assert.equal((await snapshot.json() as {messages:unknown[]}).messages.length,3);
    assert.equal((await request('/api/send',[],headers)).status,400);
    assert.equal((await request('/api/send',{text:'x'.repeat(21000)},headers)).status,413);
    adapter.fail = true;
    const error = await request('/api/refresh',{},headers);
    assert.equal(error.status,503); assert.ok(!(await error.text()).includes('PRIVATE_PROVIDER_ERROR'));
    assert.equal((await request('/api/logout',{},headers)).status,200);
    assert.equal((await request('/api/snapshot',undefined,headers)).status,401);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    store.close(); rmSync(dir,{recursive:true,force:true});
  }
});
