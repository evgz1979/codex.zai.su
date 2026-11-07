import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Store } from '../storage/store.js';
const scrypt = promisify(scryptCallback);
//: Создаёт scrypt-хеш пароля со случайной солью.
//: Возвращает salt:hexHash и не сохраняет исходный пароль.
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(32).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
//: Сравнивает введённый пароль с сохранённым scrypt-хешем.
//: Результаты одинаковой длины сравниваются timingSafeEqual.
export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(':');
  const hash = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}
//: Вычисляет SHA-256 представление cookie-токена.
//: Сырой токен не используется как ключ серверной карты сессий.
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
//: Описывает серверную веб-сессию.
//: CSRF и абсолютный срок действия находятся только в памяти процесса.
interface WebSession { csrf: string; expires: number }
//: Управляет веб-входом одного владельца и сессиями в памяти.
//: Секреты Telegram не участвуют в веб-авторизации.
export class Auth {
  private sessions = new Map<string, WebSession>();
  private attempts: number[] = [];
  //: Подключает хранилище настроек авторизации.
  //: Существующие веб-сессии не восстанавливаются из SQLite.
  constructor(private store: Store) {}
  //: Проверяет наличие хеша пароля в настройках.
  //: Отсутствующий password означает необходимость локального setup.
  get setupRequired() { return !this.store.get('password'); }
  //: Находит действующую сессию по cookie.
  //: Истёкшая сессия удаляется; неизвестный токен не авторизует запрос.
  session(cookie = ''): WebSession | undefined {
    const token = /(?:^|;\s*)zai_session=([a-f0-9]{64})(?:;|$)/.exec(cookie)?.[1];
    if (!token) return undefined;
    const session = this.sessions.get(digest(token));
    if (session && session.expires > Date.now()) return session;
    this.sessions.delete(digest(token));
  }
  //: Проверяет пароль и создаёт ограниченную веб-сессию.
  //: Допускает пять попыток за минуту и не более десяти сессий в памяти.
  async login(password: string) {
    const now = Date.now();
    this.attempts = this.attempts.filter(t => now - t < 60000);
    if (this.attempts.length >= 5) throw new AuthError(429, 'Слишком много попыток. Подождите минуту.');
    this.attempts.push(now);
    const stored = this.store.get('password');
    if (!stored || !await passwordMatches(password, stored)) throw new AuthError(401, 'Неверный пароль.');
    for (const [key, session] of this.sessions) if (session.expires <= now) this.sessions.delete(key);
    if (this.sessions.size >= 10) this.sessions.delete(this.sessions.keys().next().value!);
    const token = randomBytes(32).toString('hex');
    const session = { csrf: randomBytes(32).toString('hex'), expires: now + 8 * 3600000 };
    this.sessions.set(digest(token), session);
    return { token, ...session };
  }
  //: Отзывает сессию текущего cookie-токена.
  //: Не завершает Telegram-сессию и не очищает кеш переписки.
  logout(cookie = '') {
    const token = /zai_session=([a-f0-9]{64})/.exec(cookie)?.[1];
    if (token) this.sessions.delete(digest(token));
  }
}
//: Передаёт безопасную ошибку веб-авторизации HTTP-обработчику.
//: Хранит только HTTP-статус и текст для пользователя.
export class AuthError extends Error {
  //: Создаёт ошибку авторизации с HTTP-статусом.
  //: Исходные исключения провайдера в неё не добавляются.
  constructor(public status: number, message: string) { super(message); } }
