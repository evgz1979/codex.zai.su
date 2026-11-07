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
```
