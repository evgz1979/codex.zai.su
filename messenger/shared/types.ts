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
export interface AdminStatus { telegram: { configured: boolean; connected: boolean; stage: TelegramAuthStage }; selectedCount: number }
