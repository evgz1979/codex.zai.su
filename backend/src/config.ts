import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const root = process.cwd();
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT должен быть от 1024 до 65535');
export const config = {
  port,
  host: '127.0.0.1' as const,
  codexBin: process.env.CODEX_BIN || 'codex',
  model: process.env.CODEX_MODEL || undefined,
  dataDir: resolve(root, process.env.DATA_DIR || '.local'),
  frontendDir: resolve(root, 'frontend/dist'),
};
