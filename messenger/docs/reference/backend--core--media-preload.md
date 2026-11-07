# backend/core/media-preload.ts

Автоматическая подготовка вложений и миниатюр выбранных чатов за последние пять дней с продолжением после рестарта.

[Исходный модуль](../../backend/core/media-preload.ts) · [Индекс](README.md)

<a id="symbol-MediaPreloadService"></a>

## MediaPreloadService

Готовит миниатюры и оригиналы выбранных чатов за последние пять дней.

Выполненные задания сохраняются в SQLite, интерактивный запрос прерывает фон.

```typescript
class MediaPreloadService
```

<a id="symbol-MediaPreloadService.constructor"></a>

## MediaPreloadService.constructor

Связывает существующий дисковый кеш с постоянной очередью SQLite.

Подменяемые часы используются только синтетическими тестами.

```typescript
constructor(private store: Store, private media: AttachmentService, private now = Date.now)
```

<a id="symbol-MediaPreloadService.runOnce"></a>

## MediaPreloadService.runOnce

Сначала готовит доступные миниатюры, затем чередует их с оригиналами.

Устаревшие и невыбранные сообщения не запрашиваются у источника.

```typescript
private async runOnce()
```

<a id="symbol-MediaPreloadService.schedule"></a>

## MediaPreloadService.schedule

Планирует следующую ограниченную загрузку.

Параллельных обходов истории вложений не создаётся.

```typescript
private schedule(delay = 3000)
```

<a id="symbol-MediaPreloadService.start"></a>

## MediaPreloadService.start

Запускает один последовательный фоновый поток без нового сервиса.

Таймер не удерживает процесс после остановки основного приложения.

```typescript
start()
```

<a id="symbol-MediaPreloadService.stop"></a>

## MediaPreloadService.stop

Прерывает текущую загрузку и ждёт удаления частичного файла.

Завершённые отметки и кеш остаются для следующего запуска.

```typescript
async stop()
```

<a id="symbol-MediaPreloadService.tick"></a>

## MediaPreloadService.tick

Обрабатывает одно задание с общими ограничениями медиа.

Сбой не пишет исключение провайдера и не останавливает текстовую синхронизацию.

```typescript
tick()
```
