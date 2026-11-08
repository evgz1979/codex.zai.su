import {test,expect,type Page} from '@playwright/test';

//: Задаёт изолированные диалоги и управляемое возвращение из фона.
//: Прочтение заморожено; проверяется навигация, реальные данные и push-провайдеры не используются.
async function context(page:Page,unread=true){
  await page.addInitScript(()=>{
    const state=window as unknown as {arrivalHidden:boolean};state.arrivalHidden=false;
    Object.defineProperty(document,'hidden',{get:()=>state.arrivalHidden});Object.defineProperty(document,'hasFocus',{value:()=>false});
    const registration={pushManager:{getSubscription:async()=>null},getNotifications:async()=>[]};
    const worker=Object.assign(new EventTarget(),{register:async()=>registration,ready:Promise.resolve(registration),getRegistration:async()=>registration});
    Object.defineProperty(navigator,'serviceWorker',{value:worker});
  });
  const conversations=['Раннее уведомление','Последнее уведомление','Прочитанный'].map((title,i)=>({id:`fixture-a:conversation:${i}`,sourceId:'fixture-a',title,kind:'direct',recipient:{id:`fixture-a:recipient:${i}`,name:title},unreadCount:unread?(i===0?20:i===1?1:0):0,updatedAt:`2026-11-08T1${i}:00:00.000Z`,preview:'',canSend:true}));
  const messages=conversations.map((c,i)=>({id:`arrival-${i}`,conversationId:c.id,sourceId:c.sourceId,sender:{id:'synthetic',name:c.title},date:c.updatedAt,text:`Текст ${c.title}`,outgoing:false,status:'received',attachments:[]}));
  const snapshot={conversations,messages,sources:[{id:'fixture-a',kind:'test',name:'Telegram',connected:true}],refreshedAt:null,stale:false};
  const opened:string[]=[];const control={revision:1,beforeInbox:undefined as undefined|(()=>Promise<void>)};
  await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:conversations.map(c=>c.id),revision:control.revision}}));
  await page.route('**/api/chat/inbox',async route=>{const hold=control.beforeInbox;await hold?.();try{await route.fulfill({json:{snapshot,page:{conversationId:'inbox',messages,nextCursor:null,cached:true,historyComplete:true}}});}catch(error){if(!hold)throw error;}});
  await page.route('**/api/chat/open',route=>{const id=route.request().postDataJSON().conversationId;opened.push(id);if(!conversations.some(c=>c.id===id))throw new Error('Excluded ID reached open API');return route.fulfill({json:{snapshot,page:{conversationId:id,messages:messages.filter(m=>m.conversationId===id),nextCursor:null,cached:true,historyComplete:true}}});});
  //: Выполняет обычный вход в изолированный тестовый сервер.
  //: Fragment сохраняется до разрешения адресата после входа.
  const login=async(hash='')=>{await page.goto('/'+hash);await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();};
  //: Имитирует скрытие и возврат через события браузера.
  //: Видимое новое сообщение без этих событий не вызывает переход.
  const resume=async()=>{await page.evaluate(()=>{const state=window as unknown as {arrivalHidden:boolean};state.arrivalHidden=true;document.dispatchEvent(new Event('visibilitychange'));state.arrivalHidden=false;document.dispatchEvent(new Event('visibilitychange'));});};
  return {conversations,messages,snapshot,opened,control,login,resume};
}

test('открытие: свежайший непрочитанный выбран раньше общей ленты, количество не определяет адресата',async({page})=>{
  const {login,opened,conversations}=await context(page);await login();await expect(page.getByRole('heading',{name:'Последнее уведомление',exact:true})).toBeVisible();
  expect(opened[0]).toBe(conversations[1].id);await expect(page.locator('.destination')).toContainText('Последнее уведомление');await expect(page.locator('.bubble')).toHaveCount(1);
});

