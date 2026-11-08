// Внешние идентификаторы всегда включают источник и тип сущности.
//: Обозначает внешний строковый идентификатор общей модели.
//: Значения строятся entityId с пространством имён источника и типа.
export type EntityId = string;
//: Описывает экземпляр источника для общего интерфейса.
//: Не содержит реквизитов авторизации или native client.
export interface Source { id: EntityId; kind: string; name: string; connected: boolean; canMarkRead?:boolean }
//: Описывает адресата либо отправителя сообщения.
//: ID и видимое имя не заменяют маршрут Destination.
export interface Recipient { id: EntityId; name: string; isSelf?: boolean }
//: Описывает метаданные вложения общей модели.
//: Содержимое кешируется отдельно; DTO не содержит реквизитов провайдера.
export interface Attachment { id: EntityId; kind: 'image' | 'video' | 'file' | 'audio' | 'unsupported'; name: string; mimeType?: string; size?: number; downloadable?:boolean;hasPreview?:boolean;isVoice?:boolean }
//: Задаёт точный маршрут чтения вложения сохранённого сообщения.
//: Сервер повторно проверяет диалог, сообщение, источник и ID вложения.
export interface AttachmentRequest {conversationId:EntityId;messageId:EntityId;attachmentId:EntityId;variant?:'preview'}
//: Передаёт текст встроенной расшифровки голосового сообщения источника.
//: pending означает промежуточный текст; native ID задания остаётся на сервере.
export interface VoiceTranscription {text:string;pending:boolean}
//: Ограничивает фоновое заполнение и размер браузерного кеша выбранных диалогов.
//: По пять последних сообщений каждого чата сохраняются без его открытия и отметки прочтения.
export const OFFLINE_LIMITS={conversations:200,messages:1000,perConversation:100,headMessages:5,batch:20,bytes:4*1024*1024,refreshMs:30000} as const;
//: Передаёт небольшую порцию истории выбранных чатов для автономного чтения.
//: Источник — только серверная SQLite; readyIds также включает заведомо пустые чаты.
export interface OfflineBatch {messages:Message[];readyIds:EntityId[]}
//: Ограничивает память запроса и объём приватного кеша медиа.
//: Отдельная фоновая подготовка ограничена пятью днями, текстовая история не усечена.
export const MEDIA_LIMITS={fileBytes:32*1024*1024,cacheBytes:512*1024*1024,parallel:2,cacheFiles:2048,timeoutMs:60000,previewBytes:512*1024,preloadDays:5} as const;
//: Перечисляет общие состояния сообщения.
//: Наличие delivered/read в типе не означает их определение TelegramAdapter.
export type DeliveryStatus = 'pending' | 'received' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';
//: Фиксирует источник, диалог и получателя исходящего сообщения.
//: Сервер сверяет всю тройку с известным Conversation.
export interface Destination {
  sourceId: EntityId;
  conversationId: EntityId;
  recipientId: EntityId;
}
//: Описывает личный диалог или группу независимо от провайдера.
//: previewMessageId связывает превью с последним сообщением независимо от загрузки истории.
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
//: Описывает папку источника и входящие в неё диалоги каталога.
//: Один диалог может входить в несколько папок; членство не даёт прав чтения.
export interface ConversationFolder { id: EntityId; sourceId: EntityId; title: string; conversationIds: EntityId[] }
//: Передаёт ограниченный каталог метаданных источника и его папки.
//: truncated сообщает о неполной выборке; история и native peer сюда не входят.
export interface ConversationCatalog { conversations: Conversation[]; folders: ConversationFolder[]; truncated: boolean }
//: Дополняет каталог сохранёнными разрешениями для административного выбора.
//: Не используется в пользовательском API и не расширяет allowlist через папки.
export interface AdminDialogCatalog extends ConversationCatalog { selectedIds: EntityId[] }
//: Описывает текстовое сообщение и его происхождение.
//: Включает источник, диалог, отправителя, дату и наблюдаемый статус.
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
  voiceTranscription?:VoiceTranscription;
  sourceKey?:EntityId;
  editedAt?:string;
  sequence?:number;
}
//: Формирует короткое превью последнего сообщения для общего списка чатов.
//: Текст имеет приоритет; медиа без подписи получают фактический тип или имя файла.
export function messagePreview(message:Pick<Message,'text'|'attachments'>):string{
  const text=message.text.trim();if(text)return [...text].slice(0,300).join('');
  const attachment=message.attachments[0];if(!attachment)return 'Сообщение';
  return attachment.kind==='image'?'Фото':attachment.kind==='video'?'Видео':attachment.kind==='audio'?(attachment.isVoice?'Голосовое сообщение':'Аудио'):attachment.kind==='file'?attachment.name||'Файл':attachment.name||'Вложение';
}
//: Сравнивает позиции сообщений одного диалога для подтверждения просмотра.
//: При равной дате использует последовательность источника, затем общий ID.
export function comparePosition(a:Pick<Message,'date'|'id'|'sequence'>,b:Pick<Message,'date'|'id'|'sequence'>){const first=positionSequence(a);const second=positionSequence(b);return a.date.localeCompare(b.date)||(first!==undefined&&second!==undefined?first-second:a.id.localeCompare(b.id));}
//: Получает порядок источника для новой записи или прежнего составного message ID.
//: Совместимость применяется только к числовому суффиксу после закодированного разделителя.
export function positionSequence(message:Pick<Message,'id'|'sequence'>){if(Number.isSafeInteger(message.sequence))return message.sequence;const legacy=/:message:.*%2F([0-9]{1,10})$/.exec(message.id);return legacy?Number(legacy[1]):undefined;}
//: Поднимает диалоги с непрочитанными и сохраняет свежие сообщения сверху.
//: При равном времени порядок устойчив по общему ID.
export function compareConversations(a:Conversation,b:Conversation){return Number(b.unreadCount>0)-Number(a.unreadCount>0)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id);}
//: Передаёт ограниченный снимок общей ленты.
//: stale отражает результат последней фоновой сверки метаданных.
export interface Snapshot {
  sources: Source[];
  conversations: Conversation[];
  messages: Message[];
  refreshedAt: string | null;
  stale: boolean;
  sync?:SyncStatus;
}
//: Передаёт безопасный статус автоматической синхронизации выбранных диалогов.
//: Не содержит текстов, native peer, реквизитов или исходных исключений.
export interface SyncStatus {pendingConversations:number;pausedUntil?:string}
//: Передаёт одну страницу сообщений конкретного диалога.
//: nextCursor относится только к этому диалогу; null завершает доступную историю; inbox обозначает общую ленту.
export interface MessagePage {conversationId:EntityId;messages:Message[];nextCursor:string|null;oldestCursor?:string|null;historyComplete?:boolean;cached?:boolean;sourceUpdatedAt?:number}
//: Описывает внутреннюю страницу источника для фонового заполнения SQLite.
//: cursors включает сервисные записи и используется только серверным синхронизатором.
export interface HistoryPage extends MessagePage {cursors:string[]}
//: Возвращает отдельную страницу диалога и ограниченную общую ленту.
//: Страница не теряется при вытеснении старых сообщений из общего кеша.
export interface ConversationPageResult {page:MessagePage;snapshot:Snapshot}
//: Описывает запрос отправки текста в точный Destination.
//: requestId используется для временной дедупликации одного процесса.
export interface SendRequest { destination: Destination; text: string; requestId: string }
//: Передаёт состояние веб-входа и первичной настройки.
//: CSRF возвращается после входа, Telegram-сессия сюда не входит.
export interface SessionInfo { authenticated: boolean; setupRequired: boolean; csrfToken?: string; account?:AccountInfo;expiresAt?:number }
//: Показывает имя личного Messenger без Telegram-реквизитов.
//: Персональная ссылка публично раскрывает только выбранное владельцем имя.
export interface AccountInfo {id:string;username:string;displayName:string;isOwner:boolean;path?:string}
//: Исключает служебные пути из коротких имён новых личных ссылок.
//: Существующие имена продолжают работать через прежний путь /u/username.
export const ACCOUNT_RESERVED_NAMES=['owner','admin','api','assets','healthz'] as const;
//: Определяет префикс личной страницы по короткому или прежнему адресу.
//: Служебные пути владельца не считаются пользовательскими страницами.
export function messengerPageBase(pathname:string):string {
  const legacy=/^\/u\/[a-z][a-z0-9_-]{1,31}(?=\/|$)/.exec(pathname);
  if(legacy)return legacy[0];
  const direct=/^\/([a-z][a-z0-9_-]{1,31})(?=\/|$)/.exec(pathname);
  return direct&&!ACCOUNT_RESERVED_NAMES.some(name=>name===direct[1])?direct[0]:'';
}
//: Задаёт ограничения выборок, кеша и длины текста MVP.
//: Одна константа используется сервером и клиентской валидацией текста.
export const LIMITS = { conversations: 1000, pageMessages: 10, syncMessages:100, cachedMessages: 400, text: 4096 } as const;
//: Задаёт одинаковые границы новых паролей Messenger для CLI, API и формы.
//: Не изменяет существующие пароли и не относится к Telegram 2FA.
export const PASSWORD_LIMITS = {min:8,max:512} as const;
//: Кодирует внешний ID из источника, типа и native ID.
//: Экранирует компоненты, чтобы двоеточия native ID не создавали коллизии.
export function entityId(sourceId: string, kind: string, nativeId: string): EntityId {
  return [sourceId, kind, nativeId].map(encodeURIComponent).join(':');
}
//: Получает маршрут отправки из Conversation.
//: Копирует sourceId, id диалога и recipient.id без выбора провайдера по догадке.
export function destinationFor(c: Conversation): Destination {
  return { sourceId: c.sourceId, conversationId: c.id, recipientId: c.recipient.id };
}

