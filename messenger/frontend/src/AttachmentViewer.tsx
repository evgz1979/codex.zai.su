import {useEffect,useId,useRef,useState,useMemo} from 'react';
import type {Attachment,AttachmentRequest} from '../../shared/types';
import {ApiError,attachmentData} from './api';
//: Открывает локальный Blob фотографии, видео или аудио после защищённой загрузки.
//: PDF открывается браузером, текст выводится безопасно; закрытие отзывает object URL.
export default function AttachmentViewer({request,onClose,onUnauthorized}:{request:AttachmentRequest;onClose():void;onUnauthorized(error:ApiError):void}){
  const dialog=useRef<HTMLDialogElement>(null);const title=useId();const close=useRef<HTMLButtonElement>(null);
  const [opened,setOpened]=useState<{url:string;attachment:Attachment;blob:Blob;text?:string}>();const [error,setError]=useState('');const [playbackError,setPlaybackError]=useState(false);const [shareError,setShareError]=useState('');
  useEffect(()=>{
    const element=dialog.current!;element.showModal();close.current?.focus();const controller=new AbortController();let url:string|undefined;let disposed=false;
    attachmentData(request,controller.signal).then(async result=>{
      if(disposed)return;
      const readable=result.attachment.mimeType==='application/pdf'||result.attachment.mimeType==='text/plain';
      const blob=result.attachment.kind==='file'&&!readable?new Blob([result.blob],{type:'application/octet-stream'}):result.blob;
      url=URL.createObjectURL(blob);const text=result.attachment.mimeType==='text/plain'?await result.blob.slice(0,1024*1024).text():undefined;if(disposed){URL.revokeObjectURL(url);return;}setOpened({url,attachment:result.attachment,blob,text});
    }).catch(cause=>{if(disposed||controller.signal.aborted)return;if(cause instanceof ApiError&&cause.status===401){onUnauthorized(cause);return;}setError(cause instanceof ApiError?cause.message:'Не удалось загрузить вложение. Повторите открытие.');});
    return()=>{disposed=true;controller.abort();element.close();if(url)URL.revokeObjectURL(url);};
  },[request]);
  const a=opened?.attachment;
  const shareFile=useMemo(()=>opened?new File([opened.blob],opened.attachment.name,{type:opened.blob.type}):undefined,[opened]);
  let canShare=false;try{canShare=!!shareFile&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[shareFile]});}catch{/* Недоступное системное меню скрыто. */}
  const canOpen=!!a&&(a.kind!=='file'||['application/pdf','text/plain'].includes(a.mimeType||''));
  //: Открывает только штатное системное меню передачи файла по нажатию владельца.
  //: Отмена не является ошибкой; приложение не выбирает внешнего адресата автоматически.
  async function share(){if(!shareFile)return;try{await navigator.share({files:[shareFile],title:a?.name});}catch(cause){if(!(cause&&typeof cause==='object'&&'name' in cause&&cause.name==='AbortError'))setShareError('Не удалось открыть системное меню.');}}

  return <dialog ref={dialog} className="media-viewer" aria-labelledby={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <header><h2 id={title}>{a?.name||'Вложение'}</h2><button ref={close} className="icon-button" aria-label="Закрыть вложение" onClick={onClose}>✕</button></header>
    <div className="media-content">
      {error?<p className="error" role="alert">{error}</p>:!opened?<p role="status">Загрузка вложения…</p>:<>
        {a?.kind==='image'&&<img src={opened.url} alt={a.name} onError={()=>setPlaybackError(true)}/>}
        {a?.kind==='video'&&<video src={opened.url} controls playsInline preload="metadata" onError={()=>setPlaybackError(true)}/>}
        {a?.kind==='audio'&&<audio src={opened.url} controls preload="metadata" onError={()=>setPlaybackError(true)}/>}
        {a?.kind==='file'&&a.mimeType==='application/pdf'&&<p><a className="media-open-primary" href={opened.url} target="_blank" rel="noopener noreferrer">Открыть PDF</a></p>}
        {opened.text!==undefined&&<pre className="media-text">{opened.text}</pre>}
        {a?.kind==='file'&&!['application/pdf','text/plain'].includes(a.mimeType||'')&&<p>Откройте системное меню или сохраните файл для просмотра.</p>}
        {shareError&&<p role="status">{shareError}</p>}
        {playbackError&&<p role="status">Браузер не смог воспроизвести вложение. Скачайте файл.</p>}
      </>}
    </div>
    {opened&&<footer><span>{Math.ceil(opened.attachment.size!/1024)} КБ</span><span className="media-actions">{canOpen&&<a href={opened.url} target="_blank" rel="noopener noreferrer">Открыть отдельно</a>}{canShare&&<button onClick={share}>Поделиться…</button>}<a className="media-download-secondary" href={opened.url} download={opened.attachment.name}>Скачать</a></span></footer>}
  </dialog>;
}
