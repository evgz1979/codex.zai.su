import {useEffect,useRef,useState} from 'react';
import type {Conversation} from '../../shared/types';
import {ApiError,avatarData} from './api';
const photos=new Map<string,Blob>();
//: Очищает оперативные фото при смене или завершении веб-входа.
//: Данные не записываются в браузерное хранилище и не переживают перезагрузку.
export function clearAvatars(){photos.clear();}
//: Показывает круглое фото возле видимой области либо устойчивые цветные инициалы.
//: Запрос отменяется при уходе, object URL освобождается; 401 передаётся владельцу входа.
export default function Avatar({conversation,onUnauthorized}:{conversation:Conversation;onUnauthorized(error:unknown):void}){
  const element=useRef<HTMLSpanElement>(null);const [source,setSource]=useState<string>();
  const fail=useRef(onUnauthorized);fail.current=onUnauthorized;
  const {id,title,avatarVersion}=conversation;
  const tone=[...id].reduce((value,char)=>value+char.codePointAt(0)!,0)%6;
  const initials=title.trim().split(/\s+/u).slice(0,2).map(word=>[...word][0]).join('').toLocaleUpperCase();
  useEffect(()=>{
    setSource(undefined);if(!avatarVersion||!element.current)return;
    const controller=new AbortController();let url:string|undefined;let started=false;
    //: Загружает фотографию один раз при приближении к видимой области.
    //: Кеш по ID и версии ограничен 64 Blob; ошибки фото оставляют инициалы.
    async function load(){
      if(started)return;started=true;
      try{
        const key=`${id}/${avatarVersion}`;const blob=photos.get(key)||await avatarData(id,controller.signal);if(controller.signal.aborted)return;
        photos.delete(key);photos.set(key,blob);while(photos.size>64)photos.delete(photos.keys().next().value!);
        url=URL.createObjectURL(blob);setSource(url);
      }catch(error){if(!controller.signal.aborted&&error instanceof ApiError&&error.status===401)fail.current(error);}
    }
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();void load();}},{rootMargin:'100px'});observer.observe(element.current);
    return()=>{observer.disconnect();controller.abort();if(url)URL.revokeObjectURL(url);};
  },[id,avatarVersion]);
  return <span ref={element} className={`avatar tone-${tone}`}><span aria-hidden="true">{initials}</span>{source&&<img src={source} alt={`Фото: ${title}`} onError={()=>setSource(undefined)}/>}</span>;
}
