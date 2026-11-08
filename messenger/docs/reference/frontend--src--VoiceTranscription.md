# frontend/src/VoiceTranscription.tsx

Кнопка расшифровки голосового, частичный текст, ручной повтор и отменяемый опрос.

[Исходный модуль](../../frontend/src/VoiceTranscription.tsx) · [Индекс](README.md)

<a id="symbol-VoiceTranscription"></a>

## VoiceTranscription

Показывает кнопку голосового и полученный текст под сообщением.

Запуск явный; ожидающее задание возобновляется из кеша, уход отменяет HTTP-опрос.

```typescript
VoiceTranscription({ request, value, onUnauthorized }: {
    request: AttachmentRequest;
    value?: Transcript;
    onUnauthorized(error: ApiError): void;
})
```

<a id="symbol-VoiceTranscription.poll"></a>

## VoiceTranscription.poll

Читает состояние только выбранного голосового, пока Telegram готовит текст.

После двух минут предлагает ручное продолжение; ошибки не повторяются автоматически.

```typescript
async poll()
```
