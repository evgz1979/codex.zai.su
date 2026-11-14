import {compareConversations,LIMITS,OFFLINE_LIMITS,type AccountInfo,type ConversationPageResult,type Message,type SessionInfo,type Snapshot} from '../../shared/types';
//: Описывает сохранённые данные одного личного адреса без реквизитов входа.
//: Срок чтения ограничен веб-сессией; logoutPending содержит только факт локального выхода.
interface SavedAccount {account?:AccountInfo;expiresAt:number;savedAt:number;snapshot:Snapshot;messages:Message[];logoutPending?:boolean;accessRevision?:number;allowedIds?:string[]}
//: Создаёт пустой снимок без имитации подключения к источнику.
//: Используется только для локального кеша ранее полученных данных.
function emptySnapshot():Snapshot{return {sources:[],conversations:[],messages:[],refreshedAt:null,stale:true};}
//: Хранит ограниченный кеш прочитанных сообщений в IndexedDB текущего браузера.
//: Пароли, cookie, CSRF, Telegram-сессии и административные ответы не сохраняются.
export class OfflineCache {
  private database?:Promise<IDBDatabase>;
  private value?:SavedAccount;
  private loaded=false;
  private queue:Promise<unknown>=Promise.resolve();
  generation=0;
  dataRevision=0;
  //: Привязывает кеш к API-префиксу конкретного личного адреса.
  //: Короткий и прежний путь аккаунта используют один ключ; чужие адреса не смешиваются.
  constructor(private scope:string){}
  //: Открывает отдельное браузерное хранилище с одной записью на аккаунт.
  //: Ошибки запрета хранилища или квоты не мешают обычной работе по сети.
  private db(){
    this.database??=new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('zai-messenger-offline-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('accounts');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Offline storage blocked'));
    });return this.database;
  }
  //: Читает одну запись только своего адреса из IndexedDB.
  //: Позднее завершение чтения после выхода не восстанавливает старые сообщения.
  private async load(){
    if(this.loaded)return;const generation=this.generation;
    const db=await this.db();const value=await new Promise<SavedAccount|undefined>((resolve,reject)=>{const request=db.transaction('accounts').objectStore('accounts').get(this.scope);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    if(generation===this.generation){this.value=value;this.loaded=true;}
  }
  //: Последовательно применяет локальные изменения и фиксирует транзакцию целиком.
  //: Новая генерация после выхода запрещает поздним ответам повторно заполнить кеш.
  private change(update:(value:SavedAccount|undefined)=>SavedAccount|undefined|false,generation=this.generation):Promise<void>{
    const operation=this.queue.then(async()=>{
      if(generation!==this.generation)return;await this.load();if(generation!==this.generation)return;
      const next=update(this.value);if(next===false)return;this.value=next;const value=this.value;const db=await this.db();
      await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('accounts','readwrite');const store=transaction.objectStore('accounts');if(value)store.put(value,this.scope);else store.delete(this.scope);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
    });this.queue=operation.catch(()=>{});return operation.catch(()=>{});
  }
  //: Удаляет локальную историю либо оставляет только намерение отозвать серверную сессию.
  //: Данные не воскресают после перезагрузки или позднего HTTP-ответа.
  clear(logoutPending=false){this.generation++;return this.change(()=>logoutPending?{expiresAt:0,savedAt:0,snapshot:emptySnapshot(),messages:[],logoutPending:true}:undefined);}
  //: Сбрасывает память окна после изменения общего кеша соседним окном.
  //: Сохранённое намерение выхода в IndexedDB не перезаписывается.
  invalidate(){this.generation++;this.loaded=false;this.value=undefined;}
  //: Проверяет необходимость закончить локальный выход при восстановлении связи.
  //: Флаг не содержит токенов и не даёт права чтения кеша.
  async needsLogout(){try{await this.queue;await this.load();return !!this.value?.logoutPending;}catch{return false;}}
  //: Сохраняет только публичное имя и фактический срок подтверждённого входа.
  //: При смене аккаунта прежняя история полностью сбрасывается.
  authorize(info:SessionInfo){return this.change(previous=>{
    if(!info.authenticated)return undefined;
    const same=previous?.account?.id===info.account?.id&&!previous?.logoutPending;
    return {...(same?previous:undefined),account:info.account,expiresAt:Math.min(info.expiresAt||Date.now()+8*3600000,Date.now()+8*3600000),savedAt:previous?.savedAt||0,snapshot:same&&previous?previous.snapshot:emptySnapshot(),messages:same&&previous?previous.messages:[]};
  });}
  //: Ограничивает кеш двумястами чатами, сотней сообщений чата и тысячей всего.
  //: Резервирует последние пять записей каждого чата; лимит байтов сначала удаляет более старые.
  private bound(value:SavedAccount){
    value.snapshot.conversations.sort(compareConversations);value.snapshot.conversations=value.snapshot.conversations.slice(0,OFFLINE_LIMITS.conversations);
    const ids=new Set(value.snapshot.conversations.map(c=>c.id));const counts=new Map<string,number>();
    const ordered=value.messages.filter(m=>ids.has(m.conversationId)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).filter(m=>{const count=(counts.get(m.conversationId)||0)+1;counts.set(m.conversationId,count);return count<=OFFLINE_LIMITS.perConversation;});
    counts.clear();const reserved=new Set<string>();const newest=new Set<string>();
    for(const message of ordered){const count=(counts.get(message.conversationId)||0)+1;counts.set(message.conversationId,count);if(count<=OFFLINE_LIMITS.headMessages)reserved.add(message.id);if(count===1)newest.add(message.id);}
    const extra=ordered.filter(m=>!reserved.has(m.id)).slice(0,Math.max(0,OFFLINE_LIMITS.messages-reserved.size));const kept=new Set([...reserved,...extra.map(m=>m.id)]);value.messages=ordered.filter(m=>kept.has(m.id));
    const encoder=new TextEncoder();while(encoder.encode(JSON.stringify(value)).byteLength>OFFLINE_LIMITS.bytes){
      const removable=value.messages.filter(m=>!newest.has(m.id)).slice(-25);
      if(removable.length){const removed=new Set(removable.map(m=>m.id));value.messages=value.messages.filter(m=>!removed.has(m.id));}
      else if(value.snapshot.conversations.some(c=>c.avatarThumbnail)){for(const conversation of value.snapshot.conversations)delete conversation.avatarThumbnail;}
      else if(value.messages.length)value.messages.pop();else if(value.snapshot.conversations.length)value.snapshot.conversations.pop();else break;
    }
    return value;
  }
  //: Запоминает ответы чтения и подтверждённые изменения сообщений и закреплений.
  //: Снятие выбора, удаления и reset немедленно удаляют соответствующую локальную историю.
  remember(path:string,input:unknown,result:unknown,generation:number,revisionAtRequest:number){
    if(!path.startsWith('access?')&&!['snapshot','inbox','open','older','read','refresh','pin','send','transcribe','offline'].includes(path))return Promise.resolve();
    return this.change(value=>{
    if(!value||value.logoutPending||value.expiresAt<=Date.now())return value;
    const data=result as Snapshot&Partial<ConversationPageResult>&{ids?:string[];deletedIds?:string[];reset?:boolean;revision?:number};
    if(path.startsWith('access?')){
      if(typeof data.revision==='number'&&value.accessRevision===data.revision&&!data.reset&&!data.deletedIds?.length)return false;
      value.accessRevision=data.revision;
      const ids=new Set(data.ids||[]);const deleted=new Set(data.deletedIds||[]);
      if(deleted.size||data.reset||value.allowedIds&&(value.allowedIds.length!==ids.size||value.allowedIds.some(id=>!ids.has(id))))this.dataRevision++;
      value.allowedIds=[...ids];
      value.snapshot.conversations=value.snapshot.conversations.filter(c=>ids.has(c.id));value.messages=data.reset?[]:value.messages.filter(m=>ids.has(m.conversationId)&&!deleted.has(m.id));
    }else{
      if(revisionAtRequest!==this.dataRevision)return false;
      if(path==='pin')this.dataRevision++; // Поздний снимок не откатывает закрепление в сохранённом списке.
      const snapshot=data.snapshot||(['snapshot','read','refresh','pin'].includes(path)?data:undefined);
      if(snapshot?.conversations){value.snapshot={...structuredClone(snapshot),messages:[]};if(value.allowedIds){const ids=new Set(value.allowedIds);value.snapshot.conversations=value.snapshot.conversations.filter(c=>ids.has(c.id));}}
      const messages=[...(snapshot?.messages||[]),...(data.page?.messages||[]),...(path==='send'?[result as Message]:[]),...(path==='offline'?data.messages:[])];
      const merged=new Map(value.messages.map(m=>[m.id,m]));if(path==='offline'&&messages.every(m=>JSON.stringify(merged.get(m.id))===JSON.stringify(m)))return false;
      for(const message of messages){
        const previous=merged.get(message.id);const version=message.editedAt||message.date;if(previous&&(previous.editedAt||previous.date)>version)continue;
        const copy=structuredClone(message);if(previous&&(previous.editedAt||previous.date)===version&&previous.voiceTranscription?.pending===false&&copy.voiceTranscription?.pending!==false&&copy.attachments.some(a=>a.isVoice))copy.voiceTranscription=previous.voiceTranscription;
        merged.set(message.id,copy);
      }value.messages=[...merged.values()];
      if(path==='transcribe'){const message=value.messages.find(m=>m.id===(input as {messageId?:string})?.messageId);if(message)message.voiceTranscription=result as Message['voiceTranscription'];}
    }
    value.savedAt=Date.now();return this.bound(value);
  },generation);}
  //: Восстанавливает только данные ещё действующего ранее подтверждённого входа.
  //: Пустой, просроченный или завершённый вход не предоставляет локальную переписку.
  async read(path:string,input?:unknown):Promise<unknown>{
    try{await this.queue;await this.load();}catch{return undefined;}
    const value=this.value;if(!value||value.logoutPending)return;
    if(value.expiresAt<=Date.now()){await this.clear();return;}
    if(path==='session')return {authenticated:true,setupRequired:false,account:value.account,expiresAt:value.expiresAt} satisfies SessionInfo;
    const snapshot={...value.snapshot,stale:true,messages:[...value.messages].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).slice(-LIMITS.pageMessages)};
    if(path==='snapshot')return snapshot;
    if(!['inbox','open','older'].includes(path))return;
    const route=input as {conversationId?:string;before?:string};const id=path==='inbox'?'inbox':route?.conversationId;
    if(!id||id!=='inbox'&&!snapshot.conversations.some(c=>c.id===id))return;
    let anchor:{conversationId:string;date:string;id:string}|undefined;
    if(route?.before){try{const bytes=Uint8Array.from(atob(route.before.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));anchor=JSON.parse(new TextDecoder().decode(bytes));}catch{return;}if(anchor?.conversationId!==id||typeof anchor.date!=='string'||typeof anchor.id!=='string')return;}
    const messages=value.messages.filter(m=>(id==='inbox'||m.conversationId===id)&&(!anchor||m.date<anchor.date||m.date===anchor.date&&m.id<anchor.id)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
    const page=messages.slice(0,LIMITS.pageMessages).reverse();const first=page[0];
    const cursor=first?btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({conversationId:id,date:first.date,id:first.id})))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null;
    return {snapshot,page:{conversationId:id,messages:page,nextCursor:messages.length>LIMITS.pageMessages?cursor:null,oldestCursor:cursor,historyComplete:false,cached:true}} satisfies ConversationPageResult;
  }
}
