# frontend/src/useAppBadge.ts

Согласование значка приложения и уведомлений при чтении, возврате фокуса и позднем push.

[Исходный модуль](../../frontend/src/useAppBadge.ts) · [Индекс](README.md)

<a id="symbol-synchronizeBadge"></a>

## synchronizeBadge

Уточняет значок приложения и закрывает уведомления после прочтения всех входящих.

Ошибки необязательных API не меняют вход, подписку и счётчики переписки.

```typescript
async synchronizeBadge(count: number)
```

<a id="symbol-useAppBadge"></a>

## useAppBadge

Обновляет значок при возврате в приложение и после позднего push.

Не использует устаревшее число из замыкания и не хранит переписку в worker.

```typescript
useAppBadge(count: number, authenticated: boolean)
```

<a id="symbol-useAppBadge.message"></a>

## useAppBadge.message

Обрабатывает запрос Service Worker после доставки push при открытом окне.

Другие сообщения worker игнорируются.

```typescript
message(event: MessageEvent)
```

<a id="symbol-useAppBadge.update"></a>

## useAppBadge.update

Повторно устанавливает актуальное число в видимом приложении.

Сам факт открытия не помечает невидимые сообщения прочитанными.

```typescript
update()
```
