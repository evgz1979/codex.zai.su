# backend/index.ts

Сборка production-сервера, регистрация TelegramAdapter и остановка.

[Исходный модуль](../../backend/index.ts) · [Индекс](README.md)

<a id="symbol-stop"></a>

## stop

Завершает локальный сервер, адаптеры и SQLite.

Повторный сигнал игнорируется; PID-файл удаляется после закрытия хранилища.

```typescript
async stop()
```
