# frontend/src/AppUpdates.tsx

Проверка версии сборки и обновление приложения по нажатию без смены manifest и подписок.

[Исходный модуль](../../frontend/src/AppUpdates.tsx) · [Индекс](README.md)

<a id="symbol-AppUpdates"></a>

## AppUpdates

Показывает текущую версию и рабочую кнопку обновления внутри приложения.

Во время отправки или просмотра вложения применение обновления недоступно.

```typescript
AppUpdates({ updates, busy, hasDrafts }: {
    updates: ReturnType<typeof useAppUpdates>;
    busy: boolean;
    hasDrafts: boolean;
})
```

<a id="symbol-Release"></a>

## Release

Передаёт публичную версию приложения и идентификатор конкретной сборки.

Данные не связаны с аккаунтом, перепиской или реквизитами.

```typescript
interface Release {
    version: string;
    buildId: string;
}
```

<a id="symbol-useAppUpdates"></a>

## useAppUpdates

Проверяет новую сборку при запуске, возврате и раз в минуту в видимом окне.

Перезагрузка происходит только по нажатию; черновики требуют явного подтверждения потери.

```typescript
useAppUpdates()
```

<a id="symbol-useAppUpdates.apply"></a>

## useAppUpdates.apply

Перезагружает тот же личный адрес с уникальным параметром после сетевой проверки.

Cookie, manifest и push-подписки не удаляются; отмена предупреждения сохраняет черновики.

```typescript
async apply(state: () => {
    busy: boolean;
    hasDrafts: boolean;
})
```

<a id="symbol-useAppUpdates.check"></a>

## useAppUpdates.check

Получает публичный файл версии с обходом HTTP-кеша и ограничением времени.

Offline, ошибка и некорректный ответ не запускают перезагрузку.

```typescript
check(): Promise<Release | undefined>
```

<a id="symbol-useAppUpdates.resume"></a>

## useAppUpdates.resume

Проверяет версию при возвращении без автоматической навигации.

Скрытое приложение не опрашивает сервер и сохраняет текущий экран.

```typescript
resume()
```
