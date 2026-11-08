# backend/core/selection.ts

Постоянный выбор разрешённых диалогов и ревизия доступа.

[Исходный модуль](../../backend/core/selection.ts) · [Индекс](README.md)

<a id="symbol-ConversationSelectionService"></a>

## ConversationSelectionService

Хранит разрешённые диалоги и проверяет доступ на каждой операции.

История запрещена до выбора или разрешения нового личного входящего; исключения постоянны.

```typescript
class ConversationSelectionService
```

<a id="symbol-ConversationSelectionService.admit"></a>

## ConversationSelectionService.admit

Разрешает новый входящий личный контакт до преобразования его сообщения.

Явное исключение переживает рестарт и имеет приоритет над обнаружением.

```typescript
admit(conversation: Conversation)
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

<a id="symbol-ConversationSelectionService.observe"></a>

## ConversationSelectionService.observe

Фиксирует исходный каталог и обнаруживает новые личные входящие по метаданным.

Старые невыбранные, исключённые, боты, группы и каналы сами не разрешаются.

```typescript
observe(sourceId: string, catalog: Conversation[])
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
