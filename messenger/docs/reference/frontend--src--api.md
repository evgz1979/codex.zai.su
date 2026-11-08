# frontend/src/api.ts

Same-origin fetch, CSRF в памяти и безопасная ошибка API.

[Исходный модуль](../../frontend/src/api.ts) · [Индекс](README.md)

<a id="symbol-api"></a>

## api

Выполняет same-origin JSON-запрос к фиксированному /api пути.

Передаёт cookie/CSRF, запрещает кеш и принимает AbortSignal для смены адресата.

```typescript
async api<T>(path: string, input?: unknown, signal?: AbortSignal): Promise<T>
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

<a id="symbol-appApiBase"></a>

## appApiBase

Сохраняет прежний API-префикс независимо от формы публичной ссылки.

Старые cookie остаются действительными при коротком адресе личной страницы.

```typescript
const appApiBase = appBase ? `/api/u/${appBase.split('/').pop()}` : '/api'
```

<a id="symbol-appBase"></a>

## appBase

Выбирает путь личного Messenger из проверенного формата ссылки.

Имя не берётся из localStorage; API и настройки остаются в одном аккаунте.

```typescript
const appBase = messengerPageBase(location.pathname)
```

<a id="symbol-attachmentData"></a>

## attachmentData

Загружает байты одного вложения только по явному запросу через chat API.

Cookie и CSRF остаются same-origin; произвольные URL и секреты источника не принимаются.

```typescript
async attachmentData(input: AttachmentRequest, signal: AbortSignal): Promise<{
    blob: Blob;
    attachment: Attachment;
}>
```

<a id="symbol-setCsrf"></a>

## setCsrf

Сохраняет CSRF-токен текущей веб-сессии в памяти модуля.

Значение не записывается в localStorage или URL.

```typescript
setCsrf(value: string)
```
