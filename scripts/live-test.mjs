import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base = process.env.TEST_URL || 'http://127.0.0.1:3001';
const mode = process.argv[2] || 'create';
const file = '.local/live-test.json';
async function request(path, body) {
  const response = await fetch(`${base}/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result)); return result;
}
assert.equal((await request('/health')).codex, 'connected');
let id, word;
if (mode === 'create') {
  id = (await request('/threads', {})).id;
  word = `СЕВЕР-${Math.floor(Math.random() * 900000 + 100000)}`;
  await mkdir('.local', { recursive: true });
  await writeFile(file, JSON.stringify({ id, word }), { mode: 0o600 });
} else ({ id, word } = JSON.parse(await readFile(file, 'utf8')));
assert.ok((await request('/threads')).some((t) => t.id === id));
const before = await request(`/threads/${id}`);
if (mode === 'resume') assert.ok(before.messages.some((m) => m.text.includes(word)), 'История должна восстановиться с диска');
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 180_000);
let snapshots = 0, streamed = false, started = false;
const stream = await fetch(`${base}/api/threads/${id}/events`, { signal: controller.signal });
assert.equal(stream.status, 200);
const done = (async () => {
  let buffer = '';
  for await (const bytes of stream.body) {
    buffer += new TextDecoder().decode(bytes, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      const data = block.split('\n').find((l) => l.startsWith('data: '));
      if (!data) continue;
      const s = JSON.parse(data.slice(6)); snapshots++;
      if (s.activeTurnId) { started = true; if (s.messages.some((m) => m.role === 'assistant' && m.text)) streamed = true; }
      if (started && !s.activeTurnId) {
        assert.notEqual(s.status, 'error', s.error);
        const answer = s.messages.filter((m) => m.role === 'assistant').at(-1)?.text || '';
        assert.ok(answer.includes(word), 'Настоящий ответ Codex должен содержать кодовое слово из контекста');
        console.log(JSON.stringify({ mode, id, historyMessages: s.messages.length, snapshots, streamed, realAnswer: answer }));
        return;
      }
    }
  }
  throw new Error('Поток завершён без turn/completed');
})();
try {
  await request(`/threads/${id}/messages`, { text: mode === 'create' ? `Запомни кодовое слово ${word} в этом диалоге. Ответь только этим кодовым словом. Не используй инструменты.` : 'Какое кодовое слово я просил запомнить? Ответь только им. Не используй инструменты.' });
  await done;
} finally { clearTimeout(timeout); controller.abort(); }
