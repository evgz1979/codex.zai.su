import type {Store,SyncProgress} from '../storage/store.js';
import type {MessengerService} from './service.js';
import type {SourceAdapter} from './source-adapter.js';
import type {HistoryPage} from '../../shared/types.js';
import {LIMITS} from '../../shared/types.js';
import {AppError} from './errors.js';
import {telegramAuthIssue} from '../auth/telegram-issue.js';
//: Заполняет полный SQLite-кеш выбранных диалогов одним фоновым потоком.
//: Новые сообщения приходят событиями; история и пропуски возобновляются по курсорам.
export class AutoSyncService {
  private timer?:ReturnType<typeof setTimeout>;
  private running?:Promise<void>;
  private stopped=false;
  private metadataAt=0;
  private pausedUntil=0;
  private subscriptions=new Map<SourceAdapter,()=>void>();
  private validated=new Set<string>();
  private priority=new Set<string>();
  private round=0;
  private historyRound=0;
  //: Связывает синхронизатор с общим ядром и SQLite.
  //: Интервал и часы подменяются только изолированными тестами.
  constructor(private core:MessengerService,private store:Store,private interval=3000,private now=Date.now){core.requestSync=id=>{this.priority.add(id);};const pause=Number(store.get('sync.pausedUntil')||0);this.pausedUntil=Number.isFinite(pause)?pause:0;}
  //: Запускает автоматическое обслуживание без браузера и пользовательских кнопок.
  //: Готовая сессия наблюдает новые контакты даже при пустом выборе; без сессии вход не запускается.
  start(){this.schedule(0);}
  //: Планирует только один следующий проход.
  //: Фон не создаёт параллельных обходов истории или отдельного сервиса.
  private schedule(delay=this.interval){if(this.stopped||this.timer)return;this.timer=setTimeout(()=>{this.timer=undefined;void this.tick().finally(()=>this.schedule());},delay);this.timer.unref();}
  //: Выполняет один последовательный шаг и применяет безопасную паузу после отказа.
  //: FloodWait соблюдается без вывода исходного исключения в журнал.
  tick():Promise<void>{
    if(this.stopped)return Promise.resolve();if(this.running)return this.running;
    this.running=this.runOnce().catch(error=>{const issue=telegramAuthIssue(error);const seconds=(error instanceof AppError?error.retryAfterSeconds:undefined)||issue.retryAfterSeconds||30;this.pausedUntil=this.now()+Math.max(3,seconds)*1000;this.store.set('sync.pausedUntil',String(this.pausedUntil));}).finally(()=>{this.running=undefined;});return this.running;
  }
  //: Выбирает незагруженную голову, пропуск новых сообщений или страницу старой истории.
  //: Текущий выбор и его ревизия проверяются снова после каждого внешнего запроса.
  private async runOnce(){
    const now=this.now();if(now<this.pausedUntil||!this.core.selection.ids().length&&!this.core.canDiscoverContacts())return;
    if(now>=this.metadataAt){await this.core.refresh();if(this.stopped)return;this.metadataAt=now+30000;
      for(const adapter of this.core.registry.adapters)if(adapter.subscribe&&!this.subscriptions.has(adapter))this.subscriptions.set(adapter,adapter.subscribe(event=>{try{this.core.ingest(event);}catch{this.metadataAt=0;}},id=>this.core.selection.allows(id),conversation=>this.core.discoverContact(conversation)));
    }
    const ids=this.core.selection.ids().filter(id=>{const conversation=this.store.conversation(id);return now>=Number(this.store.get(`sync.retry.${id}`)||0)&&!!conversation&&this.core.registry.get(conversation.sourceId).source.connected;});if(!ids.length)return;
    for(const id of ids)if(!this.validated.has(id)){const state=this.store.progress(id);if(state.checkpointIds?.length&&!this.store.checkpointExists(state.checkpointIds)){this.store.saveProgress(id,{initialized:false,historyCursor:null,historyComplete:false,headKeys:[],newerCursor:null,pendingHeadKeys:[],nextHeadAt:0,checkpointIds:[]});}this.validated.add(id);}
    const entries=ids.map(id=>({id,state:this.store.progress(id)}));
    let item=entries.find(e=>!e.state.initialized&&this.priority.has(e.id))||entries.find(e=>!e.state.initialized);
    let history=false;
    if(!item){
      const old=entries.filter(e=>!e.state.historyComplete).sort((a,b)=>Number(this.priority.has(b.id))-Number(this.priority.has(a.id)));
      const head=entries.filter(e=>e.state.newerCursor||now>=e.state.nextHeadAt).sort((a,b)=>a.state.nextHeadAt-b.state.nextHeadAt);
      history=this.round++%2===0&&old.length>0;
      const preferred=old.find(e=>this.priority.has(e.id))||old[this.historyRound++%Math.max(1,old.length)];
      item=history?preferred:head[0];if(!item){item=preferred||head[0];history=!!preferred;}
    }
    if(!item)return;this.priority.delete(item.id);
    const {id,state}=item;const c=this.store.conversation(id)!;const adapter=this.core.registry.get(c.sourceId);const revision=this.core.selection.revision;
    // Прежняя пустая страница не задаёт границу новых сообщений: сначала молча заполняем архив.
    const firstHead=!state.initialized||!state.headKeys.length&&!state.checkpointIds.length;
    const before=firstHead?undefined:(history?state.historyCursor:state.newerCursor)||undefined;
    let page:HistoryPage;
    try{
    if(adapter.historyPage)page=await adapter.historyPage(id,before,!firstHead&&!history&&!state.newerCursor?LIMITS.pageMessages:LIMITS.syncMessages);
    else if(adapter.messagePage){const result=await adapter.messagePage(id,LIMITS.pageMessages,before);page={...result,cursors:result.messages.map(m=>m.id)};}
    else{const messages=await adapter.recentMessages(id,LIMITS.pageMessages);page={conversationId:id,messages,nextCursor:null,cursors:messages.map(m=>m.id)};}
    }catch(error){if((error instanceof AppError&&error.retryAfterSeconds)||telegramAuthIssue(error).retryAfterSeconds)throw error;this.store.set(`sync.retry.${id}`,String(this.now()+30000));return;}
    this.store.remove(`sync.retry.${id}`);
    if(this.stopped||revision!==this.core.selection.revision||!this.core.selection.allows(id))return;
    if(page.conversationId!==id||page.messages.length>LIMITS.syncMessages||page.nextCursor===before||page.messages.some(m=>m.conversationId!==id||m.sourceId!==c.sourceId))throw new Error('Invalid source page');
    this.core.cacheMessages(id,page.messages,!firstHead&&!history);
    const next:SyncProgress={...state};
    if(firstHead){next.initialized=true;next.historyCursor=page.nextCursor;next.historyComplete=!page.nextCursor;next.headKeys=page.cursors;next.newerCursor=null;next.pendingHeadKeys=[];next.nextHeadAt=now+15000;next.lastHeadAt=now;next.checkpointIds=page.messages.map(m=>m.id);}
    else if(history){next.historyCursor=page.nextCursor;next.historyComplete=!page.nextCursor;if(page.messages.length)next.checkpointIds=page.messages.map(m=>m.id);}
    else{
      const pending=state.newerCursor?state.pendingHeadKeys:page.cursors;const overlap=page.cursors.some(cursor=>state.headKeys.includes(cursor));
      if(overlap||!page.nextCursor){next.headKeys=pending;next.pendingHeadKeys=[];next.newerCursor=null;next.nextHeadAt=now+15000;next.lastHeadAt=now;}
      else{next.pendingHeadKeys=pending;next.newerCursor=page.nextCursor;next.nextHeadAt=now;}
    }
    next.checkpointIds=next.checkpointIds.filter(key=>this.store.checkpointExists([key]));
    this.store.saveProgress(id,next);
  }
  //: Останавливает таймер, события и текущий ограниченный запрос.
  //: Последняя успешно записанная страница остаётся готовой к возобновлению.
  async stop(){this.stopped=true;clearTimeout(this.timer);for(const unsubscribe of this.subscriptions.values())unsubscribe();this.subscriptions.clear();await this.running;}
}
