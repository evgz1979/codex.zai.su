import {test,expect} from '@playwright/test';
test('вложения: кадр видео WhatsApp отображается вместе с подписью',async({page})=>{
 await page.goto('/');
 const thumbnailJpeg=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=16;canvas.height=9;
  const context=canvas.getContext('2d')!;context.fillStyle='#5184ad';context.fillRect(0,0,16,9);
  return canvas.toDataURL('image/jpeg').split(',')[1];
 });
 await page.route('**/api/chat/inbox',async route=>{
  const response=await route.fetch();const json=await response.json();
  const message=json.page.messages.at(-1);
  message.text='Подпись к видео';message.attachments=[{id:'synthetic-video',kind:'video',name:'Видео',downloadable:false,thumbnailJpeg}];
  await route.fulfill({response,json});
 });
 const attachmentRequests:string[]=[];page.on('request',request=>{if(request.url().endsWith('/api/chat/attachment')&&request.postDataJSON()?.attachmentId==='synthetic-video')attachmentRequests.push(request.url());});
 await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
 await page.getByRole('button',{name:'Общая лента',exact:true}).click();
 const message=page.getByRole('article').filter({hasText:'Подпись к видео'});
 const frame=message.getByRole('img',{name:'Кадр видео'});
 await frame.scrollIntoViewIfNeeded();await expect(frame).toHaveJSProperty('naturalWidth',16);
 await expect(message.getByText('Видео',{exact:true})).toBeVisible();
 await expect(message.getByRole('button',{name:'Открыть вложение: Видео'})).toHaveCount(0);
 await expect(message.getByText(thumbnailJpeg,{exact:false})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(attachmentRequests).toEqual([]);
});

test('вложения: миниатюры в ленте, оригинал по нажатию, открытие PDF, скачивание и мобильные границы',async({page},testInfo)=>{
 const requests:{attachmentId:string;variant?:string}[]=[];page.on('request',request=>{if(request.url().endsWith('/api/chat/attachment'))requests.push(request.postDataJSON());});
 await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await page.getByRole('button',{name:'Общая лента',exact:true}).click();
 const photoButton=page.getByRole('button',{name:'Открыть вложение: Тестовое фото.png'});await expect(photoButton).toBeVisible();await photoButton.scrollIntoViewIfNeeded();await expect(photoButton).toBeInViewport();await expect(page.getByRole('img',{name:'Миниатюра: Тестовое фото.png'})).toBeVisible();expect(requests.filter(r=>!r.variant)).toHaveLength(0);
 await page.screenshot({path:`test-results/previews-${testInfo.project.name}.png`});
 await page.getByRole('button',{name:'Открыть вложение: Тестовое фото.png'}).click();const viewer=page.getByRole('dialog');await expect(viewer).toBeVisible();await expect(viewer.getByRole('img')).toBeVisible();await expect(viewer.getByRole('img')).toHaveJSProperty('naturalWidth',1);expect(requests.filter(r=>!r.variant)).toHaveLength(1);
 const url=await viewer.getByRole('img').getAttribute('src');expect(url).toMatch(/^blob:/);await expect(viewer.getByRole('link',{name:'Скачать'})).toHaveAttribute('download','Тестовое фото.png');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const box=await viewer.boundingBox();expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);expect(box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 await page.screenshot({path:`test-results/attachment-${testInfo.project.name}.png`});await page.getByRole('button',{name:'Закрыть вложение'}).click();await expect(viewer).toHaveCount(0);
 expect(await page.evaluate(async value=>{try{await fetch(value!);return false;}catch{return true;}},url)).toBe(true);
 await page.getByRole('button',{name:'Открыть вложение: Документ.txt'}).click();await expect(viewer.getByText('Синтетический файл',{exact:true})).toBeVisible();const download=page.waitForEvent('download');await viewer.getByRole('link',{name:'Скачать'}).click();expect((await download).suggestedFilename()).toBe('Документ.txt');await page.keyboard.press('Escape');await expect(viewer).toHaveCount(0);
 await page.getByRole('button',{name:'Открыть вложение: Документ.pdf'}).click();await expect(viewer.getByRole('link',{name:'Открыть PDF',exact:true})).toHaveAttribute('target','_blank');await expect(viewer.getByRole('link',{name:'Открыть PDF',exact:true})).not.toHaveAttribute('download');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Открыть вложение: Аудио.wav'}).click();await expect(viewer.locator('audio')).toBeVisible();await expect(viewer.locator('audio')).toHaveAttribute('controls','');await expect.poll(()=>viewer.locator('audio').evaluate((el:HTMLAudioElement)=>el.readyState)).toBeGreaterThan(0);await page.getByRole('button',{name:'Закрыть вложение'}).click();
 await page.getByRole('button',{name:'Открыть вложение: Видео.mp4'}).click();await expect(viewer.locator('video')).toBeVisible();await expect(viewer.locator('video')).toHaveAttribute('playsinline','');await expect(viewer.getByText('Браузер не смог воспроизвести вложение. Скачайте файл.')).toBeVisible();await page.keyboard.press('Escape');
});

test('вложения: исключение диалога закрывает уже открытое изображение',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='desktop-chromium');await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await page.getByRole('button',{name:'Общая лента',exact:true}).click();await page.getByRole('button',{name:'Открыть вложение: Тестовое фото.png'}).click();await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
 await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:[]}}));await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:7000});
});

test('вложения: системное меню вызывается только явным нажатием, без скачивания',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'canShare',{value:()=>true});Object.defineProperty(navigator,'share',{value:async(data:ShareData)=>{(window as unknown as {shared?:{name:string;type:string}[]}).shared=data.files?.map(file=>({name:file.name,type:file.type}));}});});
 let downloads=0;page.on('download',()=>downloads++);await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await page.getByRole('button',{name:'Общая лента',exact:true}).click();await page.getByRole('button',{name:'Открыть вложение: Тестовое фото.png'}).click();const viewer=page.getByRole('dialog');await expect(viewer.getByRole('button',{name:'Поделиться…'})).toBeVisible();expect(await page.evaluate(()=>(window as unknown as {shared?:unknown}).shared)).toBeUndefined();
 await viewer.getByRole('button',{name:'Поделиться…'}).click();expect(await page.evaluate(()=>(window as unknown as {shared?:unknown}).shared)).toEqual([{name:'Тестовое фото.png',type:'image/png'}]);expect(downloads).toBe(0);await page.getByRole('button',{name:'Закрыть вложение'}).click();
});
