import {test,expect} from '@playwright/test';

test('личный Messenger: владелец создаёт ссылку, имя видно на главной, вход только паролем и чужие чаты закрыты',async({page,isMobile})=>{
  const username=`anna${test.info().project.name==='desktop-chromium'?'pc':test.info().project.name==='iphone-webkit'?'phone':'small'}`;
  await page.route('**/api/admin/status',route=>route.fulfill({json:{telegram:{configured:false,connected:false,stage:'idle'},selectedCount:0}}));
  await page.goto('/admin');await page.getByLabel('Пароль администратора').fill('browser-admin-password');await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.getByRole('button',{name:'Пользователи',exact:true}).click();
  await page.getByLabel('Имя пользователя в ссылке').fill(username);await page.getByLabel('Имя на главной').fill('Анна');await page.getByLabel('Начальный пароль').fill('anna-browser-password');await page.getByRole('button',{name:'Добавить',exact:true}).click();
  const link=page.getByRole('link',{name:new RegExp(`/u/${username}/$`)});await expect(link).toBeVisible();const url=await link.getAttribute('href');
  await page.goto(url!);await expect(page.getByText(`Анна · @${username}`,{exact:true})).toBeVisible();
  await expect(page.locator('input')).toHaveCount(1);await expect(page.locator('input')).toHaveAttribute('type','password');await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();
  await page.screenshot({path:`test-results/personal-entry-${test.info().project.name}.png`,fullPage:true});
  await page.getByLabel('Пароль',{exact:true}).fill('anna-browser-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
  await expect(page.getByRole('navigation',{name:'Получатели'}).getByRole('button')).toHaveCount(0);
  await expect(page.locator('.account-settings')).toContainText('Анна');
  if(isMobile)await page.getByRole('button',{name:'Открыть диалоги'}).click();
  await page.getByRole('link',{name:'Настройки',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/u/${username}/admin$`));
  await expect(page.getByText(`Анна · @${username}`,{exact:true})).toBeVisible();await page.getByLabel('Пароль администратора').fill('anna-browser-password');await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Источники → Telegram'})).toBeVisible();await expect(page.getByRole('button',{name:'Пользователи',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Открыть чат'})).toHaveAttribute('href',`/u/${username}/`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/personal-users-${test.info().project.name}.png`,fullPage:true});
});
