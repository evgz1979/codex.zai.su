# frontend/src/useVisibleReads.ts

Подтверждение просмотра реально видимых сообщений после остановки прокрутки в активной ленте.

[Исходный модуль](../../frontend/src/useVisibleReads.ts) · [Индекс](README.md)

<a id="symbol-useVisibleReads"></a>

## useVisibleReads

Подтверждает сообщения, видимые в активной ленте не менее 600 мс.

Скрытая вкладка, меню, загрузка и перекрывающий просмотр не отмечают переписку.

```typescript
useVisibleReads(feed: RefObject<HTMLDivElement | null>, messages: Message[], enabled: boolean, acknowledge: (message: Message) => Promise<void>)
```

<a id="symbol-useVisibleReads.active"></a>

## useVisibleReads.active

Проверяет активность окна перед отсчётом и перед отправкой запроса.

У iOS-приложения с домашнего экрана активность определяется видимостью.

```typescript
active()
```

<a id="symbol-useVisibleReads.flush"></a>

## useVisibleReads.flush

Сохраняет просмотр последовательно и не подтверждает скрытые поздние страницы.

Ошибка оставляет позицию для следующего посещения без частых повторов RPC.

```typescript
async flush()
```

<a id="symbol-useVisibleReads.schedule"></a>

## useVisibleReads.schedule

Откладывает подтверждение до остановки прокрутки и возвращения фокуса.

Один таймер отменяется при скрытии страницы и очистке эффекта.

```typescript
schedule()
```

<a id="symbol-useVisibleReads.visible"></a>

## useVisibleReads.visible

Выбирает последнюю реально видимую позицию каждого диалога.

Высокое сообщение достаточно видеть на 80 px; вне viewport оно не считается.

```typescript
visible()
```
