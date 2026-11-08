# frontend/src/offline-cache.ts

Ограниченный личный кеш просмотренных сообщений в IndexedDB без паролей и токенов.

[Исходный модуль](../../frontend/src/offline-cache.ts) · [Индекс](README.md)

<a id="symbol-emptySnapshot"></a>

## emptySnapshot

Создаёт пустой снимок без имитации подключения к источнику.

Используется только для локального кеша ранее полученных данных.

```typescript
emptySnapshot(): Snapshot
```

<a id="symbol-OfflineCache"></a>

## OfflineCache

Хранит ограниченный кеш прочитанных сообщений в IndexedDB текущего браузера.

Пароли, cookie, CSRF, Telegram-сессии и административные ответы не сохраняются.

```typescript
class OfflineCache
```

<a id="symbol-OfflineCache.authorize"></a>

## OfflineCache.authorize

Сохраняет только публичное имя и фактический срок подтверждённого входа.

При смене аккаунта прежняя история полностью сбрасывается.

```typescript
authorize(info: SessionInfo)
```

<a id="symbol-OfflineCache.bound"></a>

## OfflineCache.bound

Ограничивает кеш двумястами чатами, сотней сообщений чата и тысячей всего.

Общий объём JSON не превышает 4 МиБ; сохраняются наиболее свежие записи.

```typescript
private bound(value: SavedAccount)
```

<a id="symbol-OfflineCache.change"></a>

## OfflineCache.change

Последовательно применяет локальные изменения и фиксирует транзакцию целиком.

Новая генерация после выхода запрещает поздним ответам повторно заполнить кеш.

```typescript
private change(update: (value: SavedAccount | undefined) => SavedAccount | undefined | false, generation = this.generation): Promise<void>
```

<a id="symbol-OfflineCache.clear"></a>

## OfflineCache.clear

Удаляет локальную историю либо оставляет только намерение отозвать серверную сессию.

Данные не воскресают после перезагрузки или позднего HTTP-ответа.

```typescript
clear(logoutPending = false)
```

<a id="symbol-OfflineCache.constructor"></a>

## OfflineCache.constructor

Привязывает кеш к API-префиксу конкретного личного адреса.

Короткий и прежний путь аккаунта используют один ключ; чужие адреса не смешиваются.

```typescript
constructor(private scope: string)
```

<a id="symbol-OfflineCache.db"></a>

## OfflineCache.db

Открывает отдельное браузерное хранилище с одной записью на аккаунт.

Ошибки запрета хранилища или квоты не мешают обычной работе по сети.

```typescript
private db()
```

<a id="symbol-OfflineCache.invalidate"></a>

## OfflineCache.invalidate

Сбрасывает память окна после изменения общего кеша соседним окном.

Сохранённое намерение выхода в IndexedDB не перезаписывается.

```typescript
invalidate()
```

<a id="symbol-OfflineCache.load"></a>

## OfflineCache.load

Читает одну запись только своего адреса из IndexedDB.

Позднее завершение чтения после выхода не восстанавливает старые сообщения.

```typescript
private async load()
```

<a id="symbol-OfflineCache.needsLogout"></a>

## OfflineCache.needsLogout

Проверяет необходимость закончить локальный выход при восстановлении связи.

Флаг не содержит токенов и не даёт права чтения кеша.

```typescript
async needsLogout()
```

<a id="symbol-OfflineCache.read"></a>

## OfflineCache.read

Восстанавливает только данные ещё действующего ранее подтверждённого входа.

Пустой, просроченный или завершённый вход не предоставляет локальную переписку.

```typescript
async read(path: string, input?: unknown): Promise<unknown>
```

<a id="symbol-OfflineCache.remember"></a>

## OfflineCache.remember

Запоминает только разрешённые ответы чтения и успешные изменения сообщений.

Снятие выбора, удаления и reset немедленно удаляют соответствующую локальную историю.

```typescript
remember(path: string, input: unknown, result: unknown, generation: number, revisionAtRequest: number)
```

<a id="symbol-SavedAccount"></a>

## SavedAccount

Описывает сохранённые данные одного личного адреса без реквизитов входа.

Срок чтения ограничен веб-сессией; logoutPending содержит только факт локального выхода.

```typescript
interface SavedAccount {
    account?: AccountInfo;
    expiresAt: number;
    savedAt: number;
    snapshot: Snapshot;
    messages: Message[];
    logoutPending?: boolean;
    accessRevision?: number;
    allowedIds?: string[];
}
```
