import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConversationStore } from '../src/store.js';
import { applyNotification, emptySnapshot } from '../src/state.js';
import { checkLocalRequest } from '../src/http.js';

test('потоковый ответ не дублируется после completed; interrupt очищает активный turn', () => {
  const state = emptySnapshot('own-thread');
  applyNotification(state, 'turn/started', { turn: { id: 'turn1' } });
  applyNotification(state, 'item/agentMessage/delta', { itemId: 'answer1', delta: 'При' });
  applyNotification(state, 'item/agentMessage/delta', { itemId: 'answer1', delta: 'вет' });
  assert.equal(state.messages[0].text, 'Привет');
  applyNotification(state, 'item/completed', { item: { id: 'answer1', type: 'agentMessage', text: 'Привет' } });
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].text, 'Привет');
  applyNotification(state, 'turn/completed', { turn: { status: 'interrupted', items: [] } });
  assert.equal(state.activeTurnId, null);
  assert.equal(state.status, 'ready');
  assert.match(state.notice!, /остановлен/);
});
test('команды отделены от чата и вывод ограничен; reasoning не отправляется', () => {
  const state = emptySnapshot('own-thread');
  applyNotification(state, 'item/started', { item: { id: 'cmd1', type: 'commandExecution', command: 'pwd', status: 'inProgress' } });
  applyNotification(state, 'item/commandExecution/outputDelta', { itemId: 'cmd1', delta: 'x'.repeat(50_000) });
  applyNotification(state, 'item/completed', { item: { id: 'reason1', type: 'reasoning', content: ['private'] } });
  assert.equal(state.messages.length, 0);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].detail.length, 32_000);
});
test('проверки Host, Origin и cross-site защищают loopback API', () => {
  assert.doesNotThrow(() => checkLocalRequest({ headers: { host: '127.0.0.1:3001' } }, 3001));
  for (const headers of [
    { host: 'attacker.test:3001' },
    { host: '127.0.0.1:3001', origin: 'https://attacker.test' },
    { host: '127.0.0.1:3001', 'sec-fetch-site': 'cross-site' },
  ]) assert.throws(() => checkLocalRequest({ headers }, 3001), /Host|Origin|Межсайтовый/);
});
test('индекс восстанавливается с диска и сохраняет параллельные обновления атомарно', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-z-ai-store-'));
  try {
    const store = new ConversationStore(dir); await store.init();
    await Promise.all([1, 2, 3].map((n) => store.put({ id: `own-${n}`, title: `Диалог ${n}`, createdAt: n, updatedAt: n })));
    const restored = new ConversationStore(dir); await restored.init();
    assert.deepEqual(restored.list().map((e) => e.id), ['own-3', 'own-2', 'own-1']);
    assert.equal(restored.get('foreign-thread'), undefined);
    assert.equal(JSON.parse(await readFile(join(dir, 'conversations.json'), 'utf8')).length, 3);
  } finally { await rm(dir, { recursive: true }); }
});
