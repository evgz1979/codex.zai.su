import {useEffect,useRef,useState} from 'react';
import {compareConversations,OFFLINE_LIMITS,type OfflineBatch,type Snapshot} from '../../shared/types';
import {api,ApiError} from './api';
//: Подготавливает последние сообщения выбранных чатов без переключения переписки.
//: Одна последовательная очередь читает только SQLite через offline API; уход, offline и выход отменяют её.
export function useOfflinePrefetch(snapshot:Snapshot|undefined,enabled:boolean,onUnauthorized:(error:ApiError)=>void){
  const [progress,setProgress]=useState({ready:0,total:0,pending:false});const fail=useRef(onUnauthorized);fail.current=onUnauthorized;
  const ids=[...(snapshot?.conversations||[])].sort(compareConversations).slice(0,OFFLINE_LIMITS.conversations).map(c=>c.id).sort();const signature=JSON.stringify(ids);
  useEffect(()=>{
    if(!enabled||!ids.length){setProgress({ready:0,total:0,pending:false});return;}
    const controller=new AbortController();let running=false;setProgress({ready:0,total:ids.length,pending:true});
    //: Обновляет головы пакетами по двадцать чатов, не отмечая сообщения прочитанными.
    //: Пустая несинхронизированная история повторяется при следующем проходе через 30 секунд.
    async function fill(){
      if(running||document.hidden||controller.signal.aborted)return;running=true;const ready=new Set<string>();
      try{
        for(let start=0;start<ids.length;start+=OFFLINE_LIMITS.batch){
          if(controller.signal.aborted||document.hidden)return;
          const result=await api<OfflineBatch>('offline',{conversationIds:ids.slice(start,start+OFFLINE_LIMITS.batch)},controller.signal);
          if(controller.signal.aborted)return;for(const id of result.readyIds)ready.add(id);setProgress({ready:ready.size,total:ids.length,pending:ready.size<ids.length});
        }
      }catch(error){if(!controller.signal.aborted&&error instanceof ApiError&&error.status===401)fail.current(error);}finally{running=false;}
    }
    //: Возобновляет подготовку при возвращении в открытое приложение.
    //: Скрытая вкладка не создаёт фоновых обходов или сетевых очередей.
    const resume=()=>{if(!document.hidden)void fill();};
    void fill();const timer=setInterval(resume,OFFLINE_LIMITS.refreshMs);document.addEventListener('visibilitychange',resume);
    return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
  },[enabled,signature]);
  return progress;
}
