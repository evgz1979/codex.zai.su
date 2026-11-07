import {createHash,randomUUID} from 'node:crypto';
import {open,rename,unlink,readdir,lstat,utimes,readFile} from 'node:fs/promises';
import {readdirSync,unlinkSync,constants} from 'node:fs';
import {join} from 'node:path';
import {AppError} from './errors.js';
import {telegramAuthIssue} from '../auth/telegram-issue.js';
import type {MessengerService} from './service.js';
import {privateDirectory,writePrivate} from '../storage/private-files.js';
import {MEDIA_LIMITS,type Attachment,type AttachmentRequest} from '../../shared/types.js';
//: Проверяет сигнатуру растрового изображения перед встроенным просмотром.
//: Несоответствие MIME переводит содержимое в обычный скачиваемый файл.
export function safeAttachmentType(attachment:Attachment,head:Buffer):Attachment{
  if(attachment.kind==='file'&&head.toString('latin1').trimStart().startsWith('%PDF-'))return {...attachment,mimeType:'application/pdf'};
  if(attachment.kind==='file'&&/\.(txt|md|log|csv)$/i.test(attachment.name)&&!head.includes(0))return {...attachment,mimeType:'text/plain'};
  if(attachment.kind==='file'&&attachment.mimeType==='text/plain')return attachment;
  if(attachment.kind!=='image'){const allowed=attachment.kind==='video'?['video/mp4','video/webm','video/quicktime']:attachment.kind==='audio'?['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav','audio/webm','audio/aac']:[];return allowed.includes(attachment.mimeType||'')?attachment:{...attachment,kind:'file',mimeType:'application/octet-stream'};}
  const mime=head[0]===255&&head[1]===216&&head[2]===255?'image/jpeg':
    head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':
    /^GIF8[79]a$/.test(head.subarray(0,6).toString('ascii'))?'image/gif':
    head.subarray(0,4).toString()==='RIFF'&&head.subarray(8,12).toString()==='WEBP'?'image/webp':undefined;
  return mime?{...attachment,mimeType:mime}:{...attachment,kind:'file',mimeType:'application/octet-stream'};
}
//: Удаляет только отдельный кеш байтов вложений по явной локальной команде.
//: Не затрагивает Telegram-сессию, настройки и SQLite-историю.
export function clearAttachmentCache(directory:string){
  const path=join(directory,'attachments');let names:string[];try{names=readdirSync(path);}catch{return;}
  for(const name of names)if(/^[a-f0-9]{64}(?:\.bin(?:\.json)?|\.bin\.json\.[a-f0-9]+\.tmp|\.[a-f0-9-]+\.part)$/.test(name))unlinkSync(join(path,name));
}
//: Кеширует запрошенные медиа на диске ограниченными потоками.
//: Доступ проверяется до кеша, после загрузки и при отдаче; публичных файловых URL нет.
export class AttachmentService {
  private directory:string;
  private active=0;
  private lastInteractive=0;
  interruptPreload?:()=>void;
  private protectedKeys=new Map<string,number>();
  //: Открывает приватную директорию кеша и удаляет незаконченные файлы прошлого процесса.
  //: Размер файла, общий объём и параллелизм ограничиваются независимо от SDK.
  constructor(private core:MessengerService,directory:string,private limits:{fileBytes:number;cacheBytes:number;parallel:number;cacheFiles:number}={...MEDIA_LIMITS}){
    this.directory=privateDirectory(join(directory,'attachments'));
    for(const name of readdirSync(this.directory))if(/^[a-f0-9]{64}(?:\.[a-f0-9-]+\.part|\.bin\.json\.[a-f0-9]+\.tmp)$/.test(name))unlinkSync(join(this.directory,name));
  }
  //: Возвращает готовый файл только проверенного вложения, либо потоково заполняет кеш.
  //: Освобождение слота обязательно после HTTP-ответа; частичный файл не становится готовым.
  async open(input:AttachmentRequest,signal:AbortSignal,authorize:()=>void,background=false){
    if(!background){this.lastInteractive=Date.now();this.interruptPreload?.();}
    const preview=input.variant==='preview';const fileLimit=preview?MEDIA_LIMITS.previewBytes:this.limits.fileBytes;
    authorize();const original=this.core.attachmentMessage(input);const previous=original.attachments.find(a=>a.id===input.attachmentId)!;
    if(previous.downloadable===false)throw new AppError(415,'Это вложение доступно только в Telegram.');
    if(this.active>=this.limits.parallel)throw new AppError(429,'Уже загружаются два вложения. Дождитесь завершения.');
    const parts=[original.sourceId,input.conversationId,input.messageId,input.attachmentId,original.editedAt||original.date];if(preview)parts.push('preview');
    const key=createHash('sha256').update(JSON.stringify(parts)).digest('hex');
    const path=join(this.directory,key+'.bin');const metaPath=path+'.json';let fromSource=false;let released=false;this.active++;this.protectedKeys.set(key,(this.protectedKeys.get(key)||0)+1);
    //: Освобождает слот ровно один раз после завершения или прерывания ответа.
    //: Файлы активных ответов не удаляются сборщиком кеша.
    const release=()=>{if(released)return;released=true;signal.removeEventListener('abort',release);this.active--;const count=(this.protectedKeys.get(key)||1)-1;if(count)this.protectedKeys.set(key,count);else this.protectedKeys.delete(key);};
    signal.addEventListener('abort',release,{once:true});
    //: Повторно проверяет веб-сессию, выбор и неизменность сообщения.
    //: Снятие галочки, выход и удаление прекращают передачу без чтения чужого диалога.
    const assertAllowed=()=>{signal.throwIfAborted();authorize();const current=this.core.attachmentMessage(input);if(current.editedAt!==original.editedAt)throw new AppError(409,'Сообщение изменилось. Откройте вложение заново.');};
    const temp=join(this.directory,`${key}.${randomUUID()}.part`);
    try{
      assertAllowed();
      const cached=await lstat(path).catch(()=>undefined);
      let metadata:Attachment|undefined=previous;
      if(preview){let record:Record<string,unknown>|undefined;try{record=JSON.parse(await readFile(metaPath,'utf8'));}catch{/* Незавершённая пара кеша перечитывается у источника. */}if(record?.missing)throw new AppError(415,'Для этого вложения нет миниатюры.');metadata=record?.id===input.attachmentId&&record.kind==='image'&&typeof record.name==='string'&&typeof record.mimeType==='string'&&typeof record.size==='number'?record as unknown as Attachment:undefined;}
      if(cached?.isFile()&&cached.size<=fileLimit&&cached.size===metadata?.size&&metadata.kind!=='unsupported'){
        assertAllowed();const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const header=Buffer.alloc(16);let count=0;try{count=(await handle.read(header,0,16,0)).bytesRead;}finally{await handle.close();}const attachment=safeAttachmentType({...metadata,size:cached.size},header.subarray(0,count));
        if(preview&&attachment.kind!=='image')throw new AppError(415,'Миниатюра недоступна.');
        this.core.attachmentMetadata(input,original,attachment);await utimes(path,new Date(),new Date());assertAllowed();return {path,attachment,assertAllowed,release};
      }
      if(!preview&&previous.size!==undefined&&previous.size>fileLimit)throw new AppError(413,'Вложения больше 32 МБ пока открываются в Telegram.');
      fromSource=true;const content=await this.core.attachmentContent(input,signal);assertAllowed();
      if(content.attachment.size!==undefined&&content.attachment.size>fileLimit)throw new AppError(413,preview?'Миниатюра превышает допустимый размер.':'Вложения больше 32 МБ пока открываются в Telegram.');
      const handle=await open(temp,'wx',0o600);let size=0;let head=Buffer.alloc(0);
      try{
        for await(const chunk of content.chunks){assertAllowed();size+=chunk.length;if(size>fileLimit)throw new AppError(413,preview?'Миниатюра превышает допустимый размер.':'Вложения больше 32 МБ пока открываются в Telegram.');if(head.length<16)head=Buffer.concat([head,Buffer.from(chunk.subarray(0,16-head.length))]);await handle.writeFile(chunk);}
        assertAllowed();if(content.attachment.size!==undefined&&size!==content.attachment.size)throw new AppError(503,'Вложение загружено не полностью. Повторите открытие.');
        await handle.sync();
      }finally{await handle.close();}
      const attachment={...safeAttachmentType(content.attachment,head),size,downloadable:true};if(preview&&attachment.kind!=='image')throw new AppError(415,'Миниатюра недоступна.');
      this.core.attachmentMetadata(input,original,attachment);assertAllowed();await rename(temp,path);if(preview)writePrivate(metaPath,JSON.stringify(attachment));await this.trim();assertAllowed();
      return {path,attachment,assertAllowed,release};
    }catch(error){release();if(preview&&fromSource&&error instanceof AppError&&[404,415].includes(error.status)){try{assertAllowed();writePrivate(metaPath,JSON.stringify({missing:true}));await this.trim();}catch{/* Отзыв доступа не сохраняет результат. */}}if(error instanceof AppError)throw error;if(signal.aborted)throw new AppError(408,'Загрузка вложения прервана.');const wait=telegramAuthIssue(error).retryAfterSeconds;if(wait)throw new AppError(429,'Telegram временно ограничил загрузку вложений.',wait);throw new AppError(503,'Не удалось загрузить вложение. Повторите открытие.');}
    finally{await unlink(temp).catch(()=>{});}
  }
  //: Разрешает один фоновый файл только вне интерактивной загрузки.
  //: Оставляет слот для открытия пользователем и даёт приоритет запросам из ленты.
  canPreload(){return this.active===0&&Date.now()-this.lastInteractive>5000;}
  //: Удаляет самые давно открывавшиеся файлы при превышении бюджета диска.
  //: Активные файлы защищены; SQLite-история и архив исключённых диалогов не меняются.
  private async trim(){
    const files:{name:string;size:number;time:number}[]=[];
    const names=await readdir(this.directory);const binary=new Set(names.filter(n=>/^[a-f0-9]{64}\.bin$/.test(n)));
    for(const name of binary){const info=await lstat(join(this.directory,name)).catch(()=>undefined);if(info?.isFile())files.push({name,size:info.size,time:info.mtimeMs});}
    for(const name of names)if(/^[a-f0-9]{64}\.bin\.json$/.test(name)&&!binary.has(name.slice(0,-5))){const info=await lstat(join(this.directory,name)).catch(()=>undefined);if(info?.isFile())files.push({name:name.slice(0,-5),size:info.size,time:info.mtimeMs});}
    let size=files.reduce((n,f)=>n+f.size,0);let count=files.length;
    for(const file of files.sort((a,b)=>a.time-b.time)){if(size<=this.limits.cacheBytes&&count<=this.limits.cacheFiles)break;if(this.protectedKeys.has(file.name.slice(0,64)))continue;await unlink(join(this.directory,file.name)).catch(()=>{});await unlink(join(this.directory,file.name+'.json')).catch(()=>{});size-=file.size;count--;}
  }
}
