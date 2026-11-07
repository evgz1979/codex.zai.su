import test from 'node:test';
import assert from 'node:assert/strict';
import {Api,type TelegramClient} from 'teleproto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {telegramAttachments,telegramPreview} from '../backend/connectors/telegram/media.js';
import {TelegramAdapter} from '../backend/connectors/telegram/adapter.js';
import {SecretVault} from '../backend/storage/private-files.js';
import {entityId,MEDIA_LIMITS} from '../shared/types.js';
//: Создаёт синтетический Telegram-документ с заведомо тестовыми native-реквизитами.
//: Реквизиты служат только проверке отсутствия их в общей модели.
function document(mimeType:string,name?:string){return new Api.Document({id:1n as never,accessHash:987n as never,fileReference:Buffer.from('NATIVE_REFERENCE_TEST'),date:0,mimeType,size:3n as never,dcId:2,attributes:name?[new Api.DocumentAttributeFilename({fileName:name})]:[]});}
//: Создаёт синтетическое сообщение одного личного диалога.
//: Реальный Telegram и данные владельца не вызываются.
function message(media:Api.TypeMessageMedia){return new Api.Message({id:7,peerId:new Api.PeerUser({userId:123n as never}),date:123,message:'',media});}
test('Telegram-вложения: фото, видео, голосовое и файлы без native secrets в DTO',()=>{
 const photo=new Api.Photo({id:1n as never,accessHash:987n as never,fileReference:Buffer.from('NATIVE_REFERENCE_TEST'),date:0,dcId:2,sizes:[new Api.PhotoSizeProgressive({type:'y',w:100,h:100,sizes:[1,3]})]});
 const image=telegramAttachments('telegram-test','telegram-test:conversation:123',message(new Api.MessageMediaPhoto({photo})))[0];assert.equal(image.kind,'image');assert.equal(image.mimeType,'image/jpeg');assert.equal(image.size,3);
 for(const [mime,name,kind] of [['video/mp4','video.mp4','video'],['audio/ogg',undefined,'audio'],['application/pdf','../file.pdf','file'],['image/svg+xml','image.svg','file'],['text/html','unsafe.html','file']] as const){const dto=telegramAttachments('telegram-test','telegram-test:conversation:123',message(new Api.MessageMediaDocument({document:document(mime,name)})))[0];assert.equal(dto.kind,kind);assert.ok(!dto.name.includes('/'));assert.ok(!JSON.stringify(dto).includes('NATIVE_REFERENCE_TEST'));assert.ok(!JSON.stringify(dto).includes('accessHash'));if(kind==='file')assert.equal(dto.mimeType,mime==='application/pdf'?'application/pdf':'application/octet-stream');if(mime==='audio/ogg')assert.match(dto.name,/\.ogg$/);}
 assert.equal(telegramAttachments('telegram-test','conversation',message(new Api.MessageMediaDocument({document:document('video/mp4'),ttlSeconds:10})))[0].downloadable,false);
 assert.equal(telegramAttachments('telegram-test','conversation',message(new Api.MessageMediaUnsupported()))[0].downloadable,false);
});
test('Telegram-вложения: один message ID нужного peer, поток и AbortSignal; чужой peer отклоняется',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zai-tg-media-'));const vault=new SecretVault(dir);vault.save({apiId:123,apiHash:'test-only',session:'test-only'});
 const peer=new Api.InputPeerUser({userId:123n as never,accessHash:987n as never});const user=new Api.User({id:123n as never,firstName:'Синтетический'});let current=message(new Api.MessageMediaDocument({document:document('image/png','test.png')}));const calls:{peer:unknown;options:Record<string,unknown>}[]=[];let params:Record<string,unknown>={};let downloads=0;let location:unknown;
 const fake={connected:false,async connect(){this.connected=true;},async checkAuthorization(){return true;},async destroy(){this.connected=false;},async getDialogs(){return [{entity:user,id:123n,title:'Синтетический',inputEntity:peer,isUser:true,isGroup:false,isChannel:false,isCommunity:false,unreadCount:0,date:123}];},async getMessages(input:unknown,options:Record<string,unknown>){calls.push({peer:input,options});return [current];},async *iterDownload(file:unknown,options:Record<string,unknown>){downloads++;location=file;params=options;yield Buffer.from([1,2,3]);}};
 const adapter=new TelegramAdapter(vault,()=>fake as unknown as TelegramClient);
 try{const [conversation]=await adapter.listConversations();const input={conversationId:conversation.id,messageId:entityId(adapter.source.id,'message',`${conversation.id}/7`),attachmentId:entityId(adapter.source.id,'attachment',`${conversation.id}/7`)};const controller=new AbortController();const content=await adapter.openAttachment(input,controller.signal);const chunks=[];for await(const chunk of content.chunks)chunks.push(chunk);
 assert.deepEqual(calls[0].options,{ids:[7]});assert.equal(calls[0].peer,peer);assert.equal(content.attachment.name,'test.png');assert.equal(downloads,1);assert.equal(params.signal,controller.signal);assert.equal(params.limit,MEDIA_LIMITS.fileBytes+1);assert.deepEqual(Buffer.concat(chunks),Buffer.from([1,2,3]));
 const video=document('video/mp4','test.mp4');video.size=BigInt(MEDIA_LIMITS.fileBytes+1) as never;video.thumbs=[new Api.PhotoSize({type:'m',w:320,h:180,size:3})];current=message(new Api.MessageMediaDocument({document:video}));const preview=await adapter.openAttachment({...input,variant:'preview'},controller.signal);for await(const _ of preview.chunks){}assert.ok(location instanceof Api.InputDocumentFileLocation);assert.equal(location.thumbSize,'m');assert.equal(params.dcId,2);assert.equal(params.signal,controller.signal);assert.equal(params.limit,MEDIA_LIMITS.previewBytes+1);assert.equal(preview.attachment.kind,'image');assert.equal(preview.attachment.size,3);
 current=new Api.Message({id:7,peerId:new Api.PeerUser({userId:999n as never}),date:123,message:'Чужой'});await assert.rejects(adapter.openAttachment(input,controller.signal),{status:404});assert.equal(downloads,2);
 await assert.rejects(adapter.openAttachment({...input,messageId:entityId(adapter.source.id,'message','other/7')},controller.signal),{status:400});assert.equal(calls.length,3);
 }finally{await adapter.disconnect();rmSync(dir,{recursive:true,force:true});}
});

