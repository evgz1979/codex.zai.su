import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,statSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
import {AttachmentService,clearAttachmentCache,safeAttachmentType} from '../backend/core/attachments.js';
import {createApp} from '../backend/http.js';
import {passwordHash} from '../backend/auth/auth.js';
import {TestAdapter} from './fixtures.js';
import {entityId,type AttachmentRequest} from '../shared/types.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
//: Создаёт полностью изолированные SQLite, медиа и источник для проверок доступа.
//: Все изображения и имена синтетические, рабочие данные не открываются.
async function context(t:{after(fn:()=>void):void}){
 const dir=mkdtempSync(join(tmpdir(),'zai-media-'));const store=new Store(dir);const adapter=new TestAdapter();store.select(adapter.conversations.map(c=>c.id));const core=new MessengerService([adapter],store);await core.refresh();
 const message=adapter.messages[0];const attachment={id:entityId(adapter.source.id,'attachment','photo'),kind:'image' as const,name:'Проверка.png',mimeType:'image/png',size:png.length,downloadable:true};message.attachments=[attachment];message.sourceKey=entityId(adapter.source.id,'source-message','global/1');store.upsertMessages([message]);adapter.media.set(attachment.id,{attachment,bytes:png});
 const input:AttachmentRequest={conversationId:message.conversationId,messageId:message.id,attachmentId:attachment.id};const media=new AttachmentService(core,dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {dir,store,adapter,core,message,attachment,input,media};
}
test('вложения: приватный кеш повторно открывается без Telegram, выбранность проверяется до кеша',async t=>{
 const {dir,store,adapter,core,input,media,attachment}=await context(t);const controller=new AbortController();const entry=await media.open(input,controller.signal,()=>{});
 assert.deepEqual(readFileSync(entry.path),png);assert.equal(statSync(entry.path).mode&0o777,0o600);assert.equal(statSync(join(dir,'attachments')).mode&0o777,0o700);entry.release();
 const next=new AttachmentService(core,dir);adapter.fail=true;const cached=await next.open(input,controller.signal,()=>{});assert.equal(adapter.attachmentCalls,1);assert.equal(cached.attachment.mimeType,'image/png');cached.release();
 core.selection.clear();await assert.rejects(next.open(input,controller.signal,()=>{}),{status:403});assert.equal(adapter.attachmentCalls,1);
 store.select([input.conversationId]);const restored=await next.open(input,controller.signal,()=>{});assert.equal(restored.attachment.id,attachment.id);restored.release();
});
test('вложения: старое обозначение unsupported уточняется без повторной загрузки истории',async t=>{
 const {store,adapter,message,input,media}=await context(t);store.upsertMessages([{...message,attachments:[{...message.attachments[0],kind:'unsupported',size:undefined}]}]);
 const entry=await media.open(input,new AbortController().signal,()=>{});assert.equal(entry.attachment.kind,'image');assert.equal(store.message(message.id)?.attachments[0].kind,'image');assert.equal(adapter.historyCalls.length,0);entry.release();
});
test('вложения: чужой маршрут, удаление и отзыв веб-сессии не читают источник или готовый кеш',async t=>{
 const {core,adapter,message,input,media}=await context(t);await assert.rejects(media.open({...input,conversationId:adapter.conversations[1].id},new AbortController().signal,()=>{}),{status:404});assert.equal(adapter.attachmentCalls,0);
 const entry=await media.open(input,new AbortController().signal,()=>{});core.selection.clear();assert.throws(entry.assertAllowed,{status:403});entry.release();
 await assert.rejects(media.open(input,new AbortController().signal,()=>{throw new Error('Authorization ended');}));assert.equal(adapter.attachmentCalls,1);
 core.selection.replace([input.conversationId],adapter.conversations);core.ingest({type:'delete',sourceId:adapter.source.id,keys:[message.sourceKey!]});await assert.rejects(media.open(input,new AbortController().signal,()=>{}),{status:404});assert.equal(adapter.attachmentCalls,1);
});
test('вложения: исключение во время загрузки удаляет частичный файл и закрывает итератор',async t=>{
 const {dir,core,adapter,attachment,input,media}=await context(t);let start!:()=>void;const started=new Promise<void>(resolve=>{start=resolve;});let resume!:()=>void;const gate=new Promise<void>(resolve=>{resume=resolve;});let ended=false;
 adapter.openAttachment=async()=>({attachment,chunks:(async function*(){try{yield png.subarray(0,10);start();await gate;yield png.subarray(10);}finally{ended=true;}})()});
 const pending=media.open(input,new AbortController().signal,()=>{});await started;core.selection.clear();resume();await assert.rejects(pending,{status:403});assert.equal(ended,true);assert.deepEqual(readdirSync(join(dir,'attachments')),[]);
});
test('вложения: лимиты размера и параллелизма, отмена и неполная загрузка не оставляют кеш',async t=>{
 const {dir,core,adapter,attachment,input}=await context(t);const media=new AttachmentService(core,dir,{fileBytes:128,cacheBytes:256,cacheFiles:2,parallel:1});let resume!:()=>void;const gate=new Promise<void>(resolve=>{resume=resolve;});let start!:()=>void;const started=new Promise<void>(resolve=>{start=resolve;});const controller=new AbortController();
 adapter.openAttachment=async()=>({attachment,chunks:(async function*(){start();await gate;yield png;})()});const pending=media.open(input,controller.signal,()=>{});await started;
 await assert.rejects(media.open(input,new AbortController().signal,()=>{}),{status:429});controller.abort();resume();await assert.rejects(pending,{status:408});assert.deepEqual(readdirSync(join(dir,'attachments')),[]);
 adapter.openAttachment=async()=>({attachment:{...attachment,size:undefined},chunks:(async function*(){yield Buffer.alloc(129);})()});await assert.rejects(media.open(input,new AbortController().signal,()=>{}),{status:413});assert.deepEqual(readdirSync(join(dir,'attachments')),[]);
 adapter.openAttachment=async()=>({attachment,chunks:(async function*(){yield png.subarray(0,10);})()});await assert.rejects(media.open(input,new AbortController().signal,()=>{}),{status:503});assert.deepEqual(readdirSync(join(dir,'attachments')),[]);
});
test('вложения: LRU ограничивает диск, очистка не удаляет настройки и текстовую историю',async t=>{
 const {dir,store,core,adapter,message,input,attachment}=await context(t);const media=new AttachmentService(core,dir,{fileBytes:128,cacheBytes:128,cacheFiles:1,parallel:2});const one=await media.open(input,new AbortController().signal,()=>{});one.release();
 const second={...attachment,id:entityId(adapter.source.id,'attachment','other')};adapter.media.set(second.id,{attachment:second,bytes:png});store.upsertMessages([{...message,attachments:[attachment,second]}]);const two=await media.open({...input,attachmentId:second.id},new AbortController().signal,()=>{});two.release();assert.equal(readdirSync(join(dir,'attachments')).length,1);
 clearAttachmentCache(dir);assert.deepEqual(readdirSync(join(dir,'attachments')),[]);assert.ok(store.message(message.id));assert.ok(store.selected().length);
});
test('вложения: HTML/SVG не становятся встроенными картинками или документами',()=>{
 const malicious=Buffer.from('<svg onload="alert(1)">');const image={id:'test:image',kind:'image' as const,name:'image.png',mimeType:'image/png'};assert.equal(safeAttachmentType(image,malicious).kind,'file');assert.equal(safeAttachmentType({...image,mimeType:'image/svg+xml'},malicious).mimeType,'application/octet-stream');
 assert.equal(safeAttachmentType({...image,kind:'video',mimeType:'text/html'},malicious).kind,'file');
});
test('HTTP вложений: chat-cookie и CSRF, закрытые файлы, безопасные заголовки и ошибки',async t=>{
 const {dir,store,core,adapter,input,media}=await context(t);store.set('auth.chat',await passwordHash('test-chat-password'));store.set('auth.admin',await passwordHash('test-admin-password'));
 const server=createApp({store,service:core,attachments:media,clientDirectory:dir,origin:'http://127.0.0.1:14321'});await new Promise<void>(resolve=>server.listen(14321,'127.0.0.1',resolve));
 const request=(path:string,body?:unknown,headers:Record<string,string>={})=>fetch('http://127.0.0.1:14321'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://127.0.0.1:14321','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  assert.equal((await request('/api/chat/attachment',input)).status,401);const login=await request('/api/chat/login',{password:'test-chat-password'});const info=await login.json() as {csrfToken:string};const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'X-CSRF-Token':info.csrfToken};
  assert.equal((await request('/api/chat/attachment',input,{Cookie:headers.Cookie})).status,403);assert.equal((await request('/api/chat/attachment',input,{...headers,Origin:'https://evil.example'})).status,403);
  assert.equal((await request('/api/chat/attachment',{...input,variant:'preview'},{Cookie:headers.Cookie})).status,403);assert.equal((await request('/api/chat/attachment',{...input,variant:'original'},headers)).status,400);
  const admin=await request('/api/admin/login',{password:'test-admin-password'});assert.equal((await request('/api/chat/attachment',input,{Cookie:admin.headers.get('set-cookie')!.split(';')[0],...{'X-CSRF-Token':info.csrfToken}})).status,401);
  const response=await request('/api/chat/attachment',input,headers);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-disposition')!,/^attachment; filename\*=UTF-8''/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  assert.equal((await request('/api/chat/attachment',undefined,headers)).status,404);assert.equal((await request('/attachments/anything.bin')).status,404);assert.equal((await request('/api/chat/attachment',{...input,messageId:'wrong'},headers)).status,404);assert.equal((await request('/api/chat/attachment',{...input,attachmentId:'../../vault.key'},headers)).status,404);
  core.selection.clear();assert.equal((await request('/api/chat/attachment',input,headers)).status,403);assert.equal(adapter.attachmentCalls,1);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('вложения: повторная синхронизация MIME не отменяет проверку сигнатуры готового кеша',async t=>{
 const {store,adapter,message,input,media,attachment}=await context(t);const fake=Buffer.from('<svg onload="alert(1)">');adapter.media.set(attachment.id,{attachment:{...attachment,size:fake.length},bytes:fake});
 const first=await media.open(input,new AbortController().signal,()=>{});assert.equal(first.attachment.kind,'file');first.release();
 store.upsertMessages([{...message,attachments:[{...attachment,size:fake.length}]}]);const next=await media.open(input,new AbortController().signal,()=>{});assert.equal(next.attachment.mimeType,'application/octet-stream');assert.equal(next.attachment.kind,'file');assert.equal(adapter.attachmentCalls,1);next.release();
});

test('вложения: отказ источника не раскрывает исключение и освобождает слот',async t=>{
 const {adapter,input,media}=await context(t);adapter.fail=true;await assert.rejects(media.open(input,new AbortController().signal,()=>{}),error=>{assert.equal((error as {status:number}).status,503);assert.ok(!(error as Error).message.includes('PRIVATE'));return true;});
 adapter.fail=false;const entry=await media.open(input,new AbortController().signal,()=>{});entry.release();assert.equal(entry.attachment.kind,'image');
});

test('HTTP вложений: выход во время скачивания отзывает запрос и удаляет частичный файл',async t=>{
 const {dir,store,core,adapter,attachment,input,media}=await context(t);store.set('auth.chat',await passwordHash('test-chat-password'));store.set('auth.admin',await passwordHash('test-admin-password'));
 let start!:()=>void;const started=new Promise<void>(resolve=>{start=resolve;});let resume!:()=>void;const gate=new Promise<void>(resolve=>{resume=resolve;});
 adapter.openAttachment=async()=>({attachment,chunks:(async function*(){yield png.subarray(0,10);start();await gate;yield png.subarray(10);})()});
 const origin='http://127.0.0.1:14322';const server=createApp({store,service:core,attachments:media,clientDirectory:dir,origin});await new Promise<void>(resolve=>server.listen(14322,'127.0.0.1',resolve));
 const post=(path:string,value:unknown,headers:Record<string,string>={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
 try{const login=await post('/api/chat/login',{password:'test-chat-password'});const {csrfToken}=await login.json() as {csrfToken:string};const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'X-CSRF-Token':csrfToken};
 const pending=post('/api/chat/attachment',input,headers);await started;assert.equal((await post('/api/chat/logout',{},headers)).status,200);resume();const response=await pending;assert.equal(response.status,401);assert.deepEqual(readdirSync(join(dir,'attachments')),[]);
 }finally{resume();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('миниатюры: отдельный кеш не заменяет оригинал и не уменьшает его метаданные',async t=>{
 const {store,adapter,input,media,attachment,message}=await context(t);adapter.previews.set(attachment.id,{attachment:{...attachment,name:'Миниатюра.png'},bytes:png});
 const preview=await media.open({...input,variant:'preview'},new AbortController().signal,()=>{});assert.equal(store.message(message.id)?.attachments[0].name,attachment.name);preview.release();
 const original=await media.open(input,new AbortController().signal,()=>{});assert.notEqual(original.path,preview.path);assert.equal(original.attachment.name,attachment.name);original.release();const calls=adapter.attachmentCalls;
 const cached=await media.open({...input,variant:'preview'},new AbortController().signal,()=>{});cached.release();assert.equal(adapter.attachmentCalls,calls);
});

test('миниатюры: отсутствие запоминается, а предел размера не зависит от оригинала',async t=>{
 const {dir,store,adapter,input,media,attachment,message}=await context(t);store.upsertMessages([{...message,attachments:[{...attachment,size:40*1024*1024}]}]);
 adapter.previews.set(attachment.id,{attachment,bytes:png});const small=await media.open({...input,variant:'preview'},new AbortController().signal,()=>{});assert.equal(small.attachment.size,png.length);small.release();await assert.rejects(media.open(input,new AbortController().signal,()=>{}),{status:413});
 clearAttachmentCache(dir);adapter.previews.clear();const value=adapter.media.get(attachment.id)!;value.attachment={...value.attachment,kind:'file'};
 await assert.rejects(media.open({...input,variant:'preview'},new AbortController().signal,()=>{}),{status:415});const calls=adapter.attachmentCalls;await assert.rejects(media.open({...input,variant:'preview'},new AbortController().signal,()=>{}),{status:415});assert.equal(adapter.attachmentCalls,calls);clearAttachmentCache(dir);assert.deepEqual(readdirSync(join(dir,'attachments')),[]);
});

test('открытие: сигнатура PDF восстанавливает просмотр старого кеша, HTML остаётся файлом',()=>{
 const file={id:'test:file',kind:'file' as const,name:'Документ.pdf',mimeType:'application/octet-stream'};assert.equal(safeAttachmentType(file,Buffer.from('%PDF-1.4\n')).mimeType,'application/pdf');assert.equal(safeAttachmentType({...file,mimeType:'application/pdf'},Buffer.from('<html>')).mimeType,'application/octet-stream');assert.equal(safeAttachmentType({...file,name:'text.txt'},Buffer.from('<script>alert(1)')).mimeType,'text/plain');
});

test('аватары: версия обновляет кеш, неизвестные и исключённые диалоги не читают фото',async t=>{
 const {adapter,core,input}=await context(t);const c=adapter.conversations[0];c.avatarVersion='photo-1';adapter.avatars.set(c.id,png);await core.refresh();const signal=new AbortController().signal;
 assert.deepEqual((await core.avatar(c.id,signal)).bytes,png);assert.equal((await core.avatar(c.id,signal)).mimeType,'image/png');assert.equal(adapter.avatarCalls,1);
 c.avatarVersion='photo-2';await core.refresh();await core.avatar(c.id,signal);assert.equal(adapter.avatarCalls,2);
 await assert.rejects(core.avatar('unknown',signal),{status:403});core.selection.clear();await assert.rejects(core.avatar(input.conversationId,signal),{status:403});assert.equal(adapter.avatarCalls,2);
});

test('аватары: размер, неподдерживаемые байты и исключение во время загрузки не возвращают фото',async t=>{
 const {adapter,core}=await context(t);const c=adapter.conversations[0];c.avatarVersion='photo-1';await core.refresh();const signal=new AbortController().signal;
 adapter.avatars.set(c.id,Buffer.alloc(512*1024+1));await assert.rejects(core.avatar(c.id,signal),{status:413});
 adapter.avatars.set(c.id,Buffer.from('<svg onload="unsafe"/>'));await assert.rejects(core.avatar(c.id,signal),{status:415});
 adapter.openAvatar=async()=> (async function*(){yield png.subarray(0,10);core.selection.clear();yield png.subarray(10);})();await assert.rejects(core.avatar(c.id,signal),{status:403});
});


test('аватары: неполный JPEG не попадает в кеш, повтор получает полное изображение',async t=>{
 const {adapter,core}=await context(t);const c=adapter.conversations[0];c.avatarVersion='same-photo';await core.refresh();const signal=new AbortController().signal;adapter.avatars.set(c.id,Buffer.from([255,216,255,224,0,0]));await assert.rejects(core.avatar(c.id,signal),{status:503});adapter.avatars.set(c.id,png);assert.deepEqual((await core.avatar(c.id,signal)).bytes,png);await core.avatar(c.id,signal);assert.equal(adapter.avatarCalls,2);await core.avatar(c.id,signal,true);assert.equal(adapter.avatarCalls,3);
});


test('аватары: частичные метаданные сохраняют миниатюру только той же версии фото',async t=>{
 const {adapter,core}=await context(t);const c=adapter.conversations[0];c.avatarVersion='photo-1';c.avatarThumbnail='synthetic-thumbnail';await core.refresh();delete c.avatarThumbnail;await core.refresh();assert.equal(core.snapshot().conversations.find(item=>item.id===c.id)?.avatarThumbnail,'synthetic-thumbnail');c.avatarVersion='photo-2';await core.refresh();assert.equal(core.snapshot().conversations.find(item=>item.id===c.id)?.avatarThumbnail,undefined);
});
