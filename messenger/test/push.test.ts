import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as webpush from 'web-push';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
import {PushService,pushSubscription} from '../backend/core/push.js';
import {createApp} from '../backend/http.js';
import {passwordHash} from '../backend/auth/auth.js';
import {TestAdapter} from './fixtures.js';

//: Создаёт синтетические ключи и endpoint без реальной регистрации устройства.
//: Сетевые push-запросы в тестах не выполняются.
function subscription(name='device'){
  const key=createECDH('prime256v1');key.generateKeys();
  return {endpoint:`https://web.push.apple.com/Q${name}`,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
}
//: Изолирует SQLite, адаптер и push-транспорт одного теста.
//: Рабочая БД, Telegram и Apple не используются.
async function context(t:{after(fn:()=>void|Promise<void>):void}){
  const dir=mkdtempSync(join(tmpdir(),'zai-push-'));const store=new Store(dir);
  const adapter=new TestAdapter();store.select([adapter.conversations[0].id]);
  const core=new MessengerService([adapter],store);await core.refresh();
  const deliveries:{subscription:webpush.PushSubscription;payload:string;options:webpush.RequestOptions}[]=[];
  const now=Date.now();
  const push=new PushService(core,store,'https://msg.zai.su:8443',async(subscription,payload,options)=>{deliveries.push({subscription,payload,options});},()=>now);
  t.after(async()=>{await push.stop();store.close();rmSync(dir,{recursive:true,force:true});});
  return {dir,store,adapter,core,push,deliveries,now};
}

test('push: подписки проверяют провайдера, схему, порт и P-256 ключи',()=>{
  const sub=subscription();assert.deepEqual(pushSubscription(sub),sub);
  for(const endpoint of ['http://web.push.apple.com/Q','https://127.0.0.1/Q','https://evil.push.apple.com.evil.example/Q','https://web.push.apple.com:8443/Q','https://user:pass@web.push.apple.com/Q','https://web.push.apple.com/Q?target=localhost','https://web.push.apple.com/Q#fragment'])assert.throws(()=>pushSubscription({...sub,endpoint}),/Некорректная/);
  for(const keys of [{...sub.keys,auth:'short'},{...sub.keys,p256dh:Buffer.alloc(65,4).toString('base64url')}])assert.throws(()=>pushSubscription({...sub,keys}),/Некорректная/);
});

test('push: новые входящие доставляются один раз без текста, история и исходящие исключены',async t=>{
  const {adapter,core,push,deliveries,now}=await context(t);push.subscribe(subscription());
  const original={...adapter.messages[0],id:'incoming',text:'PRIVATE_MESSAGE',date:new Date(now).toISOString()};
  core.cacheMessages(original.conversationId,[{...original,id:'history'}]);
  core.ingest({type:'message',message:{...original,id:'outgoing',outgoing:true}});
  core.ingest({type:'message',message:{...original,id:'old',date:new Date(now-7200000).toISOString()}});
  core.ingest({type:'message',message:{...original,id:'excluded',conversationId:adapter.conversations[1].id}});
  core.ingest({type:'message',message:original});core.ingest({type:'message',message:original});
  core.ingest({type:'message',message:{...original,text:'PRIVATE_EDIT',editedAt:new Date(now).toISOString()},edited:true});
  await push.flush();assert.equal(deliveries.length,1);
  assert.deepEqual(Object.keys(JSON.parse(deliveries[0].payload)).sort(),['badge','body','title']);
  assert.ok(!deliveries[0].payload.includes('PRIVATE'));assert.ok(!deliveries[0].payload.includes(original.conversationId));
  assert.equal(deliveries[0].options.TTL,300);
  core.ingest({type:'message',message:original});await push.flush();assert.equal(deliveries.length,1);
});

test('push: снятие выбора, удаление и отзыв подписки проверяются перед доставкой',async t=>{
  const {adapter,store,core,push,deliveries,now}=await context(t);const sub=subscription();push.subscribe(sub);
  const incoming={...adapter.messages[0],id:'queued',date:new Date(now).toISOString()};
  core.ingest({type:'message',message:incoming});core.selection.clear();await push.flush();assert.equal(deliveries.length,0);
  core.selection.replace([adapter.conversations[0].id],adapter.conversations);
  core.ingest({type:'message',message:{...incoming,id:'deleted',sourceKey:'synthetic:key'}});
  store.deleteSourceKeys(['synthetic:key'],core.selection.ids());await push.flush();assert.equal(deliveries.length,0);
  core.ingest({type:'message',message:{...incoming,id:'removed-device'}});push.remove(sub.endpoint);await push.flush();assert.equal(deliveries.length,0);
});

test('push: пропущенная свежая голова уведомляет, история и сообщения до подписки молчат',async t=>{
  const {adapter,core,push,deliveries,now}=await context(t);push.subscribe(subscription());
  const message={...adapter.messages[0],date:new Date(now-60000).toISOString()};
  core.cacheMessages(message.conversationId,[{...message,id:'before-subscribe'}],true);await push.flush();assert.equal(deliveries.length,0);
  core.cacheMessages(message.conversationId,[{...message,id:'recovery',date:new Date(now).toISOString()}],true);await push.flush();assert.equal(deliveries.length,1);
});

test('push: VAPID и устройства переживают рестарт; смена пароля отзывает доставку',async t=>{
  const {dir,store,adapter,push}=await context(t);const sub=subscription();push.subscribe(sub);
  const publicKey=push.configuration().publicKey;await push.stop();
  const recoveredStore=new Store(dir);const recoveredCore=new MessengerService([adapter],recoveredStore);
  const reopened=new PushService(recoveredCore,recoveredStore,'https://msg.zai.su:8443',async()=>{});t.after(async()=>{await reopened.stop();recoveredStore.close();});
  assert.equal(reopened.configuration().publicKey,publicKey);assert.equal(reopened.registered(sub.endpoint),true);
  store.set('auth.chat','new-password-hash');assert.equal(reopened.registered(sub.endpoint),false);
});

test('push: HTTP 410 удаляет устройство; временный отказ сохраняет подписку и не раскрывает ошибку',async t=>{
  const {store,core,push}=await context(t);await push.stop();let statusCode=410;
  const failure=new PushService(core,store,'https://msg.zai.su:8443',async()=>{throw {statusCode,body:'PRIVATE_PROVIDER_ERROR'};});t.after(()=>failure.stop());
  const sub=subscription();failure.subscribe(sub);await assert.rejects(failure.test(sub.endpoint),error=>error instanceof Error&&!error.message.includes('PRIVATE'));assert.equal(failure.registered(sub.endpoint),false);
  statusCode=503;failure.subscribe(sub);await assert.rejects(failure.test(sub.endpoint));assert.equal(failure.registered(sub.endpoint),true);
  await assert.rejects(failure.test('https://web.push.apple.com/Qother'),/Сначала включите/);
});

test('push: библиотека формирует зашифрованный aes128gcm запрос с VAPID',async t=>{
  const {store,core,push}=await context(t);await push.stop();let encrypted=false;
  const transport=new PushService(core,store,'https://msg.zai.su:8443',async(sub,payload,options)=>{
    const request=webpush.generateRequestDetails(sub,payload,options);
    assert.equal(request.headers['Content-Encoding'],'aes128gcm');assert.ok(request.headers.Authorization);
    assert.ok(Buffer.isBuffer(request.body));assert.ok(!request.body!.includes(Buffer.from('kind')));encrypted=true;
  });t.after(()=>transport.stop());const sub=subscription();transport.subscribe(sub);await transport.test(sub.endpoint);assert.equal(encrypted,true);
});

test('push HTTP: приватность, CSRF, allowlist статики и отзыв при выходе',async t=>{
  const {dir,store,core,push}=await context(t);
  const hash=await passwordHash('push-test-password');store.set('auth.chat',hash);store.set('auth.admin',hash);
  writeFileSync(join(dir,'sw.js'),'/* synthetic worker */');writeFileSync(join(dir,'manifest.webmanifest'),'{}');
  const origin='http://127.0.0.1:14342';const server=createApp({store,service:core,push,origin,clientDirectory:dir});
  await new Promise<void>(resolve=>server.listen(14342,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const request=(path:string,input?:unknown,headers:Record<string,string>={})=>fetch(origin+path,{method:input===undefined?'GET':'POST',headers:{...(input===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},...(input===undefined?{}:{body:JSON.stringify(input)})});
  assert.equal((await request('/api/chat/push/config')).status,401);
  assert.equal((await request('/api/chat/badge')).status,401);
  const login=await request('/api/chat/login',{password:'push-test-password'});const info=await login.json() as {csrfToken:string};
  const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'X-CSRF-Token':info.csrfToken};
  assert.deepEqual(await (await request('/api/chat/badge',undefined,headers)).json(),{count:3});
  const config=await (await request('/api/chat/push/config',undefined,headers)).json();assert.deepEqual(Object.keys(config),['publicKey']);
  const sub=subscription();assert.equal((await request('/api/chat/push/subscribe',{subscription:sub},{Cookie:headers.Cookie})).status,403);
  assert.equal((await request('/api/chat/push/subscribe',{subscription:{...sub,endpoint:'https://127.0.0.1/private'}},headers)).status,400);
  assert.equal((await request('/api/chat/push/subscribe',{subscription:sub},headers)).status,200);
  assert.deepEqual(await (await request('/api/chat/push/status',{endpoint:sub.endpoint},headers)).json(),{enabled:true});
  const worker=await request('/sw.js');assert.equal(worker.status,200);assert.equal(worker.headers.get('cache-control'),'no-store');assert.match(worker.headers.get('content-type')||'',/javascript/);
  assert.match((await request('/manifest.webmanifest')).headers.get('content-type')||'',/manifest\+json/);
  assert.equal((await request('/private-file')).status,404);
  assert.equal((await request('/api/chat/logout',{pushEndpoint:sub.endpoint},headers)).status,200);assert.equal(push.registered(sub.endpoint),false);
  assert.equal((await request('/api/chat/push/config',undefined,headers)).status,401);
});

test('push worker: видимое нейтральное уведомление, badge и переход только в свой чат',async()=>{
  const listeners=new Map<string,(event:any)=>void>();const shown:{title:string;body:string}[]=[];const opened:string[]=[];const badges:number[]=[];
  const self={location:{origin:'https://msg.zai.su:8443'},addEventListener:(name:string,callback:(event:any)=>void)=>listeners.set(name,callback),registration:{showNotification:async(title:string,options:{body:string})=>{shown.push({title,body:options.body});}},clients:{matchAll:async()=>[{url:'https://msg.zai.su:8443/admin',focus:async()=>{throw new Error('Admin must not be focused');}}],openWindow:async(url:string)=>{opened.push(url);}}};
  runInNewContext(readFileSync(new URL('../frontend/public/sw.js',import.meta.url),'utf8'),{self,navigator:{setAppBadge:async(count:number)=>{badges.push(count);}},URL});
  let pending=Promise.resolve();
  listeners.get('push')!({data:{json:()=>({badge:7,title:'PRIVATE',body:'PRIVATE',url:'https://evil.example/'})},waitUntil:(promise:Promise<void>)=>{pending=promise;}});await pending;
  assert.deepEqual(shown,[{title:'Z AI Messenger',body:'Новое сообщение'}]);assert.deepEqual(badges,[7]);assert.equal(listeners.has('fetch'),false);
  listeners.get('push')!({data:{json:()=>{throw new Error();}},waitUntil:(promise:Promise<void>)=>{pending=promise;}});await pending;assert.equal(shown.length,2);
  listeners.get('notificationclick')!({notification:{close:()=>{}},waitUntil:(promise:Promise<void>)=>{pending=promise;}});await pending;assert.deepEqual(opened,['/']);
});

test('push worker: поздний push при закрытом чате не возвращает прочитанный badge',async()=>{
  const listeners=new Map<string,(event:any)=>void>();const counts:number[]=[];const requests:string[]=[];let closed=0;let shown=0;
  const self={addEventListener:(name:string,callback:(event:any)=>void)=>listeners.set(name,callback),registration:{showNotification:async()=>{shown++;},getNotifications:async()=>[{close:()=>{closed++;}}]},clients:{matchAll:async()=>[]}};
  runInNewContext(readFileSync(new URL('../frontend/public/sw.js',import.meta.url),'utf8'),{self,navigator:{clearAppBadge:async()=>{counts.push(0);},setAppBadge:async(value:number)=>{counts.push(value);}},AbortController,setTimeout,clearTimeout,fetch:async(path:string,options:{credentials:string;cache:string})=>{requests.push(path);assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');return {ok:true,json:async()=>({count:0})};}});
  let pending=Promise.resolve();listeners.get('push')!({data:{json:()=>({badge:3})},waitUntil:(promise:Promise<void>)=>{pending=promise;}});await pending;
  assert.deepEqual(requests,['/api/chat/badge']);assert.deepEqual(counts,[0]);assert.equal(closed,1);assert.equal(shown,1);
});
