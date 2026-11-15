import {createHash} from 'node:crypto';
import {entityId,type AttachmentRequest,type Conversation,type Destination,type HistoryPage,type Message,type WhatsAppStatus} from '../../../shared/types.js';
import type {AttachmentContent,SourceAdapter} from '../../core/source-adapter.js';
import type {Store} from '../../storage/store.js';
import {AppError} from '../../core/errors.js';
import {browserCall} from './bridge.js';
import {attachmentKind,attachmentName} from '../../core/attachments.js';
import {WHATSAPP_ATTACHMENT_BYTES,type BrowserAction,type BrowserRequest,type BrowserResult} from './protocol.js';
//: Связывает один личный аккаунт Messenger с серверным WhatsApp Web.
//: Браузер и профиль живут в отдельном непривилегированном сервисе, доступ ограничен выбором.
export class WhatsAppAdapter implements SourceAdapter {
  readonly source={id:'whatsapp',kind:'whatsapp',name:'WhatsApp',connected:false,canTranscribeVoice:false};
  private state:WhatsAppStatus={stage:'idle',connected:false};
  private account:string;
  //: Вычисляет постоянный ключ приватного профиля без передачи пути worker.
  //: Подмена транспорта разрешена только в изолированных тестах.
  constructor(directory:string,private store:Store,private call:typeof browserCall=browserCall){this.account=createHash('sha256').update(directory).digest('hex');}
  //: Проверяет сохранённое разрешение на работу источника.
  //: Нет автоматического QR-входа при пустой настройке.
  private enabled(){return this.store.get('whatsapp.enabled')==='1';}
  //: Вызывает фиксированную операцию для своего серверного ключа.
  //: Разрешённые диалоги берутся заново из SQLite на каждом запросе.
  private async request(action:BrowserAction,input:Partial<BrowserRequest>={},signal?:AbortSignal):Promise<BrowserResult>{return this.call({...input,account:this.account,action,allowed:this.store.selected().filter(id=>id.startsWith('whatsapp:conversation:'))},undefined,signal);}
  //: Возвращает безопасное последнее состояние без QR общего status API.
  //: QR доступен только отдельному административному маршруту после проверки роли.
  status():WhatsAppStatus {const {qrDataUrl:_,...safe}=this.state;return safe;}
  //: Получает актуальный административный QR или состояние подключения.
  //: Отсутствующий worker не раскрывает исходное исключение или параметры сессии.
  async authStatus():Promise<WhatsAppStatus>{
    try{this.state=(await this.request('status')).status!;this.source.connected=this.state.connected;return this.state;}
    catch{this.source.connected=false;return this.state={stage:'unavailable',connected:false,issue:'Браузерный сервис недоступен. Повторите позже.'};}
  }
  //: Явно запускает браузер и временное ожидание сканирования QR.
  //: Занятая другим аккаунтом сессия не отключается и не передаётся новому владельцу.
  async begin(){const result=await this.request('start',{interactive:true});this.store.set('whatsapp.enabled','1');this.state=result.status!;this.source.connected=this.state.connected;return this.state;}
  //: Поднимает только ранее разрешённую сохранённую сессию.
  //: При отсутствии связанного профиля QR создаётся исключительно по кнопке администратора.
  async connect(){if(!this.enabled())return;try{const result=await this.request('start',{interactive:false});this.state=result.status!;this.source.connected=this.state.connected;}catch{this.source.connected=false;}}
  //: Оставляет новые WhatsApp-диалоги под явным выбором администратора.
  //: Каталог доступен без истории; автоматическое добавление контактов Telegram не меняется.
  canDiscoverContacts(){return false;}
  //: Возвращает только метаданные каталога или прежний выбранный кеш при сбое.
  //: Не запрашивает историю и не изменяет отметки прочтения.
  async listConversations():Promise<Conversation[]>{
    if(!this.source.connected)return this.store.loadCache().conversations.filter(c=>c.sourceId===this.source.id);
    try{return (await this.request('catalog')).conversations!;}catch{this.source.connected=false;return this.store.loadCache().conversations.filter(c=>c.sourceId===this.source.id);}
  }
  //: Читает одну ограниченную страницу исключительно выбранного диалога.
  //: Курсор относится к native message ID в том же WhatsApp-чате.
  async historyPage(conversationId:string,before?:string,limit=100):Promise<HistoryPage>{
    if(!this.store.selected().includes(conversationId))throw new AppError(403,'Диалог не разрешён в админке.');
    if(!this.source.connected)throw new AppError(503,'WhatsApp не подключён.');
    const result=await this.request('messages',{conversationId,before});const messages=result.messages!.slice(-Math.min(100,Math.max(1,limit)));
    return {conversationId,messages,nextCursor:messages.length<result.messages!.length?messages[0]?.id||null:result.nextCursor||null,cursors:messages.map(m=>m.id)};
  }
  //: Реализует общий контракт короткой головы выбранного диалога.
  //: Источник не используется для чтения неразрешённого ID.
  async recentMessages(id:string,limit:number):Promise<Message[]>{return (await this.historyPage(id,undefined,limit)).messages;}
  //: Читает оригинал фото, аудио или документа из разрешённого сообщения WhatsApp.
  //: Миниатюры из истории уже доступны клиенту; сетевой запрос нужен только по нажатию.
  async openAttachment(input:AttachmentRequest,signal:AbortSignal):Promise<AttachmentContent>{
    signal.throwIfAborted();
    if(!this.store.selected().includes(input.conversationId))throw new AppError(403,'Диалог не разрешён в админке.');
    const message=this.store.message(input.messageId);
    const previous=message?.attachments.find(a=>a.id===input.attachmentId);
    if(!message||message.sourceId!=='whatsapp'||message.conversationId!==input.conversationId||!previous||input.attachmentId!==entityId('whatsapp','attachment',decodeURIComponent(message.id.slice('whatsapp:message:'.length))))throw new AppError(404,'Вложение не найдено.');
    if(input.variant==='preview'||previous.downloadable===false)throw new AppError(415,'Этот вариант вложения недоступен.');
    if(!this.source.connected)throw new AppError(503,'WhatsApp пока не подключён.');
    let media:BrowserResult['media'];
    try{media=(await this.request('attachment',{conversationId:input.conversationId,messageId:input.messageId},signal)).media;}
    catch(error){
      signal.throwIfAborted();
      const code=error instanceof Error?error.message:'';
      if(code==='attachment_missing')throw new AppError(404,'Оригинал больше недоступен в WhatsApp.');
      if(code==='attachment_too_large')throw new AppError(413,'Это вложение больше 8 МБ.');
      if(code==='attachment_unsupported')throw new AppError(415,'Это вложение открывается в WhatsApp.');
      if(code==='invalid_destination')throw new AppError(404,'Не удалось найти оригинал в выбранном чате.');
      if(code==='not_selected')throw new AppError(403,'Вложение недоступно.');
      throw new AppError(503,'Не удалось загрузить вложение из WhatsApp.');
    }
    signal.throwIfAborted();
    if(!this.store.selected().includes(input.conversationId))throw new AppError(403,'Диалог не разрешён в админке.');
    if(!media||typeof media.data!=='string'||typeof media.mimeType!=='string')throw new AppError(503,'Не удалось загрузить вложение из WhatsApp.');
    const bytes=Buffer.from(media.data,'base64');
    if(!bytes.length||bytes.length>WHATSAPP_ATTACHMENT_BYTES)throw new AppError(503,'Вложение из WhatsApp загружено не полностью.');
    const mimeType=media.mimeType.toLowerCase().split(';')[0].trim();
    const kind=attachmentKind(mimeType);
    const suffix=mimeType==='image/jpeg'?'jpg':mimeType==='audio/mpeg'?'mp3':mimeType.split('/')[1]?.match(/^[a-z0-9]{1,8}$/)?.[0]||'bin';
    const name=attachmentName(media.name||`${previous.name}.${suffix}`);
    return {attachment:{id:previous.id,kind,name,mimeType,size:bytes.length,downloadable:true},chunks:(async function*(){yield bytes;})()};
  }
  //: Отправляет текст в точную пару выбранного чата и получателя.
  //: Автоматическая отметка всего WhatsApp-чата прочитанным при отправке отключена.
  async sendText(destination:Destination,text:string){
    if(destination.sourceId!==this.source.id||!this.store.selected().includes(destination.conversationId)||destination.recipientId!==destination.conversationId.replace(':conversation:',':recipient:'))throw new AppError(403,'Проверьте получателя WhatsApp.');
    try{return (await this.request('send',{conversationId:destination.conversationId,recipientId:destination.recipientId,text})).message!;}catch{throw new AppError(503,'WhatsApp не подтвердил отправку. Проверьте переписку перед повтором.');}
  }
  //: Передаёт позицию просмотра в текущий выбранный чат WhatsApp.
  //: Браузер подтверждает прочтение только при совпадении с актуальной границей.
  async markRead(conversationId:string,messageId:string):Promise<void>{
    if(!this.store.selected().includes(conversationId))throw new AppError(403,'Диалог не разрешён в админке.');
    if(!this.source.connected)throw new AppError(503,'WhatsApp не подключён.');
    try{await this.request('read',{conversationId,messageId});}catch(error){
      if(error instanceof Error&&error.message==='read_position_changed')throw new AppError(409,'Откройте последние сообщения WhatsApp и повторите.');
      throw new AppError(503,'WhatsApp не подтвердил прочтение.');
    }
  }
  //: Останавливает браузер аккаунта, сохраняя связанный профиль на сервере.
  //: Используется при остановке личного аккаунта и не затрагивает другие источники.
  async disconnect(){try{await this.request('stop');}catch{/* Сервис может уже завершиться. */}this.source.connected=false;}
  //: Отзывает связанную браузерную сессию и отключает автоматическое восстановление.
  //: Ранее сохранённая история Messenger не удаляется.
  async revoke(){await this.request('logout');this.store.remove('whatsapp.enabled');this.source.connected=false;this.state={stage:'idle',connected:false};}
}
