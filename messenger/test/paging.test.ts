import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Api,type TelegramClient} from 'teleproto';
import {Store} from '../backend/storage/store.js';
import {SecretVault} from '../backend/storage/private-files.js';
import {MessengerService} from '../backend/core/service.js';
import {TelegramAdapter} from '../backend/connectors/telegram/adapter.js';
import {TestAdapter} from './fixtures.js';
import {entityId} from '../shared/types.js';
//: Создаёт изолированный Store и источник с двумя страницами разных лет.
//: Разница дат воспроизводит вытеснение активного диалога из общей ленты.
function context(t:{after(fn:()=>void):void}){
 const dir=mkdtempSync(join(tmpdir(),'zai-paging-'));const store=new Store(dir);const adapter=new TestAdapter();
 adapter.messages=adapter.conversations.flatMap((c,index)=>Array.from({length:25},(_,i)=>({...adapter.messages[index],id:entityId(adapter.source.id,'message',`${c.id}/${i+1}`),date:new Date(Date.UTC(index===0?2026:2000,0,1,0,i)).toISOString(),text:`Синтетический ${index}/${i+1}`})));
 store.select(adapter.conversations.map(c=>c.id));const core=new MessengerService([adapter],store);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {core,adapter,store,dir};
}
test('страницы: обновление не читает историю всех чатов; активный диалог получает 10 + 10 + 5',async t=>{
 const {core,adapter,store}=context(t);const [first,second]=adapter.conversations;
 await core.refresh();assert.deepEqual(adapter.calls,[]);assert.equal(core.snapshot().messages.length,0);store.upsertMessages(adapter.messages);for(const c of adapter.conversations)store.saveProgress(c.id,{...store.progress(c.id),initialized:true,historyComplete:true});
 const a=await core.open(first.id);assert.equal(a.page.messages.length,10);
 const b=await core.open(second.id);assert.equal(b.page.messages.length,10);assert.ok(b.page.messages.every(m=>m.conversationId===second.id));
 assert.ok(b.snapshot.messages.every(m=>m.conversationId===first.id));
 const older=await core.open(second.id,b.page.nextCursor!);assert.equal(older.page.messages.length,10);
 const last=await core.open(second.id,older.page.nextCursor!);assert.equal(last.page.messages.length,5);assert.equal(last.page.nextCursor,null);
 assert.equal(new Set([...b.page.messages,...older.page.messages,...last.page.messages].map(m=>m.id)).size,25);
 assert.equal(adapter.calls.length,0);assert.equal(adapter.reads.length,0);
 const calls=adapter.calls.length;await core.refresh();assert.equal(adapter.calls.length,calls);
});
test('страницы кеша: чужой курсор и исключённый диалог отклоняются без Telegram',async t=>{
 const {core,adapter,store}=context(t);await core.refresh();store.upsertMessages(adapter.messages);const [a,b]=adapter.conversations;
 const first=await core.open(a.id);await assert.rejects(core.open(b.id,first.page.nextCursor!),/не относится/);
 adapter.fail=true;assert.equal((await core.open(b.id)).page.messages.length,10);assert.equal(adapter.calls.length,0);
 core.selection.clear();await assert.rejects(core.open(a.id),/не разрешён/);
});
test('страницы: отметка прочитанного работает после вытеснения из общего кеша',async t=>{
 const {core,adapter,store}=context(t);const original=adapter.conversations[0];const message=adapter.messages[0];
 adapter.conversations=Array.from({length:45},(_,i)=>({...original,id:entityId(adapter.source.id,'conversation',String(i)),recipient:{...original.recipient,id:entityId(adapter.source.id,'recipient',String(i))}}));
 adapter.messages=adapter.conversations.flatMap((c,i)=>Array.from({length:10},(_,j)=>({...message,id:entityId(c.sourceId,'message',`${c.id}/${j+1}`),conversationId:c.id,date:new Date(Date.UTC(i===0?2000:2026,0,1,0,i,j)).toISOString()})));
 core.selection.replace(adapter.conversations.map(c=>c.id),adapter.conversations);await core.refresh();store.upsertMessages(adapter.messages);
 for(const c of adapter.conversations)await core.open(c.id);
 assert.ok(core.snapshot().messages.every(m=>m.conversationId!==adapter.conversations[0].id));await core.markRead(adapter.conversations[0].id);assert.deepEqual(adapter.reads,[adapter.conversations[0].id]);
});
test('Telegram-страницы: offsetId, сервисные записи, конец и курсор чужого диалога',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'zai-telegram-page-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const vault=new SecretVault(dir);vault.save({apiId:123,apiHash:'synthetic',session:'synthetic',accountId:'47'});
 const peer=new Api.InputPeerUser({userId:123n as never,accessHash:0n as never});const entity=new Api.User({id:123n as never,firstName:'Синтетический'});
 const requests:{limit:number;offsetId?:number}[]=[];let catalogs=0;
 const fake={connected:false,async connect(){this.connected=true;},async checkAuthorization(){return true;},async destroy(){this.connected=false;},async getDialogs(){catalogs++;return[{id:{toString:()=> '123'},inputEntity:peer,entity,title:'Синтетический',isUser:true,unreadCount:0}];},async getMessages(_peer:unknown,options:{limit:number;offsetId?:number}){
  requests.push(options);assert.equal(_peer,peer);return Array.from({length:25},(_,i)=>25-i).filter(id=>id<(options.offsetId??26)).slice(0,options.limit).map(id=>id===20?new Api.MessageService({id,peerId:new Api.PeerUser({userId:123n as never}),date:id,action:new Api.MessageActionEmpty()}):new Api.Message({id,peerId:new Api.PeerUser({userId:123n as never}),date:id,message:`Synthetic ${id}`}));
 }};
 const adapter=new TelegramAdapter(vault,()=>fake as unknown as TelegramClient);const id=entityId('telegram-47','conversation','123');
 try{
  const first=await adapter.messagePage(id,1000);assert.equal(first.messages.length,9);assert.ok(first.nextCursor);assert.equal(requests[0].limit,10);
  const second=await adapter.messagePage(id,10,first.nextCursor!);assert.equal(requests[1].offsetId,16);assert.equal(second.messages.length,10);
  const third=await adapter.messagePage(id,10,second.nextCursor!);assert.equal(requests[2].offsetId,6);assert.equal(third.messages.length,5);assert.equal(third.nextCursor,null);
  assert.equal(catalogs,1);const calls=requests.length;await assert.rejects(adapter.messagePage(id,10,entityId('telegram-47','message',`${entityId('telegram-47','conversation','999')}/16`)),/не относится/);assert.equal(requests.length,calls);
 }finally{await adapter.disconnect();}
});

test('общая хронология: все страницы SQLite, границы курсора и исключённый архив',async t=>{
 const {core,adapter,store}=context(t);await core.refresh();store.upsertMessages(adapter.messages);for(const c of adapter.conversations)store.saveProgress(c.id,{...store.progress(c.id),initialized:true,historyComplete:true});
 const seen:string[]=[];let before:string|undefined;do{const {page}=core.inboxPage(before);seen.push(...page.messages.map(m=>m.id));before=page.nextCursor||undefined;}while(before);
 assert.equal(seen.length,adapter.messages.length);assert.equal(new Set(seen).size,seen.length);assert.equal(adapter.calls.length,0);
 const first=core.inboxPage();await assert.rejects(core.open(adapter.conversations[0].id,first.page.nextCursor!),/не относится/);
 store.select([adapter.conversations[1].id]);const allowed=core.inboxPage();assert.ok(allowed.page.messages.every(m=>m.conversationId===adapter.conversations[1].id));
 store.select([]);assert.deepEqual(core.inboxPage().page.messages,[]);assert.equal(core.inboxPage().page.nextCursor,null);
});
