# backend/http.ts

Фиксированный HTTP API, веб-вход, защита запросов и статические файлы.

[Исходный модуль](../../backend/http.ts) · [Индекс](README.md)

<a id="symbol-createApp"></a>

## createApp

Создаёт раздельные API чата и админки с серверной проверкой ролей.

Публичная версия требует HTTPS cookie и заранее настроенные Argon2id-пароли.

```typescript
createApp(options: {
    service: MessengerService;
    store: Store;
    admin?: AdminService;
    attachments?: AttachmentService;
    push?: PushService;
    clientDirectory: string;
    origin: string;
    secureCookies?: boolean;
})
```

<a id="symbol-createApp.abort"></a>

## createApp.abort

Прерывает сетевую загрузку при закрытии HTTP-ответа.

Не оставляет фонового копирования после ухода пользователя.

```typescript
abort()
```

<a id="symbol-createApp.authorize"></a>

## createApp.authorize

Повторно проверяет текущую chat-сессию для потока вложения.

Отзыв роли не даёт закончить начатое чтение кеша.

```typescript
authorize()
```

<a id="symbol-createApp.body"></a>

## createApp.body

Читает JSON-объект с ограничением размера.

Парсинг не пишет тела запросов в журнал или хранилище.

```typescript
async body(req: IncomingMessage): Promise<Record<string, unknown>>
```

<a id="symbol-createApp.cookie"></a>

## createApp.cookie

Устанавливает cookie для единственной роли.

Использует HttpOnly, Strict, ограниченный Path и Secure в HTTPS.

```typescript
cookie(res: ServerResponse, role: Role, token: string, maxAge: number)
```

<a id="symbol-createApp.send"></a>

## createApp.send

Передаёт только безопасный JSON-результат операции.

Сырые исключения, секреты и тела запросов не сериализуются.

```typescript
send(res: ServerResponse, status: number, value: unknown)
```

<a id="symbol-createApp.transform"></a>

## createApp.transform

Проверяет права перед каждой порцией HTTP-ответа.

После начала ответа отказ закрывает соединение без раскрытия ошибки.

```typescript
transform(chunk, _encoding, callback)
```
