# backend/core/inbox.ts

Формирование ленты только выбранных диалогов.

[Исходный модуль](../../backend/core/inbox.ts) · [Индекс](README.md)

<a id="symbol-UnifiedInboxService"></a>

## UnifiedInboxService

Формирует публичный снимок только разрешённых диалогов.

Фильтрация выполняется при каждом ответе, в том числе после изменения выбора.

```typescript
class UnifiedInboxService
```

<a id="symbol-UnifiedInboxService.constructor"></a>

## UnifiedInboxService.constructor

Подключает серверный сервис выбора диалогов.

Видимость сообщений не определяется клиентским фильтром.

```typescript
constructor(private selection: ConversationSelectionService)
```

<a id="symbol-UnifiedInboxService.filter"></a>

## UnifiedInboxService.filter

Отбирает разрешённые диалоги и связанные сообщения.

Повторно читает выбор на каждом ответе, включая выдачу кеша.

```typescript
filter(state: Snapshot): Snapshot
```
