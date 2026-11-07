import type { Conversation, ConversationCatalog, Destination, Message, MessagePage, Source } from '../../shared/types.js';
//: Задаёт контракт чтения страниц, отправки и необязательного каталога папок источника.
//: Папки содержат только метаданные и не дают доступа к истории без выбора.
export interface SourceAdapter {
  readonly source: Source;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listConversations(): Promise<Conversation[]>;
  listConversationCatalog?(): Promise<ConversationCatalog>;
  recentMessages(conversationId: string, limit: number): Promise<Message[]>;
  messagePage?(conversationId:string,limit:number,before?:string):Promise<MessagePage>;
  sendText(destination: Destination, text: string): Promise<Message>;
  markRead(conversationId: string, messageId: string): Promise<void>;
}
