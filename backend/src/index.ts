import { config } from './config.js';
import { AppServer } from './app-server.js';
import { ConversationStore } from './store.js';
import { ChatService } from './chat-service.js';
import { createHttpServer } from './http.js';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const rpc = new AppServer(config.codexBin, config.dataDir);
const service = new ChatService(rpc, new ConversationStore(config.dataDir), config.dataDir, config.model);
await service.init();
const instanceId = randomUUID();
const runtimeFile = join(config.dataDir, 'runtime.json');
const server = createHttpServer(service, { ...config, instanceId });
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? `Порт ${config.port} занят. Остановите предыдущий экземпляр.` : `Ошибка HTTP: ${error.code}`);
  void shutdown(1);
});
server.listen(config.port, config.host, () => {
  void writeFile(runtimeFile, JSON.stringify({ pid: process.pid, port: config.port, instanceId }), { mode: 0o600 })
    .then(() => console.log(`Codex Z AI: http://${config.host}:${config.port}`))
    .catch(() => { console.error('Не удалось сохранить локальное состояние запуска.'); void shutdown(1); });
});
void rpc.start().then(() => console.log('Codex App Server подключён (read-only).')).catch(() => console.error('Codex недоступен. Откройте приложение для диагностики.'));
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(code), 5000);
  server.close();
  await service.stop();
  server.closeAllConnections();
  try {
    if (JSON.parse(await readFile(runtimeFile, 'utf8')).instanceId === instanceId) await unlink(runtimeFile);
  } catch { /* Another instance or no runtime file; never remove unrelated state. */ }
  clearTimeout(deadline);
  process.exit(code);
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
