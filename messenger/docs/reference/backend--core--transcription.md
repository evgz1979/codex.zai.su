# backend/core/transcription.ts

Явная встроенная расшифровка голосовых, приватный кеш, дедупликация и проверка обновлений источника.

[Исходный модуль](../../backend/core/transcription.ts) · [Индекс](README.md)

<a id="symbol-VoiceTranscriptionService"></a>

## VoiceTranscriptionService

Управляет явными запросами встроенной расшифровки выбранного источника.

Не скачивает аудио и не передаёт сообщения внешним ИИ; кеш изолирован Store аккаунта.

```typescript
class VoiceTranscriptionService
```

<a id="symbol-VoiceTranscriptionService.constructor"></a>

## VoiceTranscriptionService.constructor

Подключает проверки маршрута ядра и приватное хранилище аккаунта.

Одновременно выполняются не более двух разных запросов источника.

```typescript
constructor(private core: MessengerService, private store: Store)
```

<a id="symbol-VoiceTranscriptionService.ingest"></a>

## VoiceTranscriptionService.ingest

Принимает обновления только ранее запрошенного задания той же версии.

Чужой ID, исключённый диалог, удаление или завершённый результат не заменяются.

```typescript
ingest(event: Extract<SourceEvent, {
    type: 'transcription';
}>)
```

<a id="symbol-VoiceTranscriptionService.message"></a>

## VoiceTranscriptionService.message

Проверяет выбранное сохранённое голосовое до любого обращения к источнику.

Миниатюры, обычное аудио, временные и чужие вложения не расшифровываются.

```typescript
private message(input: AttachmentRequest): Message
```

<a id="symbol-VoiceTranscriptionService.request"></a>

## VoiceTranscriptionService.request

Возвращает готовый кеш или запускает один дедуплицированный запрос.

Pending перечитывается у источника не чаще раза в 30 секунд, включая рестарт.

```typescript
async request(input: AttachmentRequest): Promise<VoiceTranscription>
```

<a id="symbol-VoiceTranscriptionService.valid"></a>

## VoiceTranscriptionService.valid

Проверяет форму результата перед сохранением текста провайдера.

Native ID используется только для сопоставления обновлений одного задания.

```typescript
private valid(result: SourceTranscription)
```
