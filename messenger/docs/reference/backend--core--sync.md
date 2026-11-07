# backend/core/sync.ts

Автоматическое заполнение полного SQLite-кеша выбранных диалогов, события и возобновляемая история.

[Исходный модуль](../../backend/core/sync.ts) · [Индекс](README.md)

<a id="symbol-AutoSyncService"></a>

## AutoSyncService

Заполняет полный SQLite-кеш выбранных диалогов одним фоновым потоком.

Новые сообщения приходят событиями; история и пропуски возобновляются по курсорам.

```typescript
class AutoSyncService
```

<a id="symbol-AutoSyncService.constructor"></a>

## AutoSyncService.constructor

Связывает синхронизатор с общим ядром и SQLite.

Интервал и часы подменяются только изолированными тестами.

```typescript
constructor(private core: MessengerService, private store: Store, private interval = 3000, private now = Date.now)
```

<a id="symbol-AutoSyncService.runOnce"></a>

## AutoSyncService.runOnce

Выбирает незагруженную голову, пропуск новых сообщений или страницу старой истории.

Текущий выбор и его ревизия проверяются снова после каждого внешнего запроса.

```typescript
private async runOnce()
```

<a id="symbol-AutoSyncService.schedule"></a>

## AutoSyncService.schedule

Планирует только один следующий проход.

Фон не создаёт параллельных обходов истории или отдельного сервиса.

```typescript
private schedule(delay = this.interval)
```

<a id="symbol-AutoSyncService.start"></a>

## AutoSyncService.start

Запускает автоматическое обслуживание без браузера и пользовательских кнопок.

Отсутствие выбранных диалогов не подключает Telegram.

```typescript
start()
```

<a id="symbol-AutoSyncService.stop"></a>

## AutoSyncService.stop

Останавливает таймер, события и текущий ограниченный запрос.

Последняя успешно записанная страница остаётся готовой к возобновлению.

```typescript
async stop()
```

<a id="symbol-AutoSyncService.tick"></a>

## AutoSyncService.tick

Выполняет один последовательный шаг и применяет безопасную паузу после отказа.

FloodWait соблюдается без вывода исходного исключения в журнал.

```typescript
tick(): Promise<void>
```
