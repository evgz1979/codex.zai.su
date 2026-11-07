# backend/core/selection.ts

Постоянный выбор разрешённых диалогов и ревизия доступа.

[Исходный модуль](../../backend/core/selection.ts) · [Индекс](README.md)

<a id="symbol-ConversationSelectionService"></a>

## ConversationSelectionService

Хранит разрешённые диалоги и проверяет доступ на каждой операции.

Пустой выбор запрещает загрузку, отправку и отметку прочитанного.

```typescript
class ConversationSelectionService
```

<a id="symbol-ConversationSelectionService.allows"></a>

## ConversationSelectionService.allows

Проверяет конкретный диалог по сохранённому выбору.

Невыбранный диалог не получает доступ к истории.

```typescript
allows(id: string)
```

<a id="symbol-ConversationSelectionService.clear"></a>

## ConversationSelectionService.clear

Снимает разрешение со всех диалогов.

Архивные сообщения не удаляются, ревизия меняется.

```typescript
clear()
```

<a id="symbol-ConversationSelectionService.constructor"></a>

## ConversationSelectionService.constructor

Подключает постоянный выбор диалогов в SQLite.

Отсутствующие настройки означают пустой выбор.

```typescript
constructor(private store: Store)
```

<a id="symbol-ConversationSelectionService.ids"></a>

## ConversationSelectionService.ids

Читает сохранённые разрешённые ID.

Возвращает только ID, без загрузки истории.

```typescript
ids()
```

<a id="symbol-ConversationSelectionService.replace"></a>

## ConversationSelectionService.replace

Атомарно заменяет выбор известными ID каталога.

Ограничивает число выборов и обновляет ревизию для текущих запросов.

```typescript
replace(ids: string[], available: Conversation[])
```

<a id="symbol-ConversationSelectionService.require"></a>

## ConversationSelectionService.require

Отклоняет операции над исключённым диалогом.

Сервер возвращает 403 независимо от состояния браузера.

```typescript
require(id: string)
```
