# backend/config.ts

Фиксированные loopback-порт, Origin и пути модуля для source/build.

[Исходный модуль](../../backend/config.ts) · [Индекс](README.md)

<a id="symbol-clientDirectory"></a>

## clientDirectory

Задаёт каталог собранных браузерных ресурсов.

Приватное хранилище через него не раздаётся.

```typescript
const clientDirectory = resolve(moduleRoot, 'dist/client')
```

<a id="symbol-dataDirectory"></a>

## dataDirectory

Выбирает отдельный каталог пользовательских данных.

В production обязателен абсолютный путь за пределами релиза.

```typescript
const dataDirectory = resolve(process.env.MESSENGER_DATA_DIR || resolve(moduleRoot, '.local'))
```

<a id="symbol-moduleRoot"></a>

## moduleRoot

Находит корень исходной или собранной версии Messenger.

Не зависит от рабочего каталога процесса.

```typescript
const moduleRoot = fileURLToPath(new URL(compiled ? '../../../' : '../', import.meta.url))
```

<a id="symbol-origin"></a>

## origin

Задаёт точный внешний Origin доверенного HTTPS-сайта.

Production требует явную переменную окружения и HTTPS.

```typescript
const origin = process.env.MESSENGER_PUBLIC_ORIGIN || `http://127.0.0.1:${port}`
```

<a id="symbol-port"></a>

## port

Задаёт локальный TCP-порт backend.

Сервис всегда слушает только 127.0.0.1.

```typescript
const port = 4318
```

<a id="symbol-secureCookies"></a>

## secureCookies

Определяет обязательный Secure-режим cookie.

В публичном режиме отключение Secure запрещено конфигурацией.

```typescript
const secureCookies = origin.startsWith('https://')
```
