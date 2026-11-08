# frontend/src/useOfflinePrefetch.ts

Фоновая последовательная подготовка голов выбранных чатов для чтения без сети без переключения адресата.

[Исходный модуль](../../frontend/src/useOfflinePrefetch.ts) · [Индекс](README.md)

<a id="symbol-useOfflinePrefetch"></a>

## useOfflinePrefetch

Подготавливает последние сообщения выбранных чатов без переключения переписки.

Одна последовательная очередь читает только SQLite через offline API; уход, offline и выход отменяют её.

```typescript
useOfflinePrefetch(snapshot: Snapshot | undefined, enabled: boolean, onUnauthorized: (error: ApiError) => void)
```

<a id="symbol-useOfflinePrefetch.fill"></a>

## useOfflinePrefetch.fill

Обновляет головы пакетами по двадцать чатов, не отмечая сообщения прочитанными.

Пустая несинхронизированная история повторяется при следующем проходе через 30 секунд.

```typescript
async fill()
```

<a id="symbol-useOfflinePrefetch.resume"></a>

## useOfflinePrefetch.resume

Возобновляет подготовку при возвращении в открытое приложение.

Скрытая вкладка не создаёт фоновых обходов или сетевых очередей.

```typescript
resume()
```
