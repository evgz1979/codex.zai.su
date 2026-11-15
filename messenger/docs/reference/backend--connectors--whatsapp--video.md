# backend/connectors/whatsapp/video.ts

Распознавание небольших JPEG-кадров WhatsApp в новых сообщениях и прежнем кеше.

[Исходный модуль](../../backend/connectors/whatsapp/video.ts) · [Индекс](README.md)

<a id="symbol-isVideoThumbnail"></a>

## isVideoThumbnail

Распознаёт JPEG в поле, где WhatsApp может передать кадр вместо подписи.

Усечённый base64 тоже распознаётся, чтобы его можно было скрыть из текста.

```typescript
isVideoThumbnail(value: string)
```

<a id="symbol-VIDEO_THUMBNAIL_CHARS"></a>

## VIDEO_THUMBNAIL_CHARS

Ограничивает размер JPEG-кадра и строки, которую worker читает из модели видео.

Лимит 12 000 символов оставляет в сообщении только небольшую миниатюру.

```typescript
const VIDEO_THUMBNAIL_CHARS = 12000
```

<a id="symbol-whatsappVideoMessage"></a>

## whatsappVideoMessage

Отделяет кадр WhatsApp от подписи в новых сообщениях и прежней истории.

Только полный ограниченный JPEG становится миниатюрой; сам ролик остаётся недоступен.

```typescript
whatsappVideoMessage(message: Message, body = message.text, caption?: string): Message
```
