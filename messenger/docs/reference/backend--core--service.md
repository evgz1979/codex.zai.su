# backend/core/service.ts

Единая лента, маршруты, лимиты, кеш и дедупликация отправок.

[Исходный модуль](../../backend/core/service.ts) · [Индекс](README.md)

<a id="symbol-MessengerService"></a>

## MessengerService

Объединяет источники в общую ленту и проверяет отправки.

Зависит от SourceAdapter и Store, без Telegram-специфичных ID.

```typescript
class MessengerService
```

<a id="symbol-MessengerService.adapter"></a>

## MessengerService.adapter

Ищет зарегистрированный источник по sourceId.

Неизвестный источник отклоняется с 409.

```typescript
private adapter(id: string)
```

<a id="symbol-MessengerService.attachmentContent"></a>

## MessengerService.attachmentContent

Открывает поток через адаптер источника только после проверки сохранённого выбора.

Старые placeholder-вложения получают актуальные метаданные без обхода истории.

```typescript
async attachmentContent(input: AttachmentRequest, signal: AbortSignal)
```

<a id="symbol-MessengerService.attachmentMessage"></a>

## MessengerService.attachmentMessage

Проверяет точный маршрут сохранённого вложения перед каждым чтением.

Чужой message ID, исключённый диалог и удалённая запись не открывают источник.

```typescript
attachmentMessage(input: AttachmentRequest)
```

<a id="symbol-MessengerService.attachmentMetadata"></a>

## MessengerService.attachmentMetadata

Обновляет безопасные метаданные только неизменённого сообщения после загрузки.

Поздний результат не отменяет правку, удаление или снятие разрешения.

```typescript
attachmentMetadata(input: AttachmentRequest, original: Message, attachment: Message['attachments'][number])
```

<a id="symbol-MessengerService.cacheMessages"></a>

## MessengerService.cacheMessages

Записывает разрешённые сообщения фоновой страницы с проверкой источника.

Не заменяет полный архив ограниченным окном браузера.

```typescript
cacheMessages(id: string, messages: Message[])
```

<a id="symbol-MessengerService.constructor"></a>

## MessengerService.constructor

Загружает ограниченный кеш либо пустой снимок.

Загруженные данные сразу помечаются устаревшими.

```typescript
constructor(private adapters: SourceAdapter[], private store: Store)
```

<a id="symbol-MessengerService.conversation"></a>

## MessengerService.conversation

Ищет диалог только среди известных серверу DTO.

Отсутствующий conversationId отклоняется с 404.

```typescript
private conversation(id: string): Conversation
```

<a id="symbol-MessengerService.disconnect"></a>

## MessengerService.disconnect

Закрывает соединения всех зарегистрированных источников.

Ожидает allSettled, чтобы ошибка одного адаптера не пропустила остальные.

```typescript
async disconnect()
```

<a id="symbol-MessengerService.doRefresh"></a>

## MessengerService.doRefresh

Обновляет каталог и непрочитанные без обхода истории чатов.

Полный сохранённый архив остаётся на диске, без повторного чтения для снимка.

```typescript
private async doRefresh(): Promise<Snapshot>
```

<a id="symbol-MessengerService.inboxPage"></a>

## MessengerService.inboxPage

Возвращает страницу единой хронологии из выбранных диалогов SQLite.

Общий курсор не даёт доступа к исключённому архиву или произвольному источнику.

```typescript
inboxPage(before?: string)
```

<a id="symbol-MessengerService.ingest"></a>

## MessengerService.ingest

Применяет событие источника только к текущему списку разрешений.

Правки и удаления не открывают доступ к исключённому архиву.

```typescript
ingest(event: SourceEvent)
```

<a id="symbol-MessengerService.markRead"></a>

## MessengerService.markRead

Явно отмечает диалог прочитанным через адаптер.

Ориентируется на последнее загруженное сообщение и сохраняет нулевой счётчик.

```typescript
async markRead(id: string)
```

<a id="symbol-MessengerService.open"></a>

## MessengerService.open

Читает страницу только из SQLite и будит фон при незавершённой истории.

Открытие и прокрутка не вызывают MTProto; доступ проверяется до чтения.

```typescript
async open(id: string, before?: string): Promise<ConversationPageResult>
```

<a id="symbol-MessengerService.refresh"></a>

## MessengerService.refresh

Обновляет метаданные разрешённых диалогов для фоновой сверки.

Повторный параллельный вызов использует тот же pendingRefresh.

```typescript
refresh(): Promise<Snapshot>
```

<a id="symbol-MessengerService.reset"></a>

## MessengerService.reset

Перечитывает кеш только разрешённых диалогов.

Не загружает данные Telegram и не удаляет архив исключённых диалогов.

```typescript
reset()
```

<a id="symbol-MessengerService.send"></a>

## MessengerService.send

Проверяет текст, точный маршрут и повтор request ID перед отправкой.

Неизвестный результат не повторяется автоматически; Promise хранится до 15 минут процесса.

```typescript
send(input: SendRequest): Promise<Message>
```

<a id="symbol-MessengerService.snapshot"></a>

## MessengerService.snapshot

Возвращает текущий снимок и состояния зарегистрированных источников.

Не обращается к сети; общая лента содержит только десять последних загруженных сообщений.

```typescript
snapshot(): Snapshot
```
