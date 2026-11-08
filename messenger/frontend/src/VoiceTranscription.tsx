import {useEffect,useState} from 'react';
import type {AttachmentRequest,VoiceTranscription as Transcript} from '../../shared/types';
import {api,ApiError} from './api';
//: Показывает кнопку голосового и полученный текст под сообщением.
//: Запуск явный; ожидающее задание возобновляется из кеша, уход отменяет HTTP-опрос.
export default function VoiceTranscription({request,value,offline=false,onUnauthorized}:{request:AttachmentRequest;value?:Transcript;offline?:boolean;onUnauthorized(error:ApiError):void}){
  const [transcription,setTranscription]=useState(value);
  const [attempt,setAttempt]=useState(value?.pending?1:0);
  const [busy,setBusy]=useState(!!value?.pending);
  const [error,setError]=useState('');
  const key=JSON.stringify([request.conversationId,request.messageId,request.attachmentId]);
  useEffect(()=>{if(value){setTranscription(previous=>previous?.pending===false&&value.pending?previous:value);if(!value.pending){setError('');setBusy(false);}}},[value?.text,value?.pending]);
  useEffect(()=>{
    if(offline){setBusy(false);return;}if(!attempt||value?.pending===false)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;const started=Date.now();
    setBusy(true);setError('');
    //: Читает состояние только выбранного голосового, пока Telegram готовит текст.
    //: После двух минут предлагает ручное продолжение; ошибки не повторяются автоматически.
    async function poll(){
      try{
        const result=await api<Transcript>('transcribe',request,controller.signal);
        if(controller.signal.aborted)return;
        setTranscription(result);
        if(!result.pending){setBusy(false);return;}
        if(Date.now()-started>=120000){setError('Telegram ещё готовит расшифровку. Можно проверить позже.');setBusy(false);return;}
        timer=setTimeout(()=>void poll(),3000);
      }catch(error){
        if(controller.signal.aborted)return;
        setBusy(false);setError(error instanceof Error?error.message:'Не удалось получить расшифровку.');
        if(error instanceof ApiError&&error.status===401)onUnauthorized(error);
      }
    }
    void poll();return()=>{controller.abort();clearTimeout(timer);};
  },[attempt,key,value?.pending===false,offline]);
  return <div className="voice-transcription" aria-label="Расшифровка голосового">
    {(!transcription||transcription.pending)&&<button type="button" className="transcribe-button" disabled={busy||offline} onClick={()=>setAttempt(old=>old+1)}>{busy?'Расшифровка…':error?'Повторить расшифровку':'Расшифровать'}</button>}
    <div aria-live="polite" aria-atomic="true">
      {transcription&&(transcription.text?<><span className="transcription-caption">Расшифровка</span><p className="transcription-text">{transcription.text}</p></>:!transcription.pending&&<p className="transcription-empty">Речь не распознана.</p>)}
      {error&&<p className="transcription-error" role="alert">{error}</p>}
    </div>
  </div>;
}
