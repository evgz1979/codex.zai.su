// Изолированный сервер только для браузерных тестов: временная БД и синтетические сообщения.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../backend/storage/store.js';
import { passwordHash } from '../backend/auth/auth.js';
import { MessengerService } from '../backend/core/service.js';
import { createApp } from '../backend/http.js';
import { clientDirectory } from '../backend/config.js';
import { TestAdapter } from './fixtures.js';
const dir = mkdtempSync(join(tmpdir(),'zai-messenger-browser-'));
const store = new Store(dir);
await store.set('password',await passwordHash('browser-test-password'));
const a = new TestAdapter('fixture-a','Telegram');
const b = new TestAdapter('fixture-b','Другой источник · тест');
b.conversations = b.conversations.slice(0,1); b.conversations[0].title = 'Мария · другой источник';
b.messages = b.messages.slice(0,1); b.messages[0].text = 'Это синтетическое сообщение из другого источника.';
b.messages[0].date = '2026-11-07T10:01:30.000Z';
const service = new MessengerService([a,b],store); await service.refresh();
const server = createApp({ store,service,clientDirectory,origin:'http://127.0.0.1:14318' });
server.listen(14318,'127.0.0.1');
function stop() { server.closeAllConnections(); server.close(() => { store.close(); rmSync(dir,{recursive:true,force:true}); }); }
process.on('SIGTERM',stop); process.on('SIGINT',stop);
