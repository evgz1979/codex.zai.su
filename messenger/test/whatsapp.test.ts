import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as flush} from 'node:timers/promises';
import {runInNewContext} from 'node:vm';
import {request as httpRequest} from 'node:http';
import {browserRequest,type BrowserRequest,type BrowserResult} from '../backend/connectors/whatsapp/protocol.js';
import {WhatsAppBrowser,webMessage,type WebMessage} from '../backend/connectors/whatsapp/browser.js';
import {WhatsAppAdapter} from '../backend/connectors/whatsapp/adapter.js';
import {browserCall} from '../backend/connectors/whatsapp/bridge.js';
import {Accounts} from '../backend/accounts.js';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
import {AutoSyncService} from '../backend/core/sync.js';
import {AdminService} from '../backend/admin/service.js';
import {SecretVault} from '../backend/storage/private-files.js';
import type {TelegramAdapter} from '../backend/connectors/telegram/adapter.js';
import {TestAdapter} from './fixtures.js';
import {Auth,passwordHash} from '../backend/auth/auth.js';
import {createApp} from '../backend/http.js';
import {entityId,destinationFor,type Conversation} from '../shared/types.js';

const jid='79990000001@c.us';const id=entityId('whatsapp','conversation',jid);
const conversation:Conversation={id,sourceId:'whatsapp',title:'Тест',kind:'direct',recipient:{id:entityId('whatsapp','recipient',jid),name:'Тест'},unreadCount:1,updatedAt:'2026-11-08T12:00:00.000Z',preview:'',canSend:true};
const native:WebMessage={id:{_serialized:'false_79990000001@c.us_NATIVE',remote:jid},from:jid,to:'self',fromMe:false,timestamp:1794139200,body:'Синтетическое сообщение',type:'chat',ack:0};

test('WhatsApp: закрытый протокол отклоняет RPC, путь профиля и невыбранного получателя',()=>{
 const account='a'.repeat(64);
 assert.throws(()=>browserRequest({account,action:'evaluate',script:'example'}),/invalid_request/);
 assert.throws(()=>browserRequest({account:'../../other',action:'status'}),/invalid_request/);
 assert.throws(()=>browserRequest({account,action:'messages',conversationId:id,allowed:[]}),/not_selected/);
 assert.throws(()=>browserRequest({account,action:'send',conversationId:id,allowed:[id],recipientId:'wrong',text:'текст'}),/invalid_destination/);
 assert.equal(browserRequest({account,action:'messages',conversationId:id,allowed:[id]}).conversationId,id);
 assert.throws(()=>webMessage(native,'79990000002@c.us','Другой'),/mismatch/);
 assert.equal(webMessage(native,jid,'Тест').conversationId,id);
});

test('WhatsApp: браузер изолирует QR и слот, не отключает чужую сессию, сохраняет sandbox',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-worker-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 let options:any;let destroyed=0;let closed=0;
 const client=Object.assign(new EventEmitter(),{pupBrowser:{async close(){closed++;}},async initialize(){},async destroy(){destroyed++;}});
 const browser=new WhatsAppBrowser(root,'/trusted/chrome',input=>{options=input;return client as never;});t.after(()=>browser.stop());
 const a='a'.repeat(64),b='b'.repeat(64);
 assert.equal((await browser.handle({account:a,action:'start'})).status?.stage,'idle');
 assert.equal((await browser.handle({account:a,action:'start',interactive:true})).status?.stage,'starting');
 assert.equal(options.puppeteer.executablePath,'/trusted/chrome');assert.equal(options.puppeteer.pipe,true);
 assert.ok(!options.puppeteer.args.some((arg:string)=>arg.includes('no-sandbox')||arg.includes('remote-debugging-port')));
 assert.equal((await browser.handle({account:b,action:'start',interactive:true})).status?.stage,'busy');
 client.emit('qr','synthetic-pairing-code');
 for(let i=0;i<30&&browser.status(a).stage!=='qr';i++)await new Promise(r=>setTimeout(r,10));
 assert.match(browser.status(a).qrDataUrl||'',/^data:image\/png;base64,/);assert.equal(browser.status(b).qrDataUrl,undefined);
 await browser.handle({account:b,action:'stop'});assert.equal(destroyed,0);
 await browser.handle({account:b,action:'logout'});assert.equal(destroyed,0);assert.equal(browser.status(a).stage,'qr');
 client.emit('ready');assert.equal(browser.status(a).connected,true);assert.equal(browser.status(a).qrDataUrl,undefined);
 await browser.stop();assert.equal(destroyed,1);assert.equal(closed,1);
});

