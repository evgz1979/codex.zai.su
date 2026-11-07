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

Загружает диалоги и ограниченную свежую выборку сообщений.

Успех заменяет снимок, ошибка помечает прежний снимок stale и возвращает 503.

```typescript
private async doRefresh(): Promise<Snapshot>
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

Подгружает сообщения выбранного диалога в общую ленту.

Заменяет сообщения этого диалога, не помечая его прочитанным.

```typescript
async open(id: string)
```

<a id="symbol-MessengerService.persist"></a>

## MessengerService.persist

Нормализует текущие сообщения и сохраняет снимок.

SQLite получает ограниченный JSON-кеш без секретов источников.

```typescript
private persist()
```

<a id="symbol-MessengerService.refresh"></a>

## MessengerService.refresh

Запускает ручное обновление общей ленты.

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

Не обращается к сети и не передаёт credentials адаптеров.

```typescript
snapshot(): Snapshot
```

<a id="symbol-MessengerService.sorted"></a>

## MessengerService.sorted

Убирает дубликаты ID и упорядочивает сообщения по времени.

При равной дате сравнивает ID и оставляет только cachedMessages последних.

```typescript
private sorted(messages: Message[])
```
