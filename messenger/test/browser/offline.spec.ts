import {test,expect,type Page} from '@playwright/test';
test.use({serviceWorkers:'allow'});
//: Дожидается настоящей оболочки в Cache Storage и подтверждённого входа.
//: Синтетический сервер работает на loopback, API и worker не подменяются.
async function login(page:Page,path='/',password='browser-test-password'){
  await page.goto(path);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Войти в Messenger'}).click();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(async()=>{const names=await caches.keys();return (await Promise.all(names.map(async name=>(await caches.open(name)).keys()))).flat().some(key=>key.url.endsWith(location.pathname));})).toBe(true);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL.endsWith(`${location.pathname}sw.js`))).toBe(true);
}
//: Читает только тестовый IndexedDB-кеш для проверки очистки и отсутствия секретов.
//: Не обращается к рабочему аккаунту или production-хранилищу.
async function stored(page:Page){return page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('zai-messenger-offline-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const result=await new Promise<unknown[]>((resolve,reject)=>{const request=db.transaction('accounts').objectStore('accounts').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();return JSON.stringify(result);
});}
test('offline: просмотренные чаты и расшифровки доступны после закрытия окна, без отправок',async({page,context},testInfo)=>{
  await login(page);await page.getByRole('button',{name:'Общая лента',exact:true}).click();
  await expect(page.getByRole('button',{name:'Открыть вложение: Голосовое.wav'})).toBeVisible();
  const transcribe=page.getByRole('button',{name:'Расшифровать',exact:true});if(await transcribe.count())await transcribe.click();await expect(page.getByText('Синтетическая расшифровка голосового.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Назад к чатам'}).click();await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);await page.getByRole('button',{name:'Назад к чатам'}).click();await page.getByRole('button',{name:/Команда проекта/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);
  const onlineData=await stored(page);const liveSession=await(await page.request.get('/api/chat/session')).json() as {csrfToken:string;expiresAt:number};expect(liveSession.expiresAt).toBeGreaterThan(Date.now());expect(onlineData).toContain('Синтетическая расшифровка');for(const secret of [liveSession.csrfToken,'csrfToken','browser-test-password','apiHash','sessionToken'])expect(onlineData).not.toContain(secret);
  await context.setOffline(true);await expect(page.locator('.feed-info')).toContainText('Без сети');await expect(page.getByLabel('Сообщение',{exact:true})).toBeDisabled();await page.getByRole('button',{name:'Назад к чатам'}).click();await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByText('Синтетическая расшифровка голосового.',{exact:true})).toBeVisible();
  const next=await context.newPage();await page.close();let writes=0;next.on('request',request=>{if(/\/chat\/(send|read|transcribe)$/.test(request.url()))writes++;});
  await next.goto('/');await expect(next.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await expect(next.locator('.list-header')).toContainText('Без сети');await next.getByRole('button',{name:/Анна Смирнова/}).click();await expect(next.getByText('Синтетическая расшифровка голосового.',{exact:true})).toBeVisible();expect(writes).toBe(0);
  expect(await next.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await next.screenshot({path:`test-results/offline-${testInfo.project.name}.png`});
  await context.setOffline(false);await expect(next.locator('.feed-info')).not.toContainText('Без сети',{timeout:10000});await expect(next.getByLabel('Сообщение',{exact:true})).toBeEnabled();
});
test('offline: локальный выход очищает сообщения, повторный запуск не восстанавливает старую cookie',async({page,context})=>{
  await login(page);await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);await page.getByRole('button',{name:'Назад к чатам'}).click();await context.setOffline(true);
  await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();expect(await stored(page)).not.toContain('Синтетическая расшифровка');
  await page.reload();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toHaveCount(0);await context.setOffline(false);await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toHaveCount(0);expect(await stored(page)).not.toContain('Синтетическая расшифровка');
});
test('offline: отзыв сессии очищает локальные данные при возвращении связи',async({page,context,request,baseURL})=>{
  await login(page);await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);
  const response=await page.request.get('/api/chat/session');const session=await response.json() as {csrfToken:string};const cookies=await context.cookies();const cookie=cookies.filter(c=>c.name==='zai_chat').map(c=>`${c.name}=${c.value}`).join(';');
  await context.setOffline(true);expect((await request.post(`${baseURL}/api/chat/logout`,{headers:{Origin:baseURL!,Cookie:cookie,'X-CSRF-Token':session.csrfToken},data:{}})).status()).toBe(200);
  await context.setOffline(false);await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();expect(await stored(page)).not.toContain('Синтетическая расшифровка');await context.setOffline(true);await page.reload();await expect(page.getByRole('article')).toHaveCount(0);
});
test('offline: кеши владельца и личной ссылки изолированы, выход гостя не очищает владельца',async({page,context,request,baseURL})=>{
  const username='cacheguest';
  const admin=await request.post(`${baseURL}/api/admin/login`,{headers:{Origin:baseURL!},data:{password:'browser-admin-password'}});const info=await admin.json() as {csrfToken:string};expect(admin.status()).toBe(200);
  const existing=await request.get(`${baseURL}/api/u/${username}/chat/session`);
  if(existing.status()===404)expect((await request.post(`${baseURL}/api/admin/users/create`,{headers:{Origin:baseURL!,'X-CSRF-Token':info.csrfToken},data:{username,displayName:'Кеш гостя',password:'cache-user-password'}})).status()).toBe(200);else expect(existing.status()).toBe(200);
  await login(page);await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);
  const personal=await context.newPage();await login(personal,`/${username}/`,'cache-user-password');await context.setOffline(true);await personal.reload();await expect(personal.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await expect(personal.getByRole('button',{name:/Анна Смирнова/})).toHaveCount(0);await expect(personal.locator('.sidebar-footer')).toContainText('Кеш гостя');
  await personal.getByRole('button',{name:'Выйти',exact:true}).click();await page.reload();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);
});
test('offline: просроченный кеш не открывает переписку, недоступное хранилище не мешает входу',async({page,context})=>{
  await login(page);await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);
  await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open('zai-messenger-offline-v1',1);request.onsuccess=()=>resolve(request.result);});
    await new Promise<void>(resolve=>{const transaction=db.transaction('accounts','readwrite');const store=transaction.objectStore('accounts');const request=store.get('/api');request.onsuccess=()=>{store.put({...request.result,expiresAt:Date.now()-1},'/api');};transaction.oncomplete=()=>resolve();});db.close();
  });
  await context.setOffline(true);await page.reload();await expect(page.getByText('Нет связи. Откройте приложение с интернетом, чтобы сохранить сообщения.',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toHaveCount(0);await context.setOffline(false);await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();
  await page.addInitScript(()=>{Object.defineProperty(indexedDB,'open',{value:()=>{throw new Error('Synthetic storage denied');}});});await page.reload();await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();
});
test('offline: опрос неизменённой ревизии не перезаписывает сохранённые сообщения',async({page})=>{
  await login(page);await page.waitForTimeout(2300);const before=JSON.parse(await stored(page))[0] as {savedAt:number;accessRevision:number};expect(typeof before.accessRevision).toBe('number');
  await page.waitForTimeout(2400);const after=JSON.parse(await stored(page))[0] as {savedAt:number;accessRevision:number};expect(after.accessRevision).toBe(before.accessRevision);expect(after.savedAt).toBe(before.savedAt);
});
test.describe('отказ сервера',()=>{
  test.use({serviceWorkers:'block'});
  test('offline: 503 использует сохранённое чтение, 401 очищает его',async({page})=>{
    await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);
    await page.route('**/api/chat/**',route=>route.fulfill({status:503,contentType:'text/html',body:'Synthetic server unavailable'}));await page.reload();await expect(page.getByRole('heading',{name:'Чаты',exact:true})).toBeVisible();await expect(page.locator('.list-header')).toContainText('Без сети');await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);
    await page.unroute('**/api/chat/**');await page.route('**/api/chat/**',route=>route.fulfill({status:401,json:{error:'Войдите в приложение.'}}));await page.reload();await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();await expect(page.getByRole('article')).toHaveCount(0);expect(await stored(page)).not.toContain('Синтетическая расшифровка');
  });
  test('offline: поздний ответ исключённого чата не возвращает сообщения в кеш',async({page})=>{
    await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await page.getByRole('button',{name:/Анна Смирнова/}).click();await expect(page.getByRole('article')).not.toHaveCount(0);await page.getByRole('button',{name:'Назад к чатам'}).click();
    const initial=JSON.parse(await stored(page))[0] as {snapshot:{conversations:{id:string;title:string}[]};accessRevision:number};const excluded=initial.snapshot.conversations.find(c=>c.title==='Анна Смирнова')!.id;
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
    await page.route('**/api/chat/open',async route=>{const response=await route.fetch();started();await gate;await route.fulfill({response});});
    await page.getByRole('button',{name:/Анна Смирнова/}).click();await ready;
    for(const path of ['inbox','snapshot'])await page.route(`**/api/chat/${path}`,async route=>{const response=await route.fetch();const result=await response.json();const snapshot=result.snapshot||result;snapshot.conversations=snapshot.conversations.filter((c:{id:string})=>c.id!==excluded);snapshot.messages=snapshot.messages.filter((m:{conversationId:string})=>m.conversationId!==excluded);if(result.page)result.page.messages=result.page.messages.filter((m:{conversationId:string})=>m.conversationId!==excluded);await route.fulfill({response,json:result});});
    await page.route('**/api/chat/access?*',route=>route.fulfill({json:{ids:initial.snapshot.conversations.filter(c=>c.id!==excluded).map(c=>c.id),revision:(initial.accessRevision||Date.now())+1}}));
    await expect(page.getByRole('button',{name:/Анна Смирнова/})).toHaveCount(0);release();await page.waitForTimeout(300);
    const cached=JSON.parse(await stored(page))[0] as {snapshot:{conversations:{id:string}[]};messages:{conversationId:string}[]};expect(cached.snapshot.conversations.some(c=>c.id===excluded)).toBe(false);expect(cached.messages.some(m=>m.conversationId===excluded)).toBe(false);
  });
});