test('WhatsApp: остановка во время запуска ждёт только браузер, а не QR и синхронизацию',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-launch-stop-'));let closed=0;
 const client=Object.assign(new EventEmitter(),{pupBrowser:undefined as undefined|{close():Promise<void>},async initialize(){await new Promise(r=>setTimeout(r,30));client.pupBrowser={async close(){closed++;}};await new Promise(()=>{});},async destroy(){}});
 const browser=new WhatsAppBrowser(root,'/trusted/chrome',()=>client as never);t.after(async()=>{await browser.stop();rmSync(root,{recursive:true,force:true});});
 const account='a'.repeat(64);await browser.handle({account,action:'start',interactive:true});await browser.handle({account,action:'stop'});assert.equal(closed,1);assert.equal(browser.status(account).stage,'idle');
});

test('WhatsApp: неотсканированный QR завершается через три минуты',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const root=mkdtempSync(join(tmpdir(),'wa-qr-timeout-'));let closed=0;
 const client=Object.assign(new EventEmitter(),{pupBrowser:{async close(){closed++;}},async initialize(){},async destroy(){},async getState(){return 'UNPAIRED';}});
 const browser=new WhatsAppBrowser(root,'/trusted/chrome',()=>client as never);t.after(async()=>{await browser.stop();rmSync(root,{recursive:true,force:true});});
 const account='a'.repeat(64);await browser.handle({account,action:'start',interactive:true});
 t.mock.timers.tick(180001);await flush();assert.equal(closed,1);assert.equal(browser.status(account).stage,'error');assert.match(browser.status(account).issue!,/ожидания QR/);
});

test('WhatsApp: принятый QR получает время на синхронизацию, доступ к чатам только после ready',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const root=mkdtempSync(join(tmpdir(),'wa-sync-phase-'));let closed=0;let nativeState='UNPAIRED';
 const client=Object.assign(new EventEmitter(),{pupBrowser:{async close(){closed++;}},async initialize(){},async destroy(){},async getState(){return nativeState;}});
 const browser=new WhatsAppBrowser(root,'/trusted/chrome',()=>client as never);t.after(async()=>{await browser.stop();rmSync(root,{recursive:true,force:true});});
 const account='a'.repeat(64);await browser.handle({account,action:'start',interactive:true});
 t.mock.timers.tick(2000);await flush();assert.equal(browser.status(account).stage,'starting');
 nativeState='CONNECTED';t.mock.timers.tick(2000);await flush();assert.equal(browser.status(account).stage,'syncing');assert.equal(browser.status(account).connected,false);
 client.emit('loading_screen',37);assert.equal(browser.status(account).progress,37);assert.equal(browser.status(account).qrDataUrl,undefined);
 t.mock.timers.tick(180001);await flush();assert.equal(closed,0);assert.equal(browser.status(account).stage,'syncing');
 await assert.rejects(browser.handle({account,action:'catalog'}),/browser_not_ready/);
 client.emit('ready');assert.equal(browser.status(account).connected,true);assert.equal(browser.status(account).progress,undefined);assert.ok(existsSync(join(root,account,'linked')));
 t.mock.timers.tick(900001);await flush();assert.equal(closed,0);assert.equal(browser.status(account).stage,'connected');
});

