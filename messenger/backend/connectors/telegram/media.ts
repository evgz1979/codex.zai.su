import {Api} from 'teleproto';
import {entityId,type Attachment} from '../../../shared/types.js';
//: Очищает отображаемое имя файла без использования его как пути.
//: Удаляет управляющие символы, компоненты каталогов и ограничивает длину.
export function attachmentName(name:string){return [...name.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim()].slice(0,180).join('')||'Файл';}
//: Оставляет только безопасные встроенные форматы браузерного просмотра.
//: SVG, HTML и произвольные документы остаются скачиваемыми файлами.
export function attachmentKind(mime:string):Attachment['kind']{
  if(['image/jpeg','image/png','image/gif','image/webp'].includes(mime))return 'image';
  if(['video/mp4','video/webm','video/quicktime'].includes(mime))return 'video';
  if(['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav','audio/webm','audio/aac'].includes(mime))return 'audio';
  return 'file';
}
//: Преобразует только безопасные метаданные Telegram-вложения в общий DTO.
//: Native file reference, access_hash и самоуничтожающиеся медиа в DTO не попадают.
export function telegramAttachments(source:string,conversation:string,message:Api.Message):Attachment[]{
  const media=message.media;if(!media||media instanceof Api.MessageMediaWebPage)return [];
  const id=entityId(source,'attachment',`${conversation}/${message.id}`);
  if((media instanceof Api.MessageMediaPhoto||media instanceof Api.MessageMediaDocument)&&media.ttlSeconds)return [{id,kind:'unsupported',name:'Временное вложение · Telegram',downloadable:false}];
  if(media instanceof Api.MessageMediaPhoto&&media.photo instanceof Api.Photo){
    const size=media.photo.sizes.at(-1);const bytes=size instanceof Api.PhotoSize?size.size:size instanceof Api.PhotoSizeProgressive?size.sizes.at(-1):size instanceof Api.PhotoCachedSize?size.bytes.length:undefined;
    return [{id,kind:'image',name:`Фото ${message.id}.jpg`,mimeType:'image/jpeg',size:bytes,downloadable:true}];
  }
  if(media instanceof Api.MessageMediaDocument&&media.document instanceof Api.Document){
    const doc=media.document;const mime=doc.mimeType.toLowerCase().split(';')[0].trim();const filename=doc.attributes.find((a):a is Api.DocumentAttributeFilename=>a instanceof Api.DocumentAttributeFilename)?.fileName;
    const kind=attachmentKind(mime);const extension:Record<string,string>={'audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a','audio/wav':'wav','audio/x-wav':'wav','audio/webm':'webm','audio/aac':'aac','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};const label=kind==='audio'?'Аудио':kind==='video'?'Видео':'Файл';const fallback=`${label} ${message.id}.${extension[mime]||'bin'}`;
    const size=Number(doc.size.toString());return [{id,kind,name:attachmentName(filename||fallback),mimeType:kind==='file'?'application/octet-stream':mime,...(Number.isSafeInteger(size)&&size>=0?{size}:{}),downloadable:true}];
  }
  return [{id,kind:'unsupported',name:'Вложение · откройте в Telegram',downloadable:false}];
}
