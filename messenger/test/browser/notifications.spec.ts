import {test,expect} from '@playwright/test';

test('уведомления: iPhone получает инструкцию установки на экран Домой',async({page,isMobile})=>{
  test.skip(!isMobile,'Инструкция относится к iPhone.');
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
  await page.locator('.notification-settings summary').click();
  await expect(page.locator('.notification-settings')).toContainText('На экран Домой');
  await expect(page.locator('.notification-settings')).toContainText('iOS 16.4');
  await expect(page.locator('.notification-settings').getByRole('button',{name:'Включить',exact:true})).toHaveCount(0);
});

test('уведомления: явное включение, проверка и выключение без повторного запроса разрешения',async({page,isMobile})=>{
  await page.addInitScript(()=>{
    const original=window.matchMedia.bind(window);window.matchMedia=query=>{const result=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});return result;};
    let subscribed=false;
    const sub={endpoint:'https://web.push.apple.com/Qsynthetic',options:{},toJSON:()=>({endpoint:'https://web.push.apple.com/Qsynthetic',keys:{p256dh:'synthetic',auth:'synthetic'}}),unsubscribe:async()=>{subscribed=false;return true;}};
    const worker={pushManager:{getSubscription:async()=>subscribed?sub:null,subscribe:async()=>{subscribed=true;return sub;}},getNotifications:async()=>[]};
    Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>worker,ready:Promise.resolve(worker),getRegistration:async()=>worker},configurable:true});
    Object.defineProperty(window,'PushManager',{value:class {}});
    Object.defineProperty(window,'Notification',{value:{permission:'default',requestPermission:async()=>{(window as unknown as {permissionRequests:number}).permissionRequests=((window as unknown as {permissionRequests:number}).permissionRequests||0)+1;return 'granted';}}});
  });
  const calls:string[]=[];
  await page.route('**/api/chat/push/**',async route=>{
    const action=route.request().url().split('/').pop()!;calls.push(action);
    if(action==='config')return route.fulfill({json:{publicKey:'BA'.padEnd(87,'A')}});
    if(action==='status')return route.fulfill({json:{enabled:false}});
    await route.fulfill({json:{ok:true}});
  });
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();

  await page.locator('.notification-settings summary').click();
  expect(await page.evaluate(()=>(window as unknown as {permissionRequests:number}).permissionRequests||0)).toBe(0);
  await page.getByRole('button',{name:'Включить',exact:true}).click();await expect(page.locator('.notification-settings summary')).toHaveText('Уведомления: включены');
  await page.screenshot({path:`test-results/notifications-${test.info().project.name}.png`});
  await page.getByRole('button',{name:'Проверить',exact:true}).click();await expect(page.locator('.notification-settings')).toContainText('Проверка отправлена');
  await page.getByRole('button',{name:'Выключить',exact:true}).click();await expect(page.locator('.notification-settings summary')).toHaveText('Уведомления');
  expect(calls).toEqual(['config','subscribe','test','remove']);
  expect(await page.evaluate(()=>(window as unknown as {permissionRequests:number}).permissionRequests)).toBe(1);
});
