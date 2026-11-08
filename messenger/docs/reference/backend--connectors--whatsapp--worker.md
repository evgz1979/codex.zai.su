# backend/connectors/whatsapp/worker.ts

Последовательный Unix socket worker браузера с дедлайнами и безопасными отказами.

[Исходный модуль](../../backend/connectors/whatsapp/worker.ts) · [Индекс](README.md)

<a id="symbol-createBrowserWorker"></a>

## createBrowserWorker

Обслуживает закрытый Unix socket с фиксированным протоколом WhatsApp.

Все браузерные операции последовательны; зависший вызов завершает worker для очистки cgroup.

```typescript
createBrowserWorker(browser: Pick<WhatsAppBrowser, 'handle' | 'stop'>)
```

<a id="symbol-main"></a>

## main

Запускает непривилегированный браузерный worker без TCP-listener.

Сессии находятся вне релизов; SIGTERM закрывает браузер и приватный socket.

```typescript
main()
```

<a id="symbol-main.stop"></a>

## main.stop

Завершает только браузерный сервис по сигналу systemd.

Профили сохраняются, чужие сервисы и сетевые настройки не меняются.

```typescript
stop()
```
