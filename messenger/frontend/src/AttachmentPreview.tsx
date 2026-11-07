import {useEffect,useRef,useState} from 'react';
import type {Attachment,AttachmentRequest} from '../../shared/types';
import {ApiError} from './api';
import {previewData} from './previews';
//: Показывает небольшую миниатюру только рядом с видимой областью ленты.
//: Оригинал открывается отдельным действием; уход с экрана отменяет запрос и отзывает URL.
export default function AttachmentPreview({attachment:a,request,version,paused,onOpen,onUnauthorized}:{attachment:Attachment;request:AttachmentRequest;version:string;paused:boolean;onOpen():void;onUnauthorized(error:ApiError):void}){
  const button=useRef<HTMLButtonElement>(null);const [visible,setVisible]=useState(false);const [url,setUrl]=useState<string>();
  const mayPreview=a.hasPreview!==false&&(a.kind==='image'||a.kind==='video'||a.kind==='unsupported'||a.hasPreview===true);
  const key=JSON.stringify([request.conversationId,request.messageId,request.attachmentId,version]);
  useEffect(()=>{
    if(!mayPreview)return;const element=button.current!;
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{root:element.closest('.feed'),rootMargin:'160px'});observer.observe(element);return()=>observer.disconnect();
  },[mayPreview,key]);
  useEffect(()=>{
    if(!mayPreview||!visible||paused)return;const controller=new AbortController();let disposed=false;let objectUrl:string|undefined;setUrl(undefined);
    previewData(request,version,controller.signal).then(result=>{if(disposed)return;objectUrl=URL.createObjectURL(result.blob);setUrl(objectUrl);}).catch(error=>{if(!disposed&&!controller.signal.aborted&&error instanceof ApiError&&error.status===401)onUnauthorized(error);});
    return()=>{disposed=true;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);setUrl(undefined);};
  },[mayPreview,visible,paused,key]);
  return <button ref={button} className={`attachment attachment-button ${mayPreview?'attachment-preview':''}`} onClick={onOpen} aria-label={`Открыть вложение: ${a.name}`}>
    {mayPreview?<span className="attachment-thumb-surface">{url?<img src={url} alt={`Миниатюра: ${a.name}`} onError={()=>setUrl(undefined)}/>:<span aria-hidden="true">{a.kind==='video'?'▷':'▧'}</span>}{url&&a.kind==='video'&&<span className="attachment-thumb-play" aria-hidden="true">▶</span>}</span>:<span aria-hidden="true">{a.kind==='audio'?'♪':'▤'}</span>}
    <span className="attachment-thumb-label">{a.kind==='unsupported'?'Открыть вложение':a.name}{a.size!==undefined&&<small>{Math.ceil(a.size/1024)} КБ</small>}</span>
  </button>;
}
