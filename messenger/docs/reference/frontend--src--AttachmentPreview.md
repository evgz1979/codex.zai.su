# frontend/src/AttachmentPreview.tsx

Ленивая миниатюра в ленте, фиксированные размеры и открытие оригинала.

[Исходный модуль](../../frontend/src/AttachmentPreview.tsx) · [Индекс](README.md)

<a id="symbol-attachmentHasPreview"></a>

## attachmentHasPreview

Определяет, занимает ли вложение ширину пузыря.

Правило одинаково для встроенного JPEG и миниатюры по отдельному запросу.

```typescript
attachmentHasPreview(a: Attachment)
```

<a id="symbol-AttachmentPreview"></a>

## AttachmentPreview

Показывает небольшую миниатюру только рядом с видимой областью ленты.

Оригинал открывается отдельным действием; уход с экрана отменяет запрос и отзывает URL.

```typescript
AttachmentPreview({ attachment: a, request, version, paused, onOpen, onUnauthorized }: {
    attachment: Attachment;
    request: AttachmentRequest;
    version: string;
    paused: boolean;
    onOpen(): void;
    onUnauthorized(error: ApiError): void;
})
```
