import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Store } from '../storage/store.js';
const scrypt = promisify(scryptCallback);
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(32).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(':');
  const hash = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
interface WebSession { csrf: string; expires: number }
export class Auth {
  private sessions = new Map<string, WebSession>();
  private attempts: number[] = [];
  constructor(private store: Store) {}
  get setupRequired() { return !this.store.get('password'); }
  session(cookie = ''): WebSession | undefined {
    const token = /(?:^|;\s*)zai_session=([a-f0-9]{64})(?:;|$)/.exec(cookie)?.[1];
    if (!token) return undefined;
    const session = this.sessions.get(digest(token));
    if (session && session.expires > Date.now()) return session;
    this.sessions.delete(digest(token));
  }
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
  logout(cookie = '') {
    const token = /zai_session=([a-f0-9]{64})/.exec(cookie)?.[1];
    if (token) this.sessions.delete(digest(token));
  }
}
export class AuthError extends Error { constructor(public status: number, message: string) { super(message); } }
