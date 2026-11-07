# backend/storage/private-files.ts

Права приватных файлов и AES-256-GCM хранилище Telegram-сессии.

[Исходный модуль](../../backend/storage/private-files.ts) · [Индекс](README.md)

<a id="symbol-privateDirectory"></a>

## privateDirectory

Создаёт каталог приватных данных и выставляет права 0700.

Возвращает исходный путь; содержимое каталога не выводится.

```typescript
privateDirectory(path: string): string
```

<a id="symbol-SecretVault"></a>

## SecretVault

Хранит Telegram credentials в AES-256-GCM файле.

Ключ находится рядом в приватном файле, защита не заменяет безопасность macOS-аккаунта.

```typescript
class SecretVault
```

<a id="symbol-SecretVault.clear"></a>

## SecretVault.clear

Удаляет локальный зашифрованный файл сессии.

Ключ и ранее кешированные сообщения не удаляются.

```typescript
clear()
```

<a id="symbol-SecretVault.constructor"></a>

## SecretVault.constructor

Определяет пути vault.key и telegram.enc в приватном каталоге.

Создаёт только каталог; наличие сессии не требуется.

```typescript
constructor(directory: string)
```

<a id="symbol-SecretVault.exists"></a>

## SecretVault.exists

Проверяет наличие обоих файлов для расшифровки.

Отсутствие одного файла означает отсутствие доступной сессии.

```typescript
exists()
```

<a id="symbol-SecretVault.load"></a>

## SecretVault.load

Расшифровывает серверные реквизиты из vault.

Ошибка аутентичности не превращается в пустую успешную сессию.

```typescript
load(): TelegramCredentials | undefined
```

<a id="symbol-SecretVault.save"></a>

## SecretVault.save

Шифрует credentials новым IV и записывает auth tag с шифротекстом.

Существующий ключ переиспользуется; реквизиты не печатаются.

```typescript
save(credentials: TelegramCredentials)
```

<a id="symbol-TelegramCredentials"></a>

## TelegramCredentials

Описывает только серверные реквизиты Telegram и StringSession.

Не входит в shared DTO, API-ответы и клиентскую сборку.

```typescript
export interface TelegramCredentials {
    apiId: number;
    apiHash: string;
    session: string;
    accountId?: string;
}
```

<a id="symbol-writePrivate"></a>

## writePrivate

Атомарно заменяет приватный файл через случайный временный файл.

Создаёт файл с 0600, затем rename и повторная установка прав.

```typescript
writePrivate(path: string, value: string | Buffer)
```
