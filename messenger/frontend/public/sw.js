/* Offline-кеш только оболочки приложения; API, переписку и токены worker не кеширует. */
const workerBase=self.registration?.scope?new URL(self.registration.scope).pathname.replace(/\/$/,''):'';
const workerApiBase=workerBase?`/api/u/${workerBase.split('/').pop()}`:'/api';
const shellCache=`messenger-shell-v1:${workerBase||'owner'}`;
//: Сохраняет HTML личного чата только вместе с файлами той же сборки.
//: Админка, API и ответы с реквизитами не попадают в Cache Storage.
async function saveShell(response){
  if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))return;
  const html=await response.clone().text();const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css))"/g)].map(match=>match[1]);
  if(!assets.length)return;
  const loaded=await Promise.all(assets.map(async path=>{const resource=await fetch(path,{cache:'reload'});if(!resource.ok)throw new Error('Shell asset unavailable');return [path,resource];}));
  const cache=await caches.open(shellCache);for(const [path,resource] of loaded)await cache.put(path,resource);await cache.put(`${workerBase}/`,response);
  const keep=new Set([`${workerBase}/`,...assets]);for(const key of await cache.keys())if(!keep.has(new URL(key.url).pathname))await cache.delete(key);
}
//: Готовит оболочку при установке независимо от разрешения на уведомления.
//: Если сеть недоступна, прежний кеш остаётся пригодным для запуска.
async function warmShell(){const response=await fetch(`${workerBase}/`,{cache:'reload'});await saveShell(response);}
self.addEventListener('install',event=>event.waitUntil(warmShell().catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const request=event.request;const url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'&&url.pathname===`${workerBase}/`){
    event.respondWith((async()=>{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
      try{const response=await fetch(request,{signal:controller.signal});if(response.status>=500)throw new Error('Shell unavailable');if(response.ok)event.waitUntil(saveShell(response.clone()).catch(()=>{}));return response;}
      catch{const saved=await (await caches.open(shellCache)).match(`${workerBase}/`);return saved||new Response('Нет связи. Откройте Messenger с интернетом перед первым автономным запуском.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
      finally{clearTimeout(timer);}
    })());
  }else if(/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(url.pathname)){
    event.respondWith((async()=>{const cache=await caches.open(shellCache);return await cache.match(request)||fetch(request);})());
  }
});
//: Уточняет число после поздней доставки, даже когда приложение уже закрыли.
//: Читает только защищённый счётчик; при истёкшей сессии использует число push.
async function currentBadge(fallback){
  if(typeof fetch!=='function')return {count:fallback,fresh:false};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3000);
  try{const response=await fetch(`${workerApiBase}/chat/badge`,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(response.ok){const value=await response.json();if(Number.isSafeInteger(value.count)&&value.count>=0)return {count:value.count,fresh:true};}}catch{/* Offline и истёкший вход не теряют обычные push. */}finally{clearTimeout(timer);}
  return {count:fallback,fresh:false};
}
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{/* Нейтральное уведомление обязательно и при некорректном payload. */}
  event.waitUntil((async()=>{
    await self.registration.showNotification('Z AI Messenger',{
      body:payload.kind==='test'?'Уведомления включены':'Новое сообщение',
      icon:'/icon-192.png',badge:'/icon-192.png',tag:payload.kind==='test'?'messenger-test':'messenger-incoming',
      data:{conversationId:typeof payload.conversationId==='string'&&payload.conversationId.length<=2048?payload.conversationId:undefined},
    });
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const visible=windows.filter(client=>client.visibilityState==='visible'&&new URL(client.url).pathname===`${workerBase}/`);
    const badge=await currentBadge(payload.badge);
    if((badge.fresh||!visible.length)&&Number.isSafeInteger(badge.count)&&badge.count>=0){try{if(badge.count===0&&'clearAppBadge' in navigator)await navigator.clearAppBadge();else if('setAppBadge' in navigator)await navigator.setAppBadge(badge.count);}catch{/* Системные настройки могут скрывать значок. */}}
    if(payload.kind!=='test'&&badge.fresh&&badge.count===0&&self.registration.getNotifications)for(const notification of await self.registration.getNotifications())if(notification.tag!=='messenger-test')notification.close();
    for(const client of visible)client.postMessage({type:'messenger:badge-refresh'});
  })());
});
//: Передаёт клик уже открытой странице после её пробуждения.
//: Без подтверждения страница получит тот же ID через fragment.
function requestConversation(client,conversationId){
  return new Promise(resolve=>{
    const {port1,port2}=new MessageChannel();
    const finish=received=>{clearTimeout(timer);port1.close();resolve(received);};
    const timer=setTimeout(()=>finish(false),750);
    port1.onmessage=event=>{if(event.data===true)finish(true);};
    try{client.postMessage({type:'messenger:open-conversation',conversationId},[port2]);}
    catch{port2.close();finish(false);}
  });
}
let lastNotificationClick=0;
self.addEventListener('notificationclick',event=>{
  const click=++lastNotificationClick;
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(click!==lastNotificationClick)return;
    const chat=windows.find(client=>{const url=new URL(client.url);return url.origin===self.location.origin&&url.pathname===`${workerBase}/`;});
    const id=event.notification.data?.conversationId;
    const conversationId=typeof id==='string'&&id.length>0&&id.length<=2048?id:undefined;
    const hash=conversationId?`#${new URLSearchParams({conversation:conversationId})}`:'';
    if(chat){
      const focused=await chat.focus().catch(()=>null);
      if(click!==lastNotificationClick)return;
      if(!conversationId&&focused){focused.postMessage({type:'messenger:open-latest'});return;}
      if(conversationId){
        if(focused&&await requestConversation(focused,conversationId))return;
        if(click!==lastNotificationClick)return;
        const destination=new URL(chat.url);
        destination.hash=hash;
        const navigated=await chat.navigate(destination.href).catch(()=>null);
        if(navigated){if(!focused)await navigated.focus().catch(()=>{});return;}
      }
    }
    if(click===lastNotificationClick)await self.clients.openWindow(`${workerBase}/${hash}`);
  })());
});
