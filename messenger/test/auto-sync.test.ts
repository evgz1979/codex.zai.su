import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
import {AutoSyncService} from '../backend/core/sync.js';
import {TestAdapter} from './fixtures.js';
import {entityId,type Message} from '../shared/types.js';
//: Создаёт историю тестового источника без реального аккаунта.
//: Номер определяет устойчивые ID и даты, чтобы проверять пропуски после отключения.
function history(adapter:TestAdapter,first:number,last:number){const c=adapter.conversations[0];return Array.from({length:last-first+1},(_,i)=>({...adapter.messages[0],id:entityId(c.sourceId,'message',`${c.id}/${first+i}`),sourceKey:entityId(c.sourceId,'source-message',`global/${first+i}`),conversationId:c.id,date:new Date((first+i)*1000).toISOString(),text:`Synthetic ${first+i}`}));}
//: Читает все страницы только синтетической SQLite-базы.
//: Не принимает рабочую БД и прекращает чтение на пустой ожидающей странице.
function cached(store:Store,id:string){const messages:Message[]=[];let page=store.messagePage(id);for(let i=0;i<1000;i++){messages.push(...page.messages);if(!page.nextCursor||!page.messages.length)break;page=store.messagePage(id,page.nextCursor);}return messages;}
//: Создаёт один выбранный диалог и изолированный фоновый синхронизатор.
//: Время управляется тестом, таймеры и MTProto не запускаются.
function context(t:{after(fn:()=>void):void},count=250){const dir=mkdtempSync(join(tmpdir(),'zai-auto-'));const store=new Store(dir);const adapter=new TestAdapter();adapter.messages=history(adapter,1,count);const id=adapter.conversations[0].id;store.select([id]);const core=new MessengerService([adapter],store);let time=1000000;const now=()=>time;const sync=new AutoSyncService(core,store,3000,now);t.after(async()=>{await sync.stop();store.close();rmSync(dir,{recursive:true,force:true});});return {dir,store,adapter,id,core,sync,now,advance:(ms:number)=>{time+=ms;}};}
test('автокеш: вся история больше 40 сохраняется, открытие и прокрутка не вызывают источник',async t=>{
 const {store,adapter,id,core,sync}=context(t);
 await sync.tick();await sync.tick();await sync.tick();assert.equal(store.progress(id).historyComplete,true);assert.equal(cached(store,id).length,250);assert.equal(store.syncStatus().pendingConversations,0);
 const calls=adapter.historyCalls.length;adapter.fail=true;
 for(let i=0;i<10;i++){const first=await core.open(id);assert.equal(first.page.cached,true);assert.equal(first.page.messages.length,10);assert.equal((await core.open(id,first.page.nextCursor!)).page.messages.length,10);}
 assert.equal(adapter.historyCalls.length,calls);assert.ok(adapter.historyCalls.every(call=>call.id===id));
});
test('автокеш: перезапуск продолжает курсор и не загружает начало истории заново',async t=>{
 const {store,adapter,id,core,sync,now}=context(t);await sync.tick();const cursor=store.progress(id).historyCursor;await sync.stop();
 const next=new AutoSyncService(core,store,3000,now);try{await next.tick();assert.equal(adapter.historyCalls.at(-1)?.before,cursor);await next.tick();assert.equal(cached(store,id).length,250);}finally{await next.stop();}
});
test('автокеш: пропуск более страницы после отключения догружается, живое событие не скрывает пропуск',async t=>{
 const {store,adapter,id,sync,advance}=context(t);for(let i=0;i<3;i++)await sync.tick();
 adapter.messages.push(...history(adapter,251,600));const incoming=history(adapter,601,601)[0];adapter.messages.push(incoming);adapter.listener!({type:'message',message:incoming});advance(16000);
 for(let i=0;i<8;i++)await sync.tick();assert.equal(cached(store,id).length,601);assert.equal(new Set(cached(store,id).map(m=>m.id)).size,601);assert.equal(store.progress(id).newerCursor,null);
});
test('автокеш: новые сообщения, правки и удаления применяются только к выбранному диалогу',async t=>{
 const {store,adapter,id,core,sync}=context(t,5);await sync.tick();const message=history(adapter,6,6)[0];adapter.listener!({type:'message',message});assert.equal(cached(store,id).length,6);
 adapter.listener!({type:'message',message:{...message,text:'Edited'},edited:true});assert.equal(cached(store,id).find(m=>m.id===message.id)?.text,'Edited');
 const other=adapter.conversations[1];adapter.listener!({type:'message',message:{...message,id:'not-selected',conversationId:other.id}});assert.equal(cached(store,other.id).length,0);
 const before=store.revision;adapter.listener!({type:'delete',sourceId:adapter.source.id,keys:[message.sourceKey!]});assert.equal(cached(store,id).length,5);assert.deepEqual(store.access(before).deletedIds,[message.id]);assert.ok(!store.conversation(id)?.preview.includes('Edited'));
 core.selection.clear();adapter.listener!({type:'delete',sourceId:adapter.source.id,keys:[adapter.messages[0].sourceKey!]});assert.equal(cached(store,id).length,5);await assert.rejects(core.open(id),/не разрешён/);
});
test('автокеш: FloodWait не продвигает курсор и не создаёт цикл повторов',async t=>{
 const {store,adapter,id,sync,advance}=context(t);await sync.tick();const cursor=store.progress(id).historyCursor;const original=adapter.historyPage.bind(adapter);let attempts=0;
 adapter.historyPage=async(...args)=>{attempts++;if(attempts===1)throw {name:'FloodWaitError',seconds:5};return original(...args);};
 await sync.tick();assert.equal(store.progress(id).historyCursor,cursor);await sync.tick();assert.equal(attempts,1);advance(5001);await sync.tick();assert.equal(attempts,2);assert.equal(adapter.historyCalls.at(-1)?.before,cursor);
});
test('автокеш: повреждённый старым усечением checkpoint приводит к восстановлению истории',async t=>{
 const {dir,store,adapter,id,core,sync,now}=context(t);for(let i=0;i<3;i++)await sync.tick();await sync.stop();
 const db=new DatabaseSync(join(dir,'messenger.sqlite'));db.prepare('DELETE FROM message_cache WHERE conversation_id=? AND id NOT IN (SELECT id FROM message_cache WHERE conversation_id=? ORDER BY date DESC,id DESC LIMIT 40)').run(id,id);db.close();
 const next=new AutoSyncService(core,store,3000,now);try{for(let i=0;i<3;i++)await next.tick();assert.equal(cached(store,id).length,250);assert.equal(adapter.historyCalls.at(-3)?.before,undefined);}finally{await next.stop();}
});

