import { mkdirSync, chmodSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export function privateDirectory(path: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  return path;
}
export function writePrivate(path: string, value: string | Buffer) {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, value, { mode: 0o600, flag: 'wx' });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}
export interface TelegramCredentials { apiId: number; apiHash: string; session: string }
export class SecretVault {
  private keyPath: string;
  private secretPath: string;
  constructor(directory: string) {
    privateDirectory(directory);
    this.keyPath = join(directory, 'vault.key');
    this.secretPath = join(directory, 'telegram.enc');
  }
  exists() { return existsSync(this.keyPath) && existsSync(this.secretPath); }
  save(credentials: TelegramCredentials) {
    if (!existsSync(this.keyPath)) writePrivate(this.keyPath, randomBytes(32));
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', readFileSync(this.keyPath), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials)), cipher.final()]);
    writePrivate(this.secretPath, Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
  }
  load(): TelegramCredentials | undefined {
    if (!this.exists()) return undefined;
    const bytes = readFileSync(this.secretPath);
    const decipher = createDecipheriv('aes-256-gcm', readFileSync(this.keyPath), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
  }
}
