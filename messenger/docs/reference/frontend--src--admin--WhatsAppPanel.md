# frontend/src/admin/WhatsAppPanel.tsx

Временный серверный QR и независимый выбор чатов WhatsApp в личной админке.

[Исходный модуль](../../frontend/src/admin/WhatsAppPanel.tsx) · [Индекс](README.md)

<a id="symbol-WhatsAppPanel"></a>

## WhatsAppPanel

Показывает QR владельцу и неактивные инструкции остальным пользователям.

Неактивная панель не вызывает API; QR не попадает в локальный кеш или чат.

```typescript
WhatsAppPanel({ onError, enabled }: {
    onError: (error: unknown) => void;
    enabled: boolean;
})
```

<a id="symbol-WhatsAppPanel.dialogs"></a>

## WhatsAppPanel.dialogs

Загружает каталог метаданных WhatsApp без истории невыбранных чатов.

Выбор других источников не отправляется и не сбрасывается.

```typescript
async dialogs()
```

<a id="symbol-WhatsAppPanel.refresh"></a>

## WhatsAppPanel.refresh

Последовательно опрашивает состояние и свежий QR, пока открыт экран.

Уход со страницы отменяет обновления; фоновые копии QR не создаются.

```typescript
async refresh()
```

<a id="symbol-WhatsAppPanel.run"></a>

## WhatsAppPanel.run

Выполняет административное действие и показывает только безопасный результат.

Автоматической отправки сообщений и сканирования QR здесь нет.

```typescript
async run(task: () => Promise<void>)
```
