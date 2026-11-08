# backend/runtime.ts

Отдельные БД, Telegram, пароли, медиакеш, push и жизненный цикл личного аккаунта.

[Исходный модуль](../../backend/runtime.ts) · [Индекс](README.md)

<a id="symbol-AccountRuntime"></a>

## AccountRuntime

Объединяет изолированные сервисы одного личного аккаунта.

Каждый экземпляр использует собственные БД, Telegram, пароли, кеш и фоновые задачи.

```typescript
export interface AccountRuntime {
    store: Store;
    service: MessengerService;
    auth: Auth;
    admin?: AdminService;
    attachments?: AttachmentService;
    push?: PushService;
    start(): void;
    stop(): Promise<void>;
}
```

<a id="symbol-createAccountRuntime"></a>

## createAccountRuntime

Собирает личный Messenger в заданном приватном каталоге.

WhatsApp создаётся только для владельца; остановка завершает задачи перед закрытием SQLite.

```typescript
createAccountRuntime(directory: string, origin: string, isOwner = false): AccountRuntime
```

<a id="symbol-createAccountRuntime.start"></a>

## createAccountRuntime.start

Запускает синхронизацию и подготовку медиа личного аккаунта.

Сервис уже создан; повторный внешний порт не открывается.

```typescript
start()
```

<a id="symbol-createAccountRuntime.stop"></a>

## createAccountRuntime.stop

Завершает личные фоновые задачи и закрывает SQLite.

Авторизация Telegram отменяется перед отключением источника.

```typescript
async stop()
```
