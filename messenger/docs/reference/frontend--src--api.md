# frontend/src/api.ts

Same-origin fetch, CSRF в памяти и безопасная ошибка API.

[Исходный модуль](../../frontend/src/api.ts) · [Индекс](README.md)

<a id="symbol-api"></a>

## api

Отправляет запрос на сервер и при отказе транспорта пробует локальное чтение.

Отказы доступа не подменяются кешем; отправка, прочтение и расшифровка offline не выполняются.

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

<a id="symbol-avatarData"></a>

## avatarData

Получает фото только выбранного диалога через same-origin chat API.

Не принимает внешний URL; 404 оставляет инициалы вместо фотографии.

```typescript
async avatarData(conversationId: string, signal: AbortSignal, refresh = false): Promise<Blob>
```

<a id="symbol-avatarData.abort"></a>

## avatarData.abort

Передаёт отмену владельца отдельному дедлайну HTTP-запроса фото.

Таймер не меняет общую сессию или запросы других изображений.

```typescript
abort()
```

<a id="symbol-clearOffline"></a>

## clearOffline

Очищает кеш при выходе или отзыве входа во всех окнах одного аккаунта.

В соседние окна передаётся только API-префикс, без переписки и реквизитов.

```typescript
async clearOffline(logoutPending = false)
```

<a id="symbol-connection"></a>

## connection

Переключает режим связи после сетевого ответа или отказа транспорта.

Данные текущей переписки остаются в интерфейсе при потере соединения.

```typescript
connection(value: boolean)
```

<a id="symbol-isOffline"></a>

## isOffline

Сообщает фактическую недоступность сервера для режима чтения.

Возврат navigator.onLine сам по себе ещё не подтверждает связь с Messenger.

```typescript
isOffline()
```

<a id="symbol-network"></a>

## network

Выполняет same-origin JSON-запрос к фиксированному /api пути.

Передаёт cookie/CSRF, запрещает кеш и принимает AbortSignal для смены адресата.

```typescript
async network<T>(role: 'admin' | 'chat', path: string, input?: unknown, signal?: AbortSignal): Promise<T>
```

<a id="symbol-network.abort"></a>

## network.abort

Передаёт отмену владельца HTTP-запросу, не считая её потерей связи.

Дедлайн применяется только к чтению; отправки не повторяются автоматически.

```typescript
abort()
```

<a id="symbol-readCachedPage"></a>

## readCachedPage

Читает сохранённую первую страницу текущего аккаунта до сетевого обновления.

Индексация, срок входа и очистка при отзыве общие с автономным режимом.

```typescript
async readCachedPage(conversationId?: string): Promise<ConversationPageResult | undefined>
```

<a id="symbol-reconnect"></a>

## reconnect

Восстанавливает CSRF и проверяет серверный вход перед выходом из offline-режима.

Отложенный локальный выход отзывает cookie прежде, чем разрешается загрузка переписки.

```typescript
async reconnect()
```

<a id="symbol-setCsrf"></a>

## setCsrf

Сохраняет CSRF-токен текущей веб-сессии в памяти модуля.

Значение не записывается в localStorage или URL.

```typescript
setCsrf(value: string)
```

<a id="symbol-subscribeConnection"></a>

## subscribeConnection

Подписывает интерфейс на смену состояния связи.

Состояние не сохраняется в localStorage и не содержит данные аккаунта.

```typescript
subscribeConnection(listener: () => void)
```
