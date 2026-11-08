/* Только доставка push: без fetch-handler, кеша переписки и токенов. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
//: Уточняет число после поздней доставки, даже когда приложение уже закрыли.
//: Читает только защищённый счётчик; при истёкшей сессии использует число push.
async function currentBadge(fallback){
  if(typeof fetch!=='function')return {count:fallback,fresh:false};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3000);
  try{const response=await fetch('/api/chat/badge',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(response.ok){const value=await response.json();if(Number.isSafeInteger(value.count)&&value.count>=0)return {count:value.count,fresh:true};}}catch{/* Offline и истёкший вход не теряют обычные push. */}finally{clearTimeout(timer);}
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
    const visible=windows.filter(client=>client.visibilityState==='visible'&&new URL(client.url).pathname==='/');
    const badge=await currentBadge(payload.badge);
    if((badge.fresh||!visible.length)&&Number.isSafeInteger(badge.count)&&badge.count>=0){try{if(badge.count===0&&'clearAppBadge' in navigator)await navigator.clearAppBadge();else if('setAppBadge' in navigator)await navigator.setAppBadge(badge.count);}catch{/* Системные настройки могут скрывать значок. */}}
    if(payload.kind!=='test'&&badge.fresh&&badge.count===0&&self.registration.getNotifications)for(const notification of await self.registration.getNotifications())if(notification.tag!=='messenger-test')notification.close();
    for(const client of visible)client.postMessage({type:'messenger:badge-refresh'});
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const chat=windows.find(client=>{const url=new URL(client.url);return url.origin===self.location.origin&&url.pathname==='/';});
    const id=event.notification.data?.conversationId;
    const conversationId=typeof id==='string'&&id.length>0&&id.length<=2048?id:undefined;
    if(chat){chat.postMessage(conversationId?{type:'messenger:open-conversation',conversationId}:{type:'messenger:open-latest'});await chat.focus();}
    else await self.clients.openWindow(conversationId?`/#conversation=${encodeURIComponent(conversationId)}`:'/');
  })());
});
