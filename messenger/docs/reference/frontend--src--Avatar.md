# frontend/src/Avatar.tsx

Круглые фотографии разрешённых диалогов с загрузкой возле видимой области и инициалами.

[Исходный модуль](../../frontend/src/Avatar.tsx) · [Индекс](README.md)

<a id="symbol-Avatar"></a>

## Avatar

Показывает фото возле видимой области, повторяет временные ошибки и сохраняет готовое фото.

Новая версия заменяет старую после декодирования; уход отменяет запросы и таймеры.

```typescript
Avatar({ conversation, onUnauthorized }: {
    conversation: Conversation;
    onUnauthorized(error: unknown): void;
})
```

<a id="symbol-Avatar.load"></a>

## Avatar.load

Загружает и декодирует фотографию до смены видимого изображения.

Временный отказ получает три быстрых повтора, затем паузу 30 с; постоянные отказы не повторяются.

```typescript
async load()
```

<a id="symbol-Avatar.resume"></a>

## Avatar.resume

Возобновляет незавершённую загрузку после возвращения или восстановления сети.

Готовая фотография и постоянный отказ не вызывают новых запросов.

```typescript
resume()
```

<a id="symbol-clearAvatars"></a>

## clearAvatars

Очищает оперативные фото при смене или завершении веб-входа.

Поколение запрещает позднему запросу вернуть фото в кеш после выхода.

```typescript
clearAvatars()
```

<a id="symbol-queuedPhoto"></a>

## queuedPhoto

Ограничивает загрузку фото двумя запросами и повторно использует до 64 Blob.

Отменённая очередь не обращается к API; данные разных поколений входа не смешиваются.

```typescript
queuedPhoto(id: string, version: string, signal: AbortSignal, refresh = false)
```
