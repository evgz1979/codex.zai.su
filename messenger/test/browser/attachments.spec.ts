import {test,expect} from '@playwright/test';
test('вложения: только по нажатию, фото/аудио/видео, скачивание, Escape и мобильные границы',async({page},testInfo)=>{
 const requests:string[]=[];page.on('request',request=>{if(request.url().endsWith('/api/chat/attachment'))requests.push(request.postDataJSON().attachmentId);});
 await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
 await expect(page.getByRole('button',{name:'Открыть вложение: Тестовое фото.png'})).toBeVisible();expect(requests).toHaveLength(0);
 await page.getByRole('button',{name:'Открыть вложение: Тестовое фото.png'}).click();const viewer=page.getByRole('dialog');await expect(viewer).toBeVisible();await expect(viewer.getByRole('img')).toBeVisible();await expect(viewer.getByRole('img')).toHaveJSProperty('naturalWidth',1);expect(requests).toHaveLength(1);
 const url=await viewer.getByRole('img').getAttribute('src');expect(url).toMatch(/^blob:/);await expect(viewer.getByRole('link',{name:'Скачать'})).toHaveAttribute('download','Тестовое фото.png');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const box=await viewer.boundingBox();expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);expect(box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 await page.screenshot({path:`test-results/attachment-${testInfo.project.name}.png`});await page.getByRole('button',{name:'Закрыть вложение'}).click();await expect(viewer).toHaveCount(0);
 expect(await page.evaluate(async value=>{try{await fetch(value!);return false;}catch{return true;}},url)).toBe(true);
 await page.getByRole('button',{name:'Открыть вложение: Документ.txt'}).click();await expect(viewer.getByText('Файл готов к скачиванию.')).toBeVisible();const download=page.waitForEvent('download');await viewer.getByRole('link',{name:'Скачать'}).click();expect((await download).suggestedFilename()).toBe('Документ.txt');await page.keyboard.press('Escape');await expect(viewer).toHaveCount(0);
 await page.getByRole('button',{name:'Открыть вложение: Аудио.wav'}).click();await expect(viewer.locator('audio')).toBeVisible();await expect(viewer.locator('audio')).toHaveAttribute('controls','');await expect.poll(()=>viewer.locator('audio').evaluate((el:HTMLAudioElement)=>el.readyState)).toBeGreaterThan(0);await page.getByRole('button',{name:'Закрыть вложение'}).click();
 await page.getByRole('button',{name:'Открыть вложение: Видео.mp4'}).click();await expect(viewer.locator('video')).toBeVisible();await expect(viewer.locator('video')).toHaveAttribute('playsinline','');await expect(viewer.getByText('Браузер не смог воспроизвести вложение. Скачайте файл.')).toBeVisible();await page.keyboard.press('Escape');
});

test('вложения: исключение диалога закрывает уже открытое изображение',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='desktop-chromium');await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await page.getByRole('button',{name:'Открыть вложение: Тестовое фото.png'}).click();await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
 await page.route('**/api/chat/access?since=*',route=>route.fulfill({json:{ids:[]}}));await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:7000});
});
