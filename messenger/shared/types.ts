// Внешние идентификаторы всегда включают источник и тип сущности.
export type EntityId = string;
export interface Source { id: EntityId; kind: string; name: string; connected: boolean }
export interface Recipient { id: EntityId; name: string; isSelf?: boolean }
export interface Attachment { id: EntityId; kind: 'image' | 'file' | 'audio' | 'unsupported'; name: string; mimeType?: string; size?: number }
export type DeliveryStatus = 'pending' | 'received' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';
export interface Destination {
  sourceId: EntityId;
  conversationId: EntityId;
  recipientId: EntityId;
}
export interface Conversation {
  id: EntityId;
  sourceId: EntityId;
  title: string;
  kind: 'direct' | 'group';
  recipient: Recipient;
  unreadCount: number;
  updatedAt: string;
  preview: string;
  canSend: boolean;
}
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
export interface Snapshot {
  sources: Source[];
  conversations: Conversation[];
  messages: Message[];
  refreshedAt: string | null;
  stale: boolean;
}
export interface SendRequest { destination: Destination; text: string; requestId: string }
export interface SessionInfo { authenticated: boolean; setupRequired: boolean; csrfToken?: string }
export const LIMITS = { conversations: 100, recentConversations: 12, messagesPerConversation: 20, selectedMessages: 40, cachedMessages: 400, text: 4096 } as const;
export function entityId(sourceId: string, kind: string, nativeId: string): EntityId {
  return [sourceId, kind, nativeId].map(encodeURIComponent).join(':');
}
export function destinationFor(c: Conversation): Destination {
  return { sourceId: c.sourceId, conversationId: c.id, recipientId: c.recipient.id };
}
