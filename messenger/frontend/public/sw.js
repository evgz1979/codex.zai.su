/* Только доставка push: без fetch-handler, кеша переписки и токенов. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{/* Нейтральное уведомление обязательно и при некорректном payload. */}
  event.waitUntil((async()=>{
    await self.registration.showNotification('Z AI Messenger',{
      body:payload.kind==='test'?'Уведомления включены':'Новое сообщение',
      icon:'/icon-192.png',badge:'/icon-192.png',tag:payload.kind==='test'?'messenger-test':'messenger-incoming',
    });
    if(Number.isSafeInteger(payload.badge)&&payload.badge>=0&&'setAppBadge' in navigator){try{await navigator.setAppBadge(payload.badge);}catch{/* Системные настройки могут скрывать значок. */}}
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const chat=windows.find(client=>{const url=new URL(client.url);return url.origin===self.location.origin&&url.pathname==='/';});
    if(chat)await chat.focus();else await self.clients.openWindow('/');
  })());
});
