import {Accounts} from './accounts.js';
import { createApp } from './http.js';
import { dataDirectory, clientDirectory, origin, port } from './config.js';
import { writePrivate } from './storage/private-files.js';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
process.umask(0o077);
const accounts=new Accounts(dataDirectory,origin);
if (process.env.NODE_ENV==='production' && !accounts.owner.runtime.auth.ready()) throw new Error('Passwords must be provisioned before publication');
const server = createApp({ ...accounts.owner.runtime, accounts, clientDirectory, origin });
server.listen(port, '127.0.0.1', () => {
  accounts.start();
  writePrivate(join(dataDirectory,'server.pid'),String(process.pid));
  console.log(`Z AI Messenger: ${origin}`);
});
server.on('error', () => { console.error('Не удалось запустить Messenger. Проверьте, свободен ли порт 4318.'); process.exitCode = 1; });
let stopping = false;
//: Завершает локальный сервер, адаптеры и SQLite.
//: Повторный сигнал игнорируется; PID-файл удаляется после закрытия хранилища.
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await accounts.stop();
  try { unlinkSync(join(dataDirectory,'server.pid')); } catch { /* Уже удалён. */ }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('uncaughtException', () => { console.error('Сервер остановлен из-за внутренней ошибки.'); process.exit(1); });
process.on('unhandledRejection', () => { console.error('Операция прервана из-за внутренней ошибки.'); process.exit(1); });