test('открытие: без непрочитанных остаётся общая лента',async({page})=>{
  const {login,opened}=await context(page,false);await login();await expect(page.getByRole('heading',{name:'Общая лента',exact:true})).toBeVisible();await expect(page.locator('.bubble')).toHaveCount(3);expect(opened).toEqual([]);
});

for(const valid of [true,false])test(`уведомление: ${valid?'точный диалог':'исключённый ID'} проверяется после входа`,async({page})=>{
  const {login,opened,conversations}=await context(page);const id=valid?conversations[0].id:'excluded:conversation:private';
  await login(`#conversation=${encodeURIComponent(id)}`);await expect(page.getByRole('heading',{name:valid?'Раннее уведомление':'Последнее уведомление',exact:true})).toBeVisible();expect(opened[0]).toBe(valid?conversations[0].id:conversations[1].id);expect(await page.evaluate(()=>location.hash)).toBe('');
});

test('уведомление: открытое окно входа сохраняет выбранный в push диалог',async({page})=>{
  const {conversations,opened}=await context(page);await page.goto('/');await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();
  await page.evaluate(id=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'messenger:open-conversation',conversationId:id}})),conversations[0].id);
  await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await expect(page.getByRole('heading',{name:'Раннее уведомление',exact:true})).toBeVisible();expect(opened[0]).toBe(conversations[0].id);
});

test('возврат: сохраняет черновик, открывает новое после возврата и принимает явный клик уведомления',async({page,isMobile})=>{
  const {login,resume,conversations,control}=await context(page,false);await login();await expect(page.locator('.bubble')).toHaveCount(3);
  if(isMobile)await page.getByRole('button',{name:'Открыть диалоги'}).click();await page.getByRole('button',{name:/Раннее уведомление/}).click();await page.getByLabel('Сообщение',{exact:true}).fill('Мой черновик');
  conversations[1].unreadCount=1;await resume();await page.waitForTimeout(700);await expect(page.getByRole('heading',{name:'Раннее уведомление',exact:true})).toBeVisible();await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('Мой черновик');
  await page.getByLabel('Сообщение',{exact:true}).fill('');await resume();await expect(page.getByRole('heading',{name:'Последнее уведомление',exact:true})).toBeVisible();
  await page.getByLabel('Сообщение',{exact:true}).fill('Черновик второго диалога');
  await page.evaluate(id=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'messenger:open-conversation',conversationId:id}})),conversations[0].id);await expect(page.getByRole('heading',{name:'Раннее уведомление',exact:true})).toBeVisible();
  if(isMobile)await page.getByRole('button',{name:'Открыть диалоги'}).click();await page.getByRole('button',{name:/Последнее уведомление/}).click();await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('Черновик второго диалога');
  conversations[0].updatedAt='2026-11-08T14:00:00.000Z';conversations[0].unreadCount=1;conversations[0].preview='Новое в активном приложении';control.revision++;
  await expect(page.locator('.conversation').filter({hasText:'Раннее уведомление'})).toContainText('Новое в активном приложении',{timeout:7000});await expect(page.getByRole('heading',{name:'Последнее уведомление',exact:true})).toBeVisible();
});

test('возврат: ручной выбор отменяет запоздалое автоматическое открытие',async({page,isMobile})=>{
  const {login,resume,conversations,control}=await context(page,false);await login();await expect(page.locator('.bubble')).toHaveCount(3);
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let started:()=>void=()=>{};const ready=new Promise<void>(resolve=>{started=resolve;});
  conversations[1].unreadCount=1;control.beforeInbox=async()=>{started();await gate;};await resume();await ready;
  try{if(isMobile)await page.getByRole('button',{name:'Открыть диалоги'}).click();await page.getByRole('button',{name:/Раннее уведомление/}).click();await expect(page.getByRole('heading',{name:'Раннее уведомление',exact:true})).toBeVisible();}
  finally{control.beforeInbox=undefined;release();}
  await page.waitForTimeout(700);await expect(page.getByRole('heading',{name:'Раннее уведомление',exact:true})).toBeVisible();await expect(page.getByLabel('Сообщение',{exact:true})).toBeEnabled();
});
