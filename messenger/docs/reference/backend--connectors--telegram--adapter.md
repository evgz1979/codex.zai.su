# backend/connectors/telegram/adapter.ts

Каталог диалогов/папок Telegram, преобразование сообщений в общие DTO и проверка назначения.

[Исходный модуль](../../backend/connectors/telegram/adapter.ts) · [Индекс](README.md)

<a id="symbol-TELEGRAM_SOURCE"></a>

## TELEGRAM_SOURCE

Задаёт стабильный ID личного Telegram-источника.

Это ID экземпляра адаптера, а не общий вид провайдера.

```typescript
const TELEGRAM_SOURCE = 'telegram-personal'
```

<a id="symbol-TelegramAdapter"></a>

## TelegramAdapter

Реализует SourceAdapter для одного личного Telegram-аккаунта.

Сессия и native peer остаются на сервере, DTO не содержат секретов.

```typescript
class TelegramAdapter implements SourceAdapter
```

<a id="symbol-TelegramAdapter.bindEvents"></a>

## TelegramAdapter.bindEvents

Подключает по одному обработчику событий нового клиента.

Не журналирует updates; личные удаления имеют глобальную область, каналы — собственную.

```typescript
private bindEvents()
```

<a id="symbol-TelegramAdapter.bindEvents.changed"></a>

## TelegramAdapter.bindEvents.changed

Преобразует входящее сообщение только после проверки разрешённого диалога.

Правка не увеличивает счётчик непрочитанных как новое сообщение.

```typescript
async changed(event: NewMessageEvent)
```

<a id="symbol-TelegramAdapter.bindEvents.deleted"></a>

## TelegramAdapter.bindEvents.deleted

Передаёт области удалённых ID без содержимого сообщения.

Неоднозначные личные удаления разрешаются серверным индексом source_key.

```typescript
deleted(event: DeletedMessageEvent)
```

<a id="symbol-TelegramAdapter.canDiscoverContacts"></a>

## TelegramAdapter.canDiscoverContacts

Разрешает наблюдение новых личных входящих после существующего входа Telegram.

Проверяет только наличие vault, не запускает интерактивную авторизацию.

```typescript
canDiscoverContacts()
```

<a id="symbol-TelegramAdapter.connect"></a>

## TelegramAdapter.connect

Устанавливает готовое авторизованное соединение.

Параллельные вызовы используют один Promise подключения.

```typescript
async connect()
```

<a id="symbol-TelegramAdapter.constructor"></a>

## TelegramAdapter.constructor

Подключает приватное хранилище и фабрику клиента.

По умолчанию используется teleproto; отдельная фабрика служит изолированным тестам.

```typescript
constructor(private vault: SecretVault, private createClient: (credentials: NonNullable<ReturnType<SecretVault['load']>>, vault: SecretVault) => TelegramPort = telegramClient)
```

<a id="symbol-TelegramAdapter.cursorOffset"></a>

## TelegramAdapter.cursorOffset

Проверяет принадлежность курсора текущему источнику и диалогу.

Не принимает native ID другого чата или произвольный offset Telegram.

```typescript
private cursorOffset(conversationId: string, cursor: string): number
```

<a id="symbol-TelegramAdapter.dialog"></a>

## TelegramAdapter.dialog

Находит native dialog по общему conversationId.

При отсутствии в памяти заново получает ограниченный список диалогов.

```typescript
private async dialog(conversationId: string)
```

<a id="symbol-TelegramAdapter.disconnect"></a>

## TelegramAdapter.disconnect

Закрывает соединение MTProto без удаления авторизации.

При обычной остановке приложения сохранённая сессия остаётся.

```typescript
async disconnect()
```

<a id="symbol-TelegramAdapter.doConnect"></a>

## TelegramAdapter.doConnect

Создаёт клиент из сохранённых credentials и проверяет авторизацию.

Не запускает интерактивный вход и помечает connected только после проверки.

```typescript
private async doConnect()
```

<a id="symbol-TelegramAdapter.fetchPage"></a>

## TelegramAdapter.fetchPage

Читает один ограниченный фрагмент истории для синхронизатора.

Все raw-курсоры сохраняют продвижение даже через сервисные сообщения.

```typescript
private async fetchPage(conversationId: string, count: number, before?: string): Promise<HistoryPage>
```

<a id="symbol-TelegramAdapter.historyPage"></a>

## TelegramAdapter.historyPage

Возвращает внутреннюю страницу до 100 записей для полного фонового кеша.

Не вызывается при открытии страницы браузером и не скачивает медиа.

