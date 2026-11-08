# frontend/src/useConversationArrival.ts

Отменяемое открытие свежего непрочитанного при запуске и возврате, точного диалога по уведомлению.

[Исходный модуль](../../frontend/src/useConversationArrival.ts) · [Индекс](README.md)

<a id="symbol-ArrivalIntent"></a>

## ArrivalIntent

Описывает открытие по уведомлению либо возвращению в приложение.

Общий ID проверяется по актуальному серверному списку перед запросом диалога.

```typescript
export interface ArrivalIntent {
    conversationId?: string;
    explicit: boolean;
}
```

<a id="symbol-Options"></a>

## Options

Связывает состояние чата с очередью переходов при открытии приложения.

Автоматический переход не меняет черновик и окно вложения, явный клик сохраняет черновики.

```typescript
interface Options {
    authenticated: boolean;
    busy: boolean;
    blocked: boolean;
    navigate(intent: ArrivalIntent, signal: AbortSignal): Promise<void>;
    fail(error: unknown): void;
}
```

<a id="symbol-useConversationArrival"></a>

## useConversationArrival

Открывает свежий непрочитанный при запуске и возврате, точный диалог по клику push.

Ручной выбор отменяет поздний переход; новые сообщения в активном окне не переключают адресата.

```typescript
useConversationArrival(options: Options)
```

<a id="symbol-useConversationArrival.cancel"></a>

## useConversationArrival.cancel

Отменяет переход при ручном выборе диалога или общей ленты.

Не прерывает Telegram-отправку и не удаляет черновики.

```typescript
cancel()
```

<a id="symbol-useConversationArrival.enqueue"></a>

## useConversationArrival.enqueue

Запоминает приоритетный клик уведомления или обычное открытие.

Автоматический возврат не вытесняет уже выбранное явное уведомление.

```typescript
enqueue(intent: ArrivalIntent)
```

<a id="symbol-useConversationArrival.message"></a>

## useConversationArrival.message

Принимает команды Service Worker, включая время ожидания веб-входа.

URL не принимается, некорректный или слишком длинный ID игнорируется.

```typescript
message(event: MessageEvent)
```

<a id="symbol-useConversationArrival.visibility"></a>

## useConversationArrival.visibility

Обрабатывает возвращение из фона ровно один раз.

Изменения в уже видимом приложении не создают новых переходов.

```typescript
visibility()
```
