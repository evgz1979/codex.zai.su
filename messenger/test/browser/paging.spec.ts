import {test,expect} from '@playwright/test';
test('чат: 10 сообщений адресата, ручная догрузка, прокрутка и быстрый переход',async({page},testInfo)=>{
 const conversations=['Анна','Команда'].map((title,i)=>({id:`fixture-a:conversation:${i}`,sourceId:'fixture-a',title,kind:'direct',recipient:{id:`fixture-a:recipient:${i}`,name:title},unreadCount:0,updatedAt:'2026-11-07T10:00:00Z',preview:'',canSend:true}));
 const snapshot={conversations,messages:[],sources:[{id:'fixture-a',kind:'test',name:'Telegram',connected:true}],refreshedAt:null,stale:true};
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let settled:()=>void=()=>{};const firstSettled=new Promise<void>(resolve=>{settled=resolve;});let first=true;let refreshes=0;
 const opens:string[]=[];const older:string[]=[];
 await page.route('**/api/chat/access',route=>route.fulfill({json:{ids:conversations.map(c=>c.id)}}));
 await page.route('**/api/chat/snapshot',route=>route.fulfill({json:snapshot}));
 await page.route('**/api/chat/refresh',route=>{refreshes++;return route.fulfill({json:snapshot});});
 await page.route(/\/api\/chat\/(open|older)$/,async route=>{
  const input=route.request().postDataJSON();const c=conversations.find(c=>c.id===input.conversationId)!;const old=route.request().url().endsWith('/older');(old?older:opens).push(c.id);
  const hold=first&&!old&&c.id===conversations[0].id;if(hold){first=false;await gate;}
  const all=Array.from({length:25},(_,i)=>({id:`${c.id}/${i+1}`,sourceId:c.sourceId,conversationId:c.id,sender:{id:'synthetic',name:c.title},text:`${c.title} ${i+1}`,date:new Date(Date.UTC(2026,10,7,0,i)).toISOString(),outgoing:false,status:'received',attachments:[]}));
  const end=input.before?all.findIndex(m=>m.id===input.before):all.length;const start=Math.max(0,end-10);const messages=all.slice(start,end);
  try{await route.fulfill({json:{snapshot,page:{conversationId:c.id,messages,nextCursor:start>0?messages[0].id:null}}});}catch{if(!hold)throw new Error('Unexpected route failure');}finally{if(hold)settled();}
 });
 await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
 const mobile=testInfo.project.name!=='desktop-chromium';if(mobile)await page.getByRole('button',{name:'Открыть диалоги'}).click();
 await page.getByRole('button',{name:/Анна/}).click();if(mobile)await page.getByRole('button',{name:'Открыть диалоги'}).click();await page.getByRole('button',{name:/Команда/}).click();await expect(page.locator('.bubble')).toHaveCount(10);await expect(page.getByRole('heading',{name:'Команда',exact:true})).toBeVisible();
 release();await firstSettled;await expect(page.locator('.bubble').getByText('Анна 25',{exact:true})).toHaveCount(0);
 await page.locator('.feed').evaluate(element=>{element.scrollTop=0;});const anchor=page.locator('.bubble').getByText('Команда 16',{exact:true});const top=(await anchor.boundingBox())!.y;
 await page.getByRole('button',{name:'Загрузить ещё 10 сообщений'}).click();await expect(page.locator('.bubble')).toHaveCount(20);expect(Math.abs((await anchor.boundingBox())!.y-top)).toBeLessThan(3);
 await page.getByRole('button',{name:'Загрузить ещё 10 сообщений'}).click();await expect(page.locator('.bubble')).toHaveCount(25);await expect(page.getByRole('button',{name:'Загрузить ещё 10 сообщений'})).toHaveCount(0);expect(older).toEqual([conversations[1].id,conversations[1].id]);
 if(mobile)await page.getByRole('button',{name:'Открыть диалоги'}).click();await page.getByRole('button',{name:/Анна/}).click();await expect(page.locator('.bubble')).toHaveCount(10);await expect(page.locator('.bubble').getByText('Анна 25',{exact:true})).toBeVisible();await expect(page.locator('.bubble').getByText('Команда 25',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Обновить',exact:true}).click();await expect(page.getByRole('button',{name:'Обновить',exact:true})).toBeEnabled();expect(refreshes).toBe(1);expect(opens.filter(id=>id===conversations[1].id)).toHaveLength(1);expect(opens.at(-1)).toBe(conversations[0].id);await expect(page.locator('.bubble')).toHaveCount(10);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.locator('.feed').evaluate(element=>{element.scrollTop=0;});await page.screenshot({path:`test-results/paging-${testInfo.project.name}.png`});
});
