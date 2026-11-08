import {useEffect,useState} from 'react';
import {api,appBase} from './api';

//: Получает существующую регистрацию без создания фонового кеша.
//: Отсутствие Service Worker допускается в браузерах без Web Push.
async function registration(){const worker='serviceWorker' in navigator?await navigator.serviceWorker.getRegistration(`${appBase}/`):undefined;return worker?.scope&&new URL(worker.scope).pathname!==`${appBase}/`?undefined:worker;}
//: Получает endpoint только текущего устройства для явного выхода.
//: Значение передаётся серверу в POST, без URL, localStorage и журналов.
export async function notificationEndpoint(){try{return (await (await registration())?.pushManager?.getSubscription())?.endpoint;}catch{return undefined;}}
//: Удаляет браузерную подписку после успешного выхода или отключения.
//: Не изменяет системное разрешение iOS и не затрагивает другие устройства.
export async function unsubscribeNotifications(){const worker=await registration();await (await worker?.pushManager?.getSubscription())?.unsubscribe();for(const notification of await worker?.getNotifications()||[])notification.close();if('clearAppBadge' in navigator)await navigator.clearAppBadge();}

//: Показывает включение Web Push и установочную инструкцию для iPhone.
//: Разрешение запрашивается только по нажатию; история и сессии не кешируются.
export default function Notifications(){
  const [state,setState]=useState<'loading'|'install'|'unsupported'|'blocked'|'off'|'on'>('loading');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let disposed=false;
    const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const standalone=matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone;
    if(ios&&!standalone){setState('install');return;}
    if(!window.isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){setState('unsupported');return;}
    if(Notification.permission==='denied'){setState('blocked');return;}
    (async()=>{
      const worker=await navigator.serviceWorker.register(`${appBase}/sw.js`,{scope:`${appBase}/`,updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      const sub=await worker.pushManager.getSubscription();
      const result=sub?await api<{enabled:boolean}>('push/status',{endpoint:sub.endpoint}):{enabled:false};
      if(!disposed)setState(result.enabled?'on':'off');
    })().catch(()=>{if(!disposed){setState('off');setMessage('Не удалось проверить уведомления. Повторите включение.');}});
    return()=>{disposed=true;};
  },[]);
  //: Вызывает системное разрешение непосредственно из пользовательского нажатия.
  //: Подписка отправляется только chat API с cookie и CSRF после разрешения.
  async function enable(){
    setBusy(true);setMessage('');
    try{
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){setState(permission==='denied'?'blocked':'off');return;}
      const config=await api<{publicKey:string}>('push/config');
      const worker=await navigator.serviceWorker.register(`${appBase}/sw.js`,{scope:`${appBase}/`,updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
      let sub=await worker.pushManager.getSubscription();
      if(sub&&sub.options.applicationServerKey&&!new Uint8Array(sub.options.applicationServerKey).every((byte,index)=>byte===key[index])){await sub.unsubscribe();sub=null;}
      sub??=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      await api('push/subscribe',{subscription:sub.toJSON()});setState('on');
    }catch{setMessage('Не удалось включить уведомления. Проверьте подключение и повторите.');}
    finally{setBusy(false);}
  }
  //: Сначала отзывает серверную доставку, затем браузерную подписку.
  //: При сетевом отказе UI не объявляет уведомления отключёнными.
  async function disable(){
    setBusy(true);setMessage('');
    try{const endpoint=await notificationEndpoint();if(endpoint)await api('push/remove',{endpoint});await unsubscribeNotifications();setState('off');}
    catch{setMessage('Не удалось отключить уведомления. Повторите.');}finally{setBusy(false);}
  }
  //: Запрашивает реальную проверочную доставку только этому устройству.
  //: Успех означает приём push-сервисом, отображение проверяет владелец iPhone.
  async function test(){
    setBusy(true);setMessage('');
    try{await api('push/test',{endpoint:await notificationEndpoint()});setMessage('Проверка отправлена. Проверьте уведомления iPhone.');}
    catch{setMessage('Проверка не отправлена. Выключите и включите уведомления, затем повторите.');}finally{setBusy(false);}
  }
  return <details className="notification-settings">
    <summary>Уведомления{state==='on'?': включены':''}</summary>
    {state==='loading'?<p role="status">Проверка…</p>:state==='install'?<p>На iPhone: откройте сайт в Safari → «Поделиться» → «На экран Домой». Запустите Messenger с новой иконки и включите уведомления. Требуется iOS 16.4 или новее.</p>:state==='unsupported'?<p>Этот браузер не поддерживает уведомления. На iPhone добавьте Messenger на экран «Домой»; требуется iOS 16.4 или новее.</p>:state==='blocked'?<p>Уведомления запрещены. Разрешите их для Messenger в настройках уведомлений устройства и откройте приложение снова.</p>:<>
      <p>{state==='on'?'Новые входящие из выбранных диалогов. Текст сообщения скрыт.':'Уведомлять о новых входящих, даже когда Messenger закрыт. Текст сообщения скрыт.'}</p>
      <div className="notification-actions"><button type="button" onClick={state==='on'?disable:enable} disabled={busy}>{state==='on'?'Выключить':'Включить'}</button>{state==='on'&&<button type="button" onClick={test} disabled={busy}>Проверить</button>}</div>
    </>}
    {message&&<p role="status">{message}</p>}
  </details>;
}
