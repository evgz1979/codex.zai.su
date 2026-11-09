import {test,expect,type Page} from '@playwright/test';

//: Подменяет только браузерные push API с сохранением синтетического разрешения между загрузками.
//: HTTP-вход остаётся настоящим; к Apple, Telegram и production-аккаунтам тест не обращается.
async function mockPush(page:Page,permission:'default'|'granted'|'denied'='default',existing=false){
  await page.addInitScript(({permission,existing})=>{
    const original=window.matchMedia.bind(window);window.matchMedia=query=>{const result=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});return result;};
    let subscribed=existing||sessionStorage.getItem('synthetic-push')==='yes';
    const sub={endpoint:'https://web.push.apple.com/Qsynthetic',expirationTime:null,options:{},toJSON:()=>({endpoint:'https://web.push.apple.com/Qsynthetic',keys:{p256dh:'synthetic',auth:'synthetic'}}),unsubscribe:async()=>{subscribed=false;sessionStorage.removeItem('synthetic-push');return true;}};
    const worker={pushManager:{getSubscription:async()=>subscribed?sub:null,subscribe:async()=>{subscribed=true;sessionStorage.setItem('synthetic-push','yes');return sub;}},getNotifications:async()=>[]};
    Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>worker,ready:Promise.resolve(worker),getRegistration:async()=>worker},configurable:true});
    Object.defineProperty(window,'PushManager',{value:class {}});
    const notifications={get permission(){return sessionStorage.getItem('synthetic-permission')||permission;},requestPermission:async()=>{sessionStorage.setItem('synthetic-permission-requests',String(Number(sessionStorage.getItem('synthetic-permission-requests')||0)+1));sessionStorage.setItem('synthetic-permission','granted');return 'granted';}};
    Object.defineProperty(window,'Notification',{value:notifications});
  },{permission,existing});
}
//: Входит в синтетический чат через реальную форму браузерного сервера.
//: Cookie и CSRF не подменяются и не записываются тестом в хранилище браузера.
async function login(page:Page){await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();}
//: Подменяет только исходящие HTTP-действия уведомлений и собирает их имена.
//: Отсутствующие серверные подписки восстанавливаются через subscribe без ручного status/enable.
async function mockDelivery(page:Page){
  const calls:string[]=[];await page.route('**/api/chat/push/**',async route=>{
    const action=route.request().url().split('/').pop()!;calls.push(action);
    if(action==='config')return route.fulfill({json:{publicKey:'BA'.padEnd(87,'A')}});
    await route.fulfill({json:{ok:true}});
  });return calls;
}

test('уведомления: iPhone получает инструкцию установки на экран Домой',async({page,isMobile})=>{
  test.skip(!isMobile,'Инструкция относится к iPhone.');await login(page);
  await page.locator('.notification-settings summary').click();
  await expect(page.locator('.notification-settings')).toContainText('На экран Домой');
  await expect(page.locator('.notification-settings')).toContainText('iOS 16.4');
  await expect(page.locator('.notification-settings').getByRole('button',{name:'Разрешить уведомления',exact:true})).toHaveCount(0);
});

test('уведомления: одно разрешение сохраняет доставку после перезагрузки, проверка и явный выход',async({page})=>{
  await mockPush(page);const calls=await mockDelivery(page);await login(page);
  await expect(page.getByRole('button',{name:'Разрешить уведомления',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem('synthetic-permission-requests'))).toBeNull();
  await page.getByRole('button',{name:'Разрешить уведомления',exact:true}).click();await expect(page.locator('.notification-settings summary')).toHaveText('Уведомления: включены');
  await expect(page.getByRole('button',{name:'Выключить',exact:true})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await expect(page.locator('.notification-settings summary')).toHaveText('Уведомления: включены');
  expect(await page.evaluate(()=>sessionStorage.getItem('synthetic-permission-requests'))).toBe('1');
  await page.locator('.notification-settings summary').click();await page.getByRole('button',{name:'Проверить',exact:true}).click();await expect(page.locator('.notification-settings')).toContainText('Проверка отправлена');
  await page.screenshot({path:`test-results/notifications-${test.info().project.name}.png`});
  expect(calls.filter(action=>action==='subscribe')).toHaveLength(3);expect(calls).not.toContain('remove');
  let endpoint:unknown;await page.route('**/api/chat/logout',route=>{endpoint=route.request().postDataJSON().pushEndpoint;return route.continue();});
  await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();expect(endpoint).toBe('https://web.push.apple.com/Qsynthetic');
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('synthetic-push'))).toBeNull();
});

for(const existing of [false,true])test(`уведомления: granted автоматически восстанавливает ${existing?'серверную':'браузерную'} подписку`,async({page})=>{
  await mockPush(page,'granted',existing);const calls=await mockDelivery(page);await login(page);
  await expect(page.locator('.notification-settings summary')).toHaveText('Уведомления: включены');expect(calls).toEqual(['config','subscribe']);
  expect(await page.evaluate(()=>sessionStorage.getItem('synthetic-permission-requests'))).toBeNull();
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>calls.filter(action=>action==='subscribe').length).toBe(2);
});

test('уведомления: временный отказ восстанавливается автоматически при возвращении сети',async({page})=>{
  await mockPush(page,'granted',true);let failed=true;let subscribed=0;
  await page.route('**/api/chat/push/**',route=>{if(route.request().url().endsWith('/config'))return route.fulfill({json:{publicKey:'BA'.padEnd(87,'A')}});subscribed++;return route.fulfill(failed?{status:503,json:{error:'Временный отказ'}}:{json:{ok:true}});});
  await login(page);await expect(page.locator('.notification-settings')).toContainText('Повторим автоматически');failed=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('.notification-settings summary')).toHaveText('Уведомления: включены');expect(subscribed).toBe(2);
  expect(await page.evaluate(()=>sessionStorage.getItem('synthetic-permission-requests'))).toBeNull();
});

test('уведомления: системный запрет не вызывает повторных запросов разрешения',async({page})=>{
  await mockPush(page,'denied');const calls=await mockDelivery(page);await login(page);await page.locator('.notification-settings summary').click();
  await expect(page.locator('.notification-settings')).toContainText('Уведомления запрещены');expect(calls).toEqual([]);expect(await page.evaluate(()=>sessionStorage.getItem('synthetic-permission-requests'))).toBeNull();
});

test('вход чата: истечение подтверждённого срока проверяет сервер и не вызывает logout или отзыв push',async({page})=>{
  await mockPush(page,'granted',true);await mockDelivery(page);await login(page);let checked=0;let requests=0;let logouts=0;
  page.on('request',request=>{if(request.url().endsWith('/chat/logout'))logouts++;});
  await page.route('**/api/chat/session',async route=>{const attempt=++requests;const response=await route.fetch();const info=await response.json();await route.fulfill({json:{...info,expiresAt:attempt===1?Date.now()+1000:Date.now()+180*86400000}});checked++;});
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>checked).toBe(1);
  await page.waitForTimeout(1100);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(()=>checked).toBeGreaterThan(1);await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await page.unrouteAll({behavior:'wait'});expect(logouts).toBe(0);
});
