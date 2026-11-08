import {test,expect} from '@playwright/test';

test('WhatsApp в админке: серверный QR, готовность, выбор; QR не сохраняется локально',async({page})=>{
 let stage='idle';let selected:string[]=[];
 await page.route('**/api/admin/**',async route=>{
  const action=new URL(route.request().url()).pathname.slice('/api/admin/'.length);
  const qr='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const status={stage,connected:stage==='connected',...(stage==='qr'?{qrDataUrl:qr,expiresAt:Date.now()+30000}:{})};
  if(action==='whatsapp/begin')stage='qr';
  if(action==='whatsapp/selection')selected=route.request().postDataJSON().ids;
  const data=action==='session'?{authenticated:true,setupRequired:false,csrfToken:'synthetic-csrf',account:{id:'owner',username:'owner',displayName:'Владелец',isOwner:true,path:'/'}}:action==='status'?{telegram:{configured:false,connected:false,stage:'idle'},selectedCount:0}:action==='whatsapp/begin'?{stage:'qr',connected:false,qrDataUrl:qr}:action==='whatsapp/status'?status:action==='whatsapp/dialogs'?{conversations:[{id:'whatsapp:conversation:test',sourceId:'whatsapp',title:'Тест WhatsApp',kind:'direct',recipient:{id:'whatsapp:recipient:test',name:'Тест'},unreadCount:0,updatedAt:new Date().toISOString(),preview:'',canSend:true}],folders:[],truncated:false,selectedIds:selected}:{selectedIds:selected};
  await route.fulfill({json:data});
 });
 await page.goto('/admin');await page.getByRole('button',{name:'Источники → WhatsApp',exact:true}).click();
 await page.getByRole('button',{name:'Подключить WhatsApp',exact:true}).click();await expect(page.getByAltText('QR-код подключения WhatsApp')).toBeVisible();
 expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain('data:image');
 stage='connected';await expect(page.getByText('WhatsApp подключён',{exact:true})).toBeVisible();await expect(page.getByAltText('QR-код подключения WhatsApp')).toHaveCount(0);
 await page.getByRole('button',{name:'Получить список диалогов WhatsApp'}).click();await expect(page.getByText('Тест WhatsApp',{exact:true})).toBeVisible();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Сохранить выбор'}).click();await expect(page.getByText('Выбор WhatsApp сохранён.')).toBeVisible();expect(selected).toEqual(['whatsapp:conversation:test']);
});

test('WhatsApp у личного пользователя: видимые серые инструкции, кнопки отключены, запросов нет',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api/admin/**',async route=>{
  const action=new URL(route.request().url()).pathname.slice('/api/admin/'.length);requests.push(action);
  const data=action==='session'?{authenticated:true,setupRequired:false,csrfToken:'guest-csrf',account:{id:'guest',username:'guest',displayName:'Гость',isOwner:false,path:'/guest/'}}:action==='status'?{telegram:{configured:false,connected:false,stage:'idle'},selectedCount:0}:{};
  await route.fulfill({json:data});
 });
 await page.goto('/admin');await page.getByRole('button',{name:'Источники → WhatsApp',exact:true}).click();
 await expect(page.getByText('Тестирование WhatsApp пока доступно только владельцу.')).toBeVisible();
 await expect(page.getByText('На телефоне: WhatsApp → Настройки → Связанные устройства → Привязать устройство.',{exact:false})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Разрешённые диалоги WhatsApp'})).toBeVisible();
 const panel=page.locator('.whatsapp-panel');await expect(panel).toHaveCSS('filter','grayscale(1)');
 for(const button of await panel.getByRole('button').all())await expect(button).toBeDisabled();
 await expect(page.getByAltText('QR-код подключения WhatsApp')).toHaveCount(0);
 await page.waitForTimeout(2200);expect(requests.filter(action=>action.startsWith('whatsapp/'))).toEqual([]);
 await page.getByRole('button',{name:'Источники → Telegram',exact:true}).click();await expect(page.getByRole('button',{name:'Получить код',exact:true})).toBeEnabled();
});
