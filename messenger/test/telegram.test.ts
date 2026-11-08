import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Api, type TelegramClient } from 'teleproto';
import { TelegramAdapter } from '../backend/connectors/telegram/adapter.js';
import { SecretVault } from '../backend/storage/private-files.js';
import {NewMessage,EditedMessage,DeletedMessage} from 'teleproto/events';
import type {SourceEvent} from '../backend/core/source-adapter.js';
import { destinationFor,entityId } from '../shared/types.js';
test('Telegram: DTO, фильтр broadcast, уникальность message ID и буквальная отправка', async () => {
  const dir = mkdtempSync(join(tmpdir(),'zai-messenger-telegram-'));
  const vault = new SecretVault(dir);
  vault.save({ apiId:123, apiHash:'test-only', session:'test-only' });
  const user = new Api.User({ id:123n as never, firstName:'Тест' });
  const group = new Api.Chat({ id:456n as never, title:'Группа', photo:new Api.ChatPhotoEmpty(), participantsCount:2, date:0, version:1 });
  const dialogs = [user,group,user].map((entity,i) => ({
    entity, id:{toString:() => String(i)}, title:`Диалог ${i}`, inputEntity:new Api.InputPeerSelf(),
    isUser:i === 0, isGroup:i === 1, isChannel:i === 2, isCommunity:false, unreadCount:2,date:123,
  }));
  const message = () => {
    const m = new Api.Message({ id:1,peerId:new Api.PeerUser({userId:123n as never}),date:123,message:'<b>буквальный</b>' });
    m._sender = user;
    return m;
  };
  let sentOptions: Record<string,unknown> = {};
  let requestedLimit = 0;
  const fake = {
    connected:false, async connect(){ this.connected = true; }, async checkAuthorization(){ return true; }, async destroy(){ this.connected = false; },
    async getDialogs(){return dialogs;},
    async getMessages(_peer: unknown, options: {limit:number}){ requestedLimit = options.limit; return [message()]; },
    async sendMessage(_peer: unknown, options: Record<string,unknown>){ sentOptions = options; const m = message(); m.out = true; return m; },
    async markAsRead(){return true;},
  };
  const adapter = new TelegramAdapter(vault,() => fake as unknown as TelegramClient);
  try {
    const conversations = await adapter.listConversations();
    assert.equal(conversations.length,3); assert.equal(conversations[1].kind,'group'); assert.equal(conversations[2].kind,'channel');assert.ok(conversations.every(c=>c.preview===''));
    const a = await adapter.recentMessages(conversations[0].id,1000);
    const b = await adapter.recentMessages(conversations[1].id,1000);
    assert.equal(requestedLimit,10); assert.notEqual(a[0].id,b[0].id);
    assert.equal(a[0].sender.name,'Тест'); assert.equal(a[0].status,'received');
    await assert.rejects(adapter.sendText({...destinationFor(conversations[0]),recipientId:'wrong'},'x'),/Invalid destination/);
    const sent = await adapter.sendText(destinationFor(conversations[0]),'**буквальный текст**');
    assert.equal(sent.status,'sent'); assert.deepEqual(sentOptions.formattingEntities,[]);
    assert.equal(sentOptions.linkPreview,false); assert.equal(sentOptions.message,'**буквальный текст**');
    await adapter.markRead(conversations[0].id,a[0].id);
  } finally { await adapter.disconnect(); rmSync(dir,{recursive:true,force:true}); }
});

