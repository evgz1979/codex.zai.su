import { fileURLToPath } from 'node:url';
import { resolve, isAbsolute } from 'node:path';
const compiled=import.meta.url.includes('/dist/server/');
//: Находит корень исходной или собранной версии Messenger.
//: Не зависит от рабочего каталога процесса.
export const moduleRoot=fileURLToPath(new URL(compiled?'../../../':'../',import.meta.url));
//: Выбирает отдельный каталог пользовательских данных.
//: В production обязателен абсолютный путь за пределами релиза.
export const dataDirectory=resolve(process.env.MESSENGER_DATA_DIR||resolve(moduleRoot,'.local'));
//: Задаёт каталог собранных браузерных ресурсов.
//: Приватное хранилище через него не раздаётся.
export const clientDirectory=resolve(moduleRoot,'dist/client');
//: Задаёт локальный TCP-порт backend.
//: Сервис всегда слушает только 127.0.0.1.
export const port=4318;
//: Задаёт точный внешний Origin доверенного HTTPS-сайта.
//: Production требует явную переменную окружения и HTTPS.
export const origin=process.env.MESSENGER_PUBLIC_ORIGIN||`http://127.0.0.1:${port}`;
//: Определяет обязательный Secure-режим cookie.
//: В публичном режиме отключение Secure запрещено конфигурацией.
export const secureCookies=origin.startsWith('https://');
if (process.env.NODE_ENV==='production' && (!secureCookies || !process.env.MESSENGER_DATA_DIR || !isAbsolute(process.env.MESSENGER_DATA_DIR) || dataDirectory.startsWith(moduleRoot))) throw new Error('Production requires HTTPS origin and external data directory');
