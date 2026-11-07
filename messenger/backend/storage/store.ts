import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { chmodSync } from 'node:fs';
import { privateDirectory } from './private-files.js';
import { LIMITS, type Snapshot } from '../../shared/types.js';
//: Управляет локальной SQLite-таблицей settings.
//: Хранит хеш пароля и ограниченный кеш, но не Telegram credentials.
export class Store {
  private db: DatabaseSync;
  //: Открывает приватную SQLite и создаёт settings при отсутствии.
  //: Включает DELETE journal и secure_delete, выставляет 0600.
  constructor(directory: string) {
    privateDirectory(directory);
    const path = join(directory, 'messenger.sqlite');
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  }
  //: Читает строковое значение одного ключа settings.
  //: Использует параметризованный SELECT; неизвестный ключ даёт undefined.
  get(key: string): string | undefined {
    return (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  }
  //: Заменяет строковое значение одного ключа settings.
  //: Использует параметризованный INSERT OR REPLACE.
  set(key: string, value: string) { this.db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, value); }
  //: Загружает кеш и проверяет возраст refreshedAt.
  //: Кеш без даты или старше суток удаляется; фонового TTL-таймера нет.
  loadCache(): Snapshot | undefined {
    const raw = this.get('cache');
    if (!raw) return undefined;
    const cache = JSON.parse(raw) as Snapshot;
    // Переписки автоматически забываются через сутки.
    if (!cache.refreshedAt || Date.now() - Date.parse(cache.refreshedAt) > 86400000) { this.clearCache(); return undefined; }
    return cache;
  }
  //: Сохраняет JSON-снимок с ограниченным числом сообщений.
  //: Количество ограничено LIMITS.cachedMessages.
  saveCache(snapshot: Snapshot) {
    this.set('cache', JSON.stringify({ ...snapshot, messages: snapshot.messages.slice(-LIMITS.cachedMessages) }));
  }
  //: Удаляет только ключ cache и выполняет VACUUM.
  //: Пароль и Telegram-сессия остаются на месте.
  clearCache() { this.db.prepare('DELETE FROM settings WHERE key = ?').run('cache'); this.db.exec('VACUUM;'); }
  //: Закрывает подключение SQLite.
  //: Вызывается владельцем Store при завершении команды или сервера.
  close() { this.db.close(); }
}
