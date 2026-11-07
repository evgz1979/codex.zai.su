# backend/auth/telegram-login.ts

Пошаговый Telegram-вход с временными callbacks кода и 2FA.

[Исходный модуль](../../backend/auth/telegram-login.ts) · [Индекс](README.md)

<a id="symbol-TelegramLogin"></a>

## TelegramLogin

Управляет пошаговым Telegram-входом из защищённой админки.

Код и 2FA передаются одноразовому callback, не записываются в файлы и ответы.

```typescript
class TelegramLogin
```

<a id="symbol-TelegramLogin.begin"></a>

## TelegramLogin.begin

Начинает авторизацию по api_id, api_hash и телефону.

Проверяет поля, ограничивает жизнь входа пятью минутами, не подключает реальный аккаунт автоматически.

```typescript
async begin(input: {
    apiId: number;
    apiHash: string;
    phone: string;
})
```

<a id="symbol-TelegramLogin.cancel"></a>

## TelegramLogin.cancel

Отменяет ожидание секрета и закрывает клиент.

Не оставляет незавершённые callbacks или таймер авторизации.

```typescript
async cancel()
```

<a id="symbol-TelegramLogin.constructor"></a>

## TelegramLogin.constructor

Подключает vault и фабрику MTProto-клиента.

В production используется только штатный приватный клиент.

```typescript
constructor(private vault: SecretVault, private factory = telegramClient)
```

<a id="symbol-TelegramLogin.prompt"></a>

## TelegramLogin.prompt

Передаёт код или 2FA одноразовому callback teleproto.

В объекте сервиса хранится resolver, а не значение кода или пароля.

```typescript
private prompt(stage: 'code' | 'password')
```

<a id="symbol-TelegramLogin.setStage"></a>

## TelegramLogin.setStage

Публикует безопасное имя следующего шага.

Разрешает ожидающий HTTP-запрос без передачи введённого секрета.

```typescript
private setStage(stage: TelegramAuthStage)
```

<a id="symbol-TelegramLogin.submit"></a>

## TelegramLogin.submit

Передаёт секрет только ожидающему шагу code или password.

Повторный или неверный этап отклоняется, значение не сохраняется.

```typescript
async submit(stage: 'code' | 'password', value: string)
```

<a id="symbol-TelegramLogin.waitStage"></a>

## TelegramLogin.waitStage

Ожидает смену этапа авторизации.

Одновременно активен один переход и один ожидающий ответ.

```typescript
private waitStage()
```
