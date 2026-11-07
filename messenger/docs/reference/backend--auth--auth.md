# backend/auth/auth.ts

Хеширование пароля, веб-сессии в памяти и ограничение попыток входа.

[Исходный модуль](../../backend/auth/auth.ts) · [Индекс](README.md)

<a id="symbol-Auth"></a>

## Auth

Управляет веб-входом одного владельца и сессиями в памяти.

Секреты Telegram не участвуют в веб-авторизации.

```typescript
class Auth
```

<a id="symbol-Auth.constructor"></a>

## Auth.constructor

Подключает хранилище настроек авторизации.

Существующие веб-сессии не восстанавливаются из SQLite.

```typescript
constructor(private store: Store)
```

<a id="symbol-Auth.login"></a>

## Auth.login

Проверяет пароль и создаёт ограниченную веб-сессию.

Допускает пять попыток за минуту и не более десяти сессий в памяти.

```typescript
async login(password: string)
```

<a id="symbol-Auth.logout"></a>

## Auth.logout

Отзывает сессию текущего cookie-токена.

Не завершает Telegram-сессию и не очищает кеш переписки.

```typescript
logout(cookie = '')
```

<a id="symbol-Auth.session"></a>

## Auth.session

Находит действующую сессию по cookie.

Истёкшая сессия удаляется; неизвестный токен не авторизует запрос.

```typescript
session(cookie = ''): WebSession | undefined
```

<a id="symbol-Auth.setupRequired"></a>

## Auth.setupRequired

Проверяет наличие хеша пароля в настройках.

Отсутствующий password означает необходимость локального setup.

```typescript
get setupRequired()
```

<a id="symbol-AuthError"></a>

## AuthError

Передаёт безопасную ошибку веб-авторизации HTTP-обработчику.

Хранит только HTTP-статус и текст для пользователя.

```typescript
class AuthError extends Error
```

<a id="symbol-AuthError.constructor"></a>

## AuthError.constructor

Создаёт ошибку авторизации с HTTP-статусом.

Исходные исключения провайдера в неё не добавляются.

```typescript
constructor(public status: number, message: string)
```

<a id="symbol-digest"></a>

## digest

Вычисляет SHA-256 представление cookie-токена.

Сырой токен не используется как ключ серверной карты сессий.

```typescript
digest(token: string)
```

<a id="symbol-passwordHash"></a>

## passwordHash

Создаёт scrypt-хеш пароля со случайной солью.

Возвращает salt:hexHash и не сохраняет исходный пароль.

```typescript
async passwordHash(password: string): Promise<string>
```

<a id="symbol-passwordMatches"></a>

## passwordMatches

Сравнивает введённый пароль с сохранённым scrypt-хешем.

Результаты одинаковой длины сравниваются timingSafeEqual.

```typescript
async passwordMatches(password: string, stored: string): Promise<boolean>
```

<a id="symbol-WebSession"></a>

## WebSession

Описывает серверную веб-сессию.

CSRF и абсолютный срок действия находятся только в памяти процесса.

```typescript
interface WebSession {
    csrf: string;
    expires: number;
}
```
