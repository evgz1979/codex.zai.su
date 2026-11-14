import {existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import WA from 'whatsapp-web.js';
import QRCode from 'qrcode';
import {entityId,LIMITS,type Conversation,type Message,type WhatsAppStatus} from '../../../shared/types.js';
import {privateDirectory,writePrivate} from '../../storage/private-files.js';
import type {BrowserRequest,BrowserResult,BrowserStartup} from './protocol.js';
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
  private stateTimer?:ReturnType<typeof setTimeout>;
  private stopping?:Promise<void>;
  private qrVersion=0;
  private initializing?:Promise<void>;
  private startup?:BrowserStartup;
  private authObserved=false;
  private recoveryRequested=false;
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
      return {status:this.status(account),...(this.owner===account&&this.startup?{startup:this.startup}:{})};
    }
    if(action==='start')return {status:await this.start(account,request.interactive===true)};
    if(action==='stop'){if(this.owner===account)await this.stop();return {status:{stage:'idle',connected:false}};}
    if(action==='logout'){
      if(this.owner===account){try{if(this.client&&this.state.connected)await this.client.pupPage!.evaluate(()=>((window as any).require('WAWebSocketModel').Socket.logout()));}catch{/* Локальный доступ отзывается и при недоступности WhatsApp. */}finally{await this.stop();}}
      rmSync(join(this.root,account),{recursive:true,force:true});return {status:{stage:'idle',connected:false}};
    }
    if(this.owner&&this.owner!==account)throw new Error('browser_busy');
    if(!this.client||!this.state.connected)throw new Error('browser_not_ready');
    if(action==='catalog')return {conversations:await this.catalog()};
    const jid=nativeChat(request.conversationId!);
    if(action==='messages')return this.page(jid,request.before);
    if(action==='read'){await this.markRead(jid,request.messageId!);return {};}
    const chat=await this.client.pupPage!.evaluate(async jid=>{const chat=await (window as any).WWebJS.getChat(jid,{getAsModel:false});return chat?{id:chat.id?._serialized,isReadOnly:!!chat.isReadOnly,name:chat.formattedTitle||chat.name||''}:null;},jid);
    if(!chat||chat.id!==jid||chat.isReadOnly)throw new Error('invalid_destination');
    if(action==='send'){
      if(request.recipientId!==entityId('whatsapp','recipient',jid))throw new Error('invalid_destination');
      const result=await this.client.sendMessage(jid,request.text!,{sendSeen:false});
      return {message:webMessage(result,jid,chat.name)};
    }
    throw new Error('invalid_request');
  }
  //: Запускает Chromium с включённым sandbox и профилем текущего аккаунта.
  //: Без interactive восстанавливается только профиль, ранее достигший ready.
  private async start(account:string,interactive:boolean):Promise<WhatsAppStatus>{
    if(this.owner&&this.owner!==account)return this.status(account);
    if(this.client)return this.status(account);
    if(this.stopping)await this.stopping;
    const directory=join(this.root,account);if(!interactive&&!existsSync(join(directory,'linked')))return {stage:'idle',connected:false};
    privateDirectory(directory);this.owner=account;this.state={stage:'starting',connected:false};this.authObserved=false;this.recoveryRequested=false;
    const client=this.factory({authStrategy:new WA.LocalAuth({dataPath:directory}),webVersionCache:{type:'none'},
      puppeteer:{headless:true,executablePath:this.executablePath,pipe:true,args:['--disable-dev-shm-usage','--disable-gpu','--renderer-process-limit=2','--js-flags=--max-old-space-size=160']},
      deviceName:'Z AI Messenger',authTimeoutMs:120000,qrMaxRetries:6,takeoverOnConflict:false});
    this.client=client;
    client.on('qr',qr=>{if(this.client!==client||this.state.connected)return;if(!interactive){rmSync(join(directory,'linked'),{force:true});void this.fail(client,'Сессия WhatsApp истекла. Нажмите «Подключить WhatsApp» для нового QR.');return;}if(this.state.stage==='syncing')this.waitForScan(client);const version=++this.qrVersion;void QRCode.toDataURL(qr,{width:320,margin:2,errorCorrectionLevel:'M'}).then(qrDataUrl=>{if(this.client===client&&version===this.qrVersion)this.state={stage:'qr',connected:false,qrDataUrl,expiresAt:Date.now()+45000};}).catch(()=>this.fail(client));});
    client.on('authenticated',()=>{if(this.client===client)this.authObserved=true;this.beginSync(client);});
    client.on('loading_screen',percent=>this.beginSync(client,percent));
    client.on('ready',()=>{if(this.client!==client)return;clearTimeout(this.loginTimer);clearTimeout(this.stateTimer);this.qrVersion++;this.startup=undefined;writePrivate(join(directory,'linked'),'1');this.state={stage:'connected',connected:true};});
    client.on('auth_failure',()=>{rmSync(join(directory,'linked'),{force:true});void this.fail(client);});
    client.on('disconnected',()=>{rmSync(join(directory,'linked'),{force:true});void this.fail(client);});
    this.waitForScan(client);this.watchStartup(client);
    this.initializing=client.initialize().catch(()=>{if(this.client===client)void this.fail(client);});
    return this.status(account);
  }
  //: Ограничивает ожидание сканирования отдельно от первичной синхронизации.
  //: Перед истечением трёх минут повторно проверяет транспорт, не закрывая уже привязанный клиент.
  private waitForScan(client:InstanceType<typeof WA.Client>){
    clearTimeout(this.loginTimer);
    this.loginTimer=setTimeout(async()=>{
      if(this.client!==client||this.state.connected)return;
      try{if(await client.getState()==='CONNECTED'){this.beginSync(client);return;}}catch{/* Ещё не готовая страница не подтверждает привязку. */}
      if(this.client===client&&!this.state.connected)await this.fail(client,'Время ожидания QR истекло. Нажмите «Подключить WhatsApp» заново.');
    },180000);this.loginTimer.unref();
  }
  //: Даёт привязанному клиенту отдельные пятнадцать минут на первичную загрузку.
  //: CONNECTED транспорта не разрешает историю: доступ появляется только после ready библиотеки.
  private beginSync(client:InstanceType<typeof WA.Client>,percent?:unknown){
    if(this.client!==client||this.state.connected)return;
    if(this.state.stage!=='syncing'){
      clearTimeout(this.loginTimer);this.qrVersion++;this.state={stage:'syncing',connected:false};
      this.loginTimer=setTimeout(()=>{if(this.client===client&&!this.state.connected)void this.fail(client,'Первичная синхронизация WhatsApp не завершилась за 15 минут. Нажмите «Подключить WhatsApp», чтобы продолжить.');},900000);this.loginTimer.unref();
    }
    if(typeof percent==='number'&&Number.isFinite(percent))this.state={...this.state,progress:Math.max(0,Math.min(100,Math.round(percent)))};
  }
  //: Определяет принятую привязку без чтения чатов, профиля или ключей.
  //: Последовательный опрос работает и при закрытой админке; stop/ready отменяют таймер.
  private watchStartup(client:InstanceType<typeof WA.Client>){
    this.stateTimer=setTimeout(async()=>{
      if(this.client!==client||this.state.connected)return;
      try{
        if(await client.getState()==='CONNECTED')this.beginSync(client);
        if(client.pupPage){
          const flags=await client.pupPage.evaluate(()=>{
            const w=window as any;const socket=w.require('WAWebSocketModel').Socket;let streamReady=false;
            try{const {Stream,StreamMode,StreamInfo}=w.require('WAWebStreamModel');let display=Stream.displayInfo;try{display=w.require('WAWebStreamGetters')?.getDisplayInfo?.(Stream)??display;}catch{/* Старые сборки хранят displayInfo в модели. */}streamReady=!!StreamMode&&!!StreamInfo&&Stream.mode===StreamMode.MAIN&&display===StreamInfo.NORMAL;}catch{/* Пока модель загружается, готовность не подтверждена. */}
            return {socketConnected:socket.state==='CONNECTED',hasSynced:socket.hasSynced===true,streamReady,helpersReady:typeof w.WWebJS?.getChat==='function',callbackAvailable:typeof w.onAppStateHasSyncedEvent==='function'};
          });
          if(this.client!==client||this.state.connected)return;
          this.startup={...flags,authenticated:this.authObserved,recoveryRequested:this.recoveryRequested};
          if(flags.socketConnected&&(flags.hasSynced||flags.streamReady)&&flags.callbackAvailable&&!this.authObserved&&!this.recoveryRequested){
            this.recoveryRequested=true;this.startup.recoveryRequested=true;
            //: Повторяет штатную инициализацию при пропущенном событии уже готового WhatsApp Web.
            //: Самостоятельно ready не эмитируется; библиотека должна загрузить helpers и ClientInfo.
            try{await client.pupPage.evaluate(()=>(window as any).onAppStateHasSyncedEvent());}
            catch{await this.fail(client,'Не удалось завершить инициализацию WhatsApp Web. Повторите подключение.');}
          }
        }
      }catch{/* Во время загрузки AuthStore может ещё отсутствовать. */}
      if(this.client===client&&!this.state.connected)this.watchStartup(client);
    },2000);this.stateTimer.unref();
  }
  //: Завершает только текущую браузерную сессию после безопасного отказа.
  //: Исходное исключение библиотеки и browser stderr не выводятся в журнал или API.
  private async fail(client:InstanceType<typeof WA.Client>,issue='Не удалось подключить WhatsApp Web. Повторите подключение вручную.'){
    if(this.client!==client)return;await this.stop();this.state={stage:'error',connected:false,issue};
  }
  //: Закрывает Chromium, сохраняя профиль для следующего восстановления.
  //: Только logout удаляет профиль; остановка аккаунта и релиз его не стирают.
  async stop(){
    if(this.stopping)return this.stopping;clearTimeout(this.loginTimer);clearTimeout(this.stateTimer);this.qrVersion++;
    const client=this.client;const initializing=this.initializing;this.client=undefined;this.initializing=undefined;this.startup=undefined;this.state={stage:'idle',connected:false};
    this.stopping=(async()=>{try{if(client&&!client.pupBrowser&&initializing){let settled=false;void initializing.finally(()=>{settled=true;}).catch(()=>{});while(!client.pupBrowser&&!settled)await new Promise(resolve=>setTimeout(resolve,25));}await client?.pupBrowser?.close?.();await client?.destroy();}catch{/* Процесс может быть уже завершён cgroup. */}finally{this.owner=undefined;this.stopping=undefined;}})();return this.stopping;
  }
  //: Выдаёт административный каталог метаданных без body и lastMessage.
  //: Из browser context выходят только ID, имя, тип, дата и unread; максимум 1000 чатов.
  private async catalog():Promise<Conversation[]>{
    const rows=await this.client!.pupPage!.evaluate(()=>{
      const chats=(window as any).require('WAWebCollections').Chat;return chats.getModelsArray().slice(0,1000).map((chat:any)=>({jid:chat.id?._serialized,name:chat.formattedTitle||chat.name||chat.id?.user||'',group:!!chat.isGroup,readOnly:!!chat.isReadOnly,unread:Math.max(0,chat.unreadCount||0),timestamp:Number.isFinite(chat.t)?chat.t:0}));
    });
    return rows.filter((row:any)=>typeof row.jid==='string'&&/^[0-9-]{1,64}@(c\.us|g\.us|lid)$/.test(row.jid)).map((row:any)=>({id:entityId('whatsapp','conversation',row.jid),sourceId:'whatsapp',title:String(row.name).slice(0,512),kind:row.group||row.jid.endsWith('@g.us')?'group':'direct',recipient:{id:entityId('whatsapp','recipient',row.jid),name:String(row.name).slice(0,512),isSelf:row.jid===this.client!.info?.wid?._serialized},unreadCount:row.unread,updatedAt:new Date(row.timestamp*1000).toISOString(),preview:'',canSend:!row.readOnly}));
  }
  //: Подтверждает просмотр только до актуального последнего входящего WhatsApp.
  //: Метод источника отмечает весь чат, поэтому перед вызовом проверяется нативная граница.
  private async markRead(jid:string,messageId:string):Promise<void>{
    const key=decodeURIComponent(messageId.slice('whatsapp:message:'.length));
    if(!key.startsWith(`false_${jid}_`)&&!key.startsWith(`true_${jid}_`))throw new Error('invalid_destination');
    await this.client!.pupPage!.evaluate(async({jid,key})=>{
      const w=window as any;
      const chat=await w.WWebJS.getChat(jid,{getAsModel:false});
      if(chat?.id?._serialized!==jid)throw new Error('invalid_destination');
      if(chat.unreadCount===0)return;
      //: Сравнивает актуальные ключи без сериализации сообщений и выгрузки их тел.
      //: Поддерживает MsgKey из каталога и моделей загруженной истории.
      const serialized=(id:any)=>{
        const value=typeof id==='string'?id:id?._serialized||id?.toString?.();
        if(typeof value==='string'&&/^(true|false)_/.test(value))return value;
        const saved=id?.serialize?.()||id;
        const remote=typeof saved?.remote==='string'?saved.remote:saved?.remote?._serialized;
        const participant=typeof saved?.participant==='string'?saved.participant:saved?.participant?._serialized;
        if(remote&&typeof saved.id==='string'&&typeof saved.fromMe==='boolean')return `${saved.fromMe}_${remote}_${saved.id}${participant?'_'+participant:''}`;
      };
      const last=serialized(chat.lastReceivedKey);
      if(typeof last!=='string'||(!last.startsWith(`false_${jid}_`)&&!last.startsWith(`true_${jid}_`)))throw new Error('read_position_changed');
      if(key!==last){
        const keys=chat.msgs.getModelsArray().filter((message:any)=>!message.isNotification).map((message:any)=>serialized(message.id)||serialized(message.serialize?.().id));
        const boundary=keys.lastIndexOf(last);
        if(boundary<0||keys.lastIndexOf(key)<boundary)throw new Error('read_position_changed');
      }
      const stream=w.require('WAWebStreamModel').Stream;
      const {sendSeen}=w.require('WAWebUpdateUnreadChatAction');
      stream.markAvailable();
      try{await sendSeen({chat,threadId:undefined});}finally{stream.markUnavailable();}
      if(chat.unreadCount!==0)throw new Error('read_position_changed');
    },{jid,key});
  }
  //: Загружает ограниченную порцию выбранной истории внутри WhatsApp Web.
  //: Голова возвращается из кеша; одна догрузка ограничена восемью секундами, курсор привязан к чату.
  private async page(jid:string,before?:string):Promise<BrowserResult>{
    let cursor:string|undefined;
    if(before){const prefix='whatsapp:message:';if(!before.startsWith(prefix))throw new Error('invalid_cursor');cursor=decodeURIComponent(before.slice(prefix.length));}
    const result=await this.client!.pupPage!.evaluate(async({jid,cursor})=>{
      const w=window as any;const chat=await w.WWebJS.getChat(jid,{getAsModel:false});if(!chat||chat.id?._serialized!==jid)throw new Error('invalid_destination');
      //: Нормализует MsgKey текущих сборок, где строка доступна через toString или serialize.
      //: Не сериализует весь чат; запасной путь касается только выбранного сообщения.
      const key=(m:any):string|undefined=>{const id=m.id;let value=typeof id==='string'?id:id?._serialized||id?.toString?.();if(typeof value!=='string'||!/^(true|false)_/.test(value)){const saved=m.serialize?.().id;value=typeof saved==='string'?saved:saved?._serialized||saved?.toString?.();if((typeof value!=='string'||!/^(true|false)_/.test(value))&&saved&&typeof saved.id==='string'&&typeof saved.fromMe==='boolean'){const remote=typeof saved.remote==='string'?saved.remote:saved.remote?._serialized;const participant=typeof saved.participant==='string'?saved.participant:saved.participant?._serialized;if(remote)value=`${saved.fromMe}_${remote}_${saved.id}${participant?'_'+participant:''}`;}}return typeof value==='string'&&/^(true|false)_/.test(value)?value:undefined;};
      const anchors:Map<string,any>=w.__zaiHistoryAnchors??=new Map();const loads:Map<string,Promise<any[]>>=w.__zaiHistoryLoads??=new Map();
      const cached=chat.msgs.getModelsArray().filter((m:any)=>!m.isNotification);
      let list=cached.filter((m:any)=>key(m)&&Number.isFinite(Number(m.t))&&Number(m.t)>0);
      if(cached.length&&!list.length)throw new Error(`history_shape:${cached.length}:${cached.filter((m:any)=>key(m)).length}:${cached.filter((m:any)=>Number.isFinite(Number(m.t))&&Number(m.t)>0).length}`);
      const anchor=anchors.get(jid);if(cursor&&anchor&&key(anchor)===cursor&&!list.some((m:any)=>key(m)===cursor))list=[anchor,...list];
      let end=cursor?list.findIndex((m:any)=>key(m)===cursor):list.length;let exhausted=false;
      if(end<=0){
        let load=loads.get(jid);if(!load){if(loads.size>=4)throw new Error('history_pending');load=Promise.resolve(w.require('WAWebChatLoadMessages').loadEarlierMsgs({chat}));loads.set(jid,load);void load.finally(()=>{if(loads.get(jid)===load)loads.delete(jid);}).catch(()=>{});}
        let timer:ReturnType<typeof setTimeout>;let earlier:any[];
        try{earlier=await Promise.race([load,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('history_timeout')),8000);})]);}finally{clearTimeout(timer!);}
        exhausted=!earlier?.length;const unique=new Map([...earlier||[],...list].filter((m:any)=>!m.isNotification&&key(m)&&Number.isFinite(Number(m.t))&&Number(m.t)>0).map((m:any)=>[key(m),m]));
        list=[...unique.values()].sort((a:any,b:any)=>Number(a.t)-Number(b.t)||key(a)!.localeCompare(key(b)!));end=cursor?list.findIndex((m:any)=>key(m)===cursor):list.length;
      }
      if(end<0)throw new Error('invalid_cursor');
      const slice=list.slice(Math.max(0,end-100),end);if(!slice.length&&!exhausted)throw new Error('history_pending');
      if(slice.length){const oldest=slice[0];if(!anchor||Number(oldest.t)<=Number(anchor.t)){if(!anchors.has(jid)&&anchors.size>=1000)anchors.delete(anchors.keys().next().value!);anchors.set(jid,oldest);}}
      const messages=slice.map((m:any)=>({id:{_serialized:key(m)!,remote:key(m)!.split('_')[1]},from:m.from?._serialized||m.from,to:m.to?._serialized||m.to,author:m.author?._serialized||m.author,fromMe:typeof m.id?.fromMe==='boolean'?m.id.fromMe:key(m)!.startsWith('true_'),timestamp:Number(m.t),body:String(m.body||'').slice(0,4096),type:m.type,ack:m.ack,hasMedia:!!m.isMedia}));
      return {messages,more:!exhausted||end>100,title:String(chat.formattedTitle||chat.name||'')};
    },{jid,cursor});
    const messages=result.messages.map((value:WebMessage)=>webMessage(value,jid,result.title||jid));
    return {messages,nextCursor:result.more&&messages.length?messages[0].id:null};
  }
}
