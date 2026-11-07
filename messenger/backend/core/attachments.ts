import {createHash,randomUUID} from 'node:crypto';
import {open,rename,unlink,readdir,lstat,utimes} from 'node:fs/promises';
import {readdirSync,unlinkSync,constants} from 'node:fs';
import {join} from 'node:path';
import {AppError} from './errors.js';
import type {MessengerService} from './service.js';
import {privateDirectory} from '../storage/private-files.js';
import {MEDIA_LIMITS,type Attachment,type AttachmentRequest} from '../../shared/types.js';
//: Проверяет сигнатуру растрового изображения перед встроенным просмотром.
//: Несоответствие MIME переводит содержимое в обычный скачиваемый файл.
export function safeAttachmentType(attachment:Attachment,head:Buffer):Attachment{
  if(attachment.kind!=='image'){const allowed=attachment.kind==='video'?['video/mp4','video/webm','video/quicktime']:attachment.kind==='audio'?['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav','audio/webm','audio/aac']:[];return allowed.includes(attachment.mimeType||'')?attachment:{...attachment,kind:'file',mimeType:'application/octet-stream'};}
  const valid=attachment.mimeType==='image/jpeg'?head[0]===255&&head[1]===216&&head[2]===255:
    attachment.mimeType==='image/png'?head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    attachment.mimeType==='image/gif'?/^GIF8[79]a$/.test(head.subarray(0,6).toString('ascii')):
    attachment.mimeType==='image/webp'?head.subarray(0,4).toString()==='RIFF'&&head.subarray(8,12).toString()==='WEBP':false;
  return valid?attachment:{...attachment,kind:'file',mimeType:'application/octet-stream'};
}
//: Удаляет только отдельный кеш байтов вложений по явной локальной команде.
//: Не затрагивает Telegram-сессию, настройки и SQLite-историю.
export function clearAttachmentCache(directory:string){
  const path=join(directory,'attachments');let names:string[];try{names=readdirSync(path);}catch{return;}
  for(const name of names)if(/^[a-f0-9]{64}(?:\.bin|\.[a-f0-9-]+\.part)$/.test(name))unlinkSync(join(path,name));
}
//: Кеширует запрошенные медиа на диске ограниченными потоками.
//: Доступ проверяется до кеша, после загрузки и при отдаче; публичных файловых URL нет.
export class AttachmentService {
  private directory:string;
  private active=0;
  private protectedKeys=new Map<string,number>();
  //: Открывает приватную директорию кеша и удаляет незаконченные файлы прошлого процесса.
  //: Размер файла, общий объём и параллелизм ограничиваются независимо от SDK.
  constructor(private core:MessengerService,directory:string,private limits:{fileBytes:number;cacheBytes:number;parallel:number;cacheFiles:number}={...MEDIA_LIMITS}){
    this.directory=privateDirectory(join(directory,'attachments'));
    for(const name of readdirSync(this.directory))if(/^[a-f0-9]{64}\.[a-f0-9-]+\.part$/.test(name))unlinkSync(join(this.directory,name));
  }
  //: Возвращает готовый файл только проверенного вложения, либо потоково заполняет кеш.
  //: Освобождение слота обязательно после HTTP-ответа; частичный файл не становится готовым.
  async open(input:AttachmentRequest,signal:AbortSignal,authorize:()=>void){
    authorize();const original=this.core.attachmentMessage(input);const previous=original.attachments.find(a=>a.id===input.attachmentId)!;
    if(previous.downloadable===false)throw new AppError(415,'Это вложение доступно только в Telegram.');
    if(this.active>=this.limits.parallel)throw new AppError(429,'Уже загружаются два вложения. Дождитесь завершения.');
    const key=createHash('sha256').update(JSON.stringify([original.sourceId,input.conversationId,input.messageId,input.attachmentId,original.editedAt||original.date])).digest('hex');
    const path=join(this.directory,key+'.bin');let released=false;this.active++;this.protectedKeys.set(key,(this.protectedKeys.get(key)||0)+1);
    //: Освобождает слот ровно один раз после завершения или прерывания ответа.
    //: Файлы активных ответов не удаляются сборщиком кеша.
    const release=()=>{if(released)return;released=true;this.active--;const count=(this.protectedKeys.get(key)||1)-1;if(count)this.protectedKeys.set(key,count);else this.protectedKeys.delete(key);};
    //: Повторно проверяет веб-сессию, выбор и неизменность сообщения.
    //: Снятие галочки, выход и удаление прекращают передачу без чтения чужого диалога.
    const assertAllowed=()=>{signal.throwIfAborted();authorize();const current=this.core.attachmentMessage(input);if(current.editedAt!==original.editedAt)throw new AppError(409,'Сообщение изменилось. Откройте вложение заново.');};
    const temp=join(this.directory,`${key}.${randomUUID()}.part`);
    try{
      assertAllowed();
      const cached=await lstat(path).catch(()=>undefined);
      if(cached?.isFile()&&cached.size<=this.limits.fileBytes&&cached.size===previous.size&&previous.kind!=='unsupported'){
        assertAllowed();const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const header=Buffer.alloc(16);let count=0;try{count=(await handle.read(header,0,16,0)).bytesRead;}finally{await handle.close();}const attachment=safeAttachmentType({...previous,size:cached.size},header.subarray(0,count));this.core.attachmentMetadata(input,original,attachment);await utimes(path,new Date(),new Date());await this.trim();assertAllowed();return {path,attachment,assertAllowed,release};
      }
      if(previous.size!==undefined&&previous.size>this.limits.fileBytes)throw new AppError(413,'Вложения больше 32 МБ пока открываются в Telegram.');
      const content=await this.core.attachmentContent(input,signal);assertAllowed();
      if(content.attachment.size!==undefined&&content.attachment.size>this.limits.fileBytes)throw new AppError(413,'Вложения больше 32 МБ пока открываются в Telegram.');
      const handle=await open(temp,'wx',0o600);let size=0;let head=Buffer.alloc(0);
      try{
        for await(const chunk of content.chunks){assertAllowed();size+=chunk.length;if(size>this.limits.fileBytes)throw new AppError(413,'Вложения больше 32 МБ пока открываются в Telegram.');if(head.length<16)head=Buffer.concat([head,Buffer.from(chunk.subarray(0,16-head.length))]);await handle.writeFile(chunk);}
        assertAllowed();if(content.attachment.size!==undefined&&size!==content.attachment.size)throw new AppError(503,'Вложение загружено не полностью. Повторите открытие.');
        await handle.sync();
      }finally{await handle.close();}
      const attachment={...safeAttachmentType(content.attachment,head),size,downloadable:true};
      this.core.attachmentMetadata(input,original,attachment);assertAllowed();await rename(temp,path);await this.trim();assertAllowed();
      return {path,attachment,assertAllowed,release};
    }catch(error){release();if(error instanceof AppError)throw error;if(signal.aborted)throw new AppError(408,'Загрузка вложения прервана.');throw new AppError(503,'Не удалось загрузить вложение. Повторите открытие.');}
    finally{await unlink(temp).catch(()=>{});}
  }
  //: Удаляет самые давно открывавшиеся файлы при превышении бюджета диска.
  //: Активные файлы защищены; SQLite-история и архив исключённых диалогов не меняются.
  private async trim(){
    const files:{name:string;size:number;time:number}[]=[];
    for(const name of await readdir(this.directory))if(/^[a-f0-9]{64}\.bin$/.test(name)){const info=await lstat(join(this.directory,name)).catch(()=>undefined);if(info?.isFile())files.push({name,size:info.size,time:info.mtimeMs});}
    let size=files.reduce((n,f)=>n+f.size,0);let count=files.length;
    for(const file of files.sort((a,b)=>a.time-b.time)){if(size<=this.limits.cacheBytes&&count<=this.limits.cacheFiles)break;if(this.protectedKeys.has(file.name.slice(0,64)))continue;await unlink(join(this.directory,file.name)).catch(()=>{});size-=file.size;count--;}
  }
}
