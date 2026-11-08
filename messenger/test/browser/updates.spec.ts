import {test,expect,type Page} from '@playwright/test';
//: Создаёт управляемую публичную версию поверх собранного клиента.
//: Использует временный сервер и синтетический релиз, не меняет установленный worker.
async function versions(page:Page){
  const response=await page.request.get('/version.json');expect(response.status()).toBe(200);const current=await response.json() as {version:string;buildId:string};const control={release:current,offline:false,before:undefined as undefined|(()=>Promise<void>)};
  await page.route('**/version.json?*',async route=>{await control.before?.();return control.offline?route.abort('failed'):route.fulfill({json:control.release});});return {current,control};
}
//: Выполняет обычный вход в тестовый Messenger.
//: Пароль принадлежит только временной браузерной фикстуре.
async function login(page:Page){await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();}

test('обновления: новая сборка не перезагружает чат, отмена сохраняет черновик, применение сохраняет вход',async({page})=>{
  const {control}=await versions(page);await login(page);await page.getByRole('button',{name:/Анна Смирнова/}).click();await page.getByLabel('Сообщение',{exact:true}).fill('Не потерять черновик');
  control.release={version:'0.99.0',buildId:'synthetic-new-build'};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.sidebar .app-updates-inline')).toHaveClass(/update-available/);await expect(page.locator('.chat .app-updates-inline')).toHaveCount(0);await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('Не потерять черновик');expect(page.url()).not.toContain('_app_update');
  await page.getByRole('button',{name:'Назад к чатам'}).click();await expect(page.getByRole('button',{name:'Обновить приложение',exact:true})).toHaveAttribute('title','Доступно обновление 0.99.0');
  const dismissed=page.waitForEvent('dialog');await page.getByRole('button',{name:'Обновить приложение',exact:true}).click();await(await dismissed).dismiss();await expect(page.getByRole('button',{name:'Обновить приложение',exact:true})).toBeEnabled();await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('Не потерять черновик');expect(page.url()).not.toContain('_app_update');await page.getByRole('button',{name:'Назад к чатам'}).click();
  const accepted=page.waitForEvent('dialog');await page.getByRole('button',{name:'Обновить приложение',exact:true}).click();await(await accepted).accept();await expect(page).toHaveURL(/\?_app_update=synthetic-new-build-/);await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await expect(page.getByLabel('Пароль',{exact:true})).toHaveCount(0);
});

test('обновления: без сети приложение остаётся открытым, восстановление позволяет обновиться',async({page})=>{
  const {current,control}=await versions(page);await login(page);control.offline=true;await page.getByRole('button',{name:'Обновить приложение',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Не удалось получить обновление');await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();expect(page.url()).not.toContain('_app_update');
  control.offline=false;await page.getByRole('button',{name:'Обновить приложение',exact:true}).click();await expect(page).toHaveURL(new RegExp(`_app_update=${current.buildId}-`));await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();
});


test('обновления: черновик, начатый во время проверки версии, тоже требует подтверждения',async({page})=>{
  const {control}=await versions(page);await login(page);let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let started:()=>void=()=>{};const ready=new Promise<void>(resolve=>{started=resolve;});control.before=async()=>{started();await gate;};
  await page.getByRole('button',{name:'Обновить приложение',exact:true}).click();await ready;await page.getByRole('button',{name:/Анна Смирнова/}).click();await page.getByLabel('Сообщение',{exact:true}).fill('Новый черновик во время ожидания');
  const dialog=page.waitForEvent('dialog');release();await(await dialog).dismiss();await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('Новый черновик во время ожидания');expect(page.url()).not.toContain('_app_update');
});