test('WhatsApp: готовый Stream восстанавливает пропущенную инициализацию без подмены ready',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const root=mkdtempSync(join(tmpdir(),'wa-ready-race-'));let callbacks=0;
 const socket={state:'CONNECTED',hasSynced:false};const stream={mode:2};const modes={MAIN:1,SYNCING:2};let display=8;
 const w={require:(name:string)=>name==='WAWebSocketModel'?{Socket:socket}:name==='WAWebStreamModel'?{Stream:stream,StreamMode:modes,StreamInfo:{NORMAL:7}}:{getDisplayInfo:()=>display},onAppStateHasSyncedEvent:()=>{callbacks++;client.emit('authenticated');}};
 const client=Object.assign(new EventEmitter(),{pupBrowser:{async close(){}},pupPage:{async evaluate(fn:()=>unknown){return runInNewContext(`(${fn.toString()})()`,{window:w});}},async initialize(){},async destroy(){},async getState(){return socket.state;}});
 const browser=new WhatsAppBrowser(root,'/trusted/chrome',()=>client as never);t.after(async()=>{await browser.stop();rmSync(root,{recursive:true,force:true});});
 const account='a'.repeat(64);await browser.handle({account,action:'start',interactive:true});t.mock.timers.tick(2000);await flush();assert.equal(callbacks,0);
 assert.equal(browser.status(account).connected,false);stream.mode=modes.MAIN;t.mock.timers.tick(2000);await flush();assert.equal(callbacks,0);
 display=7;t.mock.timers.tick(2000);await flush();assert.equal(callbacks,1);assert.equal(browser.status(account).connected,false);
 const health=await browser.handle({account,action:'status'});assert.equal(health.startup?.streamReady,true);assert.equal((await browser.handle({account:'b'.repeat(64),action:'status'})).startup,undefined);
 t.mock.timers.tick(2000);await flush();assert.equal(callbacks,1);client.emit('ready');assert.equal(browser.status(account).connected,true);
});

test('WhatsApp: события прогресса не продлевают предел первичной синхронизации бесконечно',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const root=mkdtempSync(join(tmpdir(),'wa-sync-timeout-'));let closed=0;
 const client=Object.assign(new EventEmitter(),{pupBrowser:{async close(){closed++;}},async initialize(){},async destroy(){},async getState(){return 'CONNECTED';}});
 const browser=new WhatsAppBrowser(root,'/trusted/chrome',()=>client as never);t.after(async()=>{await browser.stop();rmSync(root,{recursive:true,force:true});});
 const account='a'.repeat(64);await browser.handle({account,action:'start',interactive:true});client.emit('loading_screen',10);
 t.mock.timers.tick(600000);await flush();client.emit('loading_screen',50);assert.equal(closed,0);
 t.mock.timers.tick(300001);await flush();assert.equal(closed,1);assert.equal(browser.status(account).stage,'error');assert.match(browser.status(account).issue!,/синхронизация.*15 минут/);
 assert.equal(existsSync(join(root,account,'linked')),false);
});

test('WhatsApp: адаптер проверяет текущий выбор и точный маршрут, ключи аккаунтов независимы',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-adapter-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const requests:BrowserRequest[]=[];
 const call=async(request:BrowserRequest):Promise<BrowserResult>=>{requests.push(request);if(request.action==='catalog')return {conversations:[conversation]};if(request.action==='messages')return {messages:[webMessage(native,jid,'Тест')],nextCursor:null};return {status:{stage:'connected',connected:true,qrDataUrl:'synthetic-sensitive-qr'}};};
 const adapter=new WhatsAppAdapter(root,store,call);await adapter.connect();assert.equal(requests.length,0);
 await adapter.begin();assert.equal(adapter.status().qrDataUrl,undefined);assert.equal((await adapter.authStatus()).qrDataUrl,'synthetic-sensitive-qr');
 assert.equal(adapter.canDiscoverContacts(),false);
 await assert.rejects(adapter.recentMessages(id,10),/не разрешён/);assert.ok(!requests.some(r=>r.action==='messages'));
 store.select([id]);assert.equal((await adapter.recentMessages(id,10))[0].text,native.body);
 assert.deepEqual(requests.at(-1)?.allowed,[id]);
 await assert.rejects(adapter.sendText({...destinationFor(conversation),recipientId:'wrong'},'текст'),/получателя/);assert.ok(!requests.some(r=>r.action==='send'));
 store.select([]);await assert.rejects(adapter.recentMessages(id,10),/не разрешён/);
 const other=new WhatsAppAdapter(root+'-other',store,call);await other.begin();assert.notEqual(requests[0].account,requests.at(-1)?.account);
 await assert.rejects(adapter.markRead(id,'message'),/официальном/);
});

