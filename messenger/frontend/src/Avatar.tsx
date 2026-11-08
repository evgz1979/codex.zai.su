import {useEffect,useRef,useState} from 'react';
import type {Conversation} from '../../shared/types';
import {ApiError,avatarData} from './api';
const photos=new Map<string,Blob>();
const lanes:Promise<unknown>[]=[Promise.resolve(),Promise.resolve()];
let nextLane=0;
let generation=0;
//: Очищает оперативные фото при смене или завершении веб-входа.
//: Поколение запрещает позднему запросу вернуть фото в кеш после выхода.
export function clearAvatars(){generation++;photos.clear();}
//: Ограничивает загрузку фото двумя запросами и повторно использует до 64 Blob.
//: Отменённая очередь не обращается к API; данные разных поколений входа не смешиваются.
function queuedPhoto(id:string,version:string,signal:AbortSignal,refresh=false){
  signal.throwIfAborted();const key=`${id}/${version}`;const old=refresh?undefined:photos.get(key);if(old){photos.delete(key);photos.set(key,old);return Promise.resolve(old);}
  const epoch=generation;const lane=nextLane++%lanes.length;
  const task=lanes[lane].then(async()=>{
    signal.throwIfAborted();if(epoch!==generation)throw new DOMException('Вход изменился','AbortError');
    const cached=refresh?undefined:photos.get(key);if(cached){photos.delete(key);photos.set(key,cached);return cached;}
    const blob=await avatarData(id,signal,refresh);signal.throwIfAborted();if(epoch!==generation)throw new DOMException('Вход изменился','AbortError');
    photos.set(key,blob);while(photos.size>64)photos.delete(photos.keys().next().value!);return blob;
  });
  lanes[lane]=task.catch(()=>{});return task;
}
//: Показывает фото возле видимой области, повторяет временные ошибки и сохраняет готовое фото.
//: Новая версия заменяет старую после декодирования; уход отменяет запросы и таймеры.
export default function Avatar({conversation,onUnauthorized}:{conversation:Conversation;onUnauthorized(error:unknown):void}){
  const element=useRef<HTMLSpanElement>(null);const [source,setSource]=useState<{id:string;url:string}>();
  const fail=useRef(onUnauthorized);fail.current=onUnauthorized;
  const {id,title,avatarVersion,avatarThumbnail}=conversation;
  const [badThumbnail,setBadThumbnail]=useState<string>();const [reload,setReload]=useState(0);const force=useRef(false);
  const thumbnail=avatarThumbnail&&avatarThumbnail!==badThumbnail&&avatarThumbnail.length<=12000&&/^[a-zA-Z0-9+/]+={0,2}$/.test(avatarThumbnail)?`data:image/jpeg;base64,${avatarThumbnail}`:undefined;
  const tone=[...id].reduce((value,char)=>value+char.codePointAt(0)!,0)%6;
  const initials=title.trim().split(/\s+/u).slice(0,2).map(word=>[...word][0]).join('').toLocaleUpperCase();
  useEffect(()=>()=>{if(source)URL.revokeObjectURL(source.url);},[source]);
  useEffect(()=>{
    if(!avatarVersion||!element.current){setSource(undefined);return;}
    const controller=new AbortController();let refresh=force.current;force.current=false;let running=false;let visible=false;let loaded=false;let terminal=false;let attempts=0;let retry:ReturnType<typeof setTimeout>|undefined;
    //: Загружает и декодирует фотографию до смены видимого изображения.
    //: Временный отказ получает три быстрых повтора, затем паузу 30 с; постоянные отказы не повторяются.
    async function load(){
      if(running||loaded||terminal||!visible||document.hidden||controller.signal.aborted)return;
      running=true;clearTimeout(retry);let url:string|undefined;
      try{
        const blob=await queuedPhoto(id,avatarVersion!,controller.signal,refresh);controller.signal.throwIfAborted();
        url=URL.createObjectURL(blob);const picture=new Image();picture.src=url;
        try{await picture.decode();}catch(error){photos.delete(`${id}/${avatarVersion}`);refresh=true;throw error;}
        controller.signal.throwIfAborted();loaded=true;setSource({id,url});url=undefined;
      }catch(error){
        if(controller.signal.aborted)return;
        if(error instanceof ApiError&&[401,403,415].includes(error.status)){terminal=true;if(error.status===401)fail.current(error);}
        else{const delay=[1000,3000,10000][attempts++]??30000;retry=setTimeout(()=>{void load();},delay);}
      }finally{if(url)URL.revokeObjectURL(url);running=false;}
    }
    //: Возобновляет незавершённую загрузку после возвращения или восстановления сети.
    //: Готовая фотография и постоянный отказ не вызывают новых запросов.
    const resume=()=>{if(!loaded&&!terminal&&!running){attempts=0;void load();}};
    const observer=new IntersectionObserver(entries=>{
      const previous=visible;visible=entries.some(entry=>entry.isIntersecting);
      if(visible&&!previous)resume();
    },{rootMargin:'100px'});observer.observe(element.current);
    window.addEventListener('online',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return()=>{observer.disconnect();controller.abort();clearTimeout(retry);window.removeEventListener('online',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[id,avatarVersion,reload]);
  const display=source?.id===id?source.url:thumbnail;
  return <span ref={element} className={`avatar tone-${tone}`}><span aria-hidden="true">{initials}</span>{display&&<img src={display} alt={`Фото: ${title}`} onError={()=>{if(display===thumbnail)setBadThumbnail(avatarThumbnail);else{photos.delete(`${id}/${avatarVersion}`);force.current=true;setSource(undefined);setReload(value=>value+1);}}}/>}</span>;
}
