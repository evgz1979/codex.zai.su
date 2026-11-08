import type {Attachment,AttachmentRequest, Conversation, ConversationCatalog, Destination, HistoryPage, Message, MessagePage, Source,VoiceTranscription } from '../../shared/types.js';
//: Связывает внутреннее задание расшифровки с обновлениями источника.
//: transcriptionId хранится только на сервере и не входит в публичный DTO.
export interface SourceTranscription extends VoiceTranscription {transcriptionId:string}
//: Передаёт сообщения, удаления и обновления расшифровки одного источника.
//: Ключ удаления включает источник и его область уникальности, без MTProto-объектов.
export type SourceEvent={type:'message';message:Message;edited?:boolean}|{type:'delete';sourceId:string;keys:string[]}|{type:'transcription';sourceId:string;request:AttachmentRequest;result:SourceTranscription};
//: Передаёт поток байтов одного вложения внутри backend.
//: В браузер не передаются native location, ключи и объект клиента.
export interface AttachmentContent {attachment:Attachment;chunks:AsyncIterable<Uint8Array>}
//: Задаёт контракт чтения страниц, отправки и необязательного каталога папок источника.
//: allows разрешает превью только выбранных ID; каталог папок остаётся без текстов.
export interface SourceAdapter {
  readonly source: Source;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listConversations(allows?:(conversationId:string)=>boolean): Promise<Conversation[]>;
  listConversationCatalog?(): Promise<ConversationCatalog>;
  recentMessages(conversationId: string, limit: number): Promise<Message[]>;
  messagePage?(conversationId:string,limit:number,before?:string):Promise<MessagePage>;
  historyPage?(conversationId:string,before?:string,limit?:number):Promise<HistoryPage>;
  canDiscoverContacts?():boolean;
  subscribe?(listener:(event:SourceEvent)=>void,allows:(conversationId:string)=>boolean,discover?:(conversation:Conversation)=>boolean):()=>void;
  openAvatar?(conversationId:string,signal:AbortSignal):Promise<AsyncIterable<Uint8Array>>;
  openAttachment?(request:AttachmentRequest,signal:AbortSignal):Promise<AttachmentContent>;
  transcribeVoice?(request:AttachmentRequest):Promise<SourceTranscription>;
  sendText(destination: Destination, text: string): Promise<Message>;
  markRead(conversationId: string, messageId: string): Promise<void>;
}
