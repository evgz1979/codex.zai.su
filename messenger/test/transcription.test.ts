import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
import {TestAdapter} from './fixtures.js';
import {entityId,type AttachmentRequest} from '../shared/types.js';
import {createApp} from '../backend/http.js';
import {passwordHash} from '../backend/auth/auth.js';
//: Создаёт выбранный синтетический диалог с одним голосовым во временной SQLite.
//: Рабочая БД, Telegram и внешняя сеть не используются.
async function context(t:TestContext){
  const dir=mkdtempSync(join(tmpdir(),'zai-transcription-'));let store=new Store(dir);const adapter=new TestAdapter();
  const message=adapter.messages[0];message.sourceKey=entityId(adapter.source.id,'source-message','global/1');const attachment={id:entityId(adapter.source.id,'attachment','voice'),kind:'audio' as const,name:'Голосовое.ogg',isVoice:true,downloadable:true};message.attachments=[attachment];
  store.select([message.conversationId]);let core=new MessengerService([adapter],store);await core.refresh();store.upsertMessages([message]);
  const input:AttachmentRequest={conversationId:message.conversationId,messageId:message.id,attachmentId:attachment.id};
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {dir,store,adapter,core,message,attachment,input, restart(){store.close();store=new Store(dir);core=new MessengerService([adapter],store);return {store,core};}};
}
test('расшифровка: точный маршрут, сохранение после синхронизации и перезапуска без нового RPC',async t=>{
  const c=await context(t);const result=await c.core.transcriptions.request(c.input);assert.deepEqual(result,{text:c.adapter.transcriptionResult.text,pending:false});assert.equal(c.adapter.transcriptionCalls.length,1);
  const preview=c.store.conversation(c.message.conversationId)!.preview;const unread=c.store.badgeCount();
  c.store.upsertMessages([{...c.message,text:'Подпись'}]);assert.deepEqual(c.store.message(c.message.id)!.voiceTranscription,result);
  const restarted=c.restart();assert.deepEqual(await restarted.core.transcriptions.request(c.input),result);assert.equal(c.adapter.transcriptionCalls.length,1);
  assert.deepEqual((await restarted.core.open(c.input.conversationId)).page.messages[0].voiceTranscription,result);assert.deepEqual(restarted.core.snapshot().messages[0].voiceTranscription,result);
  assert.ok(!JSON.stringify(restarted.core.snapshot()).includes('transcriptionId'));assert.equal(c.adapter.attachmentCalls,0);assert.equal(restarted.store.badgeCount(),unread);assert.ok(preview);
  restarted.store.clearCache();assert.equal(restarted.store.transcription(c.message.id),undefined);
});
test('расшифровка: дубли объединяются, частичный текст завершается только своим update',async t=>{
  const {core,store,adapter,input,message}=await context(t);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let calls=0;
  adapter.transcribeVoice=async()=>{calls++;await gate;return {transcriptionId:'123',text:'Начало',pending:true};};
  const first=core.transcriptions.request(input);const second=core.transcriptions.request(input);await Promise.resolve();release();assert.deepEqual(await first,await second);assert.equal(calls,1);
  assert.equal((await core.transcriptions.request(input)).pending,true);assert.equal(calls,1);
  core.ingest({type:'transcription',sourceId:adapter.source.id,request:input,result:{transcriptionId:'999',text:'Чужое',pending:false}});assert.equal(store.message(message.id)!.voiceTranscription!.text,'Начало');
  core.ingest({type:'transcription',sourceId:'another-source',request:input,result:{transcriptionId:'123',text:'Чужое',pending:false}});assert.equal(store.message(message.id)!.voiceTranscription!.text,'Начало');
  core.ingest({type:'transcription',sourceId:adapter.source.id,request:input,result:{transcriptionId:'123',text:'Готовый текст',pending:false}});
  core.ingest({type:'transcription',sourceId:adapter.source.id,request:input,result:{transcriptionId:'123',text:'Поздняя часть',pending:true}});
  assert.deepEqual(await core.transcriptions.request(input),{text:'Готовый текст',pending:false});assert.equal(calls,1);
});
test('расшифровка: незавершённый кеш после рестарта можно продолжить',async t=>{
  const c=await context(t);c.store.saveTranscription(c.message,c.input.attachmentId,{transcriptionId:'123',text:'Часть',pending:true});
  const now=Date.now;try{Date.now=()=>now()+31000;const {core}=c.restart();assert.equal((await core.transcriptions.request(c.input)).pending,false);assert.equal(c.adapter.transcriptionCalls.length,1);}finally{Date.now=now;}
});
test('расшифровка: чужие маршруты, preview, обычное аудио и исключение не вызывают источник',async t=>{
  const {core,store,adapter,input,message,attachment}=await context(t);
  for(const route of [{...input,messageId:'unknown'},{...input,attachmentId:'other'},{...input,conversationId:adapter.conversations[1].id}])await assert.rejects(core.transcriptions.request(route));
  await assert.rejects(core.transcriptions.request({...input,variant:'preview'}),{status:415});
  store.upsertMessages([{...message,attachments:[{...attachment,isVoice:false}]}]);await assert.rejects(core.transcriptions.request(input),{status:415});
  store.upsertMessages([{...message,attachments:[{...attachment,downloadable:false}]}]);await assert.rejects(core.transcriptions.request(input),{status:415});
  core.selection.clear();await assert.rejects(core.transcriptions.request(input),{status:403});assert.equal(adapter.transcriptionCalls.length,0);
});
test('расшифровка: поздний результат после исключения, замены или удаления не сохраняется',async t=>{
  const {core,store,adapter,input,message,attachment}=await context(t);let release!:()=>void;let started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const ready=new Promise<void>(resolve=>{started=resolve;});
  adapter.transcribeVoice=async()=>{started();await gate;return adapter.transcriptionResult;};
  const pending=core.transcriptions.request(input);await ready;core.selection.clear();release();await assert.rejects(pending,{status:403});assert.equal(store.transcription(message.id),undefined);
  store.select([message.conversationId]);await core.transcriptions.request(input);assert.ok(store.message(message.id)!.voiceTranscription);
  store.upsertMessages([{...message,editedAt:'2026-11-08T10:00:00.000Z',attachments:[{...attachment,isVoice:false}]}]);assert.equal(store.message(message.id)!.voiceTranscription,undefined);
  core.ingest({type:'transcription',sourceId:adapter.source.id,request:input,result:{...adapter.transcriptionResult,text:'Старое'}});assert.equal(store.message(message.id)!.voiceTranscription,undefined);
  core.ingest({type:'delete',sourceId:adapter.source.id,keys:[message.sourceKey!]});assert.equal(store.message(message.id),undefined);assert.equal(store.transcription(message.id),undefined);await assert.rejects(core.transcriptions.request(input),{status:404});
});
test('расшифровка: ошибка провайдера скрывает исходный текст и позволяет ручной повтор',async t=>{
  const {core,adapter,input}=await context(t);adapter.fail=true;await assert.rejects(core.transcriptions.request(input),error=>{assert.equal((error as {status:number}).status,503);assert.ok(!(error as Error).message.includes('PRIVATE'));return true;});adapter.fail=false;assert.equal((await core.transcriptions.request(input)).pending,false);
});
test('HTTP расшифровки: chat-cookie, CSRF, роли и отзыв сессии во время RPC',async t=>{
  const {core,store,adapter,input,dir}=await context(t);store.set('auth.chat',await passwordHash('test-chat-password'));store.set('auth.admin',await passwordHash('test-admin-password'));
  const origin='http://127.0.0.1:14325';const server=createApp({store,service:core,clientDirectory:dir,origin});await new Promise<void>(resolve=>server.listen(14325,'127.0.0.1',resolve));
  const post=(path:string,value:unknown,headers:Record<string,string>={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
  try{
    assert.equal((await post('/api/chat/transcribe',input)).status,401);const login=await post('/api/chat/login',{password:'test-chat-password'});const {csrfToken}=await login.json() as {csrfToken:string};const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'X-CSRF-Token':csrfToken};
    assert.equal((await post('/api/chat/transcribe',input,{Cookie:headers.Cookie})).status,403);assert.equal((await post('/api/chat/transcribe',input,{...headers,Origin:'https://evil.example'})).status,403);
    const admin=await post('/api/admin/login',{password:'test-admin-password'});assert.equal((await post('/api/chat/transcribe',input,{...headers,Cookie:admin.headers.get('set-cookie')!.split(';')[0]})).status,401);
    assert.equal((await post('/api/admin/transcribe',input,headers)).status,401);assert.equal((await post('/api/chat/transcribe',{...input,messageId:'unknown'},headers)).status,404);
    let release!:()=>void;let started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const ready=new Promise<void>(resolve=>{started=resolve;});adapter.transcribeVoice=async()=>{started();await gate;return adapter.transcriptionResult;};
    const pending=post('/api/chat/transcribe',input,headers);await ready;await post('/api/chat/logout',{},headers);release();assert.equal((await pending).status,401);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
