# SQLite DDL из исходников

Строковые аргументы инициализации [Store.constructor](backend--storage--store.md#symbol-Store.constructor). Рабочая БД не открывается, SQL не исполняется.

```sql
PRAGMA journal_mode=DELETE;
PRAGMA secure_delete=ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS selected_conversations (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS conversation_cache (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS message_cache (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, date TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS message_conversation ON message_cache(conversation_id,date);
CREATE INDEX IF NOT EXISTS message_page_order ON message_cache(conversation_id,date DESC,id DESC);
CREATE INDEX IF NOT EXISTS message_source_key ON message_cache(source_key);
CREATE TABLE IF NOT EXISTS sync_state (id TEXT PRIMARY KEY,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS message_tombstones (source_key TEXT PRIMARY KEY);
CREATE INDEX IF NOT EXISTS message_date_order ON message_cache(date DESC,id DESC);
CREATE TABLE IF NOT EXISTS media_preload (message_id TEXT NOT NULL,attachment_id TEXT NOT NULL,version TEXT NOT NULL,variant TEXT NOT NULL,message_date TEXT NOT NULL,next_attempt INTEGER NOT NULL,PRIMARY KEY(message_id,attachment_id,version,variant));
CREATE TABLE IF NOT EXISTS conversation_policy (id TEXT PRIMARY KEY,source_id TEXT NOT NULL,excluded INTEGER NOT NULL);
```
