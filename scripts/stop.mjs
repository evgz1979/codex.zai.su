import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
try {
  const runtime = JSON.parse(await readFile(resolve(process.env.DATA_DIR || '.local', 'runtime.json'), 'utf8'));
  if (!Number.isInteger(runtime.pid) || runtime.pid <= 1 || !Number.isInteger(runtime.port) || runtime.port < 1024 || runtime.port > 65535 || typeof runtime.instanceId !== 'string') throw new Error('Некорректный файл состояния запуска.');
  const response = await fetch(`http://127.0.0.1:${runtime.port}/api/health`, { signal: AbortSignal.timeout(3000) });
  const health = await response.json();
  if (health.instanceId !== runtime.instanceId) throw new Error('На порту другое приложение; остановка отменена.');
  process.kill(runtime.pid, 'SIGTERM');
  console.log('Codex Z AI: отправлен сигнал корректной остановки.');
} catch (error) {
  if (error.code === 'ENOENT') console.log('Нет запущенного экземпляра Codex Z AI.');
  else { console.error(`Остановка не выполнена: ${error.message}`); process.exitCode = 1; }
}
