import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Api,type TelegramClient} from 'teleproto';
import {NewMessage} from 'teleproto/events';
import {Store} from '../backend/storage/store.js';
import {SecretVault} from '../backend/storage/private-files.js';
import {MessengerService} from '../backend/core/service.js';
import {AutoSyncService} from '../backend/core/sync.js';
import {TelegramAdapter} from '../backend/connectors/telegram/adapter.js';
import {compareConversations,entityId,type Conversation,type Message} from '../shared/types.js';
import type {SourceEvent} from '../backend/core/source-adapter.js';
import {TestAdapter} from './fixtures.js';

//: Создаёт источник обнаружения новых контактов без реальной сети.
//: Тесты получают тот же третий callback подписки, который использует Telegram.
class DiscoveryAdapter extends TestAdapter{
  discover?:(conversation:Conversation)=>boolean;
  //: Объявляет синтетический источник готовым к наблюдению пустого списка.
  //: Production этот адаптер не регистрирует.
  canDiscoverContacts(){return true;}
  //: Сохраняет callback обнаружения и тестовый listener сообщения.
  //: Разрешения и входящие остаются управляемыми тестом.
  subscribe(listener:(event:SourceEvent)=>void,_allows?:(id:string)=>boolean,discover?:(conversation:Conversation)=>boolean){this.discover=discover;return super.subscribe(listener);}
}
//: Создаёт отдельную БД и источник для проверки просмотра и обнаружения.
//: Данные владельца и внешние сервисы не используются.
function context(t:{after(fn:()=>void|Promise<void>):void}){
  const dir=mkdtempSync(join(tmpdir(),'zai-reads-discovery-'));const store=new Store(dir);const adapter=new DiscoveryAdapter();const core=new MessengerService([adapter],store);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {dir,store,adapter,core};
}
//: Строит новые метаданные и входящее сообщение одного тестового контакта.
//: Свежая дата отличает новый контакт от зафиксированного исходного каталога.
function contact(adapter:TestAdapter,name='new'){
  const conversation:Conversation={...adapter.conversations[0],id:entityId(adapter.source.id,'conversation',name),title:name,recipient:{id:entityId(adapter.source.id,'recipient',name),name},unreadCount:0,updatedAt:new Date().toISOString()};
  const message:Message={...adapter.messages[0],id:entityId(adapter.source.id,'message',name),conversationId:conversation.id,date:conversation.updatedAt,sequence:10};return {conversation,message};
}

test('просмотр: точная граница, сообщения одной секунды и запоздалая голова не возвращают счётчик',async t=>{
  const {dir,store,adapter,core}=context(t);store.select([adapter.conversations[0].id]);await core.refresh();const c=adapter.conversations[0];
  const first={...adapter.messages[0],id:'position-9',sequence:9};const second={...first,id:'position-10',sequence:10};store.upsertMessages([first,second]);
  await core.markRead(c.id,first.id);assert.equal(core.snapshot().conversations[0].unreadCount,1);
  await core.refresh();assert.equal(core.snapshot().conversations[0].unreadCount,1);
  await core.markRead(c.id,second.id);assert.equal(core.snapshot().conversations[0].unreadCount,0);
  const count=adapter.reads.length;await core.markRead(c.id,first.id);assert.equal(adapter.reads.length,count);
  await assert.rejects(core.markRead(c.id,adapter.messages[1].id),/не относится/);
  const reopened=new Store(dir);try{assert.equal(reopened.readPosition(c.id)?.sequence,10);assert.equal(reopened.conversation(c.id)?.unreadCount,0);}finally{reopened.close();}
});

test('просмотр: входящее во время RPC остаётся непрочитанным, исключённый поздний ответ не применяется',async t=>{
  const {store,adapter,core}=context(t);const c=adapter.conversations[0];store.select([c.id]);await core.refresh();store.upsertMessages([adapter.messages[0]]);
  let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});adapter.markRead=async()=>{await gate;};
  const reading=core.markRead(c.id,adapter.messages[0].id);const newer={...adapter.messages[0],id:'newer',date:new Date(Date.parse(c.updatedAt)+1000).toISOString()};core.ingest({type:'message',message:newer});finish();await reading;assert.equal(core.snapshot().conversations[0].unreadCount,1);
  let finishSecond:()=>void=()=>{};const secondGate=new Promise<void>(resolve=>{finishSecond=resolve;});adapter.markRead=async()=>{await secondGate;};const next=core.markRead(c.id,newer.id);core.selection.clear();finishSecond();await assert.rejects(next,/не разрешён/);assert.equal(store.readPosition(c.id)?.id,adapter.messages[0].id);
});

test('просмотр: старый кеш без sequence правильно различает 9 и 10 одной секунды',async t=>{
  const {store,adapter,core}=context(t);const c=adapter.conversations[0];store.select([c.id]);await core.refresh();
  const first={...adapter.messages[0],id:entityId(c.sourceId,'message',`${c.id}/9`)};const second={...first,id:entityId(c.sourceId,'message',`${c.id}/10`)};store.upsertMessages([first,second]);
  await core.markRead(c.id,first.id);assert.equal(core.snapshot().conversations[0].unreadCount,1);await core.markRead(c.id,second.id);assert.equal(core.snapshot().conversations[0].unreadCount,0);assert.equal(store.readPosition(c.id)?.sequence,10);
});

