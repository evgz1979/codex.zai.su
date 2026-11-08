import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Api,type TelegramClient} from 'teleproto';
import {Raw} from 'teleproto/events';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TelegramAdapter} from '../backend/connectors/telegram/adapter.js';
import {SecretVault} from '../backend/storage/private-files.js';
import {entityId} from '../shared/types.js';
import type {SourceEvent} from '../backend/core/source-adapter.js';
//: Собирает настоящий TelegramAdapter с синтетическими TL-объектами и подменой сети.
//: Проверяет точные вызовы MTProto без рабочего аккаунта или настоящего аудио.
async function context(t:TestContext){
  const dir=mkdtempSync(join(tmpdir(),'zai-tg-transcribe-'));const vault=new SecretVault(dir);vault.save({apiId:123,apiHash:'test-only',session:'test-only'});
  const peer=new Api.InputPeerUser({userId:123n as never,accessHash:987n as never});const user=new Api.User({id:123n as never,firstName:'Синтетический'});
  const document=new Api.Document({id:1n as never,accessHash:987n as never,fileReference:Buffer.from('NATIVE_REFERENCE_TEST'),date:0,mimeType:'audio/ogg',size:3n as never,dcId:2,attributes:[new Api.DocumentAttributeAudio({duration:3,voice:true})]});
  const message=new Api.Message({id:7,peerId:new Api.PeerUser({userId:123n as never}),date:123,message:'',media:new Api.MessageMediaDocument({document})});
  let raw:(update:Api.TypeUpdate)=>void=()=>{};const calls:Api.messages.TranscribeAudio[]=[];const reads:unknown[]=[];
  const state={message,error:undefined as unknown,early:false};const events:SourceEvent[]=[];
  const update=new Api.UpdateTranscribedAudio({peer:message.peerId,msgId:7,transcriptionId:100n as never,text:'Готовый текст',pending:false});
  const fake={connected:false,async connect(){this.connected=true;},async checkAuthorization(){return true;},async destroy(){this.connected=false;},async getDialogs(){return [{entity:user,id:user.id,title:'Тест',inputEntity:peer,isUser:true,unreadCount:0,date:123}];},async getMessages(input:unknown,options:unknown){reads.push([input,options]);return [state.message];},addEventHandler(callback:(update:Api.TypeUpdate)=>void,builder:unknown){if(builder instanceof Raw)raw=callback;},async invoke(request:Api.messages.TranscribeAudio){calls.push(request);if(state.error)throw state.error;if(state.early)raw(update);return new Api.messages.TranscribedAudio({transcriptionId:100n as never,text:'Начало',pending:true});}};
  const adapter=new TelegramAdapter(vault,()=>fake as unknown as TelegramClient);const allowed=new Set<string>();adapter.subscribe(event=>events.push(event),id=>allowed.has(id));
  const [conversation]=await adapter.listConversations();allowed.add(conversation.id);
  const input={conversationId:conversation.id,messageId:entityId(adapter.source.id,'message',`${conversation.id}/7`),attachmentId:entityId(adapter.source.id,'attachment',`${conversation.id}/7`)};
  t.after(async()=>{await adapter.disconnect();rmSync(dir,{recursive:true,force:true});});
  return {adapter,input,message,document,state,calls,reads,peer,update,events,allowed,emit:(value:Api.TypeUpdate)=>raw(value)};
}
test('Telegram-расшифровка: точный peer/msgId, pending и ранний готовый update',async t=>{
  const c=await context(t);const result=await c.adapter.transcribeVoice(c.input);assert.deepEqual(result,{transcriptionId:'100',text:'Начало',pending:true});
  assert.equal(c.calls.length,1);assert.ok(c.calls[0] instanceof Api.messages.TranscribeAudio);assert.equal(c.calls[0].peer,c.peer);assert.equal(c.calls[0].msgId,7);assert.deepEqual(c.reads[0],[c.peer,{ids:[7]}]);
  c.state.early=true;assert.deepEqual(await c.adapter.transcribeVoice(c.input),{transcriptionId:'100',text:'Готовый текст',pending:false});
  assert.equal(c.events.length,1);assert.ok(c.events[0].type==='transcription'&&c.events[0].request.messageId===c.input.messageId);
  c.allowed.clear();c.emit(c.update);assert.equal(c.events.length,1);
});
test('Telegram-расшифровка: чужой peer, ID, временное и обычное аудио отклоняются до RPC',async t=>{
  const c=await context(t);
  await assert.rejects(c.adapter.transcribeVoice({...c.input,messageId:entityId(c.adapter.source.id,'message','other/7')}),{status:400});
  await assert.rejects(c.adapter.transcribeVoice({...c.input,attachmentId:'other'}),{status:415});
  c.document.attributes=[];await assert.rejects(c.adapter.transcribeVoice(c.input),{status:415});
  c.document.attributes=[new Api.DocumentAttributeAudio({duration:3,voice:true})];(c.message.media as Api.MessageMediaDocument).ttlSeconds=5;await assert.rejects(c.adapter.transcribeVoice(c.input),{status:415});
  c.state.message=new Api.Message({id:7,peerId:new Api.PeerUser({userId:999n as never}),date:123,message:'Чужое'});await assert.rejects(c.adapter.transcribeVoice(c.input),{status:404});assert.equal(c.calls.length,0);
});
test('Telegram-расшифровка: Premium, длина, flood и ошибка речи имеют безопасные тексты',async t=>{
  const c=await context(t);
  for(const [rpc,status] of [['PREMIUM_ACCOUNT_REQUIRED',403],['MSG_VOICE_TOO_LONG',422],['TRANSCRIPTION_FAILED',502],['MSG_VOICE_MISSING',404],['FLOOD_WAIT_12',429],['UNKNOWN_PRIVATE_ERROR',503]] as const){
    c.state.error={errorMessage:rpc,message:'PRIVATE_PROVIDER_SECRET'};
    await assert.rejects(c.adapter.transcribeVoice(c.input),error=>{assert.equal((error as {status:number}).status,status);assert.ok(!(error as Error).message.includes('PRIVATE'));return true;});
  }
});
