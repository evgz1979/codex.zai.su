import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
// Скомпилированный файл находится в dist/server/backend, исходник — в backend.
const compiled = import.meta.url.includes('/dist/server/');
export const moduleRoot = fileURLToPath(new URL(compiled ? '../../../' : '../', import.meta.url));
export const dataDirectory = resolve(moduleRoot, '.local');
export const clientDirectory = resolve(moduleRoot, 'dist/client');
export const port = 4318;
export const origin = `http://127.0.0.1:${port}`;
