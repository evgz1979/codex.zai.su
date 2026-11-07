import { randomBytes, createHash } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import type { Store } from '../storage/store.js';
//: Разделяет административный и пользовательский доступ.
//: Cookie, пароли и ключи сессий не взаимозаменяемы.
export type Role = 'admin' | 'chat';
//: Создаёт Argon2id-хеш с ограниченной памятью для VPS.
//: Соль генерируется библиотекой, исходный пароль не сохраняется.
export async function passwordHash(password: string): Promise<string> {
  return hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 3, parallelism: 1 });
}
//: Проверяет только Argon2id-хеш пароля.
//: Старые scrypt-настройки не дают доступ к публичному приложению.
export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('$argon2id$')) return false;
  try { return await verify(stored, password); } catch { return false; }
}
//: Хеширует случайный токен веб-сессии.
//: Сырой cookie-токен не является ключом карты сессий.
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
//: Содержит роль, CSRF и абсолютный срок веб-сессии.
//: Сессия хранится только в памяти серверного процесса.
interface WebSession { csrf: string; expires: number; role: Role }
//: Разделяет права чата и админки на сервере.
//: Роли имеют независимые пароли, cookie и ограниченные сессии в памяти.
export class Auth {
  private sessions = new Map<string, WebSession>();
  private attempts: number[] = [];
  private verifying = false;
  //: Подключает SQLite для проверки Argon2id-настроек.
  //: Сырой пароль и cookie-токены в SQLite не записываются.
  constructor(private store: Store) {}
  //: Проверяет готовность обеих ролей.
  //: До начального задания паролей публичный вход заблокирован.
  get setupRequired() { return !this.ready(); }
  //: Проверяет наличие Argon2id-хешей admin и chat.
  //: Прежний локальный scrypt-пароль не разрешает публичный запуск.
  ready() { return ['admin','chat'].every(role => this.store.get(`auth.${role}`)?.startsWith('$argon2id$')); }
  //: Строит независимое имя cookie роли.
  //: В HTTPS используется обязательный Secure-префикс.
  cookieName(role: Role, secure: boolean) { return `${secure ? '__Secure-' : ''}zai_${role}`; }
  //: Извлекает cookie только указанной роли.
  //: Другие cookies и роли не дают токен этой сессии.
  token(cookie: string, role: Role, secure: boolean) {
    const name = this.cookieName(role,secure);
    return cookie.split(';').map(c => c.trim()).find(c => c.startsWith(name+'='))?.slice(name.length+1) || '';
  }
  //: Проверяет токен, роль и срок действия сессии.
  //: Перенос токена между именами cookie не меняет права.
  session(cookie = '', role: Role = 'chat', secure = false): WebSession | undefined {
    const token = this.token(cookie,role,secure);
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    const key = `${role}:${digest(token)}`;
    const session = this.sessions.get(key);
    if (session && session.role === role && session.expires > Date.now()) return session;
    this.sessions.delete(key);
  }
  //: Проверяет Argon2id-пароль и создаёт отдельную сессию роли.
  //: Ограничивает ошибки входа и параллельные хеширования для 1 vCPU.
  async login(password: string, role: Role = 'chat') {
    const now = Date.now();
    this.attempts = this.attempts.filter(t => now - t < 60000);
    if (this.attempts.length >= 5 || this.verifying) throw new AuthError(429,'Слишком много попыток. Подождите минуту.');
    this.attempts.push(now);
    if (!this.ready()) throw new AuthError(503,'Вход ещё не настроен на сервере.');
    this.verifying = true;
    try {
      const stored = this.store.get(`auth.${role}`)!;
      if (!await passwordMatches(password,stored)) throw new AuthError(401,'Неверный пароль.');
      this.attempts.pop();
      for (const [key,s] of this.sessions) if (s.expires <= now) this.sessions.delete(key);
      if (this.sessions.size >= 10) this.sessions.delete(this.sessions.keys().next().value!);
      const token = randomBytes(32).toString('hex');
      const session: WebSession = { csrf:randomBytes(32).toString('hex'), expires:now+8*3600000, role };
      this.sessions.set(`${role}:${digest(token)}`,session);
      return { token, ...session };
    } finally { this.verifying = false; }
  }
  //: Отзывает текущую сессию одной роли.
  //: Выход из чата не завершает административную сессию.
  logout(cookie = '', role: Role = 'chat', secure = false) {
    this.sessions.delete(`${role}:${digest(this.token(cookie,role,secure))}`);
  }
  //: Отзывает все веб-сессии выбранной роли.
  //: Вызывается после изменения её пароля.
  revoke(role: Role) { for (const [key,s] of this.sessions) if (s.role === role) this.sessions.delete(key); }
}
//: Передаёт безопасный статус ошибки авторизации.
//: Не содержит пароль, cookie или исходное исключение.
export class AuthError extends Error {
  //: Создаёт безопасную ошибку входа с HTTP-статусом.
  //: Внутренние исключения и реквизиты в ответ не включаются.
  constructor(public status: number, message: string) { super(message); } }
