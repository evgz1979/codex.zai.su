# backend/connectors/telegram/media.ts

Безопасные общие метаданные фото и документов Telegram без native references.

[Исходный модуль](../../backend/connectors/telegram/media.ts) · [Индекс](README.md)

<a id="symbol-attachmentKind"></a>

## attachmentKind

Оставляет только безопасные встроенные форматы браузерного просмотра.

SVG, HTML и произвольные документы остаются скачиваемыми файлами.

```typescript
attachmentKind(mime: string): Attachment['kind']
```

<a id="symbol-attachmentName"></a>

## attachmentName

Очищает отображаемое имя файла без использования его как пути.

Удаляет управляющие символы, компоненты каталогов и ограничивает длину.

```typescript
attachmentName(name: string)
```

<a id="symbol-telegramAttachments"></a>

## telegramAttachments

Преобразует только безопасные метаданные Telegram-вложения в общий DTO.

Native file reference, access_hash и самоуничтожающиеся медиа в DTO не попадают.

```typescript
telegramAttachments(source: string, conversation: string, message: Api.Message): Attachment[]
```

<a id="symbol-telegramPreview"></a>

## telegramPreview

Выбирает небольшой готовый размер Telegram без загрузки оригинала.

Самоуничтожающиеся объекты исключены; native location остаётся только в коннекторе.

```typescript
telegramPreview(media: Api.TypeMessageMedia): {
    location?: Api.TypeInputFileLocation;
    bytes?: Buffer;
    size?: number;
    dcId?: number;
} | undefined
```
