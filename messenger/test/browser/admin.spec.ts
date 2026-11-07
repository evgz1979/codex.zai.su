import {test,expect} from '@playwright/test';
test('админка: отдельный вход, Telegram code/2FA и выбор галочками',async({page})=>{
 let stage='idle';let configured=false;let saved:string[]=[];
 const conversation={id:'telegram-47:conversation:1',sourceId:'telegram-47',title:'Тестовый канал',kind:'channel',recipient:{id:'telegram-47:recipient:1',name:'Тестовый канал'},canSend:false,unreadCount:3,updatedAt:new Date().toISOString(),preview:''};
 // Только тест UI: Telegram не подключается, публичные API защищены отдельными HTTP-тестами.
 await page.route('**/api/admin/status',route=>route.fulfill({json:{telegram:{configured,connected:configured,stage},selectedCount:saved.length}}));
 await page.route('**/api/admin/telegram/begin',route=>{const input=route.request().postDataJSON();expect(input.apiHash).toBe('1'.repeat(32));stage='code';return route.fulfill({json:{stage}});});
 await page.route('**/api/admin/telegram/code',route=>{stage='password';return route.fulfill({json:{stage}});});
 await page.route('**/api/admin/telegram/password',route=>{stage='connected';configured=true;return route.fulfill({json:{stage}});});
 await page.route('**/api/admin/dialogs',route=>route.fulfill({json:{conversations:[conversation],selectedIds:saved}}));
 await page.route('**/api/admin/selection',route=>{saved=route.request().postDataJSON().ids;return route.fulfill({json:{selectedIds:saved}});});
 await page.goto('/admin');await page.getByLabel('Пароль администратора').fill('browser-admin-password');await page.getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Источники → Telegram'})).toBeVisible();
 await page.getByLabel('api_id',{exact:true}).fill('123');await page.getByLabel('api_hash',{exact:true}).fill('1'.repeat(32));await page.getByLabel('Номер телефона').fill('+79990000000');await page.getByRole('button',{name:'Получить код'}).click();
 await page.getByLabel('Код Telegram',{exact:true}).fill('12345');await page.getByRole('button',{name:'Подтвердить',exact:true}).click();
 await page.getByLabel('Пароль 2FA',{exact:true}).fill('synthetic-2fa');await page.getByRole('button',{name:'Подтвердить',exact:true}).click();
 const box=page.getByLabel('Разрешить: Тестовый канал');await expect(box).not.toBeChecked();await box.check();await page.getByRole('button',{name:'Сохранить выбор'}).click();await expect(page.getByText('Выбор сохранён.')).toBeVisible();expect(saved).toEqual([conversation.id]);
 await box.uncheck();await page.getByRole('button',{name:'Сохранить выбор'}).click();await expect(page.getByText('Выбрано: 0 / 100',{exact:false})).toBeVisible();expect(saved).toEqual([]);
 await expect(page.getByLabel('Сообщение',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Выйти из админки'}).click();await expect(page.getByLabel('Пароль администратора')).toBeVisible();
});
