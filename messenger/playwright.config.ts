import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', fullyParallel: false, workers: 1,
  use: { baseURL:'http://127.0.0.1:14318', screenshot:'only-on-failure', trace:'off' },
  projects: [
    { name:'desktop-chromium', use:{ ...devices['Desktop Chrome'], viewport:{width:1440,height:1000} } },
    { name:'iphone-webkit', use:{ ...devices['iPhone 13'], defaultBrowserType:'webkit' } },
    { name:'small-iphone-webkit', use:{ ...devices['iPhone SE'], defaultBrowserType:'webkit' } },
  ],
  webServer: { command:'node --import tsx test/browser-server.ts', url:'http://127.0.0.1:14318/api/chat/session', reuseExistingServer:false },
});
