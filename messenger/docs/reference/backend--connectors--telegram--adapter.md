# backend/connectors/telegram/adapter.ts

Преобразование Telegram dialogs/messages в общие DTO и проверка назначения.

[Исходный модуль](../../backend/connectors/telegram/adapter.ts) · [Индекс](README.md)

<a id="symbol-id"></a>

## id

Строит ID Telegram-сущности через общий entityId.

Источник включён в каждый внешний идентификатор.

```typescript
id(kind: string, native: string)
```

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

<a id="symbol-TelegramAdapter.dialog"></a>

## TelegramAdapter.dialog

Находит native dialog по общему conversationId.

При отсутствии в памяти заново получает ограниченный список диалогов.

```typescript
private async dialog(conversationId: string)
```

<a id="symbol-TelegramAdapter.disconnect"></a>

## TelegramAdapter.disconnect

Закрывает клиент и сбрасывает connected.

Удалённая Telegram-авторизация остаётся действующей.

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

<a id="symbol-TelegramAdapter.listConversations"></a>

## TelegramAdapter.listConversations

Получает ограниченный список личных диалогов и групп.

Пропускает broadcast/communities, запрещает запись в форумы и платные диалоги.

```typescript
async listConversations(): Promise<Conversation[]>
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

<a id="symbol-TelegramAdapter.recentMessages"></a>

## TelegramAdapter.recentMessages

Читает последние сообщения выбранного диалога.

Ограничивает запрос selectedMessages и возвращает только обычные Api.Message.

```typescript
async recentMessages(conversationId: string, limit: number)
```

<a id="symbol-TelegramAdapter.sendText"></a>

## TelegramAdapter.sendText

Отправляет буквальный текст в проверенный Telegram dialog.

Повторно сверяет source и recipient; отключает разметку и link preview.

```typescript
async sendText(destination: Destination, text: string)
```

<a id="symbol-TelegramPort"></a>

## TelegramPort

Ограничивает поверхность teleproto, нужную адаптеру.

Тесты подставляют этот порт без реального Telegram-подключения.

```typescript
type TelegramPort = Pick<TelegramClient, 'connected' | 'connect' | 'checkAuthorization' | 'destroy' | 'getDialogs' | 'getMessages' | 'sendMessage' | 'markAsRead'>;
```
