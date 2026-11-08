import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import { fileURLToPath } from 'node:url';
//: Связывает JavaScript и файл версии одним идентификатором сборки.
//: Новый ID не меняет manifest или идентичность установленного приложения.
const release={version:JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version as string,buildId:randomUUID()};
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define:{__MESSENGER_RELEASE__:JSON.stringify(release)},
  plugins: [react(),{name:'messenger-release',
    //: Выпускает публичный файл версии рядом с index.html.
    //: Файл не содержит пользовательских данных.
    generateBundle(){this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify(release)});},
  }],
  build: { outDir: '../dist/client', emptyOutDir: true },
});
