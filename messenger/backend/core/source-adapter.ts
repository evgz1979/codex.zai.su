import type { Conversation, Destination, Message, Source } from '../../shared/types.js';
export interface SourceAdapter {
  readonly source: Source;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listConversations(): Promise<Conversation[]>;
  recentMessages(conversationId: string, limit: number): Promise<Message[]>;
  sendText(destination: Destination, text: string): Promise<Message>;
  markRead(conversationId: string, messageId: string): Promise<void>;
}