//: Описывает безопасные этапы Telegram-авторизации.
//: Не содержит введённые данные или MTProto-объекты.
export type TelegramAuthStage = 'idle' | 'connecting' | 'code' | 'password' | 'connected' | 'error';
//: Возвращает готовность источника и число разрешённых диалогов.
//: Секреты и пользовательские сообщения в модель не входят.
export interface AdminStatus { telegram: { configured: boolean; connected: boolean; stage: TelegramAuthStage; issue?: TelegramAuthIssue }; whatsapp?:WhatsAppStatus; selectedCount: number }

//: Передаёт состояние серверного WhatsApp Web в личную админку.
//: QR временный и не сохраняется frontend; cookie и профиль Chromium никогда не возвращаются.
export interface WhatsAppStatus {stage:'idle'|'starting'|'qr'|'syncing'|'connected'|'error'|'unavailable'|'busy';connected:boolean;progress?:number;qrDataUrl?:string;expiresAt?:number;issue?:string}

//: Перечисляет разрешённые категории отказа Telegram.
//: Произвольный текст исключений и введённые реквизиты не входят в контракт.
export type TelegramAuthIssueCode = 'invalid_api'|'api_blocked'|'invalid_phone'|'phone_blocked'|'account_missing'|'invalid_code'|'invalid_password'|'code_expired'|'rate_limited'|'update_required'|'restart_required'|'telegram_unavailable'|'network_timeout'|'network_error'|'captcha_required'|'email_required'|'official_app_required'|'cancelled'|'flow_expired'|'session_failed'|'unknown';
//: Описывает безопасную причину отказа и числовое время ожидания.
//: Не включает телефон, ключи, код, 2FA или request Telegram.
export interface TelegramAuthIssue {code:TelegramAuthIssueCode;retryAfterSeconds?:number}
//: Выбирает фиксированный текст ошибки для административного интерфейса.
//: Не вставляет строки провайдера; допускает только безопасное число секунд.
export function telegramAuthIssueText(issue:TelegramAuthIssue):string {
  const messages:Record<TelegramAuthIssueCode,string>={
    invalid_api:'Telegram отклонил пару api_id / api_hash. Сверьте оба значения одного приложения на my.telegram.org.',
    api_blocked:'Telegram заблокировал этот API ID. Проверьте приложение на my.telegram.org.',
    invalid_phone:'Telegram не принял номер. Укажите международный формат с + и кодом страны.',
    phone_blocked:'Telegram заблокировал авторизацию этого номера. Проверьте аккаунт в официальном приложении.',
    account_missing:'Для этого номера не найден существующий Telegram-аккаунт. Регистрация здесь не выполняется.',
    invalid_code:'Telegram не принял код. Введите последний код для входа в Messenger, а не для my.telegram.org.',
    invalid_password:'Telegram не принял пароль 2FA. Это пароль облачной двухэтапной проверки Telegram, не пароль Messenger.',
    code_expired:'Код Telegram истёк. Начните вход заново и используйте последний полученный код.',
    rate_limited:'Telegram ограничил попытки входа. Не запрашивайте код повторно, пока ограничение не закончится.',
    update_required:'Telegram требует обновления MTProto-клиента. Повторный запрос кода не исправит эту ошибку.',
    restart_required:'Telegram запросил перезапуск авторизации. Начните вход заново.',
    telegram_unavailable:'Telegram не смог выполнить авторизацию. Повторите позже.',
    network_timeout:'Истекло время ответа Telegram. Код не запрашивается повторно автоматически.',
    network_error:'Не удалось установить соединение с Telegram. Повторите позже.',
    captcha_required:'Telegram потребовал CAPTCHA. Этот способ входа пока не поддерживается.',
    email_required:'Telegram запросил подтверждение email. Этот шаг пока не поддерживается админкой.',
    official_app_required:'Telegram требует шаг получения кода, доступный только официальному приложению. Здесь продолжить вход нельзя.',
    cancelled:'Вход отменён.',flow_expired:'Истекли пять минут ожидания входа. Начните авторизацию заново.',
    session_failed:'Telegram не подтвердил готовность сессии. Начните вход заново.',
    unknown:'Авторизация завершилась неизвестной ошибкой. Диагностика: unknown. Секреты не выводятся.',
  };
  const text=Object.hasOwn(messages,issue.code)?messages[issue.code]:messages.unknown;
  return issue.code==='rate_limited'&&Number.isSafeInteger(issue.retryAfterSeconds)&&issue.retryAfterSeconds!>0&&issue.retryAfterSeconds!<=31536000?`${text} Подождите ${issue.retryAfterSeconds} сек.`:text;
}