test('WhatsApp: выбор и отключение одного источника сохраняют Telegram и архив',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-selection-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const telegram=new TestAdapter();const whatsapp=new WhatsAppAdapter(root,store,async r=>r.action==='catalog'?{conversations:[conversation]}:{status:{stage:'connected',connected:true}});
 await whatsapp.begin();const core=new MessengerService([telegram,whatsapp],store);const admin=new AdminService(core,telegram as unknown as TelegramAdapter,new SecretVault(root),store,undefined,whatsapp);
 store.select([telegram.conversations[0].id]);await admin.whatsappDialogs();admin.selectWhatsApp([id]);assert.ok(store.selected().includes(telegram.conversations[0].id));
 const catalog=await admin.dialogs();assert.ok(!catalog.selectedIds.includes(id));admin.select([]);assert.deepEqual(store.selected(),[id]);
 store.upsertMessages([webMessage(native,jid,'Тест')]);await admin.disconnectWhatsApp();assert.deepEqual(store.selected(),[]);assert.equal(store.loadCache([id]).messages.length,1);
});

test('WhatsApp HTTP: QR только admin своего аккаунта, POST защищён CSRF, общий status без QR',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-http-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 store.set('auth.chat',await passwordHash('chat-password-test'));store.set('auth.admin',await passwordHash('admin-password-test'));
 let starts=0;const whatsapp=new WhatsAppAdapter(root,store,async r=>{if(r.action==='start')starts++;return {status:{stage:'qr',connected:false,qrDataUrl:'data:image/png;base64,c3ludGhldGlj'}};});
 const telegram=new TestAdapter();const core=new MessengerService([telegram,whatsapp],store);const admin=new AdminService(core,telegram as unknown as TelegramAdapter,new SecretVault(root),store,undefined,whatsapp);
 const origin='http://127.0.0.1';const server=createApp({store,service:core,auth:new Auth(store),admin,clientDirectory:root,origin});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const port=(server.address() as {port:number}).port;
 const raw=(path:string,input?:unknown,headers:Record<string,string>={})=>new Promise<{status:number;body:any;headers:any}>((resolve,reject)=>{const req=httpRequest(`http://127.0.0.1:${port}${path}`,{method:input===undefined?'GET':'POST',headers:{Host:'127.0.0.1',Origin:origin,'Content-Type':'application/json',...headers}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(data),headers:res.headers}));});req.on('error',reject);req.end(input===undefined?undefined:JSON.stringify(input));});
 const chat=await raw('/api/chat/login',{password:'chat-password-test'});const ch={Cookie:chat.headers['set-cookie'][0].split(';')[0],'X-CSRF-Token':chat.body.csrfToken};
 assert.equal((await raw('/api/admin/whatsapp/status',undefined,ch)).status,401);
 assert.equal((await raw('/api/chat/whatsapp/status',undefined,ch)).status,404);
 const login=await raw('/api/admin/login',{password:'admin-password-test'});const ah={Cookie:login.headers['set-cookie'][0].split(';')[0],'X-CSRF-Token':login.body.csrfToken};
 assert.equal((await raw('/api/admin/whatsapp/begin',{}, {Cookie:ah.Cookie})).status,403);assert.equal(starts,0);
 const status=await raw('/api/admin/whatsapp/status',undefined,ah);assert.equal(status.status,200);assert.equal(status.headers['cache-control'],'no-store');assert.match(status.body.qrDataUrl,/^data:/);
 assert.ok(!JSON.stringify((await raw('/api/admin/status',undefined,ah)).body).includes('base64'));
 assert.equal((await raw('/api/u/unknown/admin/whatsapp/status',undefined,ah)).status,404);
});

