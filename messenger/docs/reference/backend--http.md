# backend/http.ts

Фиксированный HTTP API, веб-вход, защита запросов и статические файлы.

[Исходный модуль](../../backend/http.ts) · [Индекс](README.md)

<a id="symbol-createApp"></a>

## createApp

Создаёт HTTP-сервер Messenger и ограниченный API.

Проверяет Host/Origin, веб-сессию и CSRF; не открывает shell или RPC-прокси.

```typescript
createApp(options: {
    service: MessengerService;
    store: Store;
    clientDirectory: string;
    origin: string;
})
```

<a id="symbol-createApp.body"></a>

## createApp.body

Читает ограниченный JSON-объект из HTTP-запроса.

Отклоняет другой Content-Type, тело свыше 20000 байт и некорректный JSON.

```typescript
async body(req: IncomingMessage): Promise<Record<string, unknown>>
```

<a id="symbol-createApp.send"></a>

## createApp.send

Записывает JSON-ответ с выбранным HTTP-статусом.

Сериализует только явно переданную прикладную модель.

```typescript
send(res: ServerResponse, status: number, body: unknown)
```
