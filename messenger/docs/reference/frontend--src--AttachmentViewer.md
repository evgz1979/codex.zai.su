# frontend/src/AttachmentViewer.tsx

Модальный просмотр медиа по явному запросу, скачивание и отзыв Blob URL.

[Исходный модуль](../../frontend/src/AttachmentViewer.tsx) · [Индекс](README.md)

<a id="symbol-AttachmentViewer"></a>

## AttachmentViewer

Открывает локальный Blob фотографии, видео или аудио после защищённой загрузки.

PDF открывается браузером, текст выводится безопасно; закрытие отзывает object URL.

```typescript
AttachmentViewer({ request, attachment, offline, onClose, onUnauthorized }: {
    request: AttachmentRequest;
    attachment?: Attachment;
    offline: boolean;
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

<a id="symbol-cachedThumbnail"></a>

## cachedThumbnail

Открывает маленький JPEG, уже полученный вместе с выбранным сообщением.

Файл помечается миниатюрой, чтобы его можно было отличить от оригинала.

```typescript
cachedThumbnail(attachment: Attachment | undefined)
```

<a id="symbol-viewAttachment"></a>

## viewAttachment

Загружает оригинал по нажатию, используя сохранённую миниатюру при недоступности файла.

Отказы доступа и одноразовое вложение никогда не заменяются кешированной копией.

```typescript
async viewAttachment(request: AttachmentRequest, attachment: Attachment | undefined, offline: boolean, signal: AbortSignal)
```
