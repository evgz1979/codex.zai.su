import {useEffect,useRef,useState} from 'react';
import {api,appBase} from './api';

//: Получает существующую регистрацию без создания фонового кеша.
//: Отсутствие Service Worker допускается в браузерах без Web Push.
async function registration(){const worker='serviceWorker' in navigator?await navigator.serviceWorker.getRegistration(`${appBase}/`):undefined;return worker?.scope&&new URL(worker.scope).pathname!==`${appBase}/`?undefined:worker;}
//: Получает endpoint только текущего устройства для явного выхода.
//: Значение передаётся серверу в POST, без URL, localStorage и журналов.
export async function notificationEndpoint(){try{return (await (await registration())?.pushManager?.getSubscription())?.endpoint;}catch{return undefined;}}
//: Удаляет браузерную подписку после явного выхода.
//: Не изменяет системное разрешение iOS и не затрагивает другие устройства.
export async function unsubscribeNotifications(){const worker=await registration();await (await worker?.pushManager?.getSubscription())?.unsubscribe();for(const notification of await worker?.getNotifications()||[])notification.close();if('clearAppBadge' in navigator)await navigator.clearAppBadge();}

//: Восстанавливает доставку при уже выданном системном разрешении.
//: Запрос разрешения не выполняется; endpoint передаётся только защищённому API своего аккаунта.
async function restoreNotifications(){
  const config=await api<{publicKey:string}>('push/config');
  const worker=await navigator.serviceWorker.register(`${appBase}/sw.js`,{scope:`${appBase}/`,updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
  let sub=await worker.pushManager.getSubscription();
  const existing=sub?.options.applicationServerKey?new Uint8Array(sub.options.applicationServerKey):undefined;
  if(sub&&(sub.expirationTime!==null&&sub.expirationTime<=Date.now()||existing&&(existing.length!==key.length||!existing.every((byte,index)=>byte===key[index])))){await sub.unsubscribe();sub=null;}
  sub??=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await api('push/subscribe',{subscription:sub.toJSON()});
}

//: Постоянно поддерживает разрешённые уведомления и показывает инструкцию для iPhone.
//: Системное разрешение запрашивается один раз по нажатию; восстановление выполняется автоматически.
export default function Notifications(){
  const [state,setState]=useState<'loading'|'install'|'unsupported'|'blocked'|'permission'|'retry'|'on'>('loading');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const pending=useRef(false);
  const mounted=useRef(false);
  const restoredAt=useRef(0);
  useEffect(()=>{
    mounted.current=true;
    const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const standalone=matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone;
    if(ios&&!standalone){setState('install');return()=>{mounted.current=false;};}
    if(!window.isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){setState('unsupported');return()=>{mounted.current=false;};}
    //: Проверяет разрешение и восстанавливает push при возврате или восстановлении сети.
    //: Сетевой отказ повторяется автоматически, без нового системного запроса.
    const restore=()=>{if(!document.hidden&&navigator.onLine!==false)void enable(false);};
    restore();const timer=window.setInterval(()=>{if(Date.now()-restoredAt.current>=3600000)restore();},60000);window.addEventListener('online',restore);document.addEventListener('visibilitychange',restore);
    return()=>{mounted.current=false;window.clearInterval(timer);window.removeEventListener('online',restore);document.removeEventListener('visibilitychange',restore);};
  },[]);
  //: Запрашивает первое разрешение непосредственно из пользовательского нажатия.
  //: Последующие восстановления используют granted без повторного requestPermission.
  async function enable(requestPermission:boolean){
    if(pending.current)return;pending.current=true;setBusy(true);
    try{
      const permission=Notification.permission==='default'&&requestPermission?await Notification.requestPermission():Notification.permission;
      if(!mounted.current)return;
      if(permission!=='granted'){setState(permission==='denied'?'blocked':'permission');setMessage('');return;}
      await restoreNotifications();restoredAt.current=Date.now();if(mounted.current){setState('on');setMessage('');}
    }catch{if(mounted.current){setState('retry');setMessage('Не удалось восстановить уведомления. Повторим автоматически, когда появится связь.');}}
    finally{pending.current=false;if(mounted.current)setBusy(false);}
  }
  //: Запрашивает реальную проверочную доставку только этому устройству.
  //: Успех означает приём push-сервисом, отображение проверяет владелец устройства.
  async function test(){
    if(pending.current)return;pending.current=true;setBusy(true);setMessage('');
    try{await restoreNotifications();await api('push/test',{endpoint:await notificationEndpoint()});setMessage('Проверка отправлена. Проверьте уведомления устройства.');}
    catch{setMessage('Проверка не отправлена. Проверьте подключение и повторите.');}finally{pending.current=false;if(mounted.current)setBusy(false);}
  }
  return <details className="notification-settings" open={state==='permission'||state==='retry'}>
    <summary>Уведомления{state==='on'?': включены':''}</summary>
    {state==='loading'?<p role="status">Проверка…</p>:state==='install'?<p>На iPhone: откройте сайт в Safari → «Поделиться» → «На экран Домой». Запустите Messenger с новой иконки и разрешите уведомления один раз. Требуется iOS 16.4 или новее.</p>:state==='unsupported'?<p>Этот браузер не поддерживает уведомления. На iPhone добавьте Messenger на экран «Домой»; требуется iOS 16.4 или новее.</p>:state==='blocked'?<p>Уведомления запрещены. Разрешите их для Messenger в настройках уведомлений устройства и откройте приложение снова.</p>:<>
      <p>{state==='on'?'Уведомления включены постоянно. Текст сообщения скрыт.':state==='permission'?'Разрешите уведомления один раз. Дальше они включаются автоматически, в том числе после обновления приложения. Текст сообщения скрыт.':'Восстанавливаем уведомления автоматически.'}</p>
      <div className="notification-actions">{state!=='on'&&<button type="button" onClick={()=>void enable(state==='permission')} disabled={busy}>{state==='permission'?'Разрешить уведомления':'Повторить'}</button>}{state==='on'&&<button type="button" onClick={test} disabled={busy}>Проверить</button>}</div>
    </>}
    {message&&<p role="status">{message}</p>}
  </details>;
}
