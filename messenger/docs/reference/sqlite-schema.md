# SQLite DDL из исходников

Строковые аргументы инициализации [Store.constructor](backend--storage--store.md#symbol-Store.constructor). Рабочая БД не открывается, SQL не исполняется.

```sql
PRAGMA journal_mode=DELETE;
PRAGMA secure_delete=ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```
