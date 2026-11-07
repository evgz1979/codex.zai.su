import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
// Скомпилированный файл находится в dist/server/backend, исходник — в backend.
const compiled = import.meta.url.includes('/dist/server/');
//: Определяет корень Messenger из расположения конфигурации.
//: Поддерживает исходный backend и dist/server/backend без зависимости от cwd.
export const moduleRoot = fileURLToPath(new URL(compiled ? '../../../' : '../', import.meta.url));
//: Задаёт каталог приватных данных модуля.
//: Всегда указывает на .local внутри Messenger.
export const dataDirectory = resolve(moduleRoot, '.local');
//: Задаёт каталог собранного frontend.
//: HTTP-сервер раздаёт только dist/client.
export const clientDirectory = resolve(moduleRoot, 'dist/client');
//: Задаёт единственный production-порт Messenger.
//: Публичная привязка и произвольный порт через окружение не поддерживаются.
export const port = 4318;
//: Задаёт точный локальный Origin для HTTP-проверок.
//: Использует 127.0.0.1 и фиксированный port, без доверия proxy-заголовкам.
export const origin = `http://127.0.0.1:${port}`;
