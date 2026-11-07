# backend/config.ts

Фиксированные loopback-порт, Origin и пути модуля для source/build.

[Исходный модуль](../../backend/config.ts) · [Индекс](README.md)

<a id="symbol-clientDirectory"></a>

## clientDirectory

Задаёт каталог собранного frontend.

HTTP-сервер раздаёт только dist/client.

```typescript
const clientDirectory = resolve(moduleRoot, 'dist/client')
```

<a id="symbol-dataDirectory"></a>

## dataDirectory

Задаёт каталог приватных данных модуля.

Всегда указывает на .local внутри Messenger.

```typescript
const dataDirectory = resolve(moduleRoot, '.local')
```

<a id="symbol-moduleRoot"></a>

## moduleRoot

Определяет корень Messenger из расположения конфигурации.

Поддерживает исходный backend и dist/server/backend без зависимости от cwd.

```typescript
const moduleRoot = fileURLToPath(new URL(compiled ? '../../../' : '../', import.meta.url))
```

<a id="symbol-origin"></a>

## origin

Задаёт точный локальный Origin для HTTP-проверок.

Использует 127.0.0.1 и фиксированный port, без доверия proxy-заголовкам.

```typescript
const origin = `http://127.0.0.1:${port}`
```

<a id="symbol-port"></a>

## port

Задаёт единственный production-порт Messenger.

Публичная привязка и произвольный порт через окружение не поддерживаются.

```typescript
const port = 4318
```
