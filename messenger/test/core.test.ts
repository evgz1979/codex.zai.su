import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../backend/storage/store.js';
import { SecretVault } from '../backend/storage/private-files.js';
import { MessengerService } from '../backend/core/service.js';
import { Auth, passwordHash, passwordMatches } from '../backend/auth/auth.js';
import { destinationFor, entityId, messagePreview, LIMITS } from '../shared/types.js';
import { TestAdapter } from './fixtures.js';
import {AutoSyncService} from '../backend/core/sync.js';

function context(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), 'zai-messenger-test-'));
  const store = new Store(dir);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, store };
}
test('идентификаторы не конфликтуют между источниками, типами и строками', () => {
  assert.notEqual(entityId('a','message','1'), entityId('b','message','1'));
  assert.notEqual(entityId('a','message','1'), entityId('a','conversation','1'));
  assert.notEqual(entityId('a:b','message','1'), entityId('a','b:message','1'));
});
test('единая лента объединяет источники и сохраняет хронологию', async t => {
  const { store } = context(t);
  const a = new TestAdapter('a'), b = new TestAdapter('b');
  store.select([...a.conversations,...b.conversations].map(c=>c.id));
  const service = new MessengerService([a,b],store);
  await service.refresh();
  store.upsertMessages([...a.messages,...b.messages]);for(const conversation of [...a.conversations,...b.conversations])await service.open(conversation.id);
  const result=service.snapshot();
  assert.equal(result.conversations.length, 6);
  assert.equal(new Set(result.messages.map(m => m.id)).size, 6);
  assert.deepEqual(result.messages.map(m => m.date), result.messages.map(m => m.date).sort());
  assert.equal(a.calls.length,0);
  assert.equal(a.reads.length,0);
});
test('отправка проверяет весь маршрут; повтор HTTP не дублирует отправку', async t => {
  const { store } = context(t);
  const a = new TestAdapter('a'), b = new TestAdapter('b');
  store.select([...a.conversations,...b.conversations].map(c=>c.id));
  const service = new MessengerService([a,b],store);
  await service.refresh();
  const destination = destinationFor(a.conversations[0]);
  const request = { destination, text: '**буквальный текст**', requestId: '12345678-12345678' };
  for (const wrong of [{ ...destination, sourceId:'b' }, { ...destination, recipientId: b.conversations[0].recipient.id }]) {
    assert.throws(() => service.send({ ...request, destination:wrong }), /Адресат/);
  }
  assert.throws(() => service.send({ ...request, text:' ' }), /текст/);
  assert.throws(() => service.send({ ...request, text:'x'.repeat(4097) }), /текст/);
  const [first,second] = await Promise.all([service.send(request),service.send(request)]);
  assert.equal(first.id, second.id);
  assert.equal(a.sent.length, 1); assert.equal(b.sent.length,0);
  assert.equal(first.text, request.text);
  assert.throws(() => service.send({ ...request, text:'Другой текст' }), /уже использован/);
});
test('ошибки провайдера не выходят наружу; повтор не отправляет заново', async t => {
  const { store } = context(t);
  const a = new TestAdapter(); store.select(a.conversations.map(c=>c.id)); const service = new MessengerService([a], store);
  await service.refresh(); a.fail = true;
  const request = { destination: destinationFor(a.conversations[0]), text:'test', requestId:'12345678-12345678' };
  await assert.rejects(service.send(request), /Результат отправки неизвестен/);
  await assert.rejects(service.send(request), /Результат отправки неизвестен/);
  await assert.rejects(service.refresh(), e => e instanceof Error && !e.message.includes('PRIVATE_PROVIDER_ERROR'));
  assert.equal(service.snapshot().stale,true);
});
test('открытие ограничено; непрочитанные сбрасываются только явным действием', async t => {
  const { store } = context(t); const a = new TestAdapter(); store.select(a.conversations.map(c=>c.id)); const service = new MessengerService([a],store);
  await service.refresh(); const c = a.conversations[0];
  store.upsertMessages(a.messages);await service.open(c.id);assert.equal(c.unreadCount,3);assert.equal(a.calls.length,0);
  await service.markRead(c.id); assert.equal(service.snapshot().conversations.find(x => x.id === c.id)?.unreadCount,0); assert.deepEqual(a.reads,[c.id]);
});
test('SQLite сохраняет всю историю, ограничивает снимок и сохраняет исключённый архив', t => {
  const { store, dir } = context(t); const a = new TestAdapter();
  store.select([a.conversations[0].id]);
  store.saveCache({ sources:[a.source], conversations:a.conversations, messages:Array.from({length:600},(_,i)=>({...a.messages[0],id:String(i)})), refreshedAt:new Date().toISOString(), stale:false });
  store.saveProgress(a.conversations[0].id,{...store.progress(a.conversations[0].id),initialized:true,historyComplete:true});assert.equal(store.loadCache().messages.length,10);
  let page=store.messagePage(a.conversations[0].id);let total=page.messages.length;while(page.nextCursor){page=store.messagePage(a.conversations[0].id,page.nextCursor);total+=page.messages.length;}assert.equal(total,600);
  store.select([]); assert.equal(store.loadCache().messages.length,0);
  store.select([a.conversations[0].id]); assert.equal(store.loadCache().messages.length,10);
  const vault=new SecretVault(dir); const credentials={apiId:123,apiHash:'test-only',session:'test-only'};
  vault.save(credentials);assert.deepEqual(vault.load(),credentials);
  assert.ok(!readFileSync(join(dir,'telegram.enc')).includes(Buffer.from(credentials.session)));
  assert.equal(statSync(dir).mode&0o777,0o700);
  for(const name of ['vault.key','telegram.enc','messenger.sqlite'])assert.equal(statSync(join(dir,name)).mode&0o777,0o600);
});
test('пароль хешируется; сессии отзываются; перебор ограничен', async t => {
  const { store } = context(t); const auth = new Auth(store);
  assert.equal(auth.setupRequired,true);
  const hash = await passwordHash('test-password-only');
  assert.ok(!hash.includes('test-password-only')); assert.ok(await passwordMatches('test-password-only',hash));
  assert.ok(!await passwordMatches('wrong',hash));
  store.set('auth.chat',hash); store.set('auth.admin',hash);
  const login = await auth.login('test-password-only');
  assert.equal(auth.session(`zai_chat=${login.token}`)?.csrf,login.csrf);
  auth.logout(`zai_chat=${login.token}`); assert.equal(auth.session(`zai_chat=${login.token}`),undefined);
  for (let i=0;i<5;i++) await assert.rejects(auth.login('wrong'),/Неверный/);
  await assert.rejects(auth.login('wrong'),/Слишком много/);
});

