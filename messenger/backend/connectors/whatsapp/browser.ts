import {existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import WA from 'whatsapp-web.js';
import QRCode from 'qrcode';
import {entityId,LIMITS,type Conversation,type Message,type WhatsAppStatus} from '../../../shared/types.js';
import {privateDirectory,writePrivate} from '../../storage/private-files.js';
import type {BrowserRequest,BrowserResult} from './protocol.js';
//: Использует WhatsApp Web без автоматической передачи всех входящих текстов в Node.
//: История извлекается только явной командой выбранного диалога; состояние проверяется отдельно.
class PollingClient extends WA.Client {
  //: Отключает стандартные message/group/call listeners сторонней библиотеки.
  //: QR, authenticated и ready остаются частью инициализации клиента.
  async attachEventListeners(){}
}
//: Описывает только используемые поля сообщения из браузерного клиента.
//: Не сохраняет ссылки на native message, функции, медиа или ключи шифрования.
export interface WebMessage {id:{_serialized:string;remote?:string;fromMe?:boolean};from:string;to:string;author?:string;fromMe:boolean;timestamp:number;body:string;type:string;ack:number;hasMedia?:boolean}
//: Проверяет и декодирует точный native маршрут WhatsApp.
//: Статусы, рассылки, каналы и произвольные URL не становятся диалогами Messenger.
export function nativeChat(id:string):string {
  const match=/^whatsapp:conversation:([^:]+)$/.exec(id);if(!match)throw new Error('invalid_destination');
  const jid=decodeURIComponent(match[1]);if(!/^[0-9-]{1,64}@(c\.us|g\.us|lid)$/.test(jid))throw new Error('invalid_destination');return jid;
}
//: Преобразует сообщение только после проверки выбранного native диалога.
//: Неподдерживаемое вложение явно обозначается, текст и статус не выдумываются.
export function webMessage(value:WebMessage,chatId:string,title:string):Message {
  const actual=value.id.remote|| (value.fromMe?value.to:value.from);if(actual!==chatId)throw new Error('message_destination_mismatch');
  const conversationId=entityId('whatsapp','conversation',chatId);const outgoing=!!value.fromMe;
  const mediaNames:Record<string,string>={image:'Фото',video:'Видео',ptt:'Голосовое сообщение',audio:'Аудио',document:'Документ',sticker:'Стикер'};
  return {id:entityId('whatsapp','message',value.id._serialized),sourceKey:entityId('whatsapp','message',value.id._serialized),sourceId:'whatsapp',conversationId,
    sender:{id:entityId('whatsapp','recipient',outgoing?'self':value.author||value.from),name:outgoing?'Вы':value.author?.split('@')[0]||title,isSelf:outgoing},
    date:new Date(value.timestamp*1000).toISOString(),text:String(value.body||'').slice(0,LIMITS.text),outgoing,
    status:!outgoing?'received':value.ack>=3?'read':value.ack===2?'delivered':value.ack===1?'sent':value.ack===-1?'failed':'pending',
    attachments:value.hasMedia||mediaNames[value.type]?[{id:entityId('whatsapp','attachment',value.id._serialized),kind:'unsupported',name:mediaNames[value.type]||'Вложение WhatsApp',downloadable:false}]:[]};
}
//: Управляет единственной ограниченной браузерной сессией VPS.
//: Разные аккаунты не делят профиль; чужой start возвращает busy без отключения владельца.
export class WhatsAppBrowser {
  private client?:InstanceType<typeof WA.Client>;
  private owner?:string;
  private state:WhatsAppStatus={stage:'idle',connected:false};
  private loginTimer?:ReturnType<typeof setTimeout>;
  private stopping?:Promise<void>;
  private qrVersion=0;
  private initializing?:Promise<void>;
  //: Задаёт корень профилей и доверенный путь браузера из конфигурации сервиса.
  //: HTTP-запросы не могут менять executablePath, root или фабрику клиента.
  constructor(private root:string,private executablePath:string,private factory=(options:WA.ClientOptions)=>new PollingClient(options)){privateDirectory(root);}
  //: Возвращает QR только владельцу текущего процесса и только до его истечения.
  //: Чужой аккаунт не узнаёт ни владельца слота, ни его телефон, ни QR.
  status(account:string):WhatsAppStatus {
    if(this.owner&&this.owner!==account)return {stage:'busy',connected:false,issue:'На сервере уже запущен WhatsApp другого аккаунта. Доступна одна сессия.'};
    if(this.state.expiresAt&&Date.now()>this.state.expiresAt){const {qrDataUrl:_,...state}=this.state;return {...state,stage:'starting'};}
    return {...this.state};
  }
  //: Применяет одну проверенную команду без произвольного RPC.
  //: Чтение и отправка допускаются только для выбранного ID и фактического готового клиента.
  async handle(request:BrowserRequest):Promise<BrowserResult>{
    const {account,action}=request;if(action==='status'){
      if(this.owner===account&&this.client&&this.state.connected){const client=this.client;try{if(await client.getState()!=='CONNECTED')await this.fail(client,'Соединение WhatsApp потеряно. Повторите подключение.');}catch{await this.fail(client);}}
      return {status:this.status(account)};
    }
    if(action==='start')return {status:await this.start(account,request.interactive===true)};
    if(action==='stop'){if(this.owner===account)await this.stop();return {status:{stage:'idle',connected:false}};}
    if(action==='logout'){
      if(this.owner===account){if(this.client&&this.state.connected)await this.client.logout();await this.stop();}
      rmSync(join(this.root,account),{recursive:true,force:true});return {status:{stage:'idle',connected:false}};
    }
    if(this.owner&&this.owner!==account)throw new Error('browser_busy');
    if(!this.client||!this.state.connected)throw new Error('browser_not_ready');
    if(action==='catalog')return {conversations:await this.catalog()};
    const jid=nativeChat(request.conversationId!);const chat=await this.client.getChatById(jid);
    if(!chat||chat.id._serialized!==jid||chat.isReadOnly)throw new Error('invalid_destination');
    if(action==='send'){
      if(request.recipientId!==entityId('whatsapp','recipient',jid))throw new Error('invalid_destination');
      const result=await this.client.sendMessage(jid,request.text!,{sendSeen:false});
      return {message:webMessage(result,jid,chat.name)};
    }
    return this.page(jid,chat.name,request.before);
  }
  //: Запускает Chromium с включённым sandbox и профилем текущего аккаунта.
  //: Без interactive восстанавливается только профиль, ранее достигший ready.
  private async start(account:string,interactive:boolean):Promise<WhatsAppStatus>{
    if(this.owner&&this.owner!==account)return this.status(account);
    if(this.client)return this.status(account);
    if(this.stopping)await this.stopping;
    const directory=join(this.root,account);if(!interactive&&!existsSync(join(directory,'linked')))return {stage:'idle',connected:false};
    privateDirectory(directory);this.owner=account;this.state={stage:'starting',connected:false};
    const client=this.factory({authStrategy:new WA.LocalAuth({dataPath:directory}),webVersionCache:{type:'none'},
      puppeteer:{headless:true,executablePath:this.executablePath,pipe:true,args:['--disable-dev-shm-usage','--disable-gpu','--renderer-process-limit=2','--js-flags=--max-old-space-size=160']},
      deviceName:'Z AI Messenger',authTimeoutMs:120000,qrMaxRetries:6,takeoverOnConflict:false});
    this.client=client;
    client.on('qr',qr=>{if(!interactive){rmSync(join(directory,'linked'),{force:true});void this.fail(client,'Сессия WhatsApp истекла. Нажмите «Подключить WhatsApp» для нового QR.');return;}const version=++this.qrVersion;void QRCode.toDataURL(qr,{width:320,margin:2,errorCorrectionLevel:'M'}).then(qrDataUrl=>{if(this.client===client&&version===this.qrVersion)this.state={stage:'qr',connected:false,qrDataUrl,expiresAt:Date.now()+45000};}).catch(()=>this.fail(client));});
    client.on('authenticated',()=>{if(this.client===client)this.state={stage:'starting',connected:false};});
    client.on('ready',()=>{if(this.client!==client)return;clearTimeout(this.loginTimer);writePrivate(join(directory,'linked'),'1');this.state={stage:'connected',connected:true};});
    client.on('auth_failure',()=>{rmSync(join(directory,'linked'),{force:true});void this.fail(client);});
    client.on('disconnected',()=>{rmSync(join(directory,'linked'),{force:true});void this.fail(client);});
    this.loginTimer=setTimeout(()=>{if(this.client===client&&!this.state.connected)void this.fail(client,'Время ожидания QR истекло. Нажмите «Подключить WhatsApp» заново.');},180000);this.loginTimer.unref();
    this.initializing=client.initialize().catch(()=>{if(this.client===client)void this.fail(client);});
    return this.status(account);
  }
  //: Завершает только текущую браузерную сессию после безопасного отказа.
  //: Исходное исключение библиотеки и browser stderr не выводятся в журнал или API.
  private async fail(client:InstanceType<typeof WA.Client>,issue='Не удалось подключить WhatsApp Web. Повторите подключение вручную.'){
    if(this.client!==client)return;await this.stop();this.state={stage:'error',connected:false,issue};
  }
  //: Закрывает Chromium, сохраняя профиль для следующего восстановления.
  //: Только logout удаляет профиль; остановка аккаунта и релиз его не стирают.
  async stop(){
    if(this.stopping)return this.stopping;clearTimeout(this.loginTimer);this.qrVersion++;
    const client=this.client;const initializing=this.initializing;this.client=undefined;this.initializing=undefined;this.state={stage:'idle',connected:false};
    this.stopping=(async()=>{try{if(client&&!client.pupBrowser)await initializing;await client?.destroy();}catch{/* Процесс может быть уже завершён cgroup. */}finally{this.owner=undefined;this.stopping=undefined;}})();return this.stopping;
  }
  //: Выдаёт административный каталог метаданных без body и lastMessage.
  //: Из browser context выходят только ID, имя, тип, дата и unread; максимум 1000 чатов.
  private async catalog():Promise<Conversation[]>{
    const rows=await this.client!.pupPage!.evaluate(()=>{
      const api=(window as any).Store;return api.Chat.getModelsArray().slice(0,1000).map((chat:any)=>({jid:chat.id?._serialized,name:chat.formattedTitle||chat.name||chat.id?.user||'',group:!!chat.isGroup,readOnly:!!chat.isReadOnly,unread:Math.max(0,chat.unreadCount||0),timestamp:chat.t||0}));
    });
    return rows.filter((row:any)=>typeof row.jid==='string'&&/^[0-9-]{1,64}@(c\.us|g\.us|lid)$/.test(row.jid)).map((row:any)=>({id:entityId('whatsapp','conversation',row.jid),sourceId:'whatsapp',title:String(row.name).slice(0,512),kind:row.group||row.jid.endsWith('@g.us')?'group':'direct',recipient:{id:entityId('whatsapp','recipient',row.jid),name:String(row.name).slice(0,512),isSelf:row.jid===this.client!.info?.wid?._serialized},unreadCount:row.unread,updatedAt:new Date(row.timestamp*1000).toISOString(),preview:'',canSend:!row.readOnly}));
  }
  //: Загружает ограниченную порцию выбранной истории внутри WhatsApp Web.
  //: Курсор проверяется в том же чате; одна операция догружает не более 20 страниц браузера.
  private async page(jid:string,title:string,before?:string):Promise<BrowserResult>{
    let cursor:string|undefined;
    if(before){const prefix='whatsapp:message:';if(!before.startsWith(prefix))throw new Error('invalid_cursor');cursor=decodeURIComponent(before.slice(prefix.length));}
    const result=await this.client!.pupPage!.evaluate(async({jid,cursor})=>{
      const w=window as any;const chat=await w.WWebJS.getChat(jid,{getAsModel:false});let tries=0;
      let list=chat.msgs.getModelsArray().filter((m:any)=>!m.isNotification);let end=cursor?list.findIndex((m:any)=>m.id._serialized===cursor):list.length;
      while((end<100)&&tries++<20){
        const earlier=await w.require('WAWebChatLoadMessages').loadEarlierMsgs({chat});if(!earlier?.length)break;
        list=chat.msgs.getModelsArray().filter((m:any)=>!m.isNotification);end=cursor?list.findIndex((m:any)=>m.id._serialized===cursor):list.length;
      }
      if(end<0)throw new Error('invalid_cursor');
      const messages=list.slice(Math.max(0,end-100),end).map((m:any)=>({id:{_serialized:m.id._serialized,remote:m.id.remote?._serialized},from:m.from?._serialized||m.from,to:m.to?._serialized||m.to,author:m.author?._serialized||m.author,fromMe:!!m.id.fromMe,timestamp:m.t,body:String(m.body||'').slice(0,4096),type:m.type,ack:m.ack,hasMedia:!!m.isMedia}));
      return {messages,more:end>=100};
    },{jid,cursor});
    const messages=result.messages.map((value:WebMessage)=>webMessage(value,jid,title));
    return {messages,nextCursor:result.more&&messages.length?messages[0].id:null};
  }
}
