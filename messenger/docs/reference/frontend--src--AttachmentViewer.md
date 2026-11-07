# frontend/src/AttachmentViewer.tsx

Модальный просмотр медиа по явному запросу, скачивание и отзыв Blob URL.

[Исходный модуль](../../frontend/src/AttachmentViewer.tsx) · [Индекс](README.md)

<a id="symbol-AttachmentViewer"></a>

## AttachmentViewer

Открывает локальный Blob фотографии, видео или аудио после защищённой загрузки.

PDF открывается браузером, текст выводится безопасно; закрытие отзывает object URL.

```typescript
AttachmentViewer({ request, onClose, onUnauthorized }: {
    request: AttachmentRequest;
    onClose(): void;
    onUnauthorized(error: ApiError): void;
})
```

<a id="symbol-AttachmentViewer.share"></a>

## AttachmentViewer.share

Открывает только штатное системное меню передачи файла по нажатию владельца.

Отмена не является ошибкой; приложение не выбирает внешнего адресата автоматически.

```typescript
async share()
```
