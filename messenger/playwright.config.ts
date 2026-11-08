import { defineConfig, devices } from '@playwright/test';
//: Выбирает отдельный loopback-порт для параллельных рабочих копий.
//: Без переменной окружения используется прежний тестовый порт.
const testPort=Number(process.env.MESSENGER_TEST_PORT||14318);
if(!Number.isInteger(testPort)||testPort<1024||testPort>65535)throw new Error('Invalid Messenger test port');
export default defineConfig({
  testDir: './test/browser', fullyParallel: false, workers: 1,
  use: { baseURL:`http://127.0.0.1:${testPort}`, screenshot:'only-on-failure', trace:'off',serviceWorkers:'block' },
  projects: [
    { name:'desktop-chromium', use:{ ...devices['Desktop Chrome'], viewport:{width:1440,height:1000} } },
    { name:'iphone-webkit', use:{ ...devices['iPhone 13'], defaultBrowserType:'webkit' } },
    { name:'small-iphone-webkit', use:{ ...devices['iPhone SE'], defaultBrowserType:'webkit' } },
  ],
  webServer: { command:'node --import tsx test/browser-server.ts', url:`http://127.0.0.1:${testPort}/api/chat/session`, reuseExistingServer:false },
});
