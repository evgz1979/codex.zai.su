import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { ChatService, HttpError } from './chat-service.js';

export function checkLocalRequest(req: Pick<IncomingMessage, 'headers'>, port: number) {
  if (req.headers.host !== `127.0.0.1:${port}`) throw new HttpError(403, 'Недопустимый Host. Используйте 127.0.0.1.');
  const origin = req.headers.origin;
  if (origin && ![`http://127.0.0.1:${port}`, 'http://127.0.0.1:5173'].includes(origin)) throw new HttpError(403, 'Доступ с этого Origin запрещён.');
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Межсайтовый доступ запрещён.');
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Ожидается application/json.');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > 65_536) throw new HttpError(413, 'Слишком большой запрос.');
  }
  try {
    const value = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, 'Некорректный JSON.'); }
}
export function createHttpServer(service: ChatService, options: { port: number; frontendDir: string; instanceId?: string }) {
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      checkLocalRequest(req, options.port);
      const url = new URL(req.url || '/', `http://127.0.0.1:${options.port}`);
      const path = url.pathname;
      if (req.method === 'GET' && path === '/api/health') {
        json(res, service.rpc.connected ? 200 : 503, { status: service.rpc.connected ? 'ok' : 'error', codex: service.rpc.connected ? 'connected' : 'disconnected', sandbox: 'read-only', model: service.model, instanceId: options.instanceId, ...(service.rpc.lastError ? { error: service.rpc.lastError } : {}) }); return;
      }
      if (path === '/api/threads' && req.method === 'GET') { json(res, 200, service.store.list()); return; }
      if (path === '/api/threads' && req.method === 'POST') { await body(req); json(res, 201, await service.create()); return; }
      const match = path.match(/^\/api\/threads\/([a-zA-Z0-9_-]{1,100})(?:\/(events|messages|interrupt|older))?$/);
      if (match) {
        const [, id, action] = match;
        service.assertOwned(id);
        if (!action && req.method === 'GET') { json(res, 200, await service.open(id)); return; }
        if (action === 'events' && req.method === 'GET') {
          const snapshot = await service.open(id);
          if (res.destroyed) return;
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
          const write = (value: unknown) => {
            if (!res.destroyed && !res.write(`event: snapshot\ndata: ${JSON.stringify(value)}\n\n`) && res.writableLength > 1_000_000) res.destroy();
          };
          write(snapshot);
          const onChange = (threadId: string, value: unknown) => { if (id === threadId) write(value); };
          service.on('change', onChange);
          const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
          res.on('close', () => { clearInterval(heartbeat); service.off('change', onChange); });
          return;
        }
        if (req.method === 'POST') {
          const value = await body(req);
          if (action === 'messages') {
            if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 16_000) throw new HttpError(400, 'Введите от 1 до 16000 символов.');
            json(res, 202, await service.send(id, value.text.trim())); return;
          }
          if (action === 'interrupt') { json(res, 200, await service.interrupt(id)); return; }
          if (action === 'older') { json(res, 200, await service.older(id)); return; }
        }
      }
      if (path.startsWith('/api/')) throw new HttpError(404, 'Эндпоинт не найден.');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Метод не поддерживается.');
      const root = resolve(options.frontendDir);
      let file = resolve(root, `.${decodeURIComponent(path)}`);
      if (file !== root && !file.startsWith(root + sep)) throw new HttpError(403, 'Путь запрещён.');
      try { if (!(await stat(file)).isFile()) file = resolve(root, 'index.html'); }
      catch { file = resolve(root, 'index.html'); }
      const content = await readFile(file).catch(() => { throw new HttpError(503, 'Frontend не собран. Выполните npm run build или откройте Vite на 127.0.0.1:5173.'); });
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      json(res, e instanceof HttpError ? e.statusCode : 500, { error: e instanceof Error ? e.message : 'Внутренняя ошибка.' });
    }
  });
  server.requestTimeout = 70_000;
  return server;
}
