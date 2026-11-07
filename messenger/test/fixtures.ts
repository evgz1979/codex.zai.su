// Только синтетические данные тестов. Не подключается к production entrypoint.
import {AppError} from '../backend/core/errors.js';
import type { SourceAdapter,SourceEvent,AttachmentContent } from '../backend/core/source-adapter.js';
import { destinationFor, entityId, type AttachmentRequest,type Conversation, type Destination, type Message, type Source } from '../shared/types.js';
export class TestAdapter implements SourceAdapter {
  source: Source;
  conversations: Conversation[];
  messages: Message[];
  sent: { destination: Destination; text: string }[] = [];
  reads: string[] = [];
  calls: number[] = [];
  fail = false;
  attachmentCalls=0;
  previews=new Map<string,{attachment:Message['attachments'][number];bytes:Buffer}>();
  media=new Map<string,{attachment:Message['attachments'][number];bytes:Buffer}>();
  listener?:(event:SourceEvent)=>void;
  historyCalls:{id:string;before?:string;limit:number}[]=[];
  constructor(sourceId = 'test-a', name = 'Тестовый источник') {
    this.source = { id: sourceId, name, kind: 'test', connected: false };
    this.conversations = ['Анна Смирнова', 'Команда проекта', 'Алексей'].map((title,i) => ({
      id: entityId(sourceId,'conversation',String(i)), sourceId,
      title, kind: i === 1 ? 'group' : 'direct', recipient: { id: entityId(sourceId,'recipient',String(i)), name: title },
      unreadCount: i === 0 ? 3 : 0, preview: ['Увидимся завтра в 10?', 'Всё готово к встрече.', 'Отлично, спасибо!'][i],
      updatedAt: `2026-11-07T10:0${i}:00.000Z`, canSend: true,
    }));
    this.messages = this.conversations.map((c,i) => ({
      id: entityId(sourceId, 'message', String(i)), sourceId, conversationId: c.id,
      sender: { id: entityId(sourceId,'sender','1'), name: c.title }, date: c.updatedAt,
      text: c.preview, outgoing: false, status: 'received', attachments: [],
    }));
  }
  async connect() { if (this.fail) throw new Error('PRIVATE_PROVIDER_ERROR'); this.source.connected = true; }
  async disconnect() { this.source.connected = false; }
  async listConversations() { return structuredClone(this.conversations); }
  async recentMessages(id: string, limit: number) { this.calls.push(limit); return this.messages.filter(m => m.conversationId === id).slice(-limit); }
  //: Возвращает синтетическую страницу только указанного диалога.
  //: Курсор другого диалога отклоняется без доступа к рабочему Telegram.
  async messagePage(id:string,limit:number,before?:string){
    this.calls.push(limit);
    const messages=this.messages.filter(m=>m.conversationId===id).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    const end=before?messages.findIndex(m=>m.id===before):messages.length;
    if(end<0)throw new Error('Invalid synthetic cursor');
    const start=Math.max(0,end-limit);const page=messages.slice(start,end);
    return {conversationId:id,messages:page,nextCursor:start>0?page[0].id:null};
  }
  //: Отдаёт тестовую страницу для автоматического синхронизатора.
  //: Записывает только синтетические параметры вызова, без реального Telegram.
  async historyPage(id:string,before?:string,limit=100){this.historyCalls.push({id,before,limit});const page=await this.messagePage(id,limit,before);return {...page,cursors:page.messages.map(m=>m.id)};}
  //: Подключает тестовые события источника без сетевого соединения.
  //: Производственный entrypoint этот источник не регистрирует.
  subscribe(listener:(event:SourceEvent)=>void){this.listener=listener;return()=>{this.listener=undefined;};}
  async sendText(destination: Destination, text: string): Promise<Message> {
    if (this.fail) throw new Error('PRIVATE_PROVIDER_ERROR');
    this.sent.push({ destination, text });
    const c = this.conversations.find(c => c.id === destination.conversationId)!;
    if (JSON.stringify(destination) !== JSON.stringify(destinationFor(c))) throw new Error('Wrong route');
    const message: Message = { ...this.messages[0], id: entityId(this.source.id,'message', `sent-${this.sent.length}`), sourceId: this.source.id, conversationId: c.id, text, attachments:[],outgoing: true, status: 'sent', date: new Date().toISOString() };
    this.messages.push(message);
    return message;
  }
  //: Возвращает только заранее заданные синтетические байты для теста вложений.
  //: Реальная сеть, файлы владельца и production entrypoint не используются.
  async openAttachment(input:AttachmentRequest,signal:AbortSignal):Promise<AttachmentContent>{
    this.attachmentCalls++;if(this.fail)throw new Error('PRIVATE_PROVIDER_ERROR');signal.throwIfAborted();
    const value=input.variant==='preview'?(this.previews.get(input.attachmentId)||(this.media.get(input.attachmentId)?.attachment.kind==='image'?this.media.get(input.attachmentId):undefined)):this.media.get(input.attachmentId);if(input.variant==='preview'&&!value)throw new AppError(415,'Для этого вложения нет миниатюры.');if(!value)throw new Error('No synthetic attachment');
    return {attachment:value.attachment,chunks:(async function*(){yield value.bytes;})()};
  }
  async markRead(id: string) { this.reads.push(id); }
}
