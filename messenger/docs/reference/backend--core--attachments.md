# backend/core/attachments.ts

Защищённая потоковая загрузка вложений и ограниченный приватный кеш байтов.

[Исходный модуль](../../backend/core/attachments.ts) · [Индекс](README.md)

<a id="symbol-AttachmentService"></a>

## AttachmentService

Кеширует запрошенные медиа на диске ограниченными потоками.

Доступ проверяется до кеша, после загрузки и при отдаче; публичных файловых URL нет.

```typescript
class AttachmentService
```

<a id="symbol-AttachmentService.canPreload"></a>

## AttachmentService.canPreload

Разрешает один фоновый файл только вне интерактивной загрузки.

Оставляет слот для открытия пользователем и даёт приоритет запросам из ленты.

```typescript
canPreload()
```

<a id="symbol-AttachmentService.constructor"></a>

## AttachmentService.constructor

Открывает приватную директорию кеша и удаляет незаконченные файлы прошлого процесса.

Размер файла, общий объём и параллелизм ограничиваются независимо от SDK.

```typescript
constructor(private core: MessengerService, directory: string, private limits: {
    fileBytes: number;
    cacheBytes: number;
    parallel: number;
    cacheFiles: number;
} = { ...MEDIA_LIMITS })
```

<a id="symbol-AttachmentService.open"></a>

## AttachmentService.open

Возвращает готовый файл только проверенного вложения, либо потоково заполняет кеш.

Освобождение слота обязательно после HTTP-ответа; частичный файл не становится готовым.

```typescript
async open(input: AttachmentRequest, signal: AbortSignal, authorize: () => void, background = false)
```

<a id="symbol-AttachmentService.open.assertAllowed"></a>

## AttachmentService.open.assertAllowed

Повторно проверяет веб-сессию, выбор и неизменность сообщения.

Снятие галочки, выход и удаление прекращают передачу без чтения чужого диалога.

```typescript
assertAllowed()
```

<a id="symbol-AttachmentService.open.release"></a>

## AttachmentService.open.release

Освобождает слот ровно один раз после завершения или прерывания ответа.

Файлы активных ответов не удаляются сборщиком кеша.

```typescript
release()
```

<a id="symbol-AttachmentService.trim"></a>

## AttachmentService.trim

Удаляет самые давно открывавшиеся файлы при превышении бюджета диска.

Активные файлы защищены; SQLite-история и архив исключённых диалогов не меняются.

```typescript
private async trim()
```

<a id="symbol-clearAttachmentCache"></a>

## clearAttachmentCache

Удаляет только отдельный кеш байтов вложений по явной локальной команде.

Не затрагивает Telegram-сессию, настройки и SQLite-историю.

```typescript
clearAttachmentCache(directory: string)
```

<a id="symbol-safeAttachmentType"></a>

## safeAttachmentType

Проверяет сигнатуру растрового изображения перед встроенным просмотром.

Несоответствие MIME переводит содержимое в обычный скачиваемый файл.

```typescript
safeAttachmentType(attachment: Attachment, head: Buffer): Attachment
```
