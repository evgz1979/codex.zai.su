import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

//: Растеризует квадратную исходную иконку в PNG для установки приложения.
//: Фон доходит до всех краёв; скругление выполняет ОС, внешние ресурсы не используются.
export async function buildIcons(){
  const browser=await chromium.launch({headless:true});
  try{
    const svg=await readFile(new URL('./app-icon.svg',import.meta.url),'utf8');
    for(const [size,name] of [[180,'apple-touch-icon.png'],[192,'icon-192.png'],[512,'icon-512.png']]){
      const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
      await page.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
      await page.screenshot({path:fileURLToPath(new URL(`../frontend/public/${name}`,import.meta.url))});
      await page.close();
    }
  }finally{await browser.close();}
}
await buildIcons();
