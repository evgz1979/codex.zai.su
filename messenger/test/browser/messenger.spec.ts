import { test, expect } from '@playwright/test';
test('источники: видимый WhatsApp-чат обновляет счётчик чатов и значок',async({page})=>{
 const reads:string[]=[];
 let unreadCount=2;
 await page.addInitScript(()=>{
  const state=window as unknown as {badge?:number};
  Object.defineProperty(document,'hasFocus',{value:()=>false});
  Object.defineProperty(navigator,'standalone',{value:true});
  Object.defineProperty(navigator,'setAppBadge',{value:async(count:number)=>{state.badge=count;}});
  Object.defineProperty(navigator,'clearAppBadge',{value:async()=>{state.badge=0;}});
 });
 await page.route('**/api/chat/**',async route=>{
  const action=new URL(route.request().url()).pathname.split('/').pop();
  if(!['session','login','snapshot','inbox','open','older','access','read'].includes(action!))return route.continue();
  if(action==='read'){reads.push(route.request().postDataJSON().conversationId);unreadCount=0;}
  const response=await route.fetch();const data=await response.json();
  const decorate=(snapshot:any)=>{if(!snapshot?.sources)return;const source=snapshot.sources.find((s:any)=>s.id==='fixture-b');Object.assign(source,{kind:'whatsapp',name:'WhatsApp'});snapshot.conversations.forEach((c:any)=>{c.unreadCount=c.sourceId==='fixture-b'?unreadCount:0;});};
  decorate(data);decorate(data.snapshot);await route.fulfill({response,json:data});
 });
 await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
 await expect(page.locator('.conversation-source').getByText('Telegram',{exact:true}).first()).toBeVisible();await expect(page.locator('.conversation-source[data-source-kind=whatsapp]')).toHaveText('WhatsApp');
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {badge:number}).badge)).toBe(2);
 expect(reads).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:/Мария · другой источник/}).click();await expect(page.locator('.chat-heading')).toContainText('WhatsApp');
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {badge:number}).badge)).toBe(0);
 expect(reads).toEqual(['fixture-b:conversation:0']);
});

test('единая лента, выбор адресата, отправка, непрочитанные, выход и мобильные границы', async ({ page }, testInfo) => {
  const errors: string[] = [];
  let takingScreenshot = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => {
    // WebKit screenshotter Playwright вставляет служебный <style>body {}</style>
    // для синхронизации анимаций. CSP запрещает его; вне скриншота ошибок быть не должно.
    if (takingScreenshot && msg.text().startsWith('Refused to apply a stylesheet')) return;
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');
  await page.getByRole('button',{name:'Войти в Messenger'}).click();
  await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();
  await expect(page.locator('.chat')).toBeHidden();
  await expect(page.getByRole('img',{name:'Фото: Анна Смирнова'})).toBeVisible();
  await page.getByRole('button',{name:'Общая лента',exact:true}).click();
  await expect(page.locator('.bubble').getByText('Это синтетическое сообщение из другого источника.')).toBeVisible();
  await expect(page.getByLabel('Сообщение',{exact:true})).toBeDisabled();
  const mobile = testInfo.project.name !== 'desktop-chromium';
  await page.getByRole('button',{name:'Назад к чатам'}).click();
  await page.getByRole('button',{name:/Анна Смирнова/}).click();
  await expect(page.locator('.destination')).toContainText('Анна Смирнова');
  await expect(page.locator('.destination')).toContainText('Telegram');
  await expect(page.getByLabel('Сообщение',{exact:true})).toBeEnabled();
  const draftText = `Черновик для Анны · ${testInfo.project.name}`;
  await page.getByLabel('Сообщение',{exact:true}).fill(draftText);
  // Выбор другого адресата не переносит чужой черновик.
  await page.getByRole('button',{name:'Назад к чатам'}).click();
  await page.getByRole('button',{name:/Команда проекта/}).click();
  await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'Назад к чатам'}).click();
  await page.getByRole('button',{name:/Анна Смирнова/}).click();
  await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue(draftText);
  const sendRequest = page.waitForRequest(req => req.url().endsWith('/api/chat/send'));
  await page.getByRole('button',{name:'Отправить: Анна Смирнова'}).click();
  const sent = (await sendRequest).postDataJSON();
  expect(sent.destination.sourceId).toBe('fixture-a'); expect(sent.destination.conversationId).toContain('fixture-a:conversation:0');
  await expect(page.locator('.bubble').getByText(draftText,{exact:true})).toBeVisible();
  await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('');
  if (!mobile) {
    await expect(page.getByRole('button',{name:'Отметить прочитанным'})).not.toBeVisible();
  }
  await expect(page.getByRole('button',{name:'Обновить',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Загрузить ещё 10 сообщений'})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const sendBox = await page.locator('.composer').boundingBox();
  expect(sendBox!.x).toBeGreaterThanOrEqual(0); expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(errors).toEqual([]);
  takingScreenshot = true;
  try { await page.screenshot({path:`test-results/${testInfo.project.name}-messenger.png`,caret:'initial'}); }
  finally { takingScreenshot = false; }
  if (mobile) {
    await page.setViewportSize({width:page.viewportSize()!.width,height:420});
    await page.getByLabel('Сообщение',{exact:true}).focus();
    const box = await page.locator('.composer').boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(420);
    await page.getByRole('button',{name:'Назад к чатам'}).click();
  }
  if (!mobile) await page.getByRole('button',{name:'Назад к чатам'}).click();
  await page.getByRole('button',{name:'Выйти',exact:true}).click();
  await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();
  await expect(page.getByText(draftText,{exact:true})).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('открытый чат скрывает исключённые диалоги без синхронизации истории',async({page},testInfo)=>{
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
  await page.getByRole('button',{name:'Общая лента',exact:true}).click();
  await expect(page.locator('.bubble').getByText('Это синтетическое сообщение из другого источника.')).toBeVisible();
  await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:[]}}));
  await expect(page.locator('.bubble')).toHaveCount(0,{timeout:7000});
  await expect(page.getByRole('heading',{name:'Нет загруженных сообщений'})).toBeVisible();
});


