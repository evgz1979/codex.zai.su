# frontend/src/previews.ts

Последовательная очередь и ограниченный оперативный кеш миниатюр без хранилища браузера.

[Исходный модуль](../../frontend/src/previews.ts) · [Индекс](README.md)

<a id="symbol-clearPreviews"></a>

## clearPreviews

Удаляет только оперативные миниатюры при выходе или смене разрешений.

Постоянных записей в хранилище браузера нет, Blob URL принадлежат компонентам.

```typescript
clearPreviews()
```

<a id="symbol-previewData"></a>

## previewData

Последовательно получает маленькие изображения и повторно использует до 32 Blob.

Отмена снимает ожидающую работу; оригиналы здесь никогда не запрашиваются.

```typescript
previewData(input: AttachmentRequest, version: string, signal: AbortSignal)
```