test('диалоги: непрочитанные выше прочитанных, внутри порядок по свежести',()=>{
  const adapter=new TestAdapter();const rows=[{...adapter.conversations[0],id:'read',unreadCount:0,updatedAt:'2026-11-08T13:00:00Z'},{...adapter.conversations[0],id:'older',unreadCount:8,updatedAt:'2026-11-08T10:00:00Z'},{...adapter.conversations[0],id:'newer',unreadCount:1,updatedAt:'2026-11-08T12:00:00Z'}];
  assert.deepEqual(rows.sort(compareConversations).map(c=>c.id),['newer','older','read']);
});

test('просмотр: отказ источника не сбрасывает счётчик и не сохраняет границу',async t=>{
  const {store,adapter,core}=context(t);const c=adapter.conversations[0];store.select([c.id]);await core.refresh();store.upsertMessages([adapter.messages[0]]);adapter.markRead=async()=>{throw new Error('Synthetic refusal');};
  await assert.rejects(core.markRead(c.id,adapter.messages[0].id));assert.equal(core.snapshot().conversations[0].unreadCount,3);assert.equal(store.readPosition(c.id),undefined);
});

test('контакты: старые невыбранные остаются закрытыми, новый входящий разрешается до записи и уведомляет',async t=>{
  const {store,adapter,core}=context(t);await core.refresh();assert.equal(core.snapshot().conversations.length,0);assert.equal(adapter.calls.length,0);assert.equal(core.discoverContact(adapter.conversations[0]),false);
  const {conversation,message}=contact(adapter);const received:Message[]=[];core.onIncoming(message=>received.push(message));
  assert.equal(core.discoverContact(conversation),true);assert.equal(core.selection.allows(conversation.id),true);core.ingest({type:'message',message});
  assert.equal(store.message(message.id)?.conversationId,conversation.id);assert.equal(received.length,1);assert.equal(core.snapshot().conversations[0].unreadCount,1);
  core.selection.replace([], [...adapter.conversations,conversation]);assert.equal(core.discoverContact(conversation),false);core.ingest({type:'message',message:{...message,id:'excluded-new'}});assert.equal(store.message('excluded-new'),undefined);
});

test('контакты: обнаружение из метаданных после пропуска, начальная история не создаёт лишних уведомлений',async t=>{
  const {adapter,core}=context(t);await core.refresh();const {conversation,message}=contact(adapter);adapter.conversations.push({...conversation,unreadCount:1});const received:Message[]=[];core.onIncoming(m=>received.push(m));
  await core.refresh();assert.equal(core.selection.allows(conversation.id),true);
  core.cacheMessages(conversation.id,[{...message,id:'older-history',date:new Date(Date.parse(message.date)-3600000).toISOString()},message]);assert.deepEqual(received.map(m=>m.id),[message.id]);
  core.cacheMessages(conversation.id,[message]);assert.equal(received.length,1);
});

test('контакты: наблюдение работает при пустом выборе и исключения сохраняются в SQLite',async t=>{
  const {dir,store,adapter,core}=context(t);const sync=new AutoSyncService(core,store);t.after(()=>sync.stop());await sync.tick();assert.ok(adapter.discover);assert.equal(core.selection.ids().length,0);
  const {conversation,message}=contact(adapter);assert.equal(adapter.discover!(conversation),true);adapter.listener!({type:'message',message});assert.ok(store.message(message.id));
  core.selection.replace([], [...adapter.conversations,conversation]);const restoredStore=new Store(dir);const restored=new MessengerService([adapter],restoredStore);try{assert.equal(restored.discoverContact(conversation),false);}finally{restoredStore.close();}
  for(const other of [{...conversation,id:'group',kind:'group' as const},{...conversation,id:'bot',isBot:true},{...conversation,id:'self',recipient:{...conversation.recipient,isSelf:true}}])assert.equal(core.discoverContact(other),false);
});

test('контакты: сохранение устаревшей админской формы сохраняет уже добавленный новый контакт',async t=>{
  const {adapter,core}=context(t);await core.refresh();const {conversation}=contact(adapter);assert.ok(core.discoverContact(conversation));core.selection.replace([],adapter.conversations);assert.ok(core.selection.allows(conversation.id));
});

test('Telegram: новый личный входящий сначала проходит discover, исключённые и боты не преобразуются',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'zai-discover-telegram-'));const vault=new SecretVault(dir);vault.save({apiId:123,apiHash:'synthetic',session:'synthetic'});
  const handlers:{callback:(event:never)=>void|Promise<void>;builder:unknown}[]=[];
  const fake={connected:false,async connect(){this.connected=true;},async checkAuthorization(){return true;},async destroy(){this.connected=false;},addEventHandler(callback:(event:never)=>void|Promise<void>,builder:unknown){handlers.push({callback,builder});}};
  const adapter=new TelegramAdapter(vault,()=>fake as unknown as TelegramClient);await adapter.connect();const allowed=new Set<string>();const received:SourceEvent[]=[];const phases:string[]=[];
  adapter.subscribe(event=>{phases.push('message');received.push(event);},id=>allowed.has(id),c=>{phases.push('discover');if(c.title==='Исключённый')return false;allowed.add(c.id);return true;});
  const changed=handlers.find(handler=>handler.builder instanceof NewMessage)!.callback;
  try{for(const [id,name,bot] of [[51,'Новый',false],[52,'Исключённый',false],[53,'Бот',true]] as const){const user=new Api.User({id:BigInt(id) as never,accessHash:42n as never,firstName:name,bot});const m=new Api.Message({id:10,peerId:new Api.PeerUser({userId:user.id}),date:Math.floor(Date.now()/1000),message:'synthetic'});m._sender=user;await changed({message:m} as never);}
    assert.deepEqual(phases,['discover','message','discover']);assert.equal(received.length,1);assert.equal(received[0].type,'message');
  }finally{await adapter.disconnect();rmSync(dir,{recursive:true,force:true});}
});
