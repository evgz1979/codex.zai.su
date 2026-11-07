import type { Conversation, ConversationCatalog, Destination, HistoryPage, Message, MessagePage, Source } from '../../shared/types.js';
//: Передаёт обновлённое сообщение или ключи удалений одного источника.
//: Ключ удаления включает источник и его область уникальности, без MTProto-объектов.
export type SourceEvent={type:'message';message:Message;edited?:boolean}|{type:'delete';sourceId:string;keys:string[]};
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
  historyPage?(conversationId:string,before?:string,limit?:number):Promise<HistoryPage>;
  subscribe?(listener:(event:SourceEvent)=>void,allows:(conversationId:string)=>boolean):()=>void;
  sendText(destination: Destination, text: string): Promise<Message>;
  markRead(conversationId: string, messageId: string): Promise<void>;
}
