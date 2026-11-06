import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
try {
  const pid = Number(readFileSync(`${root}.local/server.pid`,'utf8'));
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error();
  const command = execFileSync('/bin/ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).trim();
  if (!command.includes(`${root}dist/server/backend/index.js`)) throw new Error();
  process.kill(pid,'SIGTERM');
  console.log('Локальный Messenger остановлен.');
} catch { console.log('Запущенный Messenger с подтверждённым PID не найден.'); }
