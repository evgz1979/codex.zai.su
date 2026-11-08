# shared/types.ts

Общие DTO ленты и каталога, статусы веб-авторизации, лимиты, ID и Destination.

[Исходный модуль](../../shared/types.ts) · [Индекс](README.md)

<a id="symbol-ACCOUNT_RESERVED_NAMES"></a>

## ACCOUNT_RESERVED_NAMES

Исключает служебные пути из коротких имён новых личных ссылок.

Существующие имена продолжают работать через прежний путь /u/username.

```typescript
const ACCOUNT_RESERVED_NAMES = ['owner', 'admin', 'api', 'assets', 'healthz'] as const
```

<a id="symbol-AccountInfo"></a>

## AccountInfo

Показывает имя личного Messenger без Telegram-реквизитов.

Персональная ссылка публично раскрывает только выбранное владельцем имя.

```typescript
export interface AccountInfo {
    id: string;
    username: string;
    displayName: string;
    isOwner: boolean;
    path?: string;
}
```

<a id="symbol-AdminDialogCatalog"></a>

## AdminDialogCatalog

Дополняет каталог сохранёнными разрешениями для административного выбора.

Не используется в пользовательском API и не расширяет allowlist через папки.

```typescript
export interface AdminDialogCatalog extends ConversationCatalog {
    selectedIds: EntityId[];
}
```

<a id="symbol-AdminStatus"></a>

## AdminStatus

Возвращает готовность источника и число разрешённых диалогов.

Секреты и пользовательские сообщения в модель не входят.

```typescript
export interface AdminStatus {
    telegram: {
        configured: boolean;
        connected: boolean;
        stage: TelegramAuthStage;
        issue?: TelegramAuthIssue;
    };
    whatsapp?: WhatsAppStatus;
    selectedCount: number;
}
```

<a id="symbol-Attachment"></a>

## Attachment

Описывает метаданные вложения общей модели.

Содержимое кешируется отдельно; DTO не содержит реквизитов провайдера.

```typescript
export interface Attachment {
    id: EntityId;
    kind: 'image' | 'video' | 'file' | 'audio' | 'unsupported';
    name: string;
    mimeType?: string;
    size?: number;
    downloadable?: boolean;
    hasPreview?: boolean;
    isVoice?: boolean;
}
```

<a id="symbol-AttachmentRequest"></a>

## AttachmentRequest

Задаёт точный маршрут чтения вложения сохранённого сообщения.

Сервер повторно проверяет диалог, сообщение, источник и ID вложения.

```typescript
export interface AttachmentRequest {
    conversationId: EntityId;
    messageId: EntityId;
    attachmentId: EntityId;
    variant?: 'preview';
}
```

<a id="symbol-compareConversations"></a>

## compareConversations

Поднимает диалоги с непрочитанными и сохраняет свежие сообщения сверху.

При равном времени порядок устойчив по общему ID.

```typescript
compareConversations(a: Conversation, b: Conversation)
```

<a id="symbol-comparePosition"></a>

## comparePosition

Сравнивает позиции сообщений одного диалога для подтверждения просмотра.

При равной дате использует последовательность источника, затем общий ID.

```typescript
comparePosition(a: Pick<Message, 'date' | 'id' | 'sequence'>, b: Pick<Message, 'date' | 'id' | 'sequence'>)
```

<a id="symbol-Conversation"></a>

## Conversation

Описывает личный диалог или группу независимо от провайдера.

previewMessageId связывает превью с последним сообщением независимо от загрузки истории.

```typescript
export interface Conversation {
    id: EntityId;
    sourceId: EntityId;
    title: string;
    kind: 'direct' | 'group' | 'channel';
    recipient: Recipient;
    unreadCount: number;
    updatedAt: string;
    preview: string;
    previewMessageId?: EntityId;
    canSend: boolean;
    isBot?: boolean;
    avatarVersion?: string;
    avatarThumbnail?: string;
}
```

<a id="symbol-ConversationCatalog"></a>

## ConversationCatalog

Передаёт ограниченный каталог метаданных источника и его папки.

truncated сообщает о неполной выборке; история и native peer сюда не входят.

```typescript
export interface ConversationCatalog {
    conversations: Conversation[];
    folders: ConversationFolder[];
    truncated: boolean;
}
```

<a id="symbol-ConversationFolder"></a>

## ConversationFolder

Описывает папку источника и входящие в неё диалоги каталога.

Один диалог может входить в несколько папок; членство не даёт прав чтения.

```typescript
export interface ConversationFolder {
    id: EntityId;
    sourceId: EntityId;
    title: string;
    conversationIds: EntityId[];
}
```

<a id="symbol-ConversationPageResult"></a>

## ConversationPageResult

Возвращает отдельную страницу диалога и ограниченную общую ленту.

Страница не теряется при вытеснении старых сообщений из общего кеша.

```typescript
export interface ConversationPageResult {
    page: MessagePage;
    snapshot: Snapshot;
}
```

<a id="symbol-DeliveryStatus"></a>

