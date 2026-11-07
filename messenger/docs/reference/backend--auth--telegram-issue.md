# backend/auth/telegram-issue.ts

Allowlist-классификация отказов Telegram без раскрытия исходных исключений.

[Исходный модуль](../../backend/auth/telegram-issue.ts) · [Индекс](README.md)

<a id="symbol-telegramAuthIssue"></a>

## telegramAuthIssue

Переводит исключение Telegram в ограниченную безопасную категорию.

Не возвращает исходный message, request, стек, телефон, код или ключи.

```typescript
telegramAuthIssue(error: unknown): TelegramAuthIssue
```
