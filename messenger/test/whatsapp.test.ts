import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {browserRequest,type BrowserRequest,type BrowserResult} from '../backend/connectors/whatsapp/protocol.js';
import {WhatsAppBrowser,webMessage,type WebMessage} from '../backend/connectors/whatsapp/browser.js';
import {WhatsAppAdapter} from '../backend/connectors/whatsapp/adapter.js';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
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
 let options:any;let destroyed=0;
 const client=Object.assign(new EventEmitter(),{pupBrowser:{},async initialize(){},async destroy(){destroyed++;}});
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
 await browser.stop();assert.equal(destroyed,1);
});

test('WhatsApp: адаптер проверяет текущий выбор и точный маршрут, ключи аккаунтов независимы',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-adapter-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const requests:BrowserRequest[]=[];
 const call=async(request:BrowserRequest):Promise<BrowserResult>=>{requests.push(request);if(request.action==='catalog')return {conversations:[conversation]};if(request.action==='messages')return {messages:[webMessage(native,jid,'Тест')],nextCursor:null};return {status:{stage:'connected',connected:true,qrDataUrl:'synthetic-sensitive-qr'}};};
 const adapter=new WhatsAppAdapter(root,store,call);await adapter.connect();assert.equal(requests.length,0);
 await adapter.begin();assert.equal(adapter.status().qrDataUrl,undefined);assert.equal((await adapter.authStatus()).qrDataUrl,'synthetic-sensitive-qr');
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

test('WhatsApp: отсутствие Telegram-входа не блокирует метаданные подключённого WhatsApp',async t=>{
 const root=mkdtempSync(join(tmpdir(),'wa-independent-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const telegram=new TestAdapter();telegram.connect=async()=>{throw new Error('login required');};
 const whatsapp=new WhatsAppAdapter(root,store,async request=>request.action==='catalog'?{conversations:[conversation]}:{status:{stage:'connected',connected:true}});
 await whatsapp.begin();store.select([id]);const core=new MessengerService([telegram,whatsapp],store);const result=await core.refresh();
 assert.ok(result.conversations.some(c=>c.id===id));assert.equal(result.sources.find(s=>s.id==='whatsapp')?.connected,true);
});
