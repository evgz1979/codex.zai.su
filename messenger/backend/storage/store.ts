import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { chmodSync } from 'node:fs';
import { privateDirectory } from './private-files.js';
import { LIMITS, type Snapshot, type Conversation, type Message } from '../../shared/types.js';
//: Хранит настройки, выбор диалогов и ограниченный кеш каждого диалога.
//: Исключение диалога меняет только выбор, не удаляя сохранённые данные.
export class Store {
  private db: DatabaseSync;
  //: Открывает SQLite и создаёт совместимые таблицы кеша и выбора.
  //: Прежний кеш мигрируется без автоматического разрешения диалогов.
  constructor(directory: string) {
    privateDirectory(directory);
    const path = join(directory,'messenger.sqlite');
    this.db = new DatabaseSync(path); chmodSync(path,0o600);
    this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS selected_conversations (id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS conversation_cache (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS message_cache (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, date TEXT NOT NULL, payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS message_conversation ON message_cache(conversation_id,date);');
    // Мигрируем только прежний локальный кеш. Выбор по умолчанию остаётся пустым.
    const old = this.get('cache');
    if (old) { try { this.saveCache(JSON.parse(old)); } catch { /* Повреждённый старый кеш не является настройкой. */ } this.remove('cache'); }
  }
  //: Читает строковую настройку по ключу.
  //: Использует параметризованный SELECT.
  get(key: string): string | undefined { return (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as {value:string}|undefined)?.value; }
  //: Заменяет строковую настройку.
  //: Не формирует SQL из текста сообщений.
  set(key: string, value: string) { this.db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key,value); }
  //: Удаляет одну настройку по ключу.
  //: Не удаляет таблицы, выбор или чужие данные.
  remove(key: string) { this.db.prepare('DELETE FROM settings WHERE key = ?').run(key); }
  //: Читает разрешённые ID диалогов из SQLite.
  //: Результат сохраняется после перезапуска процесса.
  selected(): string[] { return (this.db.prepare('SELECT id FROM selected_conversations ORDER BY id').all() as {id:string}[]).map(r=>r.id); }
  //: Атомарно заменяет список разрешённых ID.
  //: При ошибке транзакция откатывается, кеш не удаляется.
  select(ids: string[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try { this.db.exec('DELETE FROM selected_conversations'); for (const id of ids) this.db.prepare('INSERT INTO selected_conversations (id) VALUES (?)').run(id); this.db.exec('COMMIT'); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  //: Загружает кеш только переданных разрешённых ID.
  //: Пустой выбор даёт пустую ленту, исключённый архив не читается для UI.
  loadCache(ids: string[] = this.selected()): Snapshot {
    const empty: Snapshot = { sources:[], conversations:[], messages:[], refreshedAt:this.get('refreshedAt')||null, stale:true };
    if (!ids.length) return empty;
    const placeholders = ids.map(()=>'?').join(',');
    const conversations = (this.db.prepare(`SELECT payload FROM conversation_cache WHERE id IN (${placeholders})`).all(...ids) as {payload:string}[]).map(r=>JSON.parse(r.payload) as Conversation);
    const messages = (this.db.prepare(`SELECT payload FROM message_cache WHERE conversation_id IN (${placeholders}) ORDER BY date DESC,id DESC LIMIT ?`).all(...ids,LIMITS.cachedMessages) as {payload:string}[]).map(r=>JSON.parse(r.payload) as Message).reverse();
    return { ...empty,conversations,messages };
  }
  //: Сохраняет ограниченный кеш обновлённых диалогов.
  //: Оставляет до 40 сообщений активного диалога, не трогает архив остальных.
  saveCache(snapshot: Snapshot) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const c of snapshot.conversations) this.db.prepare('INSERT OR REPLACE INTO conversation_cache (id,payload) VALUES (?,?)').run(c.id,JSON.stringify(c));
      for (const m of snapshot.messages) this.db.prepare('INSERT OR REPLACE INTO message_cache (id,conversation_id,date,payload) VALUES (?,?,?,?)').run(m.id,m.conversationId,m.date,JSON.stringify(m));
      for (const id of new Set(snapshot.messages.map(m=>m.conversationId))) this.db.prepare('DELETE FROM message_cache WHERE conversation_id = ? AND id NOT IN (SELECT id FROM message_cache WHERE conversation_id = ? ORDER BY date DESC,id DESC LIMIT ?)').run(id,id,LIMITS.selectedMessages);
      if (snapshot.refreshedAt) this.set('refreshedAt',snapshot.refreshedAt);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  //: Удаляет кеш только явной локальной командой.
  //: Пароли, выбор и Telegram-сессия сохраняются.
  clearCache() { this.db.exec('DELETE FROM message_cache; DELETE FROM conversation_cache; VACUUM;'); this.remove('refreshedAt'); }
  //: Закрывает подключение SQLite.
  //: Не удаляет постоянные настройки.
  close() { this.db.close(); }
}