test('автокеш: FloodWait метаданных сохраняет паузу при перезапуске',async t=>{
 const {store,adapter,id,core,sync,now,advance}=context(t);let attempts=0;const original=adapter.listConversations.bind(adapter);
 adapter.listConversations=async()=>{attempts++;if(attempts===1)throw {name:'FloodWaitError',seconds:60};return original();};
 await sync.tick();assert.equal(store.progress(id).initialized,false);await sync.stop();
 const next=new AutoSyncService(core,store,3000,now);try{await next.tick();advance(30000);await next.tick();assert.equal(attempts,1);advance(30001);await next.tick();assert.equal(attempts,2);assert.equal(store.progress(id).initialized,true);}finally{await next.stop();}
});

test('автокеш: поздняя страница не отменяет новую правку и не воскрешает удалённое',async t=>{
 const {store,adapter,id,core,sync}=context(t,5);await sync.tick();const original=adapter.messages[0];const edited={...original,text:'Правка новее страницы',editedAt:'2026-11-07T01:00:00.000Z'};
 core.ingest({type:'message',message:edited,edited:true});core.cacheMessages(id,[original]);assert.equal(cached(store,id).find(m=>m.id===original.id)?.text,edited.text);
 core.ingest({type:'delete',sourceId:adapter.source.id,keys:[original.sourceKey!]});core.cacheMessages(id,[original,edited]);assert.equal(cached(store,id).some(m=>m.id===original.id),false);
});
