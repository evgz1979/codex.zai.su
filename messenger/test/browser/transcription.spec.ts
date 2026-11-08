import {test,expect,type Page} from '@playwright/test';
//: Показывает нерасшифрованное голосовое в каждом независимом браузерном сценарии.
//: Серверная фикстура общая; возврат позволяет проверить настоящий сохранённый кеш.
async function freshVoice(page:Page){
  let clear=true;
  await page.route(/\/api\/chat\/(snapshot|inbox|open)$/,async route=>{
    const response=await route.fetch();const result=await response.json();
    if(clear)for(const messages of [result.messages,result.snapshot?.messages,result.page?.messages])for(const message of messages||[])delete message.voiceTranscription;
    await route.fulfill({response,json:result});
  });
  return ()=>{clear=false;};
}
test('голосовое: расшифровка только по кнопке, текст под сообщением и готовый кеш после reload',async({page},testInfo)=>{
  const keepCache=await freshVoice(page);
  let requests=0;page.on('request',request=>{if(request.url().endsWith('/chat/transcribe'))requests++;});
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await page.getByRole('button',{name:'Общая лента',exact:true}).click();
  const button=page.getByRole('button',{name:'Расшифровать',exact:true});await expect(button).toHaveCount(1);expect(requests).toBe(0);
  const message=page.getByRole('article').filter({has:page.getByRole('button',{name:'Открыть вложение: Голосовое.wav'})});await button.click();await expect(message.getByText('Синтетическая расшифровка голосового.',{exact:true})).toBeVisible();expect(requests).toBe(1);await expect(button).toHaveCount(0);keepCache();
  const voice=await message.getByRole('button',{name:'Открыть вложение: Голосовое.wav'}).boundingBox();const text=await message.locator('.transcription-text').boundingBox();expect(text!.y).toBeGreaterThan(voice!.y+voice!.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/transcription-${testInfo.project.name}.png`});
  await page.reload();await page.getByRole('button',{name:'Общая лента',exact:true}).click();await expect(page.getByText('Синтетическая расшифровка голосового.',{exact:true})).toBeVisible();expect(requests).toBe(1);
});
test('голосовое: pending обновляется, повтор клика заблокирован, текст безопасен',async({page})=>{
  await freshVoice(page);
  let requests=0;await page.route('**/api/chat/transcribe',async route=>{requests++;if(requests===1){await new Promise(resolve=>setTimeout(resolve,250));await route.fulfill({json:{pending:true,text:'Начало'}});}else await route.fulfill({json:{pending:false,text:'<script>window.transcriptUnsafe=true</script>\nГотовый текст'}});});
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await page.getByRole('button',{name:'Общая лента',exact:true}).click();await page.getByRole('button',{name:'Расшифровать',exact:true}).click();
  await expect(page.getByRole('button',{name:'Расшифровка…',exact:true})).toBeDisabled();await expect(page.getByText('Начало',{exact:true})).toBeVisible();await expect(page.locator('.transcription-text')).toContainText('Готовый текст',{timeout:8000});expect(requests).toBe(2);
  expect(await page.evaluate(()=>(window as unknown as {transcriptUnsafe?:boolean}).transcriptUnsafe)).toBeUndefined();
});
test('голосовое: ошибка остаётся у сообщения, повтор ручной, уход отменяет запрос',async({page})=>{
  await freshVoice(page);
  let requests=0;await page.route('**/api/chat/transcribe',route=>{requests++;return route.fulfill(requests===1?{status:502,json:{error:'Telegram не смог распознать речь. Попробуйте позже.'}}:{json:{pending:true,text:'Часть текста'}});});
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();await page.getByRole('button',{name:'Общая лента',exact:true}).click();await page.getByRole('button',{name:'Расшифровать',exact:true}).click();
  await expect(page.locator('.transcription-error')).toHaveText('Telegram не смог распознать речь. Попробуйте позже.');expect(requests).toBe(1);await page.getByRole('button',{name:'Повторить расшифровку'}).click();await expect(page.getByText('Часть текста',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Назад к чатам'}).click();await page.waitForTimeout(3500);expect(requests).toBe(2);
});
