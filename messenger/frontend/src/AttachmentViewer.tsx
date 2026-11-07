import {useEffect,useId,useRef,useState} from 'react';
import type {Attachment,AttachmentRequest} from '../../shared/types';
import {ApiError,attachmentData} from './api';
//: Открывает локальный Blob фотографии, видео или аудио после защищённой загрузки.
//: Остальные файлы только скачиваются; закрытие отменяет запрос и отзывает object URL.
export default function AttachmentViewer({request,onClose,onUnauthorized}:{request:AttachmentRequest;onClose():void;onUnauthorized(error:ApiError):void}){
  const dialog=useRef<HTMLDialogElement>(null);const title=useId();const close=useRef<HTMLButtonElement>(null);
  const [opened,setOpened]=useState<{url:string;attachment:Attachment}>();const [error,setError]=useState('');const [playbackError,setPlaybackError]=useState(false);
  useEffect(()=>{
    const element=dialog.current!;element.showModal();close.current?.focus();const controller=new AbortController();let url:string|undefined;let disposed=false;
    attachmentData(request,controller.signal).then(result=>{
      if(disposed)return;
      const blob=result.attachment.kind==='file'?new Blob([result.blob],{type:'application/octet-stream'}):result.blob;
      url=URL.createObjectURL(blob);setOpened({url,attachment:result.attachment});
    }).catch(cause=>{if(disposed||controller.signal.aborted)return;if(cause instanceof ApiError&&cause.status===401){onUnauthorized(cause);return;}setError(cause instanceof ApiError?cause.message:'Не удалось загрузить вложение. Повторите открытие.');});
    return()=>{disposed=true;controller.abort();element.close();if(url)URL.revokeObjectURL(url);};
  },[request]);
  const a=opened?.attachment;
  return <dialog ref={dialog} className="media-viewer" aria-labelledby={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <header><h2 id={title}>{a?.name||'Вложение'}</h2><button ref={close} className="icon-button" aria-label="Закрыть вложение" onClick={onClose}>✕</button></header>
    <div className="media-content">
      {error?<p className="error" role="alert">{error}</p>:!opened?<p role="status">Загрузка вложения…</p>:<>
        {a?.kind==='image'&&<img src={opened.url} alt={a.name} onError={()=>setPlaybackError(true)}/>}
        {a?.kind==='video'&&<video src={opened.url} controls playsInline preload="metadata" onError={()=>setPlaybackError(true)}/>}
        {a?.kind==='audio'&&<audio src={opened.url} controls preload="metadata" onError={()=>setPlaybackError(true)}/>}
        {a?.kind==='file'&&<p>Файл готов к скачиванию.</p>}
        {playbackError&&<p role="status">Браузер не смог воспроизвести вложение. Скачайте файл.</p>}
      </>}
    </div>
    {opened&&<footer><span>{Math.ceil(opened.attachment.size!/1024)} КБ</span><a href={opened.url} download={opened.attachment.name}>Скачать</a></footer>}
  </dialog>;
}