test('Telegram-миниатюры: готовый размер, локальные байты, TTL и предел без оригинала',()=>{
 const photo=new Api.Photo({id:1n as never,accessHash:987n as never,fileReference:Buffer.from('NATIVE_REFERENCE_TEST'),date:0,dcId:2,sizes:[new Api.PhotoSize({type:'x',w:1280,h:720,size:900000}),new Api.PhotoSize({type:'m',w:320,h:180,size:1234}),new Api.PhotoSize({type:'s',w:100,h:56,size:500})]});
 const media=new Api.MessageMediaPhoto({photo});const result=telegramPreview(media)!;assert.ok(result.location instanceof Api.InputPhotoFileLocation);assert.equal(result.location.thumbSize,'m');assert.equal(result.size,1234);assert.equal(result.dcId,2);assert.equal(telegramPreview(new Api.MessageMediaPhoto({photo,ttlSeconds:1})),undefined);
 photo.sizes=[new Api.PhotoCachedSize({type:'s',w:100,h:100,bytes:Buffer.from([1,2,3])})];assert.deepEqual(telegramPreview(media)?.bytes,Buffer.from([1,2,3]));
 photo.sizes=[new Api.PhotoSize({type:'m',w:320,h:180,size:MEDIA_LIMITS.previewBytes+1})];assert.equal(telegramPreview(media),undefined);
});