test('список чатов: поиск, фильтр, возврат браузером и отдельные черновики',async({page},testInfo)=>{
  const opens:string[]=[];const reads:string[]=[];
  page.on('request',request=>{if(request.url().endsWith('/api/chat/open'))opens.push(request.postDataJSON().conversationId);if(request.url().endsWith('/api/chat/read'))reads.push(request.url());});
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
  await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await expect(page.locator('.conversation')).toHaveCount(4);await page.waitForTimeout(800);expect(opens).toEqual([]);expect(reads).toEqual([]);
  const updateBox=await page.getByRole('button',{name:'Обновить приложение',exact:true}).boundingBox();const exitBox=await page.getByRole('button',{name:'Выйти',exact:true}).boundingBox();expect(Math.abs((updateBox!.y+updateBox!.height/2)-(exitBox!.y+exitBox!.height/2))).toBeLessThan(1);await expect(page.locator('.sidebar > .app-updates')).toHaveCount(0);
  await page.screenshot({path:`test-results/chat-list-${testInfo.project.name}.png`});
  await page.getByRole('button',{name:'Непрочитанные',exact:true}).click();await expect(page.getByText('Нет непрочитанных чатов',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Все',exact:true}).click();
  const search=page.getByRole('textbox',{name:'Поиск диалогов'});await search.fill('Анна');await expect(page.locator('.conversation')).toHaveCount(1);await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.locator('.sidebar')).toBeHidden();await page.getByLabel('Сообщение',{exact:true}).fill('Остался у Анны');
  await page.goBack();await expect(search).toBeVisible();await expect(search).toHaveValue('Анна');await expect(page.locator('.conversation')).toContainText('Черновик: Остался у Анны');await search.fill('несуществующий чат');await expect(page.getByText('Чаты не найдены',{exact:true})).toBeVisible();await search.fill('');
  await page.getByRole('button',{name:/Команда проекта/}).click();await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('');await page.getByRole('button',{name:'Назад к чатам'}).click();await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('Остался у Анны');
  await page.reload();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await expect(page.locator('.chat')).toBeHidden();
  await page.getByRole('button',{name:/Анна Смирнова/}).click();await page.getByRole('button',{name:'Назад к чатам'}).click();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await page.goForward();await expect(page.getByRole('heading',{name:'Анна Смирнова',exact:true})).toBeVisible();
});

test('последние сообщения в списке видны до открытия чатов и не снимают непрочитанное',async({page})=>{
  const previews=['Последнее сообщение ещё до открытия','Фото','Голосовое сообщение','Счёт.pdf'];
  const conversations=previews.map((preview,i)=>({id:`fixture-a:conversation:${i}`,sourceId:'fixture-a',title:`Чат ${i+1}`,kind:'direct',recipient:{id:`recipient-${i}`,name:`Чат ${i+1}`},unreadCount:1,updatedAt:'2026-11-08T10:00:00.000Z',preview,previewMessageId:`preview-${i}`,canSend:true}));
  const snapshot={conversations,messages:[],sources:[{id:'fixture-a',kind:'test',name:'Telegram',connected:true}],refreshedAt:null,stale:false};const reads:string[]=[];
  await page.route('**/api/chat/inbox',route=>route.fulfill({json:{snapshot,page:{conversationId:'inbox',messages:[],nextCursor:null,cached:true,historyComplete:true}}}));
  await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:conversations.map(c=>c.id),revision:1}}));
  page.on('request',request=>{if(/\/api\/chat\/(open|older|read)$/.test(request.url()))reads.push(request.url());});
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
  await expect(page.locator('.conversation .preview')).toContainText(previews);await expect(page.locator('.conversation > .badge')).toHaveText(['1','1','1','1']);await expect(page.getByText('Личный диалог',{exact:true})).toHaveCount(0);await page.waitForTimeout(800);expect(reads).toEqual([]);
});