test('WhatsApp: только владелец получает адаптер и API, личный admin не обходит запрет',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-owner-'));const origin='http://127.0.0.1';let accounts=new Accounts(root,origin);
 const hash=await passwordHash('owner-password-test');accounts.owner.runtime.store.set('auth.admin',hash);accounts.owner.runtime.store.set('auth.chat',hash);
 await accounts.create({username:'guest',displayName:'Гость',password:'guest-password-test'});
 const guest=accounts.find('guest')!;guest.runtime.store.set('whatsapp.enabled','1');
 assert.ok(accounts.owner.runtime.admin?.whatsapp);assert.equal(guest.runtime.admin?.whatsapp,undefined);
 assert.ok(!guest.runtime.service.registry.adapters.some(a=>a.source.id==='whatsapp'));
 const options={...accounts.owner.runtime,accounts,clientDirectory:root,origin};const server=createApp(options);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await accounts.stop();rmSync(root,{recursive:true,force:true});});
 options.origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const request=(path:string,input?:unknown,headers:Record<string,string>={})=>fetch(options.origin+path,{method:input===undefined?'GET':'POST',headers:{Origin:options.origin,'Content-Type':'application/json',...headers},body:input===undefined?undefined:JSON.stringify(input)});
 const login=async(base:string,password:string)=>{const response=await request(`${base}/login`,{password});assert.equal(response.status,200);const info=await response.json() as {csrfToken:string};return {Cookie:response.headers.get('set-cookie')!.split(';')[0],'X-CSRF-Token':info.csrfToken};};
 const personal='/api/u/guest/admin';const owner=await login('/api/admin','owner-password-test');const headers=await login(personal,'guest-password-test');
 for(const [action,input] of [['status',undefined],['dialogs',undefined],['begin',{}],['disconnect',{}],['selection',{ids:[id]}]] as const){
  const response=await request(`${personal}/whatsapp/${action}`,input,headers);assert.equal(response.status,403,action);assert.match(await response.text(),/только владельцу/);
 }
 assert.equal((await request(`${personal}/whatsapp/status`)).status,401);
 assert.equal((await request(`${personal}/whatsapp/status`,undefined,owner)).status,401);
 const status=await request(`${personal}/status`,undefined,headers);assert.equal(status.status,200);assert.equal((await status.json() as any).whatsapp,undefined);
 assert.equal((await request('/api/admin/whatsapp/selection',{ids:[]},owner)).status,200);
 await accounts.stop();accounts=new Accounts(root,origin);
 assert.equal(accounts.find('guest')!.runtime.store.get('whatsapp.enabled'),'1');assert.equal(accounts.find('guest')!.runtime.admin?.whatsapp,undefined);
 assert.ok(accounts.owner.runtime.admin?.whatsapp);
});

test('WhatsApp: отсутствие Telegram-входа не блокирует метаданные подключённого WhatsApp',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-independent-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const telegram=new TestAdapter();telegram.connect=async()=>{throw new Error('login required');};
 const whatsapp=new WhatsAppAdapter(root,store,async request=>request.action==='catalog'?{conversations:[conversation]}:{status:{stage:'connected',connected:true}});
 await whatsapp.begin();store.select([id]);const core=new MessengerService([telegram,whatsapp],store);const result=await core.refresh();
 assert.ok(result.conversations.some(c=>c.id===id));assert.equal(result.sources.find(s=>s.id==='whatsapp')?.connected,true);
});

