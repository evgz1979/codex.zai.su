# backend/connectors/whatsapp/thumbnails.ts

Распознавание JPEG-миниатюр фото и видео WhatsApp в новых сообщениях и прежнем кеше.

[Исходный модуль](../../backend/connectors/whatsapp/thumbnails.ts) · [Индекс](README.md)

<a id="symbol-isJpegThumbnail"></a>

## isJpegThumbnail

Распознаёт JPEG в поле, где WhatsApp может передать миниатюру вместо подписи.

Усечённый base64 тоже распознаётся, чтобы его можно было скрыть из текста.

```typescript
isJpegThumbnail(value: string)
```

<a id="symbol-JPEG_THUMBNAIL_CHARS"></a>

## JPEG_THUMBNAIL_CHARS

Ограничивает размер JPEG и строки, которую worker читает из модели фото или видео.

Лимит 12 000 символов оставляет в сообщении только небольшую миниатюру.

```typescript
const JPEG_THUMBNAIL_CHARS = 12000
```

<a id="symbol-whatsappAttachmentMessage"></a>

## whatsappAttachmentMessage

Нормализует тип вложения, подпись и миниатюру новых и сохранённых сообщений WhatsApp.

Оригиналы поддерживаемых типов загружаются по нажатию; для видео доступен кадр.

```typescript
whatsappAttachmentMessage(message: Message, body = message.text, caption?: string): Message
```
