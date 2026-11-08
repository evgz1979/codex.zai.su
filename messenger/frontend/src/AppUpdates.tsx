import {useEffect,useRef,useState} from 'react';
//: Передаёт публичную версию приложения и идентификатор конкретной сборки.
//: Данные не связаны с аккаунтом, перепиской или реквизитами.
interface Release {version:string;buildId:string}
//: Подставляется Vite одинаково в JavaScript и version.json.
//: Не читается из браузерного хранилища или параметров адреса.
declare const __MESSENGER_RELEASE__:Release;
const current=__MESSENGER_RELEASE__;
//: Проверяет новую сборку при запуске, возврате и раз в минуту в видимом окне.
//: Перезагрузка происходит только по нажатию; черновики требуют явного подтверждения потери.
export function useAppUpdates(){
  const [latest,setLatest]=useState<Release>();const [applying,setApplying]=useState(false);const [error,setError]=useState('');
  const running=useRef<Promise<Release|undefined>|undefined>(undefined);const controller=useRef<AbortController|undefined>(undefined);const mounted=useRef(true);
  //: Получает публичный файл версии с обходом HTTP-кеша и ограничением времени.
  //: Offline, ошибка и некорректный ответ не запускают перезагрузку.
  function check():Promise<Release|undefined>{
    if(running.current)return running.current;
    const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),10000);
    const request=(async()=>{
      try{
        const response=await fetch(`/version.json?_=${Date.now()}`,{cache:'no-store',credentials:'omit',signal:abort.signal});if(!response.ok)return;
        const release=await response.json() as Partial<Release>;
        if(typeof release.version!=='string'||release.version.length>32||typeof release.buildId!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(release.buildId))return;
        const result=release as Release;if(mounted.current)setLatest(result);return result;
      }catch{return undefined;}finally{clearTimeout(timer);running.current=undefined;}
    })();running.current=request;return request;
  }
  useEffect(()=>{
    mounted.current=true;
    //: Проверяет версию при возвращении без автоматической навигации.
    //: Скрытое приложение не опрашивает сервер и сохраняет текущий экран.
    const resume=()=>{if(!document.hidden)void check();};
    resume();const timer=setInterval(resume,60000);window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);window.addEventListener('pageshow',resume);
    return()=>{mounted.current=false;controller.current?.abort();clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);window.removeEventListener('pageshow',resume);};
  },[]);
  //: Перезагружает тот же личный адрес с уникальным параметром после сетевой проверки.
  //: Cookie, manifest и push-подписки не удаляются; отмена предупреждения сохраняет черновики.
  async function apply(hasDrafts:boolean){
    if(applying)return;
    if(hasDrafts&&!window.confirm('При обновлении несохранённые черновики будут удалены. Обновить приложение?'))return;
    setApplying(true);setError('');const release=await check();if(!mounted.current)return;
    if(!release){setApplying(false);setError('Не удалось получить обновление. Проверьте подключение и повторите.');return;}
    const url=new URL(location.href);url.searchParams.set('_app_update',`${release.buildId}-${Date.now()}`);location.replace(url.href);
  }
  return {version:current.version,available:!!latest&&latest.buildId!==current.buildId,latest:latest?.version,applying,error,apply};
}
//: Показывает текущую версию и рабочую кнопку обновления внутри приложения.
//: Во время отправки или просмотра вложения применение обновления недоступно.
export default function AppUpdates({updates,busy,hasDrafts}:{updates:ReturnType<typeof useAppUpdates>;busy:boolean;hasDrafts:boolean}){
  return <div className={`app-updates ${updates.available?'update-available':''}`}><div><span role={updates.available?'status':undefined}>{updates.available?`Доступно обновление ${updates.latest}`:`Версия ${updates.version}`}</span><button type="button" disabled={busy||updates.applying} onClick={()=>void updates.apply(hasDrafts)}>{updates.applying?'Обновление…':'Обновить приложение'}</button></div>{updates.error&&<p role="alert">{updates.error}</p>}</div>;
}
