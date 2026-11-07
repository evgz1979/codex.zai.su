# backend/storage/store.ts

SQLite: настройки ролей, выбранные диалоги и ограниченный кеш с сохранением исключённого архива.

[Исходный модуль](../../backend/storage/store.ts) · [Индекс](README.md)

<a id="symbol-Store"></a>

## Store

Хранит настройки, выбор диалогов и ограниченный кеш каждого диалога.

Исключение диалога меняет только выбор, не удаляя сохранённые данные.

```typescript
class Store
```

<a id="symbol-Store.clearCache"></a>

## Store.clearCache

Удаляет кеш только явной локальной командой.

Пароли, выбор и Telegram-сессия сохраняются.

```typescript
clearCache()
```

<a id="symbol-Store.close"></a>

## Store.close

Закрывает подключение SQLite.

Не удаляет постоянные настройки.

```typescript
close()
```

<a id="symbol-Store.constructor"></a>

## Store.constructor

Открывает SQLite и создаёт совместимые таблицы кеша и выбора.

Прежний кеш мигрируется без автоматического разрешения диалогов.

```typescript
constructor(directory: string)
```

<a id="symbol-Store.get"></a>

## Store.get

Читает строковую настройку по ключу.

Использует параметризованный SELECT.

```typescript
get(key: string): string | undefined
```

<a id="symbol-Store.loadCache"></a>

## Store.loadCache

Загружает кеш только переданных разрешённых ID.

Пустой выбор даёт пустую ленту, исключённый архив не читается для UI.

```typescript
loadCache(ids: string[] = this.selected()): Snapshot
```

<a id="symbol-Store.remove"></a>

## Store.remove

Удаляет одну настройку по ключу.

Не удаляет таблицы, выбор или чужие данные.

```typescript
remove(key: string)
```

<a id="symbol-Store.saveCache"></a>

## Store.saveCache

Сохраняет ограниченный кеш обновлённых диалогов.

Оставляет до 40 сообщений активного диалога, не трогает архив остальных.

```typescript
saveCache(snapshot: Snapshot)
```

<a id="symbol-Store.select"></a>

## Store.select

Атомарно заменяет список разрешённых ID.

При ошибке транзакция откатывается, кеш не удаляется.

```typescript
select(ids: string[])
```

<a id="symbol-Store.selected"></a>

## Store.selected

Читает разрешённые ID диалогов из SQLite.

Результат сохраняется после перезапуска процесса.

```typescript
selected(): string[]
```

<a id="symbol-Store.set"></a>

## Store.set

Заменяет строковую настройку.

Не формирует SQL из текста сообщений.

```typescript
set(key: string, value: string)
```
