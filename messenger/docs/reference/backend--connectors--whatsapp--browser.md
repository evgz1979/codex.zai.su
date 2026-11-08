# backend/connectors/whatsapp/browser.ts

Одна изолированная Chromium-сессия с sandbox, временным QR и выбранной историей.

[Исходный модуль](../../backend/connectors/whatsapp/browser.ts) · [Индекс](README.md)

<a id="symbol-nativeChat"></a>

## nativeChat

Проверяет и декодирует точный native маршрут WhatsApp.

Статусы, рассылки, каналы и произвольные URL не становятся диалогами Messenger.

```typescript
nativeChat(id: string): string
```

<a id="symbol-PollingClient"></a>

## PollingClient

Использует WhatsApp Web без автоматической передачи всех входящих текстов в Node.

История извлекается только явной командой выбранного диалога; состояние проверяется отдельно.

```typescript
class PollingClient extends WA.Client
```

<a id="symbol-PollingClient.attachEventListeners"></a>

## PollingClient.attachEventListeners

Отключает стандартные message/group/call listeners сторонней библиотеки.

QR, authenticated и ready остаются частью инициализации клиента.

```typescript
async attachEventListeners()
```

<a id="symbol-webMessage"></a>

## webMessage

Преобразует сообщение только после проверки выбранного native диалога.

Неподдерживаемое вложение явно обозначается, текст и статус не выдумываются.

```typescript
webMessage(value: WebMessage, chatId: string, title: string): Message
```

<a id="symbol-WebMessage"></a>

## WebMessage

Описывает только используемые поля сообщения из браузерного клиента.

Не сохраняет ссылки на native message, функции, медиа или ключи шифрования.

```typescript
export interface WebMessage {
    id: {
        _serialized: string;
        remote?: string;
        fromMe?: boolean;
    };
    from: string;
    to: string;
    author?: string;
    fromMe: boolean;
    timestamp: number;
    body: string;
    type: string;
    ack: number;
    hasMedia?: boolean;
}
```

<a id="symbol-WhatsAppBrowser"></a>

## WhatsAppBrowser

Управляет единственной ограниченной браузерной сессией VPS.

Разные аккаунты не делят профиль; чужой start возвращает busy без отключения владельца.

```typescript
class WhatsAppBrowser
```

<a id="symbol-WhatsAppBrowser.beginSync"></a>

## WhatsAppBrowser.beginSync

Даёт привязанному клиенту отдельные пятнадцать минут на первичную загрузку.

CONNECTED транспорта не разрешает историю: доступ появляется только после ready библиотеки.

```typescript
private beginSync(client: InstanceType<typeof WA.Client>, percent?: unknown)
```

<a id="symbol-WhatsAppBrowser.catalog"></a>

## WhatsAppBrowser.catalog

Выдаёт административный каталог метаданных без body и lastMessage.

Из browser context выходят только ID, имя, тип, дата и unread; максимум 1000 чатов.

```typescript
private async catalog(): Promise<Conversation[]>
```

<a id="symbol-WhatsAppBrowser.constructor"></a>

## WhatsAppBrowser.constructor

Задаёт корень профилей и доверенный путь браузера из конфигурации сервиса.

HTTP-запросы не могут менять executablePath, root или фабрику клиента.

```typescript
constructor(private root: string, private executablePath: string, private factory = (options: WA.ClientOptions) => new PollingClient(options))
```

<a id="symbol-WhatsAppBrowser.fail"></a>

## WhatsAppBrowser.fail

Завершает только текущую браузерную сессию после безопасного отказа.

Исходное исключение библиотеки и browser stderr не выводятся в журнал или API.

```typescript
private async fail(client: InstanceType<typeof WA.Client>, issue = 'Не удалось подключить WhatsApp Web. Повторите подключение вручную.')
```

<a id="symbol-WhatsAppBrowser.handle"></a>

## WhatsAppBrowser.handle

Применяет одну проверенную команду без произвольного RPC.

Чтение и отправка допускаются только для выбранного ID и фактического готового клиента.

```typescript
async handle(request: BrowserRequest): Promise<BrowserResult>
```

<a id="symbol-WhatsAppBrowser.page"></a>

## WhatsAppBrowser.page

Загружает ограниченную порцию выбранной истории внутри WhatsApp Web.

Голова возвращается из кеша; одна догрузка ограничена восемью секундами, курсор привязан к чату.

```typescript
private async page(jid: string, before?: string): Promise<BrowserResult>
```

<a id="symbol-WhatsAppBrowser.start"></a>

## WhatsAppBrowser.start

Запускает Chromium с включённым sandbox и профилем текущего аккаунта.

Без interactive восстанавливается только профиль, ранее достигший ready.

```typescript
private async start(account: string, interactive: boolean): Promise<WhatsAppStatus>
```

<a id="symbol-WhatsAppBrowser.status"></a>

## WhatsAppBrowser.status

Возвращает QR только владельцу текущего процесса и только до его истечения.

Чужой аккаунт не узнаёт ни владельца слота, ни его телефон, ни QR.

```typescript
status(account: string): WhatsAppStatus
```

<a id="symbol-WhatsAppBrowser.stop"></a>

## WhatsAppBrowser.stop

Закрывает Chromium, сохраняя профиль для следующего восстановления.

Только logout удаляет профиль; остановка аккаунта и релиз его не стирают.

```typescript
async stop()
```

<a id="symbol-WhatsAppBrowser.waitForScan"></a>

## WhatsAppBrowser.waitForScan

Ограничивает ожидание сканирования отдельно от первичной синхронизации.

Перед истечением трёх минут повторно проверяет транспорт, не закрывая уже привязанный клиент.

```typescript
private waitForScan(client: InstanceType<typeof WA.Client>)
```

<a id="symbol-WhatsAppBrowser.watchStartup"></a>

## WhatsAppBrowser.watchStartup

Определяет принятую привязку без чтения чатов, профиля или ключей.

Последовательный опрос работает и при закрытой админке; stop/ready отменяют таймер.

```typescript
private watchStartup(client: InstanceType<typeof WA.Client>)
```
