import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Auth, AuthError } from './auth/auth.js';
import { AppError, type MessengerService } from './core/service.js';
import type { Store } from './storage/store.js';
import type { SendRequest } from '../shared/types.js';

export function createApp(options: { service: MessengerService; store: Store; clientDirectory: string; origin: string }) {
  const auth = new Auth(options.store);
  const root = resolve(options.clientDirectory);
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new AppError(415, 'Ожидается JSON.');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 20000) throw new AppError(413, 'Запрос слишком большой.');
      chunks.push(chunk);
    }
    try {
      const result = JSON.parse(Buffer.concat(chunks).toString());
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
      return result;
    } catch { throw new AppError(400, 'Некорректный запрос.'); }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
    try {
      // Защита от DNS rebinding; локальная версия намеренно не доверяет proxy-заголовкам.
      if (req.headers.host !== new URL(options.origin).host) throw new AppError(403, 'Недопустимый адрес сервера.');
      const url = new URL(req.url ?? '/', options.origin);
      const path = url.pathname;
      if (!['GET', 'POST'].includes(req.method ?? '')) throw new AppError(405, 'Метод недоступен.');
      if (req.method === 'POST' && req.headers.origin !== options.origin) throw new AppError(403, 'Недопустимый источник запроса.');
      if (path === '/api/session' && req.method === 'GET') {
        const session = auth.session(req.headers.cookie);
        return send(res, 200, { authenticated: !!session, setupRequired: auth.setupRequired, ...(session ? { csrfToken: session.csrf } : {}) });
      }
      if (path === '/api/login' && req.method === 'POST') {
        const input = await body(req);
        if (typeof input.password !== 'string' || input.password.length > 512) throw new AppError(400, 'Введите пароль.');
        const login = await auth.login(input.password);
        auth.logout(req.headers.cookie);
        res.setHeader('Set-Cookie', `zai_session=${login.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        return send(res, 200, { authenticated: true, setupRequired: false, csrfToken: login.csrf });
      }
      if (path.startsWith('/api/')) {
        const session = auth.session(req.headers.cookie);
        if (!session) throw new AppError(401, 'Войдите в приложение.');
        if (req.method === 'POST' && req.headers['x-csrf-token'] !== session.csrf) throw new AppError(403, 'Обновите страницу и повторите вход.');
        if (path === '/api/logout' && req.method === 'POST') {
          auth.logout(req.headers.cookie);
          res.setHeader('Set-Cookie', 'zai_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
          return send(res, 200, { ok: true });
        }
        if (path === '/api/snapshot' && req.method === 'GET') return send(res, 200, options.service.snapshot());
        if (path === '/api/refresh' && req.method === 'POST') return send(res, 200, await options.service.refresh());
        if (path === '/api/open' && req.method === 'POST') {
          const input = await body(req);
          if (typeof input.conversationId !== 'string') throw new AppError(400, 'Выберите диалог.');
          return send(res, 200, await options.service.open(input.conversationId));
        }
        if (path === '/api/read' && req.method === 'POST') {
          const input = await body(req);
          if (typeof input.conversationId !== 'string') throw new AppError(400, 'Выберите диалог.');
          return send(res, 200, await options.service.markRead(input.conversationId));
        }
        if (path === '/api/send' && req.method === 'POST') return send(res, 200, await options.service.send(await body(req) as unknown as SendRequest));
        throw new AppError(404, 'Адрес не найден.');
      }
      if (req.method !== 'GET') throw new AppError(405, 'Метод недоступен.');
      const asset = path === '/' ? '/index.html' : decodeURIComponent(path);
      const file = resolve(root, `.${asset}`);
      if (!file.startsWith(root + sep) || !['.html', '.js', '.css', '.svg', '.ico'].includes(extname(file))) throw new AppError(404, 'Файл не найден.');
      let bytes: Buffer;
      try { bytes = await readFile(file); } catch { throw new AppError(404, 'Сначала выполните сборку messenger.'); }
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
      res.writeHead(200, { 'Content-Type': mime[extname(file)] });
      res.end(bytes);
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error instanceof AppError || error instanceof AuthError) return send(res, error.status, { error: error.message });
      // Никогда не сериализовать исключения провайдера, запросы и содержимое переписки.
      send(res, 503, { error: 'Операция недоступна. Проверьте подключение и повторите вручную.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
