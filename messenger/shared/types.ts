// Внешние идентификаторы всегда включают источник и тип сущности.
//: Обозначает внешний строковый идентификатор общей модели.
//: Значения строятся entityId с пространством имён источника и типа.
export type EntityId = string;
//: Описывает экземпляр источника для общего интерфейса.
//: Не содержит реквизитов авторизации или native client.
export interface Source { id: EntityId; kind: string; name: string; connected: boolean }
//: Описывает адресата либо отправителя сообщения.
//: ID и видимое имя не заменяют маршрут Destination.
export interface Recipient { id: EntityId; name: string; isSelf?: boolean }
//: Описывает метаданные вложения общей модели.
//: MVP не скачивает вложения и использует обозначение unsupported.
export interface Attachment { id: EntityId; kind: 'image' | 'file' | 'audio' | 'unsupported'; name: string; mimeType?: string; size?: number }
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
//: Содержит recipient, unreadCount и признак доступности записи canSend.
export interface Conversation {
  id: EntityId;
  sourceId: EntityId;
  title: string;
  kind: 'direct' | 'group' | 'channel';
  recipient: Recipient;
  unreadCount: number;
  updatedAt: string;
  preview: string;
  canSend: boolean;
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
}
//: Передаёт ограниченный снимок общей ленты.
//: stale указывает на необходимость ручного обновления данных.
export interface Snapshot {
  sources: Source[];
  conversations: Conversation[];
  messages: Message[];
  refreshedAt: string | null;
  stale: boolean;
}
//: Описывает запрос отправки текста в точный Destination.
//: requestId используется для временной дедупликации одного процесса.
export interface SendRequest { destination: Destination; text: string; requestId: string }
//: Передаёт состояние веб-входа и первичной настройки.
//: CSRF возвращается после входа, Telegram-сессия сюда не входит.
export interface SessionInfo { authenticated: boolean; setupRequired: boolean; csrfToken?: string }
//: Задаёт ограничения выборок, кеша и длины текста MVP.
//: Одна константа используется сервером и клиентской валидацией текста.
export const LIMITS = { conversations: 1000, recentConversations: 12, messagesPerConversation: 20, selectedMessages: 40, cachedMessages: 400, text: 4096 } as const;
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
export interface AdminStatus { telegram: { configured: boolean; connected: boolean; stage: TelegramAuthStage; issue?: TelegramAuthIssue }; selectedCount: number }

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
