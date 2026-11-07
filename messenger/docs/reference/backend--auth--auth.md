# backend/auth/auth.ts

Argon2id-пароли ролей admin/chat, веб-сессии в памяти и ограничение попыток входа.

[Исходный модуль](../../backend/auth/auth.ts) · [Индекс](README.md)

<a id="symbol-Auth"></a>

## Auth

Разделяет права чата и админки на сервере.

Роли имеют независимые пароли, cookie и ограниченные сессии в памяти.

```typescript
class Auth
```

<a id="symbol-Auth.constructor"></a>

## Auth.constructor

Подключает SQLite для проверки Argon2id-настроек.

Сырой пароль и cookie-токены в SQLite не записываются.

```typescript
constructor(private store: Store)
```

<a id="symbol-Auth.cookieName"></a>

## Auth.cookieName

Строит независимое имя cookie роли.

В HTTPS используется обязательный Secure-префикс.

```typescript
cookieName(role: Role, secure: boolean)
```

<a id="symbol-Auth.login"></a>

## Auth.login

Проверяет Argon2id-пароль и создаёт отдельную сессию роли.

Ограничивает ошибки входа и параллельные хеширования для 1 vCPU.

```typescript
async login(password: string, role: Role = 'chat')
```

<a id="symbol-Auth.logout"></a>

## Auth.logout

Отзывает текущую сессию одной роли.

Выход из чата не завершает административную сессию.

```typescript
logout(cookie = '', role: Role = 'chat', secure = false)
```

<a id="symbol-Auth.ready"></a>

## Auth.ready

Проверяет наличие Argon2id-хешей admin и chat.

Прежний локальный scrypt-пароль не разрешает публичный запуск.

```typescript
ready()
```

<a id="symbol-Auth.revoke"></a>

## Auth.revoke

Отзывает все веб-сессии выбранной роли.

Вызывается после изменения её пароля.

```typescript
revoke(role: Role)
```

<a id="symbol-Auth.session"></a>

## Auth.session

Проверяет токен, роль и срок действия сессии.

Перенос токена между именами cookie не меняет права.

```typescript
session(cookie = '', role: Role = 'chat', secure = false): WebSession | undefined
```

<a id="symbol-Auth.setupRequired"></a>

## Auth.setupRequired

Проверяет готовность обеих ролей.

До начального задания паролей публичный вход заблокирован.

```typescript
get setupRequired()
```

<a id="symbol-Auth.token"></a>

## Auth.token

Извлекает cookie только указанной роли.

Другие cookies и роли не дают токен этой сессии.

```typescript
token(cookie: string, role: Role, secure: boolean)
```

<a id="symbol-AuthError"></a>

## AuthError

Передаёт безопасный статус ошибки авторизации.

Не содержит пароль, cookie или исходное исключение.

```typescript
class AuthError extends Error
```

<a id="symbol-AuthError.constructor"></a>

## AuthError.constructor

Создаёт безопасную ошибку входа с HTTP-статусом.

Внутренние исключения и реквизиты в ответ не включаются.

```typescript
constructor(public status: number, message: string)
```

<a id="symbol-digest"></a>

## digest

Хеширует случайный токен веб-сессии.

Сырой cookie-токен не является ключом карты сессий.

```typescript
digest(token: string)
```

<a id="symbol-passwordHash"></a>

## passwordHash

Создаёт Argon2id-хеш с ограниченной памятью для VPS.

Соль генерируется библиотекой, исходный пароль не сохраняется.

```typescript
async passwordHash(password: string): Promise<string>
```

<a id="symbol-passwordMatches"></a>

## passwordMatches

Проверяет только Argon2id-хеш пароля.

Старые scrypt-настройки не дают доступ к публичному приложению.

```typescript
async passwordMatches(password: string, stored: string): Promise<boolean>
```

<a id="symbol-Role"></a>

## Role

Разделяет административный и пользовательский доступ.

Cookie, пароли и ключи сессий не взаимозаменяемы.

```typescript
export type Role = 'admin' | 'chat';
```

<a id="symbol-WebSession"></a>

## WebSession

Содержит роль, CSRF и абсолютный срок веб-сессии.

Сессия хранится только в памяти серверного процесса.

```typescript
interface WebSession {
    csrf: string;
    expires: number;
    role: Role;
}
```
