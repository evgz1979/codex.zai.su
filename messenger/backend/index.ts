import { Store } from './storage/store.js';
import { SecretVault } from './storage/private-files.js';
import { TelegramAdapter } from './connectors/telegram/adapter.js';
import { AdminService } from './admin/service.js';
import { Auth } from './auth/auth.js';
import { MessengerService } from './core/service.js';
import { createApp } from './http.js';
import { dataDirectory, clientDirectory, origin, port } from './config.js';
import { writePrivate } from './storage/private-files.js';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
process.umask(0o077);
const store = new Store(dataDirectory);
const vault = new SecretVault(dataDirectory);
const telegram = new TelegramAdapter(vault);
const service = new MessengerService([telegram], store);
const admin = new AdminService(service,telegram,vault,store);
if (process.env.NODE_ENV==='production' && !new Auth(store).ready()) throw new Error('Passwords must be provisioned before publication');
const server = createApp({ store, service, admin, clientDirectory, origin });
server.listen(port, '127.0.0.1', () => {
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
  await admin.close();
  await service.disconnect();
  store.close();
  try { unlinkSync(join(dataDirectory,'server.pid')); } catch { /* Уже удалён. */ }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('uncaughtException', () => { console.error('Сервер остановлен из-за внутренней ошибки.'); process.exit(1); });
process.on('unhandledRejection', () => { console.error('Операция прервана из-за внутренней ошибки.'); process.exit(1); });
