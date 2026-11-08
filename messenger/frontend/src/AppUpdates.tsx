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
  async function apply(state:()=>{busy:boolean;hasDrafts:boolean}){
    if(applying||state().busy)return;
    setApplying(true);setError('');const release=await check();if(!mounted.current)return;
    if(!release){setApplying(false);setError('Не удалось получить обновление. Проверьте подключение и повторите.');return;}
    if(state().busy){setApplying(false);setError('Дождитесь завершения текущей операции и повторите обновление.');return;}
    if(state().hasDrafts&&!window.confirm('При обновлении несохранённые черновики будут удалены. Обновить приложение?')){setApplying(false);return;}
    const url=new URL(location.href);url.searchParams.set('_app_update',`${release.buildId}-${Date.now()}`);location.replace(url.href);
  }
  return {version:current.version,available:!!latest&&latest.buildId!==current.buildId,latest:latest?.version,applying,error,apply};
}
//: Показывает компактную кнопку обновления в существующей строке действий.
//: Версия доступна в подсказке; ошибка показывается поверх интерфейса без новой строки.
export default function AppUpdates({updates,busy,hasDrafts}:{updates:ReturnType<typeof useAppUpdates>;busy:boolean;hasDrafts:boolean}){
  const state=useRef({busy,hasDrafts});state.current={busy,hasDrafts};
  const title=updates.error||(updates.available?`Доступно обновление ${updates.latest}`:`Обновить приложение · версия ${updates.version}`);
  return <span className={`app-updates-inline ${updates.available?'update-available':''}`}><button className="icon-button" type="button" aria-label="Обновить приложение" title={title} disabled={busy||updates.applying} onClick={()=>void updates.apply(()=>state.current)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5m-5 0a8 8 0 0 1 13.6-5.7L20 9m0 3a8 8 0 0 1-13.6 5.7L4 15"/></svg>{updates.available&&<i className="update-dot"/>}</button>{updates.error&&<span className="update-error" role="alert">{updates.error}</span>}</span>;
}
