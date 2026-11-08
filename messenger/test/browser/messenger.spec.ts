import { test, expect } from '@playwright/test';
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
  await expect(page.locator('.conversation .preview')).toHaveText(previews);await expect(page.locator('.conversation > .badge')).toHaveText(['1','1','1','1']);await expect(page.getByText('Личный диалог',{exact:true})).toHaveCount(0);await page.waitForTimeout(800);expect(reads).toEqual([]);
});