```typescript
async historyPage(conversationId: string, before?: string, limit: number = LIMITS.syncMessages): Promise<HistoryPage>
```

<a id="symbol-TelegramAdapter.listConversationCatalog"></a>

## TelegramAdapter.listConversationCatalog

Получает административный каталог с существующими папками Telegram.

Не меняет папки, выбор диалогов или сохранённую авторизацию.

```typescript
async listConversationCatalog(): Promise<ConversationCatalog>
```

<a id="symbol-TelegramAdapter.listConversations"></a>

## TelegramAdapter.listConversations

Получает ограниченный список диалогов для общей ленты.

Папки не запрашиваются; история остаётся отдельной операцией.

```typescript
async listConversations(): Promise<Conversation[]>
```

<a id="symbol-TelegramAdapter.loadCatalog"></a>

## TelegramAdapter.loadCatalog

Читает метаданные и при необходимости правила папок одним каталогом.

В памяти адаптера остаются только ID и peer, без содержимого сообщений.

```typescript
private async loadCatalog(withFolders: boolean): Promise<ConversationCatalog>
```

<a id="symbol-TelegramAdapter.mapMessage"></a>

## TelegramAdapter.mapMessage

Преобразует Telegram Message в провайдер-независимый DTO.

ID включает диалог; вложения обозначаются без скачивания, статус не выдаётся за delivered.

```typescript
private mapMessage(m: Api.Message, conversationId: string): Message
```

<a id="symbol-TelegramAdapter.markRead"></a>

## TelegramAdapter.markRead

Отмечает прочитанным до указанного native message ID.

Получает peer только через известный общий conversationId.

```typescript
async markRead(conversationId: string, messageId: string)
```

<a id="symbol-TelegramAdapter.messagePage"></a>

## TelegramAdapter.messagePage

Читает одну страницу до указанного сообщения без обхода других чатов.

Курсор двигается по raw-странице, включая сервисные записи; запрос ограничен 10.

```typescript
async messagePage(conversationId: string, limit: number, before?: string): Promise<MessagePage>
```

<a id="symbol-TelegramAdapter.openAttachment"></a>

## TelegramAdapter.openAttachment

Получает точное сообщение и создаёт ограниченный поток его медиа.

Peer, message и attachment сверяются; свежие file references остаются на сервере.

```typescript
async openAttachment(input: AttachmentRequest, signal: AbortSignal): Promise<AttachmentContent>
```

<a id="symbol-TelegramAdapter.openAvatar"></a>

## TelegramAdapter.openAvatar

Читает маленькое фото только известного диалога через серверный peer.

Не передаёт native location браузеру; размер и доступ повторно проверяются ядром.

```typescript
async openAvatar(conversationId: string, signal: AbortSignal): Promise<AsyncIterable<Uint8Array>>
```

<a id="symbol-TelegramAdapter.recentMessages"></a>

## TelegramAdapter.recentMessages

Читает только первую страницу выбранного диалога.

Совместимый контракт без курсора ограничен десятью сообщениями.

```typescript
async recentMessages(conversationId: string, limit: number)
```

<a id="symbol-TelegramAdapter.revoke"></a>

## TelegramAdapter.revoke

Закрывает клиент и сбрасывает connected.

Удалённая Telegram-авторизация остаётся действующей.

```typescript
async revoke()
```

<a id="symbol-TelegramAdapter.sendText"></a>

## TelegramAdapter.sendText

Отправляет буквальный текст в проверенный Telegram dialog.

Повторно сверяет source и recipient; отключает разметку и link preview.

```typescript
async sendText(destination: Destination, text: string)
```

<a id="symbol-TelegramAdapter.subscribe"></a>

## TelegramAdapter.subscribe

Подписывает ядро на изменения только разрешённых диалогов.

Подписка сохраняется при пересоздании MTProto-клиента; unselected-текст не копируется.

```typescript
subscribe(listener: (event: SourceEvent) => void, allows: (id: string) => boolean, discover?: (conversation: Conversation) => boolean)
```

<a id="symbol-TelegramPort"></a>

## TelegramPort

Ограничивает поверхность teleproto, нужную адаптеру.

Тесты подставляют этот порт без реального Telegram-подключения.

```typescript
type TelegramPort = Pick<TelegramClient, 'connected' | 'connect' | 'checkAuthorization' | 'destroy' | 'getDialogs' | 'getMessages' | 'sendMessage' | 'markAsRead' | 'logOut' | 'invoke' | 'getNotifySettings' | 'addEventHandler' | 'iterDownload'>;
```
