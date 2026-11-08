import {createHash} from 'node:crypto';
import type {Conversation,Destination,HistoryPage,Message,WhatsAppStatus} from '../../../shared/types.js';
import type {SourceAdapter} from '../../core/source-adapter.js';
import type {Store} from '../../storage/store.js';
import {AppError} from '../../core/errors.js';
import {browserCall} from './bridge.js';
import type {BrowserAction,BrowserRequest,BrowserResult} from './protocol.js';
//: Связывает один личный аккаунт Messenger с серверным WhatsApp Web.
//: Браузер и профиль живут в отдельном непривилегированном сервисе, доступ ограничен выбором.
export class WhatsAppAdapter implements SourceAdapter {
  readonly source={id:'whatsapp',kind:'whatsapp',name:'WhatsApp',connected:false};
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
  private async request(action:BrowserAction,input:Partial<BrowserRequest>={}):Promise<BrowserResult>{return this.call({...input,account:this.account,action,allowed:this.store.selected().filter(id=>id.startsWith('whatsapp:conversation:'))});}
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
  //: Отправляет текст в точную пару выбранного чата и получателя.
  //: Автоматическая отметка всего WhatsApp-чата прочитанным при отправке отключена.
  async sendText(destination:Destination,text:string){
    if(destination.sourceId!==this.source.id||!this.store.selected().includes(destination.conversationId)||destination.recipientId!==destination.conversationId.replace(':conversation:',':recipient:'))throw new AppError(403,'Проверьте получателя WhatsApp.');
    try{return (await this.request('send',{conversationId:destination.conversationId,recipientId:destination.recipientId,text})).message!;}catch{throw new AppError(503,'WhatsApp не подтвердил отправку. Проверьте переписку перед повтором.');}
  }
  //: Не подтверждает скрытые сообщения методом полного прочтения WhatsApp-чата.
  //: Библиотека не предоставляет точной границы read; счётчик остаётся до чтения в официальном клиенте.
  async markRead(_id:string,_messageId:string):Promise<void>{throw new AppError(409,'Для WhatsApp подтверждение прочтения выполняется в официальном приложении.');}
  //: Останавливает браузер аккаунта, сохраняя связанный профиль на сервере.
  //: Используется при остановке личного аккаунта и не затрагивает другие источники.
  async disconnect(){try{await this.request('stop');}catch{/* Сервис может уже завершиться. */}this.source.connected=false;}
  //: Отзывает связанную браузерную сессию и отключает автоматическое восстановление.
  //: Ранее сохранённая история Messenger не удаляется.
  async revoke(){await this.request('logout');this.store.remove('whatsapp.enabled');this.source.connected=false;this.state={stage:'idle',connected:false};}
}
