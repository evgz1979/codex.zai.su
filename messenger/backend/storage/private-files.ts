import { mkdirSync, chmodSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
//: Создаёт каталог приватных данных и выставляет права 0700.
//: Возвращает исходный путь; содержимое каталога не выводится.
export function privateDirectory(path: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  return path;
}
//: Атомарно заменяет приватный файл через случайный временный файл.
//: Создаёт файл с 0600, затем rename и повторная установка прав.
export function writePrivate(path: string, value: string | Buffer) {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, value, { mode: 0o600, flag: 'wx' });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}
//: Описывает только серверные реквизиты Telegram и StringSession.
//: Не входит в shared DTO, API-ответы и клиентскую сборку.
export interface TelegramCredentials { apiId: number; apiHash: string; session: string; accountId?: string }
//: Хранит Telegram credentials в AES-256-GCM файле.
//: Ключ находится рядом в приватном файле, защита не заменяет безопасность macOS-аккаунта.
export class SecretVault {
  private keyPath: string;
  private secretPath: string;
  //: Определяет пути vault.key и telegram.enc в приватном каталоге.
  //: Создаёт только каталог; наличие сессии не требуется.
  constructor(directory: string) {
    privateDirectory(directory);
    this.keyPath = join(directory, 'vault.key');
    this.secretPath = join(directory, 'telegram.enc');
  }
  //: Проверяет наличие обоих файлов для расшифровки.
  //: Отсутствие одного файла означает отсутствие доступной сессии.
  exists() { return existsSync(this.keyPath) && existsSync(this.secretPath); }
  //: Шифрует credentials новым IV и записывает auth tag с шифротекстом.
  //: Существующий ключ переиспользуется; реквизиты не печатаются.
  save(credentials: TelegramCredentials) {
    if (!existsSync(this.keyPath)) writePrivate(this.keyPath, randomBytes(32));
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', readFileSync(this.keyPath), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials)), cipher.final()]);
    writePrivate(this.secretPath, Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
  }
  //: Удаляет локальный зашифрованный файл сессии.
  //: Ключ и ранее кешированные сообщения не удаляются.
  clear() { if (existsSync(this.secretPath)) unlinkSync(this.secretPath); }
  //: Расшифровывает серверные реквизиты из vault.
  //: Ошибка аутентичности не превращается в пустую успешную сессию.
  load(): TelegramCredentials | undefined {
    if (!this.exists()) return undefined;
    const bytes = readFileSync(this.secretPath);
    const decipher = createDecipheriv('aes-256-gcm', readFileSync(this.keyPath), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
  }
}
