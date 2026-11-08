import type {Attachment,AttachmentRequest, Conversation, ConversationCatalog, Destination, HistoryPage, Message, MessagePage, Source } from '../../shared/types.js';
//: Передаёт обновлённое сообщение или ключи удалений одного источника.
//: Ключ удаления включает источник и его область уникальности, без MTProto-объектов.
export type SourceEvent={type:'message';message:Message;edited?:boolean}|{type:'delete';sourceId:string;keys:string[]};
//: Передаёт поток байтов одного вложения внутри backend.
//: В браузер не передаются native location, ключи и объект клиента.
export interface AttachmentContent {attachment:Attachment;chunks:AsyncIterable<Uint8Array>}
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
  canDiscoverContacts?():boolean;
  subscribe?(listener:(event:SourceEvent)=>void,allows:(conversationId:string)=>boolean,discover?:(conversation:Conversation)=>boolean):()=>void;
  openAvatar?(conversationId:string,signal:AbortSignal):Promise<AsyncIterable<Uint8Array>>;
  openAttachment?(request:AttachmentRequest,signal:AbortSignal):Promise<AttachmentContent>;
  sendText(destination: Destination, text: string): Promise<Message>;
  markRead(conversationId: string, messageId: string): Promise<void>;
}
