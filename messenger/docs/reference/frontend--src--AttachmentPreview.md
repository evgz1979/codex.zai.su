# frontend/src/AttachmentPreview.tsx

Ленивая миниатюра в ленте, фиксированные размеры и открытие оригинала.

[Исходный модуль](../../frontend/src/AttachmentPreview.tsx) · [Индекс](README.md)

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

<a id="symbol-AttachmentStill"></a>

## AttachmentStill

Показывает сохранённый JPEG-кадр в ширину пузыря сообщения.

Пропорции кадра сохраняются и на узком экране; оригинал не загружается.

```typescript
AttachmentStill({ attachment }: {
    attachment: Attachment;
})
```
