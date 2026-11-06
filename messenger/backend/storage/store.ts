import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { chmodSync } from 'node:fs';
import { privateDirectory } from './private-files.js';
import { LIMITS, type Snapshot } from '../../shared/types.js';
export class Store {
  private db: DatabaseSync;
  constructor(directory: string) {
    privateDirectory(directory);
    const path = join(directory, 'messenger.sqlite');
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  }
  get(key: string): string | undefined {
    return (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  }
  set(key: string, value: string) { this.db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, value); }
  loadCache(): Snapshot | undefined {
    const raw = this.get('cache');
    if (!raw) return undefined;
    const cache = JSON.parse(raw) as Snapshot;
    // Переписки автоматически забываются через сутки.
    if (!cache.refreshedAt || Date.now() - Date.parse(cache.refreshedAt) > 86400000) { this.clearCache(); return undefined; }
    return cache;
  }
  saveCache(snapshot: Snapshot) {
    this.set('cache', JSON.stringify({ ...snapshot, messages: snapshot.messages.slice(-LIMITS.cachedMessages) }));
  }
  clearCache() { this.db.prepare('DELETE FROM settings WHERE key = ?').run('cache'); this.db.exec('VACUUM;'); }
  close() { this.db.close(); }
}
