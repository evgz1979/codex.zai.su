# frontend/src/AttachmentViewer.tsx

Модальный просмотр медиа по явному запросу, скачивание и отзыв Blob URL.

[Исходный модуль](../../frontend/src/AttachmentViewer.tsx) · [Индекс](README.md)

<a id="symbol-AttachmentViewer"></a>

## AttachmentViewer

Открывает локальный Blob фотографии, видео или аудио после защищённой загрузки.

Остальные файлы только скачиваются; закрытие отменяет запрос и отзывает object URL.

```typescript
AttachmentViewer({ request, onClose, onUnauthorized }: {
    request: AttachmentRequest;
    onClose(): void;
    onUnauthorized(error: ApiError): void;
})
```
