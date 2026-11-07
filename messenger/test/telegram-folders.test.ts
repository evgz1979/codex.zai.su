import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Api,utils,type TelegramClient} from 'teleproto';
import type {Dialog} from 'teleproto/tl/custom/dialog';
import {telegramFolders} from '../backend/connectors/telegram/folders.js';
import {TelegramAdapter} from '../backend/connectors/telegram/adapter.js';
import {SecretVault} from '../backend/storage/private-files.js';
import {Store} from '../backend/storage/store.js';
import {MessengerService} from '../backend/core/service.js';
import {AdminService} from '../backend/admin/service.js';
import {entityId,destinationFor} from '../shared/types.js';
//: Создаёт синтетический диалог с настоящими TL-метаданными.
//: Текстов сообщений, авторизации и сетевого подключения в fixture нет.
function dialog(entity:Api.User|Api.Chat|Api.Channel,options:{muted?:number;archived?:boolean;unread?:number;mark?:boolean;mentions?:number}={}):Dialog {
 const native=new Api.Dialog({peer:utils.getPeer(entity),topMessage:0,readInboxMaxId:0,readOutboxMaxId:0,unreadCount:options.unread??0,unreadMark:options.mark,unreadMentionsCount:options.mentions??0,unreadReactionsCount:0,unreadPollVotesCount:0,notifySettings:new Api.PeerNotifySettings({muteUntil:options.muted}),folderId:options.archived?1:undefined});
 return {entity,id:{toString:()=>utils.getPeerId(entity)},inputEntity:utils.getInputPeer(entity,true,false),title:utils.getDisplayName(entity),isUser:entity instanceof Api.User,isGroup:entity instanceof Api.Chat||entity instanceof Api.Channel&&!!entity.megagroup,isChannel:entity instanceof Api.Channel,isCommunity:false,archived:!!options.archived,unreadCount:native.unreadCount,unreadMentionsCount:native.unreadMentionsCount,dialog:native,date:0} as unknown as Dialog;
}
//: Создаёт синтетическую папку с явными массивами правил.
//: Параметры сценария заменяют только нужные флаги или peer.
function folder(id:number,params:Partial<ConstructorParameters<typeof Api.DialogFilter>[0]>={}) {
 return new Api.DialogFilter({id,title:new Api.TextWithEntities({text:`Папка ${id}`,entities:[]}),pinnedPeers:[],includePeers:[],excludePeers:[],...params});
}
//: Преобразует native ID fixture в общие ID конкретного источника.
//: Один источник не может создать коллизию с другим источником или типом peer.
function available(dialogs:Dialog[],source='telegram-47') {return new Set(dialogs.map(d=>entityId(source,'conversation',d.id!.toString())));}
test('Telegram-папки: порядок, закрепления, исключения, пересечения, Self и типы ID',()=>{
 const user=dialog(new Api.User({id:5n as never,firstName:'Личный'}));
 const group=dialog(new Api.Chat({id:5n as never,title:'Группа',photo:new Api.ChatPhotoEmpty(),date:0,participantsCount:2,version:1}));
 const channel=dialog(new Api.Channel({id:5n as never,title:'Канал',photo:new Api.ChatPhotoEmpty(),date:0,broadcast:true,accessHash:123n as never}));
 const self=dialog(new Api.User({id:47n as never,firstName:'Избранное',self:true}));
 const hidden=dialog(new Api.User({id:99n as never,firstName:'Не в каталоге'}));
 const rows=[user,group,channel,self,hidden];const known=available(rows.slice(0,4));
 const first=folder(9,{includePeers:[user.inputEntity,group.inputEntity,channel.inputEntity,hidden.inputEntity],pinnedPeers:[channel.inputEntity,channel.inputEntity],excludePeers:[group.inputEntity]});
 const second=new Api.DialogFilterChatlist({id:2,title:new Api.TextWithEntities({text:'Общая папка',entities:[]}),includePeers:[user.inputEntity,new Api.InputPeerSelf()],pinnedPeers:[group.inputEntity]});
 const result=telegramFolders('telegram-47',[first,new Api.DialogFilterDefault(),second],rows,known,{users:0,groups:0,channels:0});
 const ids=[...known];assert.equal(result[0].id,'telegram-47:folder:9');assert.equal(result[1].title,'Общая папка');
 assert.deepEqual(result[0].conversationIds,[ids[2],ids[0]]);assert.deepEqual(result[1].conversationIds,[ids[1],ids[0],ids[3]]);
 assert.equal(new Set(ids).size,4);assert.ok(!JSON.stringify(result).includes('accessHash'));assert.ok(!JSON.stringify(result).includes('Не в каталоге'));
 const other=telegramFolders('telegram-48',[first],rows,available(rows.slice(0,4),'telegram-48'),{users:0,groups:0,channels:0});
 assert.notEqual(other[0].id,result[0].id);assert.notEqual(other[0].conversationIds[0],result[0].conversationIds[0]);
});
test('Telegram-папки: контакты, боты, группы и каналы используют отдельные правила',()=>{
 const rows=[dialog(new Api.User({id:1n as never,firstName:'Контакт',contact:true})),dialog(new Api.User({id:2n as never,firstName:'Другой'})),dialog(new Api.User({id:3n as never,firstName:'Бот',bot:true,contact:true})),dialog(new Api.Chat({id:4n as never,title:'Группа',photo:new Api.ChatPhotoEmpty(),date:0,participantsCount:2,version:1})),dialog(new Api.Channel({id:5n as never,title:'Супергруппа',photo:new Api.ChatPhotoEmpty(),date:0,megagroup:true})),dialog(new Api.Channel({id:6n as never,title:'Канал',photo:new Api.ChatPhotoEmpty(),date:0,broadcast:true}))];
 const filters=[folder(2,{contacts:true}),folder(3,{nonContacts:true}),folder(4,{bots:true}),folder(5,{groups:true}),folder(6,{broadcasts:true})];
 const result=telegramFolders('telegram-47',filters,rows,available(rows),{users:0,groups:0,channels:0});const ids=[...available(rows)];
 assert.deepEqual(result.map(f=>f.conversationIds),[[ids[0]],[ids[1]],[ids[2]],[ids[3],ids[4]],[ids[5]]]);
});
test('Telegram-папки: прочитанные, архив, глобальный mute, упоминания и явное включение',()=>{
 const options=[{unread:1,muted:0},{mark:true,muted:0},{unread:1},{unread:1,muted:2000,mentions:1},{unread:1,muted:0,archived:true},{muted:2000,archived:true},{muted:0},{unread:1,muted:2000,mentions:1,archived:true}];
 const rows=options.map((option,i)=>dialog(new Api.User({id:BigInt(i+1) as never,firstName:`Диалог ${i}`}),option));
 const filter=folder(2,{nonContacts:true,excludeMuted:true,excludeRead:true,excludeArchived:true,includePeers:[rows[5].inputEntity],excludePeers:[rows[1].inputEntity]});
 const ids=[...available(rows)];const result=telegramFolders('telegram-47',[filter],rows,available(rows),{users:2000,groups:0,channels:0},1000);
 assert.deepEqual(result[0].conversationIds,[ids[0],ids[3],ids[5]]);
 const expired=telegramFolders('telegram-47',[folder(3,{nonContacts:true,excludeMuted:true})],rows,available(rows),{users:999,groups:0,channels:0},1000);
 assert.ok(expired[0].conversationIds.includes(ids[2]));assert.ok(!expired[0].conversationIds.includes(ids[7]));
});
test('Telegram-каталог: папки не читают историю, не разрешают диалоги и переживают переподключение',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'zai-folders-'));const vault=new SecretVault(dir);const store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const credentials={apiId:123,apiHash:'synthetic-only',session:'synthetic-session',accountId:'47'};vault.save(credentials);
 const rows=[dialog(new Api.User({id:1n as never,firstName:'Синтетический контакт'}),{unread:1})];
 const filters=[folder(2,{nonContacts:true,excludeMuted:true})];let history=0;let logouts=0;let connects=0;let folders=0;let notify=0;
 const fake={connected:false,async connect(){this.connected=true;connects++;},async checkAuthorization(){return true;},async destroy(){this.connected=false;},async getDialogs(){return Object.assign(rows,{total:1001});},async invoke(request:Api.AnyRequest){assert.ok(request instanceof Api.messages.GetDialogFilters);folders++;return new Api.messages.DialogFilters({filters});},async getNotifySettings(){notify++;return new Api.PeerNotifySettings({muteUntil:0});},async getMessages(){history++;return[];},async logOut(){logouts++;}};
 const factory=()=>fake as unknown as TelegramClient;let adapter=new TelegramAdapter(vault,factory);const core=new MessengerService([adapter],store);const admin=new AdminService(core,adapter,vault,store);
 const catalog=await admin.dialogs();assert.equal(catalog.folders.length,1);assert.equal(catalog.folders[0].conversationIds.length,1);assert.equal(catalog.truncated,true);assert.deepEqual(catalog.selectedIds,[]);assert.equal(history,0);assert.equal(folders,1);assert.equal(notify,3);
 assert.deepEqual(core.snapshot().conversations,[]);await assert.rejects(core.open(catalog.conversations[0].id),/не разрешён/);assert.throws(()=>core.send({destination:destinationFor(catalog.conversations[0]),text:'test',requestId:'synthetic-request-1234'}),/не разрешён/);
 await adapter.listConversations();assert.equal(folders,1);assert.equal(notify,3);assert.equal(history,0);
 await adapter.disconnect();adapter=new TelegramAdapter(vault,factory);await adapter.listConversationCatalog();assert.equal(connects,2);assert.equal(logouts,0);assert.deepEqual(vault.load(),credentials);await adapter.disconnect();
});
