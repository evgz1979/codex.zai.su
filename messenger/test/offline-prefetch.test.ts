import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
import {createApp} from '../backend/http.js';
import {passwordHash} from '../backend/auth/auth.js';
import {OFFLINE_LIMITS} from '../shared/types.js';
import {TestAdapter} from './fixtures.js';
//: Готовит выбранные синтетические чаты с накопленной историей во временной SQLite.
//: Фоновая выгрузка не использует настоящий Telegram или рабочие файлы.
async function context(t:TestContext){
  const directory=mkdtempSync(join(tmpdir(),'zai-offline-heads-'));const store=new Store(directory);const adapter=new TestAdapter();store.select(adapter.conversations.map(c=>c.id));const service=new MessengerService([adapter],store);await service.refresh();
  const messages=adapter.messages.flatMap(message=>Array.from({length:15},(_,index)=>({...message,id:`${message.id}-${index.toString().padStart(2,'0')}`,date:new Date(Date.parse(message.date)+index*1000).toISOString(),text:`Синтетическое ${index}`})));store.upsertMessages(messages);
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {directory,store,adapter,service,messages};
}
test('offline-подготовка: по пять сообщений каждого чата из SQLite без подключения, просмотра и read',async t=>{
  const {store,adapter,service}=await context(t);await adapter.disconnect();const revision=store.revision;const unread=store.badgeCount();const ids=adapter.conversations.map(c=>c.id);
  const batch=service.offlineBatch(ids);assert.equal(batch.messages.length,ids.length*OFFLINE_LIMITS.headMessages);assert.deepEqual(batch.readyIds,ids);
  for(const id of ids)assert.deepEqual(batch.messages.filter(m=>m.conversationId===id).map(m=>m.text),['Синтетическое 10','Синтетическое 11','Синтетическое 12','Синтетическое 13','Синтетическое 14']);
  assert.equal(adapter.source.connected,false);assert.equal(adapter.calls.length,0);assert.equal(adapter.historyCalls.length,0);assert.equal(adapter.reads.length,0);assert.equal(store.badgeCount(),unread);assert.equal(store.revision,revision);
});
test('offline-подготовка: невыбранный чат запрещает весь пакет до чтения сообщений',async t=>{
  const {store,service,adapter}=await context(t);const ids=adapter.conversations.map(c=>c.id);store.select([ids[0]]);let calls=0;const original=store.messagePage.bind(store);store.messagePage=(...args)=>{calls++;return original(...args);};
  assert.throws(()=>service.offlineBatch(ids),{status:403});assert.equal(calls,0);
  for(const invalid of [undefined,[],[ids[0],ids[0]],[123],['x'.repeat(2049)],Array.from({length:21},(_,index)=>String(index))])assert.throws(()=>service.offlineBatch(invalid),{status:400});assert.equal(calls,0);
  store.select([]);assert.throws(()=>service.offlineBatch([ids[0]]),{status:403});
});
test('offline-подготовка HTTP: cookie chat, CSRF, роль и точные выбранные ID',async t=>{
  const {store,service,adapter,directory}=await context(t);store.set('auth.chat',await passwordHash('test-chat-password'));store.set('auth.admin',await passwordHash('test-admin-password'));
  const options={store,service,clientDirectory:directory,origin:'http://127.0.0.1'};const server=createApp(options);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');options.origin=`http://127.0.0.1:${address.port}`;
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const post=(path:string,input:unknown,headers:Record<string,string>={})=>fetch(options.origin+path,{method:'POST',headers:{Origin:options.origin,'Content-Type':'application/json',...headers},body:JSON.stringify(input)});
  const input={conversationIds:adapter.conversations.map(c=>c.id)};assert.equal((await post('/api/chat/offline',input)).status,401);
  const login=await post('/api/chat/login',{password:'test-chat-password'});const {csrfToken}=await login.json() as {csrfToken:string};const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'X-CSRF-Token':csrfToken};
  assert.equal((await post('/api/chat/offline',input,{Cookie:headers.Cookie})).status,403);const result=await post('/api/chat/offline',input,headers);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal((await result.json() as {messages:unknown[]}).messages.length,15);
  const admin=await post('/api/admin/login',{password:'test-admin-password'});assert.equal((await post('/api/chat/offline',input,{...headers,Cookie:admin.headers.get('set-cookie')!.split(';')[0]})).status,401);
  assert.equal((await post('/api/chat/offline',{conversationIds:['foreign-conversation']},headers)).status,403);assert.equal((await post('/api/chat/offline',{conversationIds:[]},headers)).status,400);assert.equal(adapter.calls.length,0);assert.equal(adapter.reads.length,0);
});
