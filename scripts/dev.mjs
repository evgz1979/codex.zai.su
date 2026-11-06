import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const commands = [
  ['node_modules/tsx/dist/cli.mjs', 'watch', 'backend/src/index.ts'],
  ['node_modules/vite/bin/vite.js', '--config', 'frontend/vite.config.ts'],
];
const children = commands.map((args) => spawn(process.execPath, args.map((arg, i) => i === 0 ? resolve(arg) : arg), { stdio: 'inherit', detached: true }));
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  setTimeout(() => {
    for (const child of children) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    process.exit(code);
  }, 5000).unref();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code || 0));
}
