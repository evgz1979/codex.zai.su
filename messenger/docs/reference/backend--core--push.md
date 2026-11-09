# backend/core/push.ts

Приватные подписки Web Push, VAPID и доставка нейтральных уведомлений новых входящих.

[Исходный модуль](../../backend/core/push.ts) · [Индекс](README.md)

<a id="symbol-Device"></a>

## Device

Хранит приватную подписку устройства и версию пароля владельца.

Подписки действуют до отзыва; expiresAt сохранён только для совместимого отката.

```typescript
interface Device {
    subscription: webpush.PushSubscription;
    createdAt: number;
    expiresAt: number;
    credential: string;
}
```

<a id="symbol-PushService"></a>

## PushService

Доставляет нейтральные уведомления только о новых входящих выбранных диалогов.

История, правки и отправки исключены; секреты и содержимое сообщений не логируются.

```typescript
class PushService
```

<a id="symbol-PushService.clear"></a>

## PushService.clear

Отзывает все устройства при смене пароля чата через админку.

Постоянная VAPID-пара сохраняется для последующего явного включения.

```typescript
clear()
```

<a id="symbol-PushService.configuration"></a>

## PushService.configuration

Возвращает публичную конфигурацию для PushManager браузера.

Production использует существующий HTTPS origin, новых сетевых входов нет.

```typescript
configuration()
```

<a id="symbol-PushService.constructor"></a>

## PushService.constructor

Подписывает доставку на события ядра без отдельного порта или процесса.

Сеть изолирована транспортом; ошибки push не прерывают Telegram-синхронизацию.

```typescript
constructor(private core: MessengerService, private store: Store, private origin: string, private transport: Transport = webpush.sendNotification, private now = Date.now)
```

<a id="symbol-PushService.credential"></a>

## PushService.credential

Связывает подписки с текущим паролем чата без хранения исходного пароля.

Смена пароля, включая CLI, делает прежние подписки недействительными.

```typescript
private credential()
```

<a id="symbol-PushService.devices"></a>

## PushService.devices

Читает только действующие подписки из приватных настроек SQLite.

Устаревшие записи удаляются; исходные endpoint и ключи не возвращаются клиенту.

```typescript
private devices(): Device[]
```

<a id="symbol-PushService.enqueue"></a>

## PushService.enqueue

Объединяет близкие новые события в одну короткую доставку.

Очередь ограничена и живёт в памяти; архив в неё не помещается.

```typescript
private enqueue(message: Message)
```

<a id="symbol-PushService.flush"></a>

## PushService.flush

Повторно проверяет выбор, удаление сообщения и срок подписки перед доставкой.

HTTP 404/410 удаляют подписку; временные ошибки не раскрываются и не создают цикл.

```typescript
flush(): Promise<void>
```

<a id="symbol-PushService.keys"></a>

## PushService.keys

Создаёт одну постоянную пару VAPID при первом включении функции.

В HTTP попадает только публичный ключ; privateKey остаётся в SQLite.

```typescript
private keys(): {
    publicKey: string;
    privateKey: string;
}
```

<a id="symbol-PushService.registered"></a>

## PushService.registered

Проверяет регистрацию только переданного endpoint.

Список и реквизиты других устройств никогда не выдаются.

```typescript
registered(endpoint: unknown)
```

<a id="symbol-PushService.remove"></a>

## PushService.remove

Удаляет подписку текущего устройства при отключении или явном выходе.

Другие устройства сохраняют собственное разрешение.

```typescript
remove(endpoint: unknown)
```

<a id="symbol-PushService.save"></a>

## PushService.save

Заменяет ограниченный список устройств в приватном хранилище.

Данные остаются вне релиза и Git вместе с остальными настройками.

```typescript
private save(devices: Device[])
```

<a id="symbol-PushService.schedule"></a>

## PushService.schedule

Планирует один ограниченный пакет без параллельных отправителей.

Таймер не удерживает процесс после штатного завершения.

```typescript
private schedule()
```

<a id="symbol-PushService.stop"></a>

## PushService.stop

Отключает события и ожидает текущую отправку перед закрытием SQLite.

Отложенная очередь после остановки не отправляется.

```typescript
async stop()
```

<a id="symbol-PushService.subscribe"></a>

## PushService.subscribe

Сохраняет разрешённую браузером подписку до явного отзыва или отказа провайдера.

Автовосстановление сохраняет дату первого включения без повторной отправки старой истории.

```typescript
subscribe(input: unknown)
```

<a id="symbol-PushService.test"></a>

## PushService.test

Отправляет явную проверку только зарегистрированному устройству владельца.

Endpoint и ошибка провайдера не включаются в HTTP-ответ.

```typescript
async test(endpoint: unknown)
```

<a id="symbol-pushSubscription"></a>

## pushSubscription

Проверяет подписку браузера и фиксированный список push-провайдеров.

Произвольные URL, порты, credentials и некорректные P-256 ключи отклоняются.

```typescript
pushSubscription(input: unknown): webpush.PushSubscription
```

<a id="symbol-Transport"></a>

## Transport

Отправляет зашифрованный Web Push через стандартную библиотеку.

Тесты подменяют транспорт без обращения к Apple или Telegram.

```typescript
type Transport = (subscription: webpush.PushSubscription, payload: string, options: webpush.RequestOptions) => Promise<unknown>;
```
