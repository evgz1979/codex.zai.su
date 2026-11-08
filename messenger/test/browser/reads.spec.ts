import {test,expect} from '@playwright/test';

test('просмотр: видимая активная лента снимает счётчик, скрытые сообщения ждут просмотра',async({page,isMobile})=>{
  await page.addInitScript(()=>{
    const state=window as unknown as {readsActive:boolean;badgeValues:number[];closedNotifications:number};state.readsActive=false;state.badgeValues=[];state.closedNotifications=0;
    Object.defineProperty(document,'hasFocus',{value:()=>state.readsActive});
    Object.defineProperty(navigator,'setAppBadge',{value:async(count:number)=>{state.badgeValues.push(count);}});
    Object.defineProperty(navigator,'clearAppBadge',{value:async()=>{state.badgeValues.push(0);}});
    const worker={pushManager:{getSubscription:async()=>null},getNotifications:async()=>[{close:()=>{state.closedNotifications++;}}]};
    Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>worker,ready:Promise.resolve(worker),getRegistration:async()=>worker,addEventListener:()=>{},removeEventListener:()=>{}}});
  });
  const conversations=[{id:'fixture-a:conversation:0',title:'Свежий непрочитанный',unreadCount:3,updatedAt:'2026-11-08T12:00:00.000Z'},{id:'fixture-a:conversation:1',title:'Старый непрочитанный',unreadCount:2,updatedAt:'2026-11-08T10:00:00.000Z'},{id:'fixture-a:conversation:2',title:'Свежий прочитанный',unreadCount:0,updatedAt:'2026-11-08T13:00:00.000Z'}].map(c=>({...c,sourceId:'fixture-a',kind:'direct',recipient:{id:`recipient-${c.id}`,name:c.title},preview:'',canSend:true}));
  const messages=Array.from({length:10},(_,index)=>({id:`visible-position-${index}`,conversationId:conversations[index===0?1:0].id,sourceId:'fixture-a',sender:{id:'synthetic',name:'Синтетический'},date:new Date(Date.UTC(2026,10,8,11,index)).toISOString(),sequence:index,text:`Позиция ${index}: ${'сообщение '.repeat(100)}`,outgoing:false,status:'received',attachments:[]}));
  const snapshot={conversations,messages,sources:[{id:'fixture-a',kind:'test',name:'Telegram',connected:true}],refreshedAt:null,stale:false};let revision=1;
  const reads:{conversationId:string;messageId:string}[]=[];
  await page.route('**/api/chat/inbox',route=>route.fulfill({json:{snapshot,page:{conversationId:'inbox',messages,nextCursor:null,cached:true,historyComplete:true}}}));
  await page.route('**/api/chat/open',route=>{const id=route.request().postDataJSON().conversationId;return route.fulfill({json:{snapshot,page:{conversationId:id,messages:messages.filter(m=>m.conversationId===id),nextCursor:null,cached:true,historyComplete:true}}});});
  await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:conversations.map(c=>c.id),revision}}));
  await page.route('**/api/chat/read',route=>{const input=route.request().postDataJSON();reads.push(input);const conversation=conversations.find(c=>c.id===input.conversationId)!;conversation.unreadCount=0;return route.fulfill({json:snapshot});});
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();
  await page.waitForTimeout(800);expect(reads).toHaveLength(0);await page.getByRole('button',{name:'Общая лента',exact:true}).click();await expect(page.locator('.bubble')).toHaveCount(10);
  await expect(page.locator('.conversation-name')).toHaveText(['Свежий непрочитанный','Старый непрочитанный','Свежий прочитанный']);
  await page.waitForTimeout(800);expect(reads).toHaveLength(0);
  await page.evaluate(()=>{(window as unknown as {readsActive:boolean}).readsActive=true;window.dispatchEvent(new Event('focus'));});
  await expect.poll(()=>reads.map(input=>input.messageId)).toEqual(['visible-position-9']);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {badgeValues:number[]}).badgeValues.at(-1))).toBe(2);
  await expect(page.locator('.conversation-name').first()).toHaveText('Старый непрочитанный');
  await page.locator('.feed').evaluate(element=>{element.scrollTop=0;});await expect.poll(()=>reads.some(input=>input.messageId==='visible-position-0')).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {badgeValues:number[]}).badgeValues.at(-1))).toBe(0);
  expect(await page.evaluate(()=>(window as unknown as {closedNotifications:number}).closedNotifications)).toBeGreaterThan(0);
  await page.evaluate(()=>{(window as unknown as {readsActive:boolean}).readsActive=false;window.dispatchEvent(new Event('blur'));});
  const count=reads.length;conversations[0].unreadCount=1;messages.push({...messages[9],id:'visible-position-10',sequence:10,date:'2026-11-08T12:10:00.000Z',text:'Новое за пределами экрана'});revision++;
  await expect(page.locator('[data-message-id="visible-position-10"]')).toHaveCount(1,{timeout:7000});await page.waitForTimeout(800);expect(reads).toHaveLength(count);
  await page.evaluate(()=>{(window as unknown as {readsActive:boolean}).readsActive=true;window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(800);expect(reads).toHaveLength(count);
  await page.locator('.feed').evaluate(element=>{element.scrollTop=element.scrollHeight;});await expect.poll(()=>reads.at(-1)?.messageId).toBe('visible-position-10');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {badgeValues:number[]}).badgeValues.at(-1))).toBe(0);
});
