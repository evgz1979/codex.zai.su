import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Auth,passwordHash} from '../backend/auth/auth.js';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
import {createApp} from '../backend/http.js';

//: Создаёт приватную синтетическую SQLite с управляемым временем авторизации.
//: Тесты не используют production-пароли, cookie или рабочую БД.
async function context(t:{after(fn:()=>void):void}){
  const dir=mkdtempSync(join(tmpdir(),'zai-auth-test-'));const store=new Store(dir);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const hash=await passwordHash('session-test-password');store.set('auth.chat',hash);store.set('auth.admin',hash);
  let now=Date.now();return {store,dir,clock:()=>now,advance:(days:number)=>{now+=days*86400000;}};
}

test('вход чата: сохраняется при повторном открытии БД и рестарте, живёт дольше восьми часов',async t=>{
  const {store,dir,clock,advance}=await context(t);const auth=new Auth(store,clock);const login=await auth.login('session-test-password');
  const cookie=`zai_chat=${login.token}`;assert.equal(login.expires-clock(),180*86400000);
  assert.ok(!store.get('auth.sessions')!.includes(login.token));
  advance(2);const reopened=new Store(dir);t.after(()=>reopened.close());const restored=new Auth(reopened,clock);
  assert.equal(restored.session(cookie)?.csrf,login.csrf);assert.equal(restored.session(cookie)?.role,'chat');
  assert.equal(restored.session(`zai_admin=${login.token}`,'admin'),undefined);
});

test('вход чата: использование продлевает срок и cookie, истёкший токен не восстанавливается',async t=>{
  const {store,clock,advance}=await context(t);const auth=new Auth(store,clock);const login=await auth.login('session-test-password');const cookie=`zai_chat=${login.token}`;
  advance(179);assert.equal(auth.renew(cookie)?.expires,clock()+180*86400000);
  advance(179);assert.ok(new Auth(store,clock).session(cookie));
  advance(2);assert.equal(auth.renew(cookie),undefined);assert.equal(new Auth(store,clock).session(cookie),undefined);
});

test('вход чата: выход и отзыв сохраняются после рестарта, смена пароля через CLI отзывает токен',async t=>{
  const {store,clock}=await context(t);let auth=new Auth(store,clock);
  const first=await auth.login('session-test-password');auth.logout(`zai_chat=${first.token}`);auth=new Auth(store,clock);assert.equal(auth.session(`zai_chat=${first.token}`),undefined);
  const second=await auth.login('session-test-password');auth.revoke('chat');auth=new Auth(store,clock);assert.equal(auth.session(`zai_chat=${second.token}`),undefined);
  const third=await auth.login('session-test-password');store.set('auth.chat',await passwordHash('changed-test-password'));
  assert.equal(auth.session(`zai_chat=${third.token}`),undefined);assert.equal(new Auth(store,clock).session(`zai_chat=${third.token}`),undefined);
});

test('вход админки: отдельная роль, восемь часов и отсутствие постоянной сессии',async t=>{
  const {store,clock,advance}=await context(t);const auth=new Auth(store,clock);const login=await auth.login('session-test-password','admin');const cookie=`zai_admin=${login.token}`;
  assert.equal(login.expires-clock(),8*3600000);assert.equal(auth.renew(cookie,'admin')?.expires,login.expires);
  assert.equal(new Auth(store,clock).session(cookie,'admin'),undefined);advance(1);assert.equal(auth.session(cookie,'admin'),undefined);
});

test('вход HTTP: прежний cookie и CSRF работают после рестарта, session обновляет срок cookie',async t=>{
  const {store,clock,advance}=await context(t);const service=new MessengerService([],store);let origin='';
  let server=createApp({store,service,auth:new Auth(store,clock),clientDirectory:'.',origin:'http://127.0.0.1'});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');const port=address.port;
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));origin=`http://127.0.0.1:${port}`;
  //: Запускает только синтетический HTTP-сервер на прежнем loopback-порту.
  //: Новый экземпляр Auth восстанавливает состояние из тестовой SQLite.
  const start=async()=>{server=createApp({store,service,auth:new Auth(store,clock),clientDirectory:'.',origin});await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));};
  await start();t.after(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  const response=await fetch(`${origin}/api/chat/login`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'session-test-password'})});assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie')!;assert.match(cookie,/Max-Age=1555\d+/);assert.match(cookie,/HttpOnly; SameSite=Strict; Path=\/api\/chat/);
  const login=await response.json() as {csrfToken:string;expiresAt:number};
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));advance(30);await start();
  const checked=await fetch(`${origin}/api/chat/session`,{headers:{Cookie:cookie.split(';')[0],Connection:'close'}});const info=await checked.json() as {authenticated:boolean;csrfToken:string;expiresAt:number};
  assert.equal(info.authenticated,true);assert.equal(info.csrfToken,login.csrfToken);assert.ok(info.expiresAt>login.expiresAt);assert.ok(checked.headers.get('set-cookie')?.includes(cookie.split(';')[0]));
  const logout=await fetch(`${origin}/api/chat/logout`,{method:'POST',headers:{Origin:origin,Cookie:cookie.split(';')[0],Connection:'close','Content-Type':'application/json','X-CSRF-Token':login.csrfToken},body:'{}'});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie')!,/Max-Age=0/);await logout.json();
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await start();
  assert.equal((await(await fetch(`${origin}/api/chat/session`,{headers:{Cookie:cookie.split(';')[0],Connection:'close'}})).json() as {authenticated:boolean}).authenticated,false);
});
