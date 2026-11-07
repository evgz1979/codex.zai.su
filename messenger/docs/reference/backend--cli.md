# backend/cli.ts

Команды setup, bootstrap и clear без вывода секретов; Telegram подключается через админку.

[Исходный модуль](../../backend/cli.ts) · [Индекс](README.md)

<a id="symbol-main"></a>

## main

Задаёт начальные пароли локально или принимает только готовые хеши из SSH stdin.

Не перезаписывает существующие production-реквизиты при развёртывании.

```typescript
async main()
```
