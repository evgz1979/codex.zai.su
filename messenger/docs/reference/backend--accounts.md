# backend/accounts.ts

Закрытый реестр личных пользователей, персональные ссылки, блокировки и независимые серверные экземпляры.

[Исходный модуль](../../backend/accounts.ts) · [Индекс](README.md)

<a id="symbol-AccountRecord"></a>

## AccountRecord

Хранит метаданные личного аккаунта и признак блокировки.

Пароли и Telegram-реквизиты находятся только в отдельном личном каталоге.

```typescript
export interface AccountRecord extends AccountInfo {
    enabled: boolean;
}
```

<a id="symbol-Accounts"></a>

## Accounts

Управляет закрытым списком пользователей и отдельными личными Messenger.

Владелец сохраняет прежний каталог; новые аккаунты используют случайные UUID.

```typescript
class Accounts
```

<a id="symbol-Accounts.allows"></a>

## Accounts.allows

Проверяет принадлежность экземпляра действующему реестру.

Используется также во время передачи вложений после блокировки аккаунта.

```typescript
allows(account: ActiveAccount)
```

<a id="symbol-Accounts.constructor"></a>

## Accounts.constructor

Восстанавливает только зарегистрированные аккаунты из приватных настроек владельца.

При повреждённом реестре запуск прекращается; каталоги с диска не обнаруживаются автоматически.

```typescript
constructor(private directory: string, private origin: string, private factory: RuntimeFactory = createAccountRuntime)
```

<a id="symbol-Accounts.create"></a>

## Accounts.create

Создаёт закрытый личный аккаунт с начальным паролем обеих ролей.

Не подключает Telegram; максимум четыре гостя, повторное имя и параллельные изменения запрещены.

```typescript
async create(input: Record<string, unknown>)
```

<a id="symbol-Accounts.find"></a>

## Accounts.find

Находит только включённый аккаунт с точным именем персональной ссылки.

Заблокированное или неизвестное имя не даёт доступ даже при прежнем cookie.

```typescript
find(username: string)
```

<a id="symbol-Accounts.list"></a>

## Accounts.list

Возвращает метаданные и персональные ссылки без доступа к чужим сервисам.

Старые записи без path сохраняют /u/username; список доступен только владельцу.

```typescript
list(): AccountRecord[]
```

<a id="symbol-Accounts.login"></a>

## Accounts.login

Выполняет вход только в выбранный ссылкой аккаунт и роль.

Общий лимит параллельного Argon2 и повторная проверка блокировки защищают VPS.

```typescript
async login(account: ActiveAccount, password: string, role: Role)
```

<a id="symbol-Accounts.open"></a>

## Accounts.open

Открывает сервисы аккаунта в каталоге с серверным UUID.

Пользовательское имя никогда не становится путём файловой системы.

```typescript
private open(info: AccountRecord)
```

<a id="symbol-Accounts.save"></a>

## Accounts.save

Сохраняет только реестр имён, UUID и блокировок в БД владельца.

Содержимое личных БД и секреты в реестр не включаются.

```typescript
private save()
```

<a id="symbol-Accounts.setEnabled"></a>

## Accounts.setEnabled

Блокирует или вновь разрешает личный аккаунт без удаления истории.

Блокировка сразу отзывает обе веб-роли и push, затем останавливает личные фоновые задачи.

```typescript
async setEnabled(id: unknown, enabled: unknown)
```

<a id="symbol-Accounts.start"></a>

## Accounts.start

Запускает личные синхронизаторы после открытия единственного loopback-порта.

Новые включённые аккаунты запускаются тем же жизненным циклом.

```typescript
start()
```

<a id="symbol-Accounts.stop"></a>

## Accounts.stop

Останавливает все личные сервисы перед удалением PID-файла.

Сначала закрывает гостей, затем БД владельца с реестром аккаунтов.

```typescript
async stop()
```

<a id="symbol-Accounts.validUsername"></a>

## Accounts.validUsername

Проверяет имя, пригодное для персональной ссылки.

Пути, Unicode, точки и зарезервированное имя владельца не принимаются.

```typescript
private validUsername(value: unknown): value is string
```

<a id="symbol-ActiveAccount"></a>

## ActiveAccount

Соединяет разрешённую запись аккаунта с его личными сервисами.

HTTP выбирает экземпляр только по проверенному сервером имени в URL.

```typescript
export interface ActiveAccount {
    info: AccountRecord;
    runtime: AccountRuntime;
}
```

<a id="symbol-RuntimeFactory"></a>

## RuntimeFactory

Создаёт сервисы одного аккаунта без публичного порта.

Подмена фабрики нужна только изолированным тестам без Telegram.

```typescript
type RuntimeFactory = (directory: string, origin: string) => AccountRuntime;
```
