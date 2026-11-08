import {test,expect,type Page} from '@playwright/test';
//: Создаёт управляемую публичную версию поверх собранного клиента.
//: Использует временный сервер и синтетический релиз, не меняет установленный worker.
async function versions(page:Page){
  const response=await page.request.get('/version.json');expect(response.status()).toBe(200);const current=await response.json() as {version:string;buildId:string};const control={release:current,offline:false};
  await page.route('**/version.json?*',route=>control.offline?route.abort('failed'):route.fulfill({json:control.release}));return {current,control};
}
//: Выполняет обычный вход в тестовый Messenger.
//: Пароль принадлежит только временной браузерной фикстуре.
async function login(page:Page){await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();}

test('обновления: новая сборка не перезагружает чат, отмена сохраняет черновик, применение сохраняет вход',async({page})=>{
  const {control}=await versions(page);await login(page);await page.getByRole('button',{name:/Анна Смирнова/}).click();await page.getByLabel('Сообщение',{exact:true}).fill('Не потерять черновик');
  control.release={version:'0.99.0',buildId:'synthetic-new-build'};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('status').filter({hasText:'Доступно обновление 0.99.0'})).toBeVisible();await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('Не потерять черновик');expect(page.url()).not.toContain('_app_update');
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Обновить приложение',exact:true}).click();await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('Не потерять черновик');expect(page.url()).not.toContain('_app_update');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Обновить приложение',exact:true}).click();await expect(page).toHaveURL(/\?_app_update=synthetic-new-build-/);await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await expect(page.getByLabel('Пароль',{exact:true})).toHaveCount(0);
});

test('обновления: без сети приложение остаётся открытым, восстановление позволяет обновиться',async({page})=>{
  const {current,control}=await versions(page);await login(page);control.offline=true;await page.getByRole('button',{name:'Обновить приложение',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Не удалось получить обновление');await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();expect(page.url()).not.toContain('_app_update');
  control.offline=false;await page.getByRole('button',{name:'Обновить приложение',exact:true}).click();await expect(page).toHaveURL(new RegExp(`_app_update=${current.buildId}-`));await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();
});