test('WhatsApp: история недоступного Telegram не задерживает синхронизацию WhatsApp',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-sync-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const telegram=new TestAdapter();telegram.connect=async()=>{throw new Error('source offline');};
 const whatsapp=new WhatsAppAdapter(root,store,async request=>request.action==='catalog'?{conversations:[conversation]}:request.action==='messages'?{messages:[webMessage(native,jid,'Тест')],nextCursor:null}:{status:{stage:'connected',connected:true}});
 await whatsapp.begin();store.select([telegram.conversations[0].id,id]);store.saveCache({sources:[],conversations:[telegram.conversations[0],conversation],messages:[],refreshedAt:null,stale:true});
 const core=new MessengerService([telegram,whatsapp],store);const sync=new AutoSyncService(core,store);await sync.tick();await sync.stop();
 assert.equal(store.progress(id).initialized,true);assert.equal(store.messagePage(id).messages[0].text,native.body);assert.equal(telegram.calls.length,0);
});

test('WhatsApp: worker запускается через symlink релиза и отвечает через приватный socket',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-entry-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const entry=join(root,'worker.ts');const socket=join(root,'control.sock');
 symlinkSync(fileURLToPath(new URL('../backend/connectors/whatsapp/worker.ts',import.meta.url)),entry);
 const child=spawn(process.execPath,['--import','tsx',entry],{env:{...process.env,WHATSAPP_BROWSER_SOCKET:socket,WHATSAPP_BROWSER_DATA:join(root,'profiles'),WHATSAPP_CHROME_PATH:'/unused/chrome'},stdio:'ignore'});
 const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
 try{
  for(let i=0;i<100&&!existsSync(socket)&&child.exitCode===null;i++)await new Promise(r=>setTimeout(r,50));
  assert.equal(child.exitCode,null);assert.equal(existsSync(socket),true);
  assert.equal((await browserCall({account:'a'.repeat(64),action:'status'},socket)).status?.stage,'idle');
 }finally{child.kill('SIGTERM');await exited;}
});

test('WhatsApp: выбранная история читает кеш и одну старую порцию без сериализатора чата',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-history-'));const account='a'.repeat(64);let calls=0;
 const model=(n:number)=>({id:{_serialized:`false_${jid}_${n}`,remote:{_serialized:jid},fromMe:false},from:{_serialized:jid},to:{_serialized:'self'},t:1794153600+n,body:`Синтетическое ${n}`,type:'chat',ack:1});
 let current=[model(1),model(2),model(3)];let earlier=[model(0)];const chat={id:{_serialized:jid},name:'Тест',msgs:{getModelsArray:()=>current}};
 const w={WWebJS:{async getChat(actual:string,options:any){assert.equal(actual,jid);assert.equal(options.getAsModel,false);return chat;}},require:(name:string)=>{assert.equal(name,'WAWebChatLoadMessages');return {async loadEarlierMsgs(){calls++;const batch=earlier;earlier=[];return batch;}};}};
 const client=Object.assign(new EventEmitter(),{pupBrowser:{async close(){}},pupPage:{async evaluate(fn:Function,arg:any){return runInNewContext(`(${fn.toString()})(input)`,{window:w,input:arg,setTimeout,clearTimeout});}},async initialize(){},async destroy(){},async getChatById(){throw Error('full chat serializer accessed');}});
 const browser=new WhatsAppBrowser(root,'/trusted/chrome',()=>client as never);t.after(async()=>{await browser.stop();rmSync(root,{recursive:true,force:true});});
 await browser.handle({account,action:'start',interactive:true});client.emit('ready');
 const head=await browser.handle({account,action:'messages',conversationId:id,allowed:[id]});assert.equal(head.messages?.length,3);assert.equal(calls,0);assert.ok(head.nextCursor);
 current=current.slice(1);const older=await browser.handle({account,action:'messages',conversationId:id,allowed:[id],before:head.nextCursor!});assert.equal(older.messages?.length,1);assert.equal(older.messages![0].text,'Синтетическое 0');assert.equal(calls,1);
 const end=await browser.handle({account,action:'messages',conversationId:id,allowed:[id],before:older.nextCursor!});assert.equal(end.messages?.length,0);assert.equal(end.nextCursor,null);assert.equal(calls,2);
});