## DeliveryStatus

Перечисляет общие состояния сообщения.

Наличие delivered/read в типе не означает их определение TelegramAdapter.

```typescript
export type DeliveryStatus = 'pending' | 'received' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';
```

<a id="symbol-Destination"></a>

## Destination

Фиксирует источник, диалог и получателя исходящего сообщения.

Сервер сверяет всю тройку с известным Conversation.

```typescript
export interface Destination {
    sourceId: EntityId;
    conversationId: EntityId;
    recipientId: EntityId;
}
```

<a id="symbol-destinationFor"></a>

## destinationFor

Получает маршрут отправки из Conversation.

Копирует sourceId, id диалога и recipient.id без выбора провайдера по догадке.

```typescript
destinationFor(c: Conversation): Destination
```

<a id="symbol-entityId"></a>

## entityId

Кодирует внешний ID из источника, типа и native ID.

Экранирует компоненты, чтобы двоеточия native ID не создавали коллизии.

```typescript
entityId(sourceId: string, kind: string, nativeId: string): EntityId
```

<a id="symbol-EntityId"></a>

## EntityId

Обозначает внешний строковый идентификатор общей модели.

Значения строятся entityId с пространством имён источника и типа.

```typescript
export type EntityId = string;
```

<a id="symbol-HistoryPage"></a>

## HistoryPage

Описывает внутреннюю страницу источника для фонового заполнения SQLite.

cursors включает сервисные записи и используется только серверным синхронизатором.

```typescript
export interface HistoryPage extends MessagePage {
    cursors: string[];
}
```

<a id="symbol-LIMITS"></a>

## LIMITS

Задаёт ограничения выборок, кеша и длины текста MVP.

Одна константа используется сервером и клиентской валидацией текста.

```typescript
const LIMITS = { conversations: 1000, pageMessages: 10, syncMessages: 100, cachedMessages: 400, text: 4096 } as const
```

<a id="symbol-MEDIA_LIMITS"></a>

## MEDIA_LIMITS

Ограничивает память запроса и объём приватного кеша медиа.

Отдельная фоновая подготовка ограничена пятью днями, текстовая история не усечена.

```typescript
const MEDIA_LIMITS = { fileBytes: 32 * 1024 * 1024, cacheBytes: 512 * 1024 * 1024, parallel: 2, cacheFiles: 2048, timeoutMs: 60000, previewBytes: 512 * 1024, preloadDays: 5 } as const
```

<a id="symbol-Message"></a>

## Message

Описывает текстовое сообщение и его происхождение.

Включает источник, диалог, отправителя, дату и наблюдаемый статус.

```typescript
export interface Message {
    id: EntityId;
    sourceId: EntityId;
    conversationId: EntityId;
    sender: Recipient;
    date: string;
    text: string;
    outgoing: boolean;
    status: DeliveryStatus;
    attachments: Attachment[];
    voiceTranscription?: VoiceTranscription;
    sourceKey?: EntityId;
    editedAt?: string;
    sequence?: number;
}
```

<a id="symbol-MessagePage"></a>

## MessagePage

Передаёт одну страницу сообщений конкретного диалога.

nextCursor относится только к этому диалогу; null завершает доступную историю; inbox обозначает общую ленту.

```typescript
export interface MessagePage {
    conversationId: EntityId;
    messages: Message[];
    nextCursor: string | null;
    oldestCursor?: string | null;
    historyComplete?: boolean;
    cached?: boolean;
    sourceUpdatedAt?: number;
}
```

<a id="symbol-messagePreview"></a>

## messagePreview

Формирует короткое превью последнего сообщения для общего списка чатов.

Текст имеет приоритет; медиа без подписи получают фактический тип или имя файла.

```typescript
messagePreview(message: Pick<Message, 'text' | 'attachments'>): string
```

<a id="symbol-messengerPageBase"></a>

## messengerPageBase

Определяет префикс личной страницы по короткому или прежнему адресу.

Служебные пути владельца не считаются пользовательскими страницами.

```typescript
messengerPageBase(pathname: string): string
```

<a id="symbol-OFFLINE_LIMITS"></a>

## OFFLINE_LIMITS

Ограничивает фоновое заполнение и размер браузерного кеша выбранных диалогов.

По пять последних сообщений каждого чата сохраняются без его открытия и отметки прочтения.

```typescript
const OFFLINE_LIMITS = { conversations: 200, messages: 1000, perConversation: 100, headMessages: 5, batch: 20, bytes: 4 * 1024 * 1024, refreshMs: 30000 } as const
```

<a id="symbol-OfflineBatch"></a>

## OfflineBatch

Передаёт небольшую порцию истории выбранных чатов для автономного чтения.

Источник — только серверная SQLite; readyIds также включает заведомо пустые чаты.

```typescript
export interface OfflineBatch {
    messages: Message[];
    readyIds: EntityId[];
}
```

<a id="symbol-PASSWORD_LIMITS"></a>

## PASSWORD_LIMITS

