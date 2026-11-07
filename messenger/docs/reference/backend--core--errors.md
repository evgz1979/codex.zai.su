# backend/core/errors.ts

Безопасная прикладная ошибка HTTP API.

[Исходный модуль](../../backend/core/errors.ts) · [Индекс](README.md)

<a id="symbol-AppError"></a>

## AppError

Представляет безопасную прикладную ошибку.

HTTP сериализует только status и message, без внутренних исключений.

```typescript
class AppError extends Error
```

<a id="symbol-AppError.constructor"></a>

## AppError.constructor

Создаёт прикладную ошибку с безопасным текстом.

HTTP-ответ не включает стек или секреты провайдера.

```typescript
constructor(public status: number, message: string, public retryAfterSeconds?: number)
```
