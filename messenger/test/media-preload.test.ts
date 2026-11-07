import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
import {AttachmentService} from '../backend/core/attachments.js';
import {MediaPreloadService} from '../backend/core/media-preload.js';
import {TestAdapter} from './fixtures.js';
import {entityId} from '../shared/types.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
//: Создаёт выбранное новое, выбранное старое и исключённое новое вложение.
//: Все байты и часы синтетические; реальный Telegram не используется.
async function context(t:{after(fn:()=>void):void}){
 const dir=mkdtempSync(join(tmpdir(),'zai-preload-'));const store=new Store(dir);const adapter=new TestAdapter();store.select(adapter.conversations.slice(0,2).map(c=>c.id));const core=new MessengerService([adapter],store);await core.refresh();
 for(const [i,m] of adapter.messages.entries()){m.date=i===1?'2026-10-31T12:00:00.000Z':'2026-11-07T11:00:00.000Z';const attachment={id:entityId(adapter.source.id,'attachment',String(i)),name:'Тест.png',kind:'image' as const,mimeType:'image/png',size:png.length,downloadable:true,hasPreview:true};m.attachments=[attachment];adapter.media.set(attachment.id,{attachment,bytes:png});adapter.previews.set(attachment.id,{attachment,bytes:png});}
 store.upsertMessages(adapter.messages);const media=new AttachmentService(core,dir);media.canPreload=()=>true;let time=Date.parse('2026-11-07T12:00:00Z');const now=()=>time;const worker=new MediaPreloadService(store,media,now);
 t.after(async()=>{await worker.stop();store.close();rmSync(dir,{recursive:true,force:true});});return {dir,store,adapter,core,media,worker,now,advance:(ms:number)=>{time+=ms;}};
}
test('предзагрузка: только выбранные вложения за пять дней, миниатюра и оригинал, без прочитанных',async t=>{
 const {store,adapter,worker,now}=await context(t);await worker.tick();await worker.tick();await worker.tick();assert.equal(adapter.attachmentCalls,2);const since=new Date(now()-5*86400000).toISOString();assert.deepEqual(store.mediaJobs(since,now(),true),[]);assert.deepEqual(store.mediaJobs(since,now(),false),[]);assert.equal(adapter.reads.length,0);assert.equal(store.message(adapter.messages[1].id)?.attachments.length,1);
});
test('предзагрузка: перезапуск не повторяет готовое, новое вложение готовится автоматически',async t=>{
 const {store,adapter,media,worker,now,advance}=await context(t);await worker.tick();await worker.tick();await worker.stop();const next=new MediaPreloadService(store,media,now);
 try{await next.tick();assert.equal(adapter.attachmentCalls,2);advance(60000);const old=adapter.messages[0];const attachment={...old.attachments[0],id:entityId(adapter.source.id,'attachment','new')};const incoming={...old,id:entityId(adapter.source.id,'message','new'),date:new Date(now()).toISOString(),attachments:[attachment]};adapter.media.set(attachment.id,{attachment,bytes:png});adapter.previews.set(attachment.id,{attachment,bytes:png});store.upsertMessages([incoming]);await next.tick();await next.tick();assert.equal(adapter.attachmentCalls,4);}finally{await next.stop();}
});
test('предзагрузка: старые вложения остаются по нажатию, текстовый архив не усечён',async t=>{
 const {store,adapter,media,worker}=await context(t);await worker.tick();await worker.tick();const m=adapter.messages[1];const entry=await media.open({conversationId:m.conversationId,messageId:m.id,attachmentId:m.attachments[0].id},new AbortController().signal,()=>{});entry.release();assert.equal(adapter.attachmentCalls,3);assert.ok(store.message(m.id));
});
test('предзагрузка: временный отказ откладывает повтор и не создаёт цикл',async t=>{
 const {adapter,worker,advance}=await context(t);adapter.fail=true;await worker.tick();await worker.tick();const calls=adapter.attachmentCalls;await worker.tick();assert.equal(adapter.attachmentCalls,calls);advance(61000);adapter.fail=false;await worker.tick();await worker.tick();assert.equal(adapter.attachmentCalls,calls+2);
});
test('предзагрузка: интерактивное открытие прерывает фон и освобождает слот',async t=>{
 const {adapter,media,worker,store}=await context(t);let started!:()=>void;const begin=new Promise<void>(resolve=>{started=resolve;});const original=adapter.openAttachment.bind(adapter);let first=true;
 adapter.openAttachment=async(input,signal)=>{if(first){first=false;const attachment=adapter.messages[0].attachments[0];return {attachment,chunks:(async function*(){started();await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));signal.throwIfAborted();yield png;})()};}return original(input,signal);};
 const background=worker.tick();await begin;const m=adapter.messages[0];const entry=await media.open({conversationId:m.conversationId,messageId:m.id,attachmentId:m.attachments[0].id},new AbortController().signal,()=>{});entry.release();await background;assert.ok(store.mediaJobs('2026-11-02T12:00:00.000Z',Date.parse('2026-11-07T12:00:00Z'),true).length);
});

test('предзагрузка: FloodWait останавливает все медиазадания и сохраняется после рестарта',async t=>{
 const {store,adapter,media,worker,now,advance}=await context(t);let calls=0;const original=adapter.openAttachment.bind(adapter);adapter.openAttachment=async()=>{calls++;throw {name:'FloodWaitError',seconds:3600,message:'PRIVATE_NATIVE_ERROR'};};await worker.tick();assert.equal(calls,1);assert.equal(Number(store.get('media.pausedUntil')),now()+3600000);advance(61000);await worker.tick();assert.equal(calls,1);await worker.stop();const next=new MediaPreloadService(store,media,now);
 try{await next.tick();assert.equal(calls,1);advance(3600000);adapter.openAttachment=original;await next.tick();assert.equal(adapter.attachmentCalls,1);}finally{await next.stop();}
});
