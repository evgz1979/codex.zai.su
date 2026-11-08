import {useEffect,useRef} from 'react';

//: Уточняет значок приложения и закрывает уведомления после прочтения всех входящих.
//: Ошибки необязательных API не меняют вход, подписку и счётчики переписки.
export async function synchronizeBadge(count:number){
  try{if(count===0&&'clearAppBadge' in navigator)await navigator.clearAppBadge();else if('setAppBadge' in navigator)await navigator.setAppBadge(count);}catch{/* Системная настройка может запрещать значок. */}
  if(count===0&&'serviceWorker' in navigator){try{const worker=await navigator.serviceWorker.getRegistration('/');for(const notification of await worker?.getNotifications()||[])if(notification.tag!=='messenger-test')notification.close();}catch{/* API уведомлений необязателен. */}}
}
//: Обновляет значок при возврате в приложение и после позднего push.
//: Не использует устаревшее число из замыкания и не хранит переписку в worker.
export function useAppBadge(count:number,authenticated:boolean){
  const latest=useRef(count);latest.current=count;
  useEffect(()=>{
    if(!authenticated)return;
    //: Повторно устанавливает актуальное число в видимом приложении.
    //: Сам факт открытия не помечает невидимые сообщения прочитанными.
    const update=()=>{if(!document.hidden)void synchronizeBadge(latest.current);};
    //: Обрабатывает запрос Service Worker после доставки push при открытом окне.
    //: Другие сообщения worker игнорируются.
    const message=(event:MessageEvent)=>{if(event.data?.type==='messenger:badge-refresh')update();};
    window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);navigator.serviceWorker?.addEventListener?.('message',message);update();
    return()=>{window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);navigator.serviceWorker?.removeEventListener?.('message',message);};
  },[authenticated]);
  useEffect(()=>{if(authenticated&&!document.hidden)void synchronizeBadge(count);},[count,authenticated]);
}
