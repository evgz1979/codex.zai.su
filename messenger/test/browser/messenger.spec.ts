import { test, expect } from '@playwright/test';
test('единая лента, выбор адресата, отправка, непрочитанные, выход и мобильные границы', async ({ page }, testInfo) => {
  const errors: string[] = [];
  let takingScreenshot = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => {
    // WebKit screenshotter Playwright вставляет служебный <style>body {}</style>
    // для синхронизации анимаций. CSP запрещает его; вне скриншота ошибок быть не должно.
    if (takingScreenshot && msg.text().startsWith('Refused to apply a stylesheet')) return;
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');
  await page.getByRole('button',{name:'Войти в Messenger'}).click();
  await expect(page.getByRole('heading',{name:'Общая лента'})).toBeVisible();
  await expect(page.locator('.bubble').getByText('Это синтетическое сообщение из другого источника.')).toBeVisible();
  await expect(page.getByLabel('Сообщение',{exact:true})).toBeDisabled();
  const mobile = testInfo.project.name !== 'desktop-chromium';
  if (mobile) await page.getByRole('button',{name:'Открыть диалоги'}).click();
  await page.getByRole('button',{name:/Анна Смирнова/}).click();
  await expect(page.locator('.destination')).toContainText('Анна Смирнова');
  await expect(page.locator('.destination')).toContainText('Telegram');
  await expect(page.getByLabel('Сообщение',{exact:true})).toBeEnabled();
  const draftText = `Черновик для Анны · ${testInfo.project.name}`;
  await page.getByLabel('Сообщение',{exact:true}).fill(draftText);
  // Выбор другого адресата не переносит чужой черновик.
  if (mobile) await page.getByRole('button',{name:'Открыть диалоги'}).click();
  await page.getByRole('button',{name:/Команда проекта/}).click();
  await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('');
  if (mobile) await page.getByRole('button',{name:'Открыть диалоги'}).click();
  await page.getByRole('button',{name:/Анна Смирнова/}).click();
  await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue(draftText);
  const sendRequest = page.waitForRequest(req => req.url().endsWith('/api/chat/send'));
  await page.getByRole('button',{name:'Отправить: Анна Смирнова'}).click();
  const sent = (await sendRequest).postDataJSON();
  expect(sent.destination.sourceId).toBe('fixture-a'); expect(sent.destination.conversationId).toContain('fixture-a:conversation:0');
  await expect(page.locator('.bubble').getByText(draftText,{exact:true})).toBeVisible();
  await expect(page.getByLabel('Сообщение',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'Отметить прочитанным'}).click();
  await expect(page.getByRole('button',{name:'Отметить прочитанным'})).not.toBeVisible();
  await page.getByRole('button',{name:'Обновить',exact:true}).click();
  await expect(page.getByRole('button',{name:'Обновить',exact:true})).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const sendBox = await page.locator('.composer').boundingBox();
  expect(sendBox!.x).toBeGreaterThanOrEqual(0); expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(errors).toEqual([]);
  takingScreenshot = true;
  try { await page.screenshot({path:`test-results/${testInfo.project.name}-messenger.png`,caret:'initial'}); }
  finally { takingScreenshot = false; }
  if (mobile) {
    await page.setViewportSize({width:page.viewportSize()!.width,height:420});
    await page.getByLabel('Сообщение',{exact:true}).focus();
    const box = await page.locator('.composer').boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(420);
    await page.getByRole('button',{name:'Открыть диалоги'}).click();
  }
  await page.getByRole('button',{name:'Выйти',exact:true}).click();
  await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();
  await expect(page.getByText(draftText,{exact:true})).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('открытый чат скрывает исключённые диалоги без синхронизации истории',async({page},testInfo)=>{
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto('/');await page.getByLabel('Пароль',{exact:true}).fill('browser-test-password');await page.getByRole('button',{name:'Войти в Messenger'}).click();
  await expect(page.locator('.bubble').getByText('Это синтетическое сообщение из другого источника.')).toBeVisible();
  await page.route('**/api/chat/access',route=>route.fulfill({json:{ids:[]}}));
  await expect(page.locator('.bubble')).toHaveCount(0,{timeout:7000});
  await expect(page.getByRole('heading',{name:'Нет загруженных сообщений'})).toBeVisible();
});