Задаёт одинаковые границы новых паролей Messenger для CLI, API и формы.

Не изменяет существующие пароли и не относится к Telegram 2FA.

```typescript
const PASSWORD_LIMITS = { min: 8, max: 512 } as const
```

<a id="symbol-positionSequence"></a>

## positionSequence

Получает порядок источника для новой записи или прежнего составного message ID.

Совместимость применяется только к числовому суффиксу после закодированного разделителя.

```typescript
positionSequence(message: Pick<Message, 'id' | 'sequence'>)
```

<a id="symbol-Recipient"></a>

## Recipient

Описывает адресата либо отправителя сообщения.

ID и видимое имя не заменяют маршрут Destination.

```typescript
export interface Recipient {
    id: EntityId;
    name: string;
    isSelf?: boolean;
}
```

<a id="symbol-SendRequest"></a>

## SendRequest

Описывает запрос отправки текста в точный Destination.

requestId используется для временной дедупликации одного процесса.

```typescript
export interface SendRequest {
    destination: Destination;
    text: string;
    requestId: string;
}
```

<a id="symbol-SessionInfo"></a>

## SessionInfo

Передаёт состояние веб-входа и первичной настройки.

CSRF возвращается после входа, Telegram-сессия сюда не входит.

```typescript
export interface SessionInfo {
    authenticated: boolean;
    setupRequired: boolean;
    csrfToken?: string;
    account?: AccountInfo;
    expiresAt?: number;
}
```

<a id="symbol-Snapshot"></a>

## Snapshot

Передаёт ограниченный снимок общей ленты.

stale отражает результат последней фоновой сверки метаданных.

```typescript
export interface Snapshot {
    sources: Source[];
    conversations: Conversation[];
    messages: Message[];
    refreshedAt: string | null;
    stale: boolean;
    sync?: SyncStatus;
}
```

<a id="symbol-Source"></a>

## Source

Описывает экземпляр источника для общего интерфейса.

Не содержит реквизитов авторизации или native client.

```typescript
export interface Source {
    id: EntityId;
    kind: string;
    name: string;
    connected: boolean;
}
```

<a id="symbol-SyncStatus"></a>

## SyncStatus

Передаёт безопасный статус автоматической синхронизации выбранных диалогов.

Не содержит текстов, native peer, реквизитов или исходных исключений.

```typescript
export interface SyncStatus {
    pendingConversations: number;
    pausedUntil?: string;
}
```

<a id="symbol-TelegramAuthIssue"></a>

## TelegramAuthIssue

Описывает безопасную причину отказа и числовое время ожидания.

Не включает телефон, ключи, код, 2FA или request Telegram.

```typescript
export interface TelegramAuthIssue {
    code: TelegramAuthIssueCode;
    retryAfterSeconds?: number;
}
```

<a id="symbol-TelegramAuthIssueCode"></a>

## TelegramAuthIssueCode

Перечисляет разрешённые категории отказа Telegram.

Произвольный текст исключений и введённые реквизиты не входят в контракт.

```typescript
export type TelegramAuthIssueCode = 'invalid_api' | 'api_blocked' | 'invalid_phone' | 'phone_blocked' | 'account_missing' | 'invalid_code' | 'invalid_password' | 'code_expired' | 'rate_limited' | 'update_required' | 'restart_required' | 'telegram_unavailable' | 'network_timeout' | 'network_error' | 'captcha_required' | 'email_required' | 'official_app_required' | 'cancelled' | 'flow_expired' | 'session_failed' | 'unknown';
```

<a id="symbol-telegramAuthIssueText"></a>

## telegramAuthIssueText

Выбирает фиксированный текст ошибки для административного интерфейса.

Не вставляет строки провайдера; допускает только безопасное число секунд.

```typescript
telegramAuthIssueText(issue: TelegramAuthIssue): string
```

<a id="symbol-TelegramAuthStage"></a>

## TelegramAuthStage

Описывает безопасные этапы Telegram-авторизации.

Не содержит введённые данные или MTProto-объекты.

```typescript
export type TelegramAuthStage = 'idle' | 'connecting' | 'code' | 'password' | 'connected' | 'error';
```

<a id="symbol-VoiceTranscription"></a>

## VoiceTranscription

Передаёт текст встроенной расшифровки голосового сообщения источника.

pending означает промежуточный текст; native ID задания остаётся на сервере.

```typescript
export interface VoiceTranscription {
    text: string;
    pending: boolean;
}
```

<a id="symbol-WhatsAppStatus"></a>

## WhatsAppStatus

Передаёт состояние серверного WhatsApp Web в личную админку.

QR временный и не сохраняется frontend; cookie и профиль Chromium никогда не возвращаются.

```typescript
export interface WhatsAppStatus {
    stage: 'idle' | 'starting' | 'qr' | 'syncing' | 'connected' | 'error' | 'unavailable' | 'busy';
    connected: boolean;
    progress?: number;
    qrDataUrl?: string;
    expiresAt?: number;
    issue?: string;
}
```
