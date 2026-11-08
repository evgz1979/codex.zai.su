# frontend/src/admin/UsersPanel.tsx

Добавление личных пользователей владельцем, персональные ссылки и блокировка доступа.

[Исходный модуль](../../frontend/src/admin/UsersPanel.tsx) · [Индекс](README.md)

<a id="symbol-ManagedUser"></a>

## ManagedUser

Дополняет публичное имя состоянием доступа для панели владельца.

Не содержит пароли, Telegram-аккаунты или личные переписки пользователей.

```typescript
type ManagedUser = AccountInfo & {
    enabled: boolean;
};
```

<a id="symbol-UsersPanel"></a>

## UsersPanel

Управляет закрытым списком личных пользователей и выдаёт персональные ссылки.

Сервер отдельно проверяет владельца; новый пользователь сам подключает Telegram.

```typescript
UsersPanel()
```

<a id="symbol-UsersPanel.create"></a>

## UsersPanel.create

Создаёт личный Messenger и очищает начальный пароль перед ожиданием ответа.

Один начальный пароль открывает чат и личные настройки; затем роли меняются отдельно.

```typescript
create(event: FormEvent)
```

<a id="symbol-UsersPanel.load"></a>

## UsersPanel.load

Получает только имена и состояния зарегистрированных пользователей.

Не загружает статусы источников и данные чужих Telegram.

```typescript
async load()
```

<a id="symbol-UsersPanel.run"></a>

## UsersPanel.run

Выполняет изменение закрытого списка и обновляет панель.

Ошибки отображаются без журналирования секретных полей.

```typescript
async run(task: () => Promise<void>)
```
