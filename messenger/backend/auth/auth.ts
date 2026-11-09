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
//: Задаёт срок входа по роли: чат продлевается при использовании, админка ограничена восемью часами.
//: Длительный вход не отменяет отзыв при выходе, блокировке или смене пароля.
const sessionLifetime = (role:Role) => role==='chat'?180*86400000:8*3600000;
//: Содержит роль, CSRF, срок и отпечаток версии пароля веб-сессии.
//: В SQLite сохраняются только chat-сессии с хешем cookie-токена.
interface WebSession { csrf: string; expires: number; role: Role; credential:string }
//: Разделяет права чата и админки на сервере.
//: Чат сохраняет вход после рестарта; административные сессии остаются в памяти.
export class Auth {
  private sessions = new Map<string, WebSession>();
  private attempts: number[] = [];
  private verifying = false;
  //: Восстанавливает действующие chat-сессии из приватной SQLite.
  //: Сырой пароль и cookie-токены на диск не записываются; повреждённые записи доступа не дают.
  constructor(private store: Store,private now=Date.now) {
    try {
      const saved=JSON.parse(store.get('auth.sessions')||'[]') as [string,WebSession][];
      for(const [key,session] of saved)if(/^chat:[a-f0-9]{64}$/.test(key)&&session.role==='chat'&&/^[a-f0-9]{64}$/.test(session.csrf)&&Number.isFinite(session.expires)&&session.expires>this.now()&&session.credential===this.credential('chat'))this.sessions.set(key,session);
    }catch{this.sessions.clear();}
  }
  //: Связывает сессию с версией пароля её роли, включая изменения через CLI.
  //: Отпечаток не позволяет использовать старый вход после смены пароля.
  private credential(role:Role){return digest(this.store.get(`auth.${role}`)||'');}
  //: Сохраняет ограниченный набор chat-сессий без исходных cookie-токенов.
  //: Административные сессии и просроченные записи в SQLite не попадают.
  private save(){this.store.set('auth.sessions',JSON.stringify([...this.sessions].filter(([,session])=>session.role==='chat'&&session.expires>this.now()&&session.credential===this.credential('chat'))));}
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
    if (session && session.role === role && session.expires > this.now()&&session.credential===this.credential(role)) return session;
    if(this.sessions.delete(key)&&role==='chat')this.save();
  }
  //: Продлевает подтверждённый вход чата до 180 дней при использовании приложения.
  //: Запись обновляется не чаще раза в сутки; истёкший или отозванный токен не восстанавливается.
  renew(cookie='',role:Role='chat',secure=false){
    const session=this.session(cookie,role,secure);
    if(session&&role==='chat'&&session.expires<=this.now()+sessionLifetime(role)-86400000){session.expires=this.now()+sessionLifetime(role);this.save();}
    return session;
  }
  //: Проверяет Argon2id-пароль и создаёт отдельную сессию роли.
  //: Ограничивает ошибки входа и параллельные хеширования для 1 vCPU.
  async login(password: string, role: Role = 'chat') {
    const now = this.now();
    this.attempts = this.attempts.filter(t => now - t < 60000);
    if (this.attempts.length >= 5 || this.verifying) throw new AuthError(429,'Слишком много попыток. Подождите минуту.');
    this.attempts.push(now);
    if (!this.ready()) throw new AuthError(503,'Вход ещё не настроен на сервере.');
    this.verifying = true;
    try {
      const stored = this.store.get(`auth.${role}`)!;
      if (!await passwordMatches(password,stored)) throw new AuthError(401,'Неверный пароль.');
      if(this.store.get(`auth.${role}`)!==stored)throw new AuthError(401,'Пароль изменён. Войдите снова.');
      this.attempts.pop();
      for (const [key,s] of this.sessions) if (s.expires <= now) this.sessions.delete(key);
      const sameRole=[...this.sessions].filter(([,session])=>session.role===role);
      if (sameRole.length >= 10) this.sessions.delete(sameRole[0][0]);
      const token = randomBytes(32).toString('hex');
      const session: WebSession = { csrf:randomBytes(32).toString('hex'), expires:now+sessionLifetime(role), role,credential:this.credential(role) };
      this.sessions.set(`${role}:${digest(token)}`,session);
      if(role==='chat')this.save();
      return { token, ...session };
    } finally { this.verifying = false; }
  }
  //: Отзывает текущую сессию одной роли.
  //: Выход из чата не завершает административную сессию.
  logout(cookie = '', role: Role = 'chat', secure = false) {
    if(this.sessions.delete(`${role}:${digest(this.token(cookie,role,secure))}`)&&role==='chat')this.save();
  }
  //: Отзывает все веб-сессии выбранной роли.
  //: Вызывается после изменения её пароля.
  revoke(role: Role) { for (const [key,s] of this.sessions) if (s.role === role) this.sessions.delete(key);if(role==='chat')this.save(); }
}
//: Передаёт безопасный статус ошибки авторизации.
//: Не содержит пароль, cookie или исходное исключение.
export class AuthError extends Error {
  //: Создаёт безопасную ошибку входа с HTTP-статусом.
  //: Внутренние исключения и реквизиты в ответ не включаются.
  constructor(public status: number, message: string) { super(message); } }
