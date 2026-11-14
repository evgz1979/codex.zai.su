import {useEffect,useRef,type RefObject} from 'react';
import {comparePosition,type Message} from '../../shared/types';

//: Подтверждает сообщения, видимые в активной ленте не менее 600 мс.
//: Скрытая вкладка, меню, загрузка и перекрывающий просмотр не отмечают переписку.
export function useVisibleReads(feed:RefObject<HTMLDivElement|null>,messages:Message[],enabled:boolean,acknowledge:(message:Message)=>Promise<void>){
  const confirmed=useRef(new Map<string,Message>());const failed=useRef(new Map<string,{id:string;at:number}>());const sending=useRef(false);const callback=useRef(acknowledge);callback.current=acknowledge;
  useEffect(()=>{
    if(!enabled)return;
    const element=feed.current;if(!element)return;
    let disposed=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const known=new Map(messages.map(message=>[message.id,message]));
    //: Проверяет активность окна перед отсчётом и перед отправкой запроса.
    //: У iOS-приложения с домашнего экрана активность определяется видимостью.
    const active=()=>!disposed&&!document.hidden&&(document.hasFocus()||(navigator as Navigator&{standalone?:boolean}).standalone===true);
    //: Выбирает последнюю реально видимую позицию каждого диалога.
    //: Высокое сообщение достаточно видеть на 80 px; вне viewport оно не считается.
    function visible(){
      const positions=new Map<string,Message>();const root=element!.getBoundingClientRect();
      const viewport=window.visualViewport;const viewportTop=viewport?.offsetTop||0;const viewportLeft=viewport?.offsetLeft||0;
      const top=Math.max(viewportTop,root.top);const bottom=Math.min(viewportTop+(viewport?.height||innerHeight),root.bottom);
      for(const node of element!.querySelectorAll<HTMLElement>('[data-message-id]')){
        const message=known.get(node.dataset.messageId||'');if(!message)continue;
        const box=node.getBoundingClientRect();const height=Math.min(box.bottom,bottom)-Math.max(box.top,top);
        if(box.height<=0||height<Math.min(80,box.height/2)||box.right<=viewportLeft||box.left>=viewportLeft+(viewport?.width||innerWidth))continue;
        const current=positions.get(message.conversationId);if(!current||comparePosition(message,current)>0)positions.set(message.conversationId,message);
      }
      return [...positions.values()];
    }
    //: Сохраняет просмотр последовательно и не подтверждает скрытые поздние страницы.
    //: Ошибка оставляет позицию для следующего посещения без частых повторов RPC.
    async function flush(){
      if(!active())return;
      if(sending.current){schedule();return;}sending.current=true;
      try{for(const message of visible()){
        if(!active())break;
        const previous=confirmed.current.get(message.conversationId);
        const failure=failed.current.get(message.conversationId);
        if(previous&&comparePosition(previous,message)>=0||failure?.id===message.id&&Date.now()-failure.at<30000)continue;
        try{await callback.current(message);confirmed.current.set(message.conversationId,message);failed.current.delete(message.conversationId);}catch{failed.current.set(message.conversationId,{id:message.id,at:Date.now()});}
      }}finally{sending.current=false;}
    }
    //: Откладывает подтверждение до остановки прокрутки и возвращения фокуса.
    //: Один таймер отменяется при скрытии страницы и очистке эффекта.
    function schedule(){clearTimeout(timer);if(active())timer=setTimeout(()=>{void flush();},600);}
    element.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);window.addEventListener('focus',schedule);window.addEventListener('blur',schedule);document.addEventListener('visibilitychange',schedule);schedule();
    window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
    return()=>{disposed=true;clearTimeout(timer);element.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);window.removeEventListener('focus',schedule);window.removeEventListener('blur',schedule);document.removeEventListener('visibilitychange',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);};
  },[feed,messages,enabled]);
}
