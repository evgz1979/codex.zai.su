# backend/connectors/whatsapp/adapter.ts

Личный SourceAdapter WhatsApp Web, административный QR, выбранная история и отправка текста.

[Исходный модуль](../../backend/connectors/whatsapp/adapter.ts) · [Индекс](README.md)

<a id="symbol-WhatsAppAdapter"></a>

## WhatsAppAdapter

Связывает один личный аккаунт Messenger с серверным WhatsApp Web.

Браузер и профиль живут в отдельном непривилегированном сервисе, доступ ограничен выбором.

```typescript
class WhatsAppAdapter implements SourceAdapter
```

<a id="symbol-WhatsAppAdapter.authStatus"></a>

## WhatsAppAdapter.authStatus

Получает актуальный административный QR или состояние подключения.

Отсутствующий worker не раскрывает исходное исключение или параметры сессии.

```typescript
async authStatus(): Promise<WhatsAppStatus>
```

<a id="symbol-WhatsAppAdapter.begin"></a>

## WhatsAppAdapter.begin

Явно запускает браузер и временное ожидание сканирования QR.

Занятая другим аккаунтом сессия не отключается и не передаётся новому владельцу.

```typescript
async begin()
```

<a id="symbol-WhatsAppAdapter.canDiscoverContacts"></a>

## WhatsAppAdapter.canDiscoverContacts

Позволяет фоновую сверку метаданных настроенного WhatsApp.

Пустой фактический каталог до ready не становится исходной политикой контактов.

```typescript
canDiscoverContacts()
```

<a id="symbol-WhatsAppAdapter.connect"></a>

## WhatsAppAdapter.connect

Поднимает только ранее разрешённую сохранённую сессию.

При отсутствии связанного профиля QR создаётся исключительно по кнопке администратора.

```typescript
async connect()
```

<a id="symbol-WhatsAppAdapter.constructor"></a>

## WhatsAppAdapter.constructor

Вычисляет постоянный ключ приватного профиля без передачи пути worker.

Подмена транспорта разрешена только в изолированных тестах.

```typescript
constructor(directory: string, private store: Store, private call: typeof browserCall = browserCall)
```

<a id="symbol-WhatsAppAdapter.disconnect"></a>

## WhatsAppAdapter.disconnect

Останавливает браузер аккаунта, сохраняя связанный профиль на сервере.

Используется при остановке личного аккаунта и не затрагивает другие источники.

```typescript
async disconnect()
```

<a id="symbol-WhatsAppAdapter.enabled"></a>

## WhatsAppAdapter.enabled

Проверяет сохранённое разрешение на работу источника.

Нет автоматического QR-входа при пустой настройке.

```typescript
private enabled()
```

<a id="symbol-WhatsAppAdapter.historyPage"></a>

## WhatsAppAdapter.historyPage

Читает одну ограниченную страницу исключительно выбранного диалога.

Курсор относится к native message ID в том же WhatsApp-чате.

```typescript
async historyPage(conversationId: string, before?: string, limit = 100): Promise<HistoryPage>
```

<a id="symbol-WhatsAppAdapter.listConversations"></a>

## WhatsAppAdapter.listConversations

Возвращает только метаданные каталога или прежний выбранный кеш при сбое.

Не запрашивает историю и не изменяет отметки прочтения.

```typescript
async listConversations(): Promise<Conversation[]>
```

<a id="symbol-WhatsAppAdapter.markRead"></a>

## WhatsAppAdapter.markRead

Не подтверждает скрытые сообщения методом полного прочтения WhatsApp-чата.

Библиотека не предоставляет точной границы read; счётчик остаётся до чтения в официальном клиенте.

```typescript
async markRead(_id: string, _messageId: string): Promise<void>
```

<a id="symbol-WhatsAppAdapter.recentMessages"></a>

## WhatsAppAdapter.recentMessages

Реализует общий контракт короткой головы выбранного диалога.

Источник не используется для чтения неразрешённого ID.

```typescript
async recentMessages(id: string, limit: number): Promise<Message[]>
```

<a id="symbol-WhatsAppAdapter.request"></a>

## WhatsAppAdapter.request

Вызывает фиксированную операцию для своего серверного ключа.

Разрешённые диалоги берутся заново из SQLite на каждом запросе.

```typescript
private async request(action: BrowserAction, input: Partial<BrowserRequest> = {}): Promise<BrowserResult>
```

<a id="symbol-WhatsAppAdapter.revoke"></a>

## WhatsAppAdapter.revoke

Отзывает связанную браузерную сессию и отключает автоматическое восстановление.

Ранее сохранённая история Messenger не удаляется.

```typescript
async revoke()
```

<a id="symbol-WhatsAppAdapter.sendText"></a>

## WhatsAppAdapter.sendText

Отправляет текст в точную пару выбранного чата и получателя.

Автоматическая отметка всего WhatsApp-чата прочитанным при отправке отключена.

```typescript
async sendText(destination: Destination, text: string)
```

<a id="symbol-WhatsAppAdapter.status"></a>

## WhatsAppAdapter.status

Возвращает безопасное последнее состояние без QR общего status API.

QR доступен только отдельному административному маршруту после проверки роли.

```typescript
status(): WhatsAppStatus
```
