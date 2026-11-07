import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../backend/storage/store.js';
import {SecretVault} from '../backend/storage/private-files.js';
import {MessengerService} from '../backend/core/service.js';
import {AdminService} from '../backend/admin/service.js';
import {TelegramLogin} from '../backend/auth/telegram-login.js';
import {TelegramAdapter} from '../backend/connectors/telegram/adapter.js';
import {Auth,passwordHash} from '../backend/auth/auth.js';
import {createApp} from '../backend/http.js';
import {TestAdapter} from './fixtures.js';
import type {telegramClient} from '../backend/connectors/telegram/client.js';
function context(t:{after(fn:()=>void):void}) {const dir=mkdtempSync(join(tmpdir(),'zai-admin-'));const store=new Store(dir);const vault=new SecretVault(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return{dir,store,vault};}
test('админка: метаданные не синхронизируют историю; выбор сохраняется в SQLite',async t=>{
 const {store,vault}=context(t);const source=new TestAdapter();const core=new MessengerService([source],store);const admin=new AdminService(core,source as unknown as TelegramAdapter,vault,store);
 const catalog=await admin.dialogs();assert.equal(source.calls.length,0);assert.ok(catalog.conversations.every(c=>c.preview===''));assert.deepEqual(catalog.selectedIds,[]);
 admin.select([source.conversations[1].id]);assert.deepEqual(store.selected(),[source.conversations[1].id]);await core.refresh();assert.equal(source.calls.length,0);await core.open(source.conversations[1].id);assert.equal(source.calls.length,1);
 const restarted=new MessengerService([source],store);assert.equal(restarted.snapshot().messages.length,1);
 admin.select([]);assert.equal(core.snapshot().messages.length,0);assert.equal(store.loadCache([source.conversations[1].id]).messages.length,1);
 assert.throws(()=>admin.select(['telegram-unknown:conversation:1']),/Проверьте/);
});
test('Telegram-вход: этапы code/2FA, сохранение сессии без кода и пароля, отмена',async t=>{
 const {vault,dir}=context(t);let code='',password='';
 const fake={async start(params:{phoneCode():Promise<string>;password():Promise<string>}){code=await params.phoneCode();password=await params.password();},async checkAuthorization(){return true;},async getMe(){return{id:47n};},session:{save(){return'synthetic-session';}},async destroy(){}};
 const factory=(()=>fake) as unknown as typeof telegramClient;
 const login=new TelegramLogin(vault,factory);
 assert.equal(await login.begin({apiId:123,apiHash:'1'.repeat(32),phone:'+79990000000'}),'code');
 assert.equal(await login.submit('code','synthetic-otp'),'password');assert.equal(await login.submit('password','synthetic-2fa'),'connected');
 assert.equal(code,'synthetic-otp');assert.equal(password,'synthetic-2fa');
 const credentials=vault.load()!;assert.equal(credentials.accountId,'47');assert.equal(credentials.session,'synthetic-session');
 assert.ok(!JSON.stringify(credentials).includes('synthetic-otp'));assert.ok(!JSON.stringify(credentials).includes('synthetic-2fa'));
 assert.ok(!readFileSync(join(dir,'telegram.enc')).includes(Buffer.from('synthetic-session')));
 await login.cancel();vault.clear();assert.equal(await login.begin({apiId:123,apiHash:'1'.repeat(32),phone:'+79990000000'}),'code');await login.cancel();assert.equal(login.stage,'idle');assert.equal(vault.exists(),false);
});
test('HTTP: отдельные права и Secure cookie, отсутствие Telegram-секретов в ответах',async t=>{
 const {store,vault,dir}=context(t);store.set('auth.chat',await passwordHash('chat-password-test'));store.set('auth.admin',await passwordHash('admin-password-test'));
 const source=new TestAdapter();const core=new MessengerService([source],store);const admin=new AdminService(core,source as unknown as TelegramAdapter,vault,store);
 const origin='https://msg.zai.su:8443';const server=createApp({store,service:core,admin,clientDirectory:dir,origin});
 await new Promise<void>(r=>server.listen(14320,'127.0.0.1',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 // undici не позволяет задавать Host напрямую: используем fixed public Host через URL dispatcher не требуется, HTTP ниже raw.
 const {request:rawRequest}=await import('node:http');
 const raw=(path:string,input?:unknown,headers:Record<string,string>={})=>new Promise<{status:number;headers:Record<string,unknown>;body:string}>((resolve,reject)=>{
 const req=rawRequest('http://127.0.0.1:14320'+path,{method:input===undefined?'GET':'POST',headers:{Host:'msg.zai.su:8443',Origin:origin,'Content-Type':'application/json',...headers}},res=>{let body='';res.on('data',c=>{body+=c;});res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body}));});req.on('error',reject);req.end(input===undefined?undefined:JSON.stringify(input));});
 const chat=await raw('/api/chat/login',{password:'chat-password-test'});assert.equal(chat.status,200);const chatCookie=(chat.headers['set-cookie'] as string[])[0];assert.match(chatCookie,/; Secure(?:;|$)/);assert.match(chatCookie,/Path=\/api\/chat/);
 const csrf=JSON.parse(chat.body).csrfToken;const ch={Cookie:chatCookie.split(';')[0],'X-CSRF-Token':csrf};
 for(const path of ['status','dialogs','selection','telegram/begin','telegram/code','telegram/password','password'])assert.equal((await raw('/api/admin/'+path,path==='status'||path==='dialogs'?undefined:{},ch)).status,401);
 const adm=await raw('/api/admin/login',{password:'admin-password-test'});assert.equal(adm.status,200);const ac=(adm.headers['set-cookie'] as string[])[0];const ah={Cookie:ac.split(';')[0],'X-CSRF-Token':JSON.parse(adm.body).csrfToken};
 assert.equal((await raw('/api/chat/snapshot',undefined,ah)).status,401);
 assert.equal((await raw('/api/admin/selection',{ids:[]},{Cookie:ah.Cookie})).status,403);
 const info=await raw('/api/admin/status',undefined,ah);assert.equal(info.status,200);assert.ok(!/apiHash|api_hash|session|password/.test(info.body));
 admin.login.issue={code:'invalid_api'};admin.login.stage='error';
 const failed=await raw('/api/admin/status',undefined,ah);assert.deepEqual(JSON.parse(failed.body).telegram.issue,{code:'invalid_api'});
 assert.equal((await raw('/api/admin/status',undefined,ch)).status,401);
 assert.equal((await raw('/telegram.enc',undefined,ah)).status,404);assert.equal((await raw('/.local/vault.key',undefined,ah)).status,404);
 assert.equal((await raw('/api/chat/open',{conversationId:source.conversations[0].id},ch)).status,403);
 assert.equal((await raw('/api/admin/selection',{ids:[]},{...ah,Origin:'https://evil.example'})).status,403);
 assert.equal((await raw('/api/admin/password',{role:'chat',password:'1234567'},ah)).status,400);
 assert.equal((await raw('/api/admin/password',{role:'chat',password:'12345678'},ah)).status,200);assert.equal((await raw('/api/chat/snapshot',undefined,ch)).status,401);
 assert.equal((await raw('/api/chat/login',{password:'12345678'})).status,200);
});
