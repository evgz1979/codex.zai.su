# backend/storage/store.ts

SQLite settings: хеш пароля и ограниченный JSON-кеш.

[Исходный модуль](../../backend/storage/store.ts) · [Индекс](README.md)

<a id="symbol-Store"></a>

## Store

Управляет локальной SQLite-таблицей settings.

Хранит хеш пароля и ограниченный кеш, но не Telegram credentials.

```typescript
class Store
```

<a id="symbol-Store.clearCache"></a>

## Store.clearCache

Удаляет только ключ cache и выполняет VACUUM.

Пароль и Telegram-сессия остаются на месте.

```typescript
clearCache()
```

<a id="symbol-Store.close"></a>

## Store.close

Закрывает подключение SQLite.

Вызывается владельцем Store при завершении команды или сервера.

```typescript
close()
```

<a id="symbol-Store.constructor"></a>

## Store.constructor

Открывает приватную SQLite и создаёт settings при отсутствии.

Включает DELETE journal и secure_delete, выставляет 0600.

```typescript
constructor(directory: string)
```

<a id="symbol-Store.get"></a>

## Store.get

Читает строковое значение одного ключа settings.

Использует параметризованный SELECT; неизвестный ключ даёт undefined.

```typescript
get(key: string): string | undefined
```

<a id="symbol-Store.loadCache"></a>

## Store.loadCache

Загружает кеш и проверяет возраст refreshedAt.

Кеш без даты или старше суток удаляется; фонового TTL-таймера нет.

```typescript
loadCache(): Snapshot | undefined
```

<a id="symbol-Store.saveCache"></a>

## Store.saveCache

Сохраняет JSON-снимок с ограниченным числом сообщений.

Количество ограничено LIMITS.cachedMessages.

```typescript
saveCache(snapshot: Snapshot)
```

<a id="symbol-Store.set"></a>

## Store.set

Заменяет строковое значение одного ключа settings.

Использует параметризованный INSERT OR REPLACE.

```typescript
set(key: string, value: string)
```