test('Telegram-события: выбор до преобразования, правки, области ID удалений и снятие подписки',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zai-events-'));const vault=new SecretVault(dir);vault.save({apiId:123,apiHash:'test-only',session:'test-only'});
 const handlers:{callback:(event:never)=>void;builder:unknown}[]=[];const events:SourceEvent[]=[];
 const fake={connected:false,async connect(){this.connected=true;},async checkAuthorization(){return true;},async destroy(){this.connected=false;},addEventHandler(callback:(event:never)=>void,builder:unknown){handlers.push({callback,builder});}};
 const adapter=new TelegramAdapter(vault,()=>fake as unknown as TelegramClient);
 const selected=entityId(adapter.source.id,'conversation','123');const channelId=entityId(adapter.source.id,'conversation','-100456');const allowed=new Set([selected,channelId]);
 const unsubscribe=adapter.subscribe(event=>events.push(event),id=>allowed.has(id));
 try{
  await adapter.connect();assert.equal(handlers.length,3);
  const m=new Api.Message({id:7,peerId:new Api.PeerUser({userId:123n as never}),date:123,message:'Синтетическое'});
  const emit=(builder:unknown,event:unknown)=>handlers.find(h=>h.builder instanceof (builder as typeof NewMessage))!.callback(event as never);
  emit(NewMessage,{message:m});assert.equal(events.length,1);const original=events[0];assert.equal(original.type,'message');if(original.type!=='message')throw new Error('Expected message');assert.equal(original.message.conversationId,selected);
  const other=new Api.Message({id:8,peerId:new Api.PeerUser({userId:999n as never}),date:123,message:'Не выбран'});emit(NewMessage,{message:other});assert.equal(events.length,1);
  m.editDate=124;emit(EditedMessage,{message:m});assert.equal(events[1].type,'message');assert.ok(events[1].type==='message'&&events[1].edited);
  emit(DeletedMessage,{isChannel:false,deletedIds:[7]});const deletion=events[2];assert.ok(deletion.type==='delete'&&deletion.keys[0]===original.message.sourceKey);
  const ch=new Api.Message({id:7,peerId:new Api.PeerChannel({channelId:456n as never}),date:123,message:'Канал'});emit(NewMessage,{message:ch});const channel=events[3];assert.ok(channel.type==='message'&&channel.message.sourceKey!==original.message.sourceKey);
  emit(DeletedMessage,{isChannel:true,chatId:{toString:()=>'-100456'},deletedIds:[7]});assert.ok(events[4].type==='delete'&&channel.type==='message'&&events[4].keys[0]===channel.message.sourceKey);
  allowed.delete(channelId);emit(DeletedMessage,{isChannel:true,chatId:{toString:()=>'-100456'},deletedIds:[7]});assert.equal(events.length,5);
  unsubscribe();emit(NewMessage,{message:m});assert.equal(events.length,5);
 }finally{await adapter.disconnect();rmSync(dir,{recursive:true,force:true});}
});

test('Telegram-аватары: маленькое фото известного peer, его DC и отменяемый ограниченный поток',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zai-avatar-'));const vault=new SecretVault(dir);vault.save({apiId:123,apiHash:'test-only',session:'test-only'});
 const photo=new Api.UserProfilePhoto({photoId:456n as never,dcId:2});const user=new Api.User({id:123n as never,firstName:'Тест',photo});const peer=new Api.InputPeerUser({userId:123n as never,accessHash:789n as never});
 let location:Api.TypeInputFileLocation|undefined;let options:{signal?:AbortSignal;dcId?:number;limit?:number}|undefined;
 const fake={connected:false,async connect(){this.connected=true;},async checkAuthorization(){return true;},async destroy(){this.connected=false;},async getDialogs(){return [{entity:user,id:user.id,title:'Тест',inputEntity:peer,isUser:true,unreadCount:0,date:123}];},iterDownload(file:Api.TypeInputFileLocation,params:typeof options){location=file;options=params;return (async function*(){yield Buffer.from([255,216,255]);})();}};
 const adapter=new TelegramAdapter(vault,()=>fake as unknown as TelegramClient);try{
  const [conversation]=await adapter.listConversations();assert.equal(conversation.avatarVersion,'456');const signal=new AbortController().signal;const chunks=[];for await(const chunk of await adapter.openAvatar(conversation.id,signal))chunks.push(chunk);
  assert.ok(location instanceof Api.InputPeerPhotoFileLocation);assert.equal(location.peer,peer);assert.equal(location.photoId,photo.photoId);assert.equal(location.big,false);assert.equal(options?.dcId,2);assert.equal(options?.signal,signal);assert.equal(options?.limit,512*1024+1);assert.equal(chunks.length,1);
  const aborted=new AbortController();aborted.abort();await assert.rejects(adapter.openAvatar(conversation.id,aborted.signal));
 }finally{await adapter.disconnect();rmSync(dir,{recursive:true,force:true});}
});
