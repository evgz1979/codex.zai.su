import {useEffect,useRef,useState} from 'react';
import {ApiError} from './api';

//: Описывает открытие по уведомлению либо возвращению в приложение.
//: Общий ID проверяется по актуальному серверному списку перед запросом диалога.
export interface ArrivalIntent {conversationId?:string;explicit:boolean}
//: Связывает состояние чата с очередью переходов при открытии приложения.
//: Обычное возвращение сохраняет текущую переписку, явный клик сохраняет черновики.
interface Options {authenticated:boolean;busy:boolean;blocked:boolean;navigate(intent:ArrivalIntent,signal:AbortSignal):Promise<void>;fail(error:unknown):void}
//: Открывает список при запуске, сохраняет переписку при возврате и принимает клик push.
//: Ручной выбор отменяет поздний переход; новые сообщения в активном окне не переключают адресата.
export function useConversationArrival(options:Options){
  const [opening,setOpening]=useState(true);const current=useRef(options);current.current=options;
  const queued=useRef<ArrivalIntent|undefined>(undefined);const running=useRef<AbortController|undefined>(undefined);const pump=useRef<()=>void>(()=>{});
  const waitingForLogin=useRef(false);
  //: Выполняет последний запрос открытия после завершения отправки или загрузки.
  //: Одна отменяемая операция не допускает применения устаревшего результата.
  pump.current=()=>{
    const state=current.current;if(!state.authenticated||state.busy||waitingForLogin.current||running.current||!queued.current)return;
    const intent=queued.current;queued.current=undefined;
    if(!intent.explicit&&state.blocked){setOpening(false);return;}
    const controller=new AbortController();running.current=controller;setOpening(true);
    void state.navigate(intent,controller.signal).catch(error=>{if(controller.signal.aborted)return;if(error instanceof ApiError&&error.status===401&&intent.explicit){queued.current=intent;waitingForLogin.current=true;}current.current.fail(error);}).finally(()=>{
      if(running.current!==controller)return;running.current=undefined;
      if(queued.current)pump.current();else setOpening(false);
    });
  };
  //: Запоминает приоритетный клик уведомления или обычное открытие.
  //: Автоматический возврат не вытесняет уже выбранное явное уведомление.
  const enqueue=(intent:ArrivalIntent)=>{
    if(!intent.explicit&&(running.current||queued.current?.explicit))return;
    if(intent.explicit){running.current?.abort();running.current=undefined;}
    queued.current=intent;pump.current();
  };
  const enqueueRef=useRef(enqueue);enqueueRef.current=enqueue;
  //: Отменяет переход при ручном выборе диалога или общей ленты.
  //: Не прерывает Telegram-отправку и не удаляет черновики.
  const cancel=()=>{queued.current=undefined;running.current?.abort();running.current=undefined;setOpening(false);};
  const cancelRef=useRef(cancel);cancelRef.current=cancel;
  useEffect(()=>{
    if(!options.authenticated){running.current?.abort();running.current=undefined;if(!queued.current?.explicit)queued.current=undefined;setOpening(true);return;}
    waitingForLogin.current=false;
    const id=new URLSearchParams(location.hash.slice(1)).get('conversation');
    if(queued.current?.explicit)pump.current();else enqueueRef.current({conversationId:id&&id.length<=2048?id:undefined,explicit:!!id});
    let hidden=document.hidden;
    //: Обрабатывает возвращение из фона ровно один раз.
    //: Изменения в уже видимом приложении не создают новых переходов.
    const visibility=()=>{if(document.hidden)hidden=true;else if(hidden){hidden=false;enqueueRef.current({explicit:false});}};
    document.addEventListener('visibilitychange',visibility);
    return()=>{document.removeEventListener('visibilitychange',visibility);running.current?.abort();running.current=undefined;};
  },[options.authenticated]);
  useEffect(()=>{
    //: Принимает команды Service Worker, включая время ожидания веб-входа.
    //: URL не принимается, некорректный или слишком длинный ID игнорируется.
    const message=(event:MessageEvent)=>{
      if(event.data?.type==='messenger:open-latest')enqueueRef.current({explicit:true});
      else if(event.data?.type==='messenger:open-conversation'&&typeof event.data.conversationId==='string'&&event.data.conversationId.length>0&&event.data.conversationId.length<=2048)enqueueRef.current({conversationId:event.data.conversationId,explicit:true});
    };
    navigator.serviceWorker?.addEventListener?.('message',message);
    return()=>{navigator.serviceWorker?.removeEventListener?.('message',message);cancelRef.current();};
  },[]);
  useEffect(()=>{pump.current();},[options.authenticated,options.busy]);
  return {opening,cancel};
}
