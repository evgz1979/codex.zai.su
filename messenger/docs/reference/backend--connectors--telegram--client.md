# backend/connectors/telegram/client.ts

Создание teleproto-клиента с приватной сессией, дедлайном RPC и выключенными логами.

[Исходный модуль](../../backend/connectors/telegram/client.ts) · [Индекс](README.md)

<a id="symbol-telegramClient"></a>

## telegramClient

Создаёт клиент teleproto без журналирования секретов.

Подключает приватное сохранение сессии и ограниченную сетевую политику.

```typescript
telegramClient(credentials: TelegramCredentials, vault?: SecretVault)
```

<a id="symbol-telegramClient.PrivateClient"></a>

## telegramClient.PrivateClient

Расширяет клиент стандартным дедлайном RPC.

Применяет ограничения поверх штатного MTProto-клиента.

```typescript
class PrivateClient extends TelegramClient
```

<a id="symbol-telegramClient.PrivateClient.invoke"></a>

## telegramClient.PrivateClient.invoke

Вызывает Telegram RPC с дедлайном по умолчанию.

Явные options могут переопределить timeout; уже отправленный запрос может выполниться.

```typescript
override invoke<R extends Api.AnyRequest>(request: R, dcId?: number, options?: Api.ApiCallOptions): Promise<R['__response']>
```

<a id="symbol-telegramClient.PrivateSession"></a>

## telegramClient.PrivateSession

Связывает StringSession с локальным SecretVault.

Пустое значение сессии не сохраняется.

```typescript
class PrivateSession extends StringSession
```

<a id="symbol-telegramClient.PrivateSession.save"></a>

## telegramClient.PrivateSession.save

Сохраняет актуальную непустую сессию зашифрованной.

Возвращает строку только серверному вызывающему коду, без вывода в журнал.

```typescript
save()
```
