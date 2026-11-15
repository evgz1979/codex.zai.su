# backend/connectors/whatsapp/protocol.ts

Закрытый протокол Unix socket и проверка выбранного получателя WhatsApp.

[Исходный модуль](../../backend/connectors/whatsapp/protocol.ts) · [Индекс](README.md)

<a id="symbol-BrowserAction"></a>

## BrowserAction

Ограничивает команды локального браузерного процесса.

Протокол не принимает URL, JavaScript, shell или произвольные методы клиента.

```typescript
export type BrowserAction = 'status' | 'start' | 'stop' | 'logout' | 'catalog' | 'messages' | 'send' | 'read' | 'attachment';
```

<a id="symbol-browserRequest"></a>

## browserRequest

Проверяет закрытый набор команд до доступа к профилю или браузеру.

Невалидный запрос не создаёт каталог и не запускает процесс.

```typescript
browserRequest(value: unknown): BrowserRequest
```

<a id="symbol-BrowserRequest"></a>

## BrowserRequest

Адресует одну изолированную сессию по непрозрачному серверному ключу.

allowed строится backend из текущего выбора, а не из HTTP-запроса пользователя.

```typescript
export interface BrowserRequest {
    account: string;
    action: BrowserAction;
    interactive?: boolean;
    allowed?: string[];
    conversationId?: string;
    recipientId?: string;
    messageId?: string;
    before?: string;
    text?: string;
}
```

<a id="symbol-browserResponseLimit"></a>

## browserResponseLimit

Ограничивает обмен по приватному сокету в зависимости от команды.

Только команда вложения получает запас для Base64 и метаданных одного файла.

```typescript
browserResponseLimit(action: string)
```

<a id="symbol-BrowserResult"></a>

## BrowserResult

Возвращает только ограниченные DTO и временный административный QR.

Файлы профиля, cookie и нативные объекты Chromium не покидают worker.

```typescript
export interface BrowserResult {
    status?: WhatsAppStatus;
    startup?: BrowserStartup;
    conversations?: Conversation[];
    messages?: Message[];
    nextCursor?: string | null;
    message?: Message;
    media?: {
        data: string;
        mimeType: string;
        name?: string;
    };
    error?: string;
}
```

<a id="symbol-BrowserStartup"></a>

## BrowserStartup

Описывает только булевы признаки первичной готовности браузера.

Доступен приватному worker-клиенту владельца, без текстов, адресов, профиля или QR.

```typescript
export interface BrowserStartup {
    socketConnected: boolean;
    hasSynced: boolean;
    streamReady: boolean;
    helpersReady: boolean;
    callbackAvailable: boolean;
    authenticated: boolean;
    recoveryRequested: boolean;
}
```

<a id="symbol-WHATSAPP_ATTACHMENT_BYTES"></a>

## WHATSAPP_ATTACHMENT_BYTES

Ограничивает оригинал одного вложения в браузерном worker.

Base64 передаётся только между серверными процессами через Unix socket.

```typescript
const WHATSAPP_ATTACHMENT_BYTES = 8 * 1024 * 1024
```
