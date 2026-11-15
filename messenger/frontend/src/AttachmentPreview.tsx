import {useEffect,useRef,useState} from 'react';
import type {Attachment,AttachmentRequest} from '../../shared/types';
import {ApiError} from './api';
import {previewData} from './previews';
//: Определяет, занимает ли вложение ширину пузыря.
//: Правило одинаково для встроенного JPEG и миниатюры по отдельному запросу.
export function attachmentHasPreview(a:Attachment){return !!a.thumbnailJpeg||(a.downloadable!==false&&a.hasPreview!==false&&(a.kind==='image'||a.kind==='video'||a.kind==='unsupported'||a.hasPreview===true));}
//: Показывает небольшую миниатюру только рядом с видимой областью ленты.
//: Оригинал открывается отдельным действием; уход с экрана отменяет запрос и отзывает URL.
export default function AttachmentPreview({attachment:a,request,version,paused,onOpen,onUnauthorized}:{attachment:Attachment;request:AttachmentRequest;version:string;paused:boolean;onOpen():void;onUnauthorized(error:ApiError):void}){
  const button=useRef<HTMLButtonElement>(null);const [visible,setVisible]=useState(false);const [url,setUrl]=useState<string>();
  const [width,setWidth]=useState(210);
  const inline=a.thumbnailJpeg?`data:image/jpeg;base64,${a.thumbnailJpeg}`:undefined;
  const preview=inline||url;
  const mayPreview=attachmentHasPreview(a);const fetchPreview=mayPreview&&!inline;
  const key=JSON.stringify([request.conversationId,request.messageId,request.attachmentId,version]);
  useEffect(()=>{
    if(!fetchPreview)return;const element=button.current!;
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{root:element.closest('.feed'),rootMargin:'160px'});observer.observe(element);return()=>observer.disconnect();
  },[fetchPreview,key]);
  useEffect(()=>{
    if(!fetchPreview||!visible||paused)return;const controller=new AbortController();let disposed=false;let objectUrl:string|undefined;setUrl(undefined);
    previewData(request,version,controller.signal).then(result=>{if(disposed)return;objectUrl=URL.createObjectURL(result.blob);setUrl(objectUrl);}).catch(error=>{if(!disposed&&!controller.signal.aborted&&error instanceof ApiError&&error.status===401)onUnauthorized(error);});
    return()=>{disposed=true;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);setUrl(undefined);};
  },[fetchPreview,visible,paused,key]);
  return <button ref={button} className={`attachment attachment-button${mayPreview?' attachment-preview':''}${a.isVoice?' attachment-voice':''}`} onClick={onOpen} aria-label={a.isVoice?'Открыть голосовое сообщение':`Открыть вложение: ${a.name}`}>
    {mayPreview?<span className={`attachment-thumb-surface${preview?'':' attachment-thumb-placeholder'}`}>
      {preview?<img src={preview} alt={inline&&a.kind==='image'?'Фото':inline&&a.kind==='video'?'Кадр видео':`Миниатюра: ${a.name}`} width={width} loading={inline?'lazy':'eager'} onError={()=>setUrl(undefined)} onLoad={event=>{
        const {naturalWidth,naturalHeight}=event.currentTarget;if(naturalHeight)setWidth(Math.max(1,Math.min(218,Math.round(320*naturalWidth/naturalHeight))));
      }}/>:<span aria-hidden="true">{a.kind==='video'?'▷':'▧'}</span>}
      {preview&&a.kind==='video'&&a.downloadable!==false&&<span className="attachment-thumb-play" aria-hidden="true">▶</span>}
    </span>:<span aria-hidden="true">{a.isVoice?'▶':a.kind==='audio'?'♪':'▤'}</span>}
    {(!mayPreview||a.kind==='file')&&<span className="attachment-thumb-label">{a.isVoice?'Голосовое':a.name}{!a.isVoice&&a.size!==undefined&&<small>{Math.ceil(a.size/1024)} КБ</small>}</span>}
  </button>;
}