test('WhatsApp: пустая зависшая догрузка ограничена сроком и не выдаётся за полный архив',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const root=mkdtempSync(join(tmpdir(),'wa-history-timeout-'));const account='a'.repeat(64);let calls=0;
 const w={WWebJS:{async getChat(){return {id:{_serialized:jid},msgs:{getModelsArray:()=>[]}};}},require:()=>({loadEarlierMsgs(){calls++;return new Promise(()=>{});}})};
 const client=Object.assign(new EventEmitter(),{pupBrowser:{async close(){}},pupPage:{async evaluate(fn:Function,arg:any){return runInNewContext(`(${fn.toString()})(input)`,{window:w,input:arg,setTimeout,clearTimeout});}},async initialize(){},async destroy(){}});
 const browser=new WhatsAppBrowser(root,'/trusted/chrome',()=>client as never);t.after(async()=>{await browser.stop();rmSync(root,{recursive:true,force:true});});await browser.handle({account,action:'start',interactive:true});client.emit('ready');
 const pending=browser.handle({account,action:'messages',conversationId:id,allowed:[id]});const rejected=assert.rejects(pending,/history_timeout/);await flush();t.mock.timers.tick(8001);await rejected;assert.equal(calls,1);assert.equal(browser.status(account).connected,true);
});

test('WhatsApp: каталог использует WAWebCollections без window.Store и не читает сообщения',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-catalog-'));const account='a'.repeat(64);
 const chat={id:{_serialized:jid,user:'79990000001'},formattedTitle:'Тест каталога',isGroup:false,isReadOnly:false,unreadCount:2,get msgs(){throw Error('unselected messages accessed');},get lastMessage(){throw Error('unselected preview accessed');},get serialize(){throw Error('full chat serializer accessed');}};
 const group={id:{_serialized:'9999-1@g.us'},name:'Группа',isGroup:true,isReadOnly:true,unreadCount:0,t:1794153600};
 const w={require:(name:string)=>{assert.equal(name,'WAWebCollections');return {Chat:{getModelsArray:()=>[chat,group]}};},WWebJS:{getChats(){throw Error('full serializer accessed');}}};
 const client=Object.assign(new EventEmitter(),{pupBrowser:{async close(){}},pupPage:{async evaluate(fn:()=>unknown){return runInNewContext(`(${fn.toString()})()`,{window:w});}},async initialize(){},async destroy(){}});
 const browser=new WhatsAppBrowser(root,'/trusted/chrome',()=>client as never);t.after(async()=>{await browser.stop();rmSync(root,{recursive:true,force:true});});
 await browser.handle({account,action:'start',interactive:true});client.emit('ready');const catalog=(await browser.handle({account,action:'catalog'})).conversations!;
 assert.equal(catalog.length,2);assert.equal(catalog[0].title,'Тест каталога');assert.equal(catalog[0].unreadCount,2);assert.equal(catalog[0].preview,'');assert.equal(catalog[0].updatedAt,'1970-01-01T00:00:00.000Z');
 assert.equal(catalog[1].kind,'group');assert.equal(catalog[1].canSend,false);
});

test('WhatsApp: выбранная read-only группа доступна для чтения, отправка в неё запрещена',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-readonly-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const jid='99999-1@g.us';const conversationId=entityId('whatsapp','conversation',jid);const account='a'.repeat(64);let sends=0;
 const client=Object.assign(new EventEmitter(),{pupBrowser:{async close(){}},pupPage:{async evaluate(){return {messages:[],more:false};}},async initialize(){},async destroy(){},async getChatById(){return {id:{_serialized:jid},name:'Группа',isReadOnly:true};},async sendMessage(){sends++;}});
 const browser=new WhatsAppBrowser(root,'/unused/chrome',()=>client as never);t.after(()=>browser.stop());
 await browser.handle({account,action:'start',interactive:true});client.emit('ready');
 assert.deepEqual((await browser.handle({account,action:'messages',conversationId,allowed:[conversationId]})).messages,[]);
 await assert.rejects(browser.handle({account,action:'send',conversationId,recipientId:entityId('whatsapp','recipient',jid),allowed:[conversationId],text:'текст'}),/invalid_destination/);assert.equal(sends,0);
});