test('аватары: временный отказ повторяется, видимые фото загружаются без всплеска запросов',async({page})=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const conversations=Array.from({length:8},(_,i)=>({id:`fixture-a:conversation:${i}`,sourceId:'fixture-a',title:`Фото ${i+1}`,kind:'direct',recipient:{id:`recipient-${i}`,name:`Фото ${i+1}`},unreadCount:0,updatedAt:'2026-11-08T10:00:00.000Z',preview:'Тест',canSend:true,avatarVersion:'photo-1'}));
  const snapshot={conversations,messages:[],sources:[{id:'fixture-a',kind:'test',name:'Telegram',connected:true}],refreshedAt:null,stale:false};let active=0;let maximum=0;const calls=new Map<string,number>();
  await page.route('**/api/chat/inbox',route=>route.fulfill({json:{snapshot,page:{conversationId:'inbox',messages:[],nextCursor:null,cached:true,historyComplete:true}}}));
  await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:conversations.map(c=>c.id),revision:1}}));
  await page.route('**/api/chat/avatar',async route=>{
    const id=route.request().postDataJSON().conversationId;const count=(calls.get(id)||0)+1;calls.set(id,count);active++;maximum=Math.max(maximum,active);
    try{await new Promise(resolve=>setTimeout(resolve,75));if(id===conversations[0].id&&count===1)await route.fulfill({status:503,json:{error:'Временный отказ'}});else await route.fulfill({contentType:'image/png',body:png});}finally{active--;}
  });
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
  for(let i=0;i<3;i++){const photo=page.getByRole('img',{name:`Фото: Фото ${i+1}`,exact:true});await expect(photo).toBeVisible();await expect(photo).toHaveJSProperty('naturalWidth',1);}
  expect(calls.get(conversations[0].id)).toBe(2);expect(maximum).toBeLessThanOrEqual(2);
  await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page.locator('.avatar img')).toHaveCount(0);
});

test('аватары: прежнее фото остаётся видимым до готовности новой версии',async({page})=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const conversation={id:'fixture-a:conversation:0',sourceId:'fixture-a',title:'Сохраняем фото',kind:'direct',recipient:{id:'recipient',name:'Сохраняем фото'},unreadCount:0,updatedAt:'2026-11-08T10:00:00.000Z',preview:'Тест',canSend:true,avatarVersion:'photo-1'};
  const snapshot={conversations:[conversation],messages:[],sources:[{id:'fixture-a',kind:'test',name:'Telegram',connected:true}],refreshedAt:null,stale:false};let revision=1;let calls=0;let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/chat/inbox',route=>route.fulfill({json:{snapshot,page:{conversationId:'inbox',messages:[],nextCursor:null,cached:true,historyComplete:true}}}));
  await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:[conversation.id],revision}}));
  await page.route('**/api/chat/avatar',async route=>{calls++;if(calls===2){await gate;await route.fulfill({status:503,json:{error:'Временный отказ'}});}else await route.fulfill({contentType:'image/png',body:png});});
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
  const photo=page.getByRole('img',{name:'Фото: Сохраняем фото',exact:true});await expect(photo).toBeVisible();const previous=await photo.getAttribute('src');
  conversation.avatarVersion='photo-2';revision++;await expect.poll(()=>calls).toBe(2);await expect(photo).toHaveAttribute('src',previous!);await expect(photo).toHaveJSProperty('naturalWidth',1);
  release();await expect(photo).toHaveAttribute('src',previous!);await expect.poll(()=>calls).toBe(3);await expect(photo).not.toHaveAttribute('src',previous!);await expect(photo).toHaveJSProperty('naturalWidth',1);
});


test('аватары: миниатюра сохраняет лицо при отказе, повреждённый кеш перечитывается у источника',async({page})=>{
  const thumbnail=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;return canvas.toDataURL('image/jpeg').split(',')[1];});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const conversation={id:'fixture-a:conversation:0',sourceId:'fixture-a',title:'Синтетическая Юля',kind:'direct',recipient:{id:'recipient',name:'Синтетическая Юля'},unreadCount:0,updatedAt:'2026-11-08T10:00:00.000Z',preview:'Тест',canSend:true,avatarVersion:'photo-1',avatarThumbnail:thumbnail};
  const snapshot={conversations:[conversation],messages:[],sources:[{id:'fixture-a',kind:'test',name:'Telegram',connected:true}],refreshedAt:null,stale:false};let calls=0;let refresh=false;
  await page.route('**/api/chat/inbox',route=>route.fulfill({json:{snapshot,page:{conversationId:'inbox',messages:[],nextCursor:null,cached:true,historyComplete:true}}}));await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:[conversation.id],revision:1}}));
  await page.route('**/api/chat/avatar',route=>{calls++;if(calls===1)return route.fulfill({contentType:'image/jpeg',body:Buffer.from([255,216,255,224,0,0,255,217])});refresh=route.request().postDataJSON().refresh===true;return route.fulfill({contentType:'image/png',body:png});});
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();const photo=page.getByRole('img',{name:'Фото: Синтетическая Юля',exact:true});await expect(photo).toHaveAttribute('src',/^data:image\/jpeg;base64,/);await expect(photo).toHaveJSProperty('naturalWidth',1);
  await expect(photo).toHaveAttribute('src',/^blob:/);await expect(photo).toHaveJSProperty('naturalWidth',1);expect(refresh).toBe(true);expect(calls).toBe(2);
});
