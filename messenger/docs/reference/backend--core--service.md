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

<a id="symbol-MessengerService.avatar"></a>

## MessengerService.avatar

Загружает ограниченное фото разрешённого диалога с приватным кешем в памяти.

Проверяет выбор и версию после каждого чанка; кеш ограничен 64 фото по 512 КиБ.

```typescript
async avatar(id: string, signal: AbortSignal)
```

<a id="symbol-MessengerService.avatar.check"></a>

## MessengerService.avatar.check

Повторно сверяет выбранность и версию фото во время загрузки.

Отменённый или исключённый запрос не возвращает даже готовый кеш.

```typescript
check()
```

<a id="symbol-MessengerService.cacheMessages"></a>

## MessengerService.cacheMessages

Записывает разрешённые сообщения фоновой страницы с проверкой источника.

Флаг notify относится только к сверке свежей головы, история молчит.

```typescript
cacheMessages(id: string, messages: Message[], notify = false)
```

<a id="symbol-MessengerService.canDiscoverContacts"></a>

## MessengerService.canDiscoverContacts

Проверяет готовность источника к обнаружению новых личных входящих.

Отсутствие Telegram-сессии не запускает авторизацию или сетевой обход.

```typescript
canDiscoverContacts()
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

<a id="symbol-MessengerService.discoverContact"></a>

## MessengerService.discoverContact

Принимает новые метаданные только от зарегистрированного источника.

История становится доступна после атомарного разрешения нового личного контакта.

```typescript
discoverContact(conversation: Conversation)
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

Отмечает прочитанным до реально показанного либо явно выбранного сообщения.

Проверяет маршрут, сохраняет новые входящие и не откатывает позднюю границу.

```typescript
async markRead(id: string, messageId?: string)
```

<a id="symbol-MessengerService.onIncoming"></a>

## MessengerService.onIncoming

Регистрирует получателя новых входящих после записи в кеш.

Обработчик не получает историю, правки или повтор уже сохранённого ID.

```typescript
onIncoming(listener: (message: Message) => void)
```

<a id="symbol-MessengerService.open"></a>

## MessengerService.open

Читает страницу только из SQLite и будит фон при незавершённой истории.

Открытие и прокрутка не вызывают MTProto; доступ проверяется до чтения.

```typescript
async open(id: string, before?: string): Promise<ConversationPageResult>
```

<a id="symbol-MessengerService.publishIncoming"></a>

## MessengerService.publishIncoming

Изолирует уведомления от ошибок необязательных подписчиков.

Сообщение уже сохранено; ошибка доставки не отменяет синхронизацию.

```typescript
private publishIncoming(message: Message)
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
