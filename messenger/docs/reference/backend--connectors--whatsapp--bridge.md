# backend/connectors/whatsapp/bridge.ts

Ограниченный клиент приватного браузерного worker без TCP и универсального RPC.

[Исходный модуль](../../backend/connectors/whatsapp/bridge.ts) · [Индекс](README.md)

<a id="symbol-browserCall"></a>

## browserCall

Отправляет одну фиксированную команду через приватный Unix socket.

Нет TCP-порта, токена в браузере, универсального RPC или бесконечного ожидания.

```typescript
browserCall(request: BrowserRequest, socketPath = process.env.WHATSAPP_BROWSER_SOCKET || '/run/zai-whatsapp/control.sock'): Promise<BrowserResult>
```

<a id="symbol-browserCall.finish"></a>

## browserCall.finish

Закрывает единственный запрос и удаляет таймер.

Ответ после таймаута никогда не передаётся вызывающему коду.

```typescript
finish(error?: Error, value?: BrowserResult)
```
