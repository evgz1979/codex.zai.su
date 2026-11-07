# backend/storage/store.ts

SQLite: настройки ролей, выбранные диалоги и полный кеш выбранной истории с сохранением исключённого архива.

[Исходный модуль](../../backend/storage/store.ts) · [Индекс](README.md)

<a id="symbol-Store"></a>

## Store

Хранит настройки, выбор диалогов и полный кеш выбранной истории.

Исключение диалога меняет только выбор, не удаляя сохранённые данные.

```typescript
class Store
```

<a id="symbol-Store.access"></a>

## Store.access

Передаёт небольшую ревизию, разрешения и удаления для автоматического UI.

Не читает тексты сообщений; пропуск старого журнала требует сброса окна.

```typescript
access(since = 0)
```

<a id="symbol-Store.checkpointExists"></a>

## Store.checkpointExists

Проверяет наличие последней записанной страницы перед возобновлением.

После отката на старый усечённый кеш пропуски приводят к повторному заполнению.

```typescript
checkpointExists(ids: string[])
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

<a id="symbol-Store.conversation"></a>

## Store.conversation

Читает одни сохранённые метаданные диалога.

Историю и реквизиты источника не загружает.

```typescript
conversation(id: string): Conversation | undefined
```

<a id="symbol-Store.deleteSourceKeys"></a>

## Store.deleteSourceKeys

Удаляет полученные от источника ключи только среди текущих разрешённых ID.

Архив исключённых диалогов не затрагивается; браузеру передаются только общие ID.

```typescript
deleteSourceKeys(keys: string[], allowed: string[])
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

<a id="symbol-Store.messagePage"></a>

## Store.messagePage

Возвращает одну индексированную страницу SQLite без запроса к источнику.

Курсор привязан к диалогу, дате и ID; незавершённая история может ожидать фоновой загрузки.

```typescript
messagePage(id: string, before?: string): MessagePage
```

<a id="symbol-Store.progress"></a>

## Store.progress

Читает сохранённый прогресс или начальное состояние нового выбранного чата.

Завершённая история не загружается заново при обычном рестарте.

```typescript
progress(id: string): SyncProgress
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

Сохраняет метаданные и сообщения без усечения накопленной истории.

Объём памяти ответа ограничен отдельно; исключённый архив не удаляется.

```typescript
saveCache(snapshot: Snapshot)
```

<a id="symbol-Store.saveProgress"></a>

## Store.saveProgress

Сохраняет курсоры только после успешной записи соответствующей страницы.

Прогресс переживает перезапуск и не содержит коды или ключи Telegram.

```typescript
saveProgress(id: string, progress: SyncProgress)
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

<a id="symbol-Store.syncStatus"></a>

## Store.syncStatus

Возвращает число выбранных диалогов с незавершённой историей.

Состояние относится только к разрешённым диалогам, без пользовательских текстов.

```typescript
syncStatus(): SyncStatus
```

<a id="symbol-Store.upsertMessages"></a>

## Store.upsertMessages

Записывает страницу или событие с дедупликацией и обновляет превью.

Уже сохранённые одинаковые сообщения не создают лишнюю ревизию.

```typescript
upsertMessages(messages: Message[], countUnread = false)
```

<a id="symbol-SyncProgress"></a>

## SyncProgress

Хранит курсоры возобновляемой истории и сверки новых сообщений.

Курсоры источника отделены от курсоров страниц браузерного SQLite API.

```typescript
export interface SyncProgress {
    initialized: boolean;
    historyCursor: string | null;
    historyComplete: boolean;
    headKeys: string[];
    newerCursor: string | null;
    pendingHeadKeys: string[];
    nextHeadAt: number;
    checkpointIds: string[];
    lastHeadAt?: number;
}
```