test('по умолчанию ничего не выбрано; исключённые диалоги нельзя читать или отправлять', async t => {
  const {store}=context(t);const a=new TestAdapter();const service=new MessengerService([a],store);
  assert.equal((await service.refresh()).messages.length,0);assert.equal(a.calls.length,0);
  assert.throws(()=>service.send({destination:destinationFor(a.conversations[0]),text:'x',requestId:'12345678-12345678'}),/не разрешён/);
  await assert.rejects(service.open(a.conversations[0].id),/не разрешён/);
  service.selection.replace([a.conversations[0].id],a.conversations);
  await service.refresh();assert.equal(a.calls.length,0);service.cacheMessages(a.conversations[0].id,a.messages.slice(0,1));await service.open(a.conversations[0].id);assert.equal(a.calls.length,0);assert.equal(service.snapshot().conversations.length,1);
  assert.equal(service.snapshot().messages.some(m=>m.conversationId===a.conversations[1].id),false);
  service.selection.clear();assert.equal(service.snapshot().messages.length,0);
  await assert.rejects(service.markRead(a.conversations[0].id),/не разрешён/);
  service.selection.replace([a.conversations[0].id],a.conversations);service.reset();assert.equal(service.snapshot().messages.length,1);
});
test('снятие выбора во время чтения не кеширует запоздалый результат',async t=>{
 const {store}=context(t);const a=new TestAdapter();store.select([a.conversations[0].id]);const service=new MessengerService([a],store);
 let finish:()=>void=()=>{};const gate=new Promise<void>(r=>{finish=r;});
 let started:()=>void=()=>{};const requested=new Promise<void>(r=>{started=r;});a.historyPage=async()=>{started();await gate;return {conversationId:a.conversations[0].id,messages:a.messages.slice(0,1),nextCursor:null,cursors:a.messages.slice(0,1).map(m=>m.id)};};
 const sync=new AutoSyncService(service,store);const pending=sync.tick();await requested;service.selection.clear();finish();await pending;await sync.stop();
 assert.equal(service.snapshot().messages.length,0);assert.equal(store.loadCache([a.conversations[0].id]).messages.length,0);
});


test('превью: подпись, фото, видео, голосовое, аудио и имя файла без пустой заглушки',()=>{
 const attachment={id:'synthetic',kind:'image' as const,name:'Фото'};assert.equal(messagePreview({text:' Подпись ',attachments:[attachment]}),'Подпись');assert.equal(messagePreview({text:'',attachments:[attachment]}),'Фото');
 assert.equal(messagePreview({text:'',attachments:[{...attachment,kind:'video'}]}),'Видео');assert.equal(messagePreview({text:'',attachments:[{...attachment,kind:'audio',isVoice:true}]}),'Голосовое сообщение');assert.equal(messagePreview({text:'',attachments:[{...attachment,kind:'audio'}]}),'Аудио');assert.equal(messagePreview({text:'',attachments:[{...attachment,kind:'file',name:'Отчёт.pdf'}]}),'Отчёт.pdf');assert.equal([...messagePreview({text:'🙂'.repeat(400),attachments:[]})].length,300);
});

test('превью: старая страница и удаление старого сообщения не заменяют последний текст одного времени',async t=>{
 const {store}=context(t);const adapter=new TestAdapter();const c=adapter.conversations[0];const head={...adapter.messages[0],id:entityId(adapter.source.id,'message',`${c.id}/100`),sequence:100,text:'Последнее',sourceKey:'synthetic-head'};const older={...head,id:entityId(adapter.source.id,'message',`${c.id}/99`),sequence:99,text:'Предыдущее',sourceKey:'synthetic-older'};
 store.select([c.id]);store.saveCache({sources:[],conversations:[{...c,preview:'Последнее',previewMessageId:head.id}],messages:[],refreshedAt:null,stale:false});
 store.upsertMessages([older]);assert.equal(store.conversation(c.id)?.preview,'Последнее');assert.equal(store.conversation(c.id)?.unreadCount,c.unreadCount);
 store.upsertMessages([head]);assert.equal(store.conversation(c.id)?.preview,'Последнее');store.deleteSourceKeys([older.sourceKey],[c.id]);assert.equal(store.conversation(c.id)?.preview,'Последнее');
 const previous={...older,id:entityId(adapter.source.id,'message',`${c.id}/98`),sequence:98,sourceKey:'synthetic-previous'};store.upsertMessages([previous]);store.deleteSourceKeys([head.sourceKey],[c.id]);assert.equal(store.conversation(c.id)?.preview,'Предыдущее');assert.equal(store.conversation(c.id)?.previewMessageId,previous.id);
});
