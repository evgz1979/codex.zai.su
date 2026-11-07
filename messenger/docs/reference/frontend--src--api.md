# frontend/src/api.ts

Same-origin fetch, CSRF в памяти и безопасная ошибка API.

[Исходный модуль](../../frontend/src/api.ts) · [Индекс](README.md)

<a id="symbol-api"></a>

## api

Выполняет same-origin JSON-запрос к фиксированному /api пути.

Передаёт cookie, CSRF для POST и запрещает кеширование ответа.

```typescript
async api<T>(path: string, input?: unknown): Promise<T>
```

<a id="symbol-ApiError"></a>

## ApiError

Передаёт HTTP-статус и безопасный текст ошибки UI.

Не содержит сырой HTTP-ответ или credentials Telegram.

```typescript
class ApiError extends Error
```

<a id="symbol-ApiError.constructor"></a>

## ApiError.constructor

Создаёт ошибку клиентского API с HTTP-статусом.

Текст берётся из безопасного поля error серверного ответа.

```typescript
constructor(public status: number, message: string)
```

<a id="symbol-setCsrf"></a>

## setCsrf

Сохраняет CSRF-токен текущей веб-сессии в памяти модуля.

Значение не записывается в localStorage или URL.

```typescript
setCsrf(value: string)
```
