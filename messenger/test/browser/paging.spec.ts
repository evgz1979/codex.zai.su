import {test,expect} from '@playwright/test';
test('автокеш: прокрутка без кнопок, обновления и удаления, быстрый переход',async({page},testInfo)=>{
 // Компактные сообщения должны прокручиваться и в невысоком desktop-окне.
 if(testInfo.project.name==='desktop-chromium')await page.setViewportSize({width:1440,height:700});
 const conversations=['Анна','Команда'].map((title,i)=>({id:`fixture-a:conversation:${i}`,sourceId:'fixture-a',title,kind:'direct',recipient:{id:`fixture-a:recipient:${i}`,name:title},unreadCount:0,updatedAt:'2026-11-07T10:00:00Z',preview:'',canSend:true}));
 const snapshot={conversations,messages:[],sources:[{id:'fixture-a',kind:'test',name:'Telegram',connected:true}],refreshedAt:null,stale:false};
 const histories=conversations.map(c=>Array.from({length:25},(_,i)=>({id:`${c.id}/${i+1}`,sourceId:c.sourceId,conversationId:c.id,sender:{id:'synthetic',name:c.title},text:`${c.title} ${i+1}`,date:new Date(Date.UTC(2026,10,7,0,i)).toISOString(),outgoing:false,status:'received',attachments:[]})));
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let settled:()=>void=()=>{};const firstSettled=new Promise<void>(resolve=>{settled=resolve;});let first=true;let revision=1;let deletedIds:string[]=[];
 const opens:string[]=[];const older:string[]=[];
 await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:conversations.map(c=>c.id),revision,deletedIds,sync:{pendingConversations:0}}}));
 await page.route('**/api/chat/inbox',route=>{const input=route.request().postDataJSON();const all=histories.flat().sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));const end=input.before?all.findIndex(m=>m.id===input.before):all.length;const start=Math.max(0,end-10);const messages=all.slice(start,end);return route.fulfill({json:{snapshot,page:{conversationId:'inbox',messages,nextCursor:start>0?messages[0].id:null,oldestCursor:messages[0]?.id,historyComplete:true,cached:true}}});});
 await page.route('**/api/chat/snapshot',route=>route.fulfill({json:snapshot}));
 await page.route('**/api/chat/refresh',()=>{throw new Error('Чат не должен запускать ручную синхронизацию');});
 await page.route(/\/api\/chat\/(open|older)$/,async route=>{
  const input=route.request().postDataJSON();const c=conversations.find(c=>c.id===input.conversationId)!;const old=route.request().url().endsWith('/older');(old?older:opens).push(c.id);
  const hold=first&&!old&&c.id===conversations[0].id;if(hold){first=false;await gate;}
  const all=histories[conversations.indexOf(c)];
  const end=input.before?all.findIndex(m=>m.id===input.before):all.length;const start=Math.max(0,end-10);const messages=all.slice(start,end);
  try{await route.fulfill({json:{snapshot,page:{conversationId:c.id,messages,nextCursor:start>0?messages[0].id:null,oldestCursor:messages[0]?.id,historyComplete:true,cached:true}}});}catch{if(!hold)throw new Error('Unexpected route failure');}finally{if(hold)settled();}
 });
 await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();

 await page.getByRole('button',{name:/Анна/}).click();await page.getByRole('button',{name:'Назад к чатам'}).click();await page.getByRole('button',{name:/Команда/}).click();await expect(page.locator('.bubble')).toHaveCount(10);await expect(page.getByRole('heading',{name:'Команда',exact:true})).toBeVisible();
 release();await firstSettled;await expect(page.locator('.bubble').getByText('Анна 25',{exact:true})).toHaveCount(0);
 const anchorTop=await page.locator('.feed').evaluate(element=>{element.scrollTop=0;return element.querySelector('.bubble')!.getBoundingClientRect().top;});
 await expect(page.locator('.bubble')).toHaveCount(20);
 const anchor=page.locator('.bubble').filter({hasText:'Команда 16'});expect(Math.abs((await anchor.boundingBox())!.y-anchorTop)).toBeLessThan(4);
 await page.locator('.feed').evaluate(element=>{element.scrollTop=0;});
 await expect(page.locator('.bubble')).toHaveCount(25);expect(older).toEqual([conversations[1].id,conversations[1].id]);
 await expect(page.getByRole('button',{name:'Обновить',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Загрузить ещё 10 сообщений'})).toHaveCount(0);
 // Автоматическое обновление не теряет уже открытые старые страницы.
 const all=histories[1];all.push({...all[24],id:`${conversations[1].id}/26`,text:'Новое автоматически',date:'2026-11-07T01:00:00Z'});revision++;
 await expect(page.locator('.bubble')).toHaveCount(26,{timeout:7000});await expect(page.locator('.bubble').getByText('Новое автоматически',{exact:true})).toHaveCount(1);
 deletedIds=[all[0].id];all.shift();revision++;
 await expect(page.locator('.bubble').getByText('Команда 1',{exact:true})).toHaveCount(0,{timeout:7000});await expect(page.locator('.bubble')).toHaveCount(25);
 await page.getByRole('button',{name:'Назад к чатам'}).click();await page.getByRole('button',{name:/Анна/}).click();await expect(page.locator('.bubble')).toHaveCount(10);await expect(page.locator('.bubble').getByText('Анна 25',{exact:true})).toBeVisible();await expect(page.locator('.bubble').getByText('Команда 25',{exact:true})).toHaveCount(0);
 expect(opens.filter(id=>id===conversations[0].id)).toHaveLength(2);expect(opens.at(-1)).toBe(conversations[0].id);
 await page.getByRole('button',{name:'Назад к чатам'}).click();await page.getByRole('button',{name:/Общая лента/}).click();await expect(page.locator('.bubble')).toHaveCount(10);await page.locator('.feed').evaluate(element=>{element.scrollTop=0;});await expect(page.locator('.bubble')).toHaveCount(20);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:`test-results/paging-${testInfo.project.name}.png`});
});
