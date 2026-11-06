import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../backend/storage/store.js';
import { SecretVault } from '../backend/storage/private-files.js';
import { MessengerService } from '../backend/core/service.js';
import { Auth, passwordHash, passwordMatches } from '../backend/auth/auth.js';
import { destinationFor, entityId, LIMITS } from '../shared/types.js';
import { TestAdapter } from './fixtures.js';

function context(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), 'zai-messenger-test-'));
  const store = new Store(dir);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, store };
}
test('идентификаторы не конфликтуют между источниками, типами и строками', () => {
  assert.notEqual(entityId('a','message','1'), entityId('b','message','1'));
  assert.notEqual(entityId('a','message','1'), entityId('a','conversation','1'));
  assert.notEqual(entityId('a:b','message','1'), entityId('a','b:message','1'));
});
test('единая лента объединяет источники и сохраняет хронологию', async t => {
  const { store } = context(t);
  const a = new TestAdapter('a'), b = new TestAdapter('b');
  const service = new MessengerService([a,b],store);
  const result = await service.refresh();
  assert.equal(result.conversations.length, 6);
  assert.equal(new Set(result.messages.map(m => m.id)).size, 6);
  assert.deepEqual(result.messages.map(m => m.date), result.messages.map(m => m.date).sort());
  assert.ok(a.calls.every(n => n <= LIMITS.messagesPerConversation));
  assert.equal(a.reads.length,0);
});
test('отправка проверяет весь маршрут; повтор HTTP не дублирует отправку', async t => {
  const { store } = context(t);
  const a = new TestAdapter('a'), b = new TestAdapter('b');
  const service = new MessengerService([a,b],store);
  await service.refresh();
  const destination = destinationFor(a.conversations[0]);
  const request = { destination, text: '**буквальный текст**', requestId: '12345678-12345678' };
  for (const wrong of [{ ...destination, sourceId:'b' }, { ...destination, recipientId: b.conversations[0].recipient.id }]) {
    assert.throws(() => service.send({ ...request, destination:wrong }), /Адресат/);
  }
  assert.throws(() => service.send({ ...request, text:' ' }), /текст/);
  assert.throws(() => service.send({ ...request, text:'x'.repeat(4097) }), /текст/);
  const [first,second] = await Promise.all([service.send(request),service.send(request)]);
  assert.equal(first.id, second.id);
  assert.equal(a.sent.length, 1); assert.equal(b.sent.length,0);
  assert.equal(first.text, request.text);
  assert.throws(() => service.send({ ...request, text:'Другой текст' }), /уже использован/);
});
test('ошибки провайдера не выходят наружу; повтор не отправляет заново', async t => {
  const { store } = context(t);
  const a = new TestAdapter(); const service = new MessengerService([a], store);
  await service.refresh(); a.fail = true;
  const request = { destination: destinationFor(a.conversations[0]), text:'test', requestId:'12345678-12345678' };
  await assert.rejects(service.send(request), /Результат отправки неизвестен/);
  await assert.rejects(service.send(request), /Результат отправки неизвестен/);
  await assert.rejects(service.refresh(), e => e instanceof Error && !e.message.includes('PRIVATE_PROVIDER_ERROR'));
  assert.equal(service.snapshot().stale,true);
});
test('открытие ограничено; непрочитанные сбрасываются только явным действием', async t => {
  const { store } = context(t); const a = new TestAdapter(); const service = new MessengerService([a],store);
  await service.refresh(); const c = a.conversations[0];
  await service.open(c.id); assert.equal(c.unreadCount,3); assert.equal(a.calls.at(-1),40);
  await service.markRead(c.id); assert.equal(service.snapshot().conversations.find(x => x.id === c.id)?.unreadCount,0); assert.deepEqual(a.reads,[c.id]);
});
test('SQLite ограничивает кеш и удаляет истёкший; приватные права и шифрование сессии', t => {
  const { store, dir } = context(t); const a = new TestAdapter();
  store.saveCache({ sources:[a.source], conversations:[], messages:Array.from({ length:600 },(_,i) => ({ ...a.messages[0], id:String(i) })), refreshedAt: new Date().toISOString(), stale:false });
  assert.equal(store.loadCache()?.messages.length,400);
  store.saveCache({ sources:[], conversations:[], messages:[], refreshedAt:'2020-01-01T00:00:00Z', stale:false });
  assert.equal(store.loadCache(),undefined);
  const vault = new SecretVault(dir);
  const credentials = { apiId:123, apiHash:'test-hash-only', session:'test-session-only' };
  vault.save(credentials); assert.deepEqual(vault.load(),credentials);
  assert.ok(!readFileSync(join(dir,'telegram.enc')).includes(Buffer.from(credentials.session)));
  assert.equal(statSync(dir).mode & 0o777,0o700);
  for (const file of ['vault.key','telegram.enc','messenger.sqlite']) assert.equal(statSync(join(dir,file)).mode & 0o777,0o600);
});
test('пароль хешируется; сессии отзываются; перебор ограничен', async t => {
  const { store } = context(t); const auth = new Auth(store);
  assert.equal(auth.setupRequired,true);
  const hash = await passwordHash('test-password-only');
  assert.ok(!hash.includes('test-password-only')); assert.ok(await passwordMatches('test-password-only',hash));
  assert.ok(!await passwordMatches('wrong',hash));
  store.set('password',hash);
  const login = await auth.login('test-password-only');
  assert.equal(auth.session(`zai_session=${login.token}`)?.csrf,login.csrf);
  auth.logout(`zai_session=${login.token}`); assert.equal(auth.session(`zai_session=${login.token}`),undefined);
  for (let i=0;i<4;i++) await assert.rejects(auth.login('wrong'),/Неверный/);
  await assert.rejects(auth.login('wrong'),/Слишком много/);
});
