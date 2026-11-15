import {LIMITS,type Message} from '../../../shared/types.js';

//: Ограничивает размер JPEG и строки, которую worker читает из модели фото или видео.
//: Лимит 12 000 символов оставляет в сообщении только небольшую миниатюру.
export const JPEG_THUMBNAIL_CHARS=12000;

//: Распознаёт JPEG в поле, где WhatsApp может передать миниатюру вместо подписи.
//: Усечённый base64 тоже распознаётся, чтобы его можно было скрыть из текста.
export function isJpegThumbnail(value:string){
  return /^(?:data:image\/jpeg;base64,)?\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value);
}

//: Отделяет миниатюру WhatsApp от подписи в новых сообщениях и прежней истории.
//: Только полный JPEG в пределах лимита становится миниатюрой фото или видео.
export function whatsappThumbnailMessage(message:Message,body=message.text,caption?:string):Message{
  if(message.sourceId!=='whatsapp')return message;
  const media=message.attachments.find(a=>a.downloadable===false&&a.kind==='unsupported'&&(a.name==='Фото'||a.name==='Видео'));
  if(!media)return message;
  const raw=body.trim();
  const encoded=isJpegThumbnail(raw);
  const base64=encoded?raw.replace(/^data:image\/jpeg;base64,/,''):'';
  const bytes=base64&&base64.length<=JPEG_THUMBNAIL_CHARS?Buffer.from(base64,'base64'):undefined;
  const thumbnailJpeg=bytes&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217?bytes.toString('base64'):undefined;
  const text=caption?.trim()?caption.slice(0,LIMITS.text):encoded?'':message.text;
  return {...message,text,attachments:message.attachments.map(a=>a===media?{...media,kind:media.name==='Фото'?'image':'video',...(thumbnailJpeg?{thumbnailJpeg}:{})}:a)};
}
