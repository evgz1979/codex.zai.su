# backend/auth/telegram-login.ts

Пошаговый Telegram-вход с временными callbacks кода и 2FA.

[Исходный модуль](../../backend/auth/telegram-login.ts) · [Индекс](README.md)

<a id="symbol-TelegramLogin"></a>

## TelegramLogin

Управляет пошаговым входом Telegram и безопасной причиной отказа.

Не хранит коды/2FA, не повторяет sendCode автоматически и ограничивает проверки.

```typescript
class TelegramLogin
```

<a id="symbol-TelegramLogin.begin"></a>

## TelegramLogin.begin

Начинает один вход по явно введённым реквизитам.

Ошибки создания клиента и сети завершают ожидание безопасным этапом error.

```typescript
async begin(input: {
    apiId: number;
    apiHash: string;
    phone: string;
})
```

<a id="symbol-TelegramLogin.cancel"></a>

## TelegramLogin.cancel

Отменяет ожидание и закрывает клиент без записи введённых секретов.

Истечение таймера сохраняет только категорию flow_expired.

```typescript
async cancel(preserveIssue = false)
```

<a id="symbol-TelegramLogin.constructor"></a>

## TelegramLogin.constructor

Подключает серверный vault и штатную либо тестовую фабрику.

Не читает секреты обратно в административные ответы.

```typescript
constructor(private vault: SecretVault, private factory = telegramClient)
```

<a id="symbol-TelegramLogin.onAuthError"></a>

## TelegramLogin.onAuthError

Классифицирует отказ без сохранения исходного исключения.

Только неверный код/2FA можно повторить в пределах пяти проверок.

```typescript
private onAuthError(error: Error)
```

<a id="symbol-TelegramLogin.prompt"></a>

## TelegramLogin.prompt

Запрашивает код или 2FA у владельца через одноразовый callback.

Повтор неверного значения сохраняет текущий запрос кода Telegram.

```typescript
private prompt(stage: 'code' | 'password')
```

<a id="symbol-TelegramLogin.setStage"></a>

## TelegramLogin.setStage

Передаёт ожидающему HTTP-запросу только безопасное имя этапа.

Один resolver обслуживает один переход авторизации.

```typescript
private setStage(stage: TelegramAuthStage)
```

<a id="symbol-TelegramLogin.submit"></a>

## TelegramLogin.submit

Передаёт значение только ожидающему шагу code или password.

Не выводит значение в ответ или журнал и ограничивает число проверок.

```typescript
async submit(stage: 'code' | 'password', value: string)
```

<a id="symbol-TelegramLogin.waitStage"></a>

## TelegramLogin.waitStage

Ожидает следующий переход процесса входа.

Значение введённого секрета сюда не возвращается.

```typescript
private waitStage()
```
