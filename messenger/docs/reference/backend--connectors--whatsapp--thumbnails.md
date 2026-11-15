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

<a id="symbol-whatsappThumbnailMessage"></a>

## whatsappThumbnailMessage

Отделяет миниатюру WhatsApp от подписи в новых сообщениях и прежней истории.

Только полный JPEG в пределах лимита становится миниатюрой фото или видео.

```typescript
whatsappThumbnailMessage(message: Message, body = message.text, caption?: string): Message
```
