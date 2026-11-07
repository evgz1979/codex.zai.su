# frontend/src/admin/AdminApp.tsx

Отдельная административная страница с собственным входом и формами.

[Исходный модуль](../../frontend/src/admin/AdminApp.tsx) · [Индекс](README.md)

<a id="symbol-AdminApp"></a>

## AdminApp

Отображает отдельный административный интерфейс.

Доступ к настройкам дополнительно проверяется API, а не маршрутом браузера.

```typescript
AdminApp()
```

<a id="symbol-AdminApp.accept"></a>

## AdminApp.accept

Применяет результат административного входа.

CSRF хранится только в памяти этой страницы.

```typescript
accept(info: SessionInfo)
```

<a id="symbol-AdminApp.answer"></a>

## AdminApp.answer

Отправляет значение ожидаемого шага code или 2FA.

Очищает секретное поле, после успеха получает только метаданные диалогов.

```typescript
answer(e: FormEvent)
```

<a id="symbol-AdminApp.begin"></a>

## AdminApp.begin

Отправляет начальные реквизиты Telegram в admin API.

Очищает api_hash и телефон в форме перед ожиданием ответа.

```typescript
async begin(e: FormEvent)
```

<a id="symbol-AdminApp.fail"></a>

## AdminApp.fail

Показывает безопасную ошибку и обрабатывает потерю прав.

При 401 очищает административные данные страницы.

```typescript
fail(e: unknown)
```

<a id="symbol-AdminApp.loadDialogs"></a>

## AdminApp.loadDialogs

Загружает метаданные каталога и сохранённые галочки.

История не запрашивается этой формой.

```typescript
async loadDialogs()
```

<a id="symbol-AdminApp.login"></a>

## AdminApp.login

Выполняет отдельный административный вход.

Использует admin API и очищает поле пароля после успеха.

```typescript
login(e: FormEvent)
```

<a id="symbol-AdminApp.logout"></a>

## AdminApp.logout

Завершает административную сессию.

Очищает список диалогов и секретные поля формы.

```typescript
async logout()
```

<a id="symbol-AdminApp.refreshStatus"></a>

## AdminApp.refreshStatus

Получает безопасные статусы источника.

Не запрашивает реквизиты или код авторизации.

```typescript
async refreshStatus()
```

<a id="symbol-AdminApp.run"></a>

## AdminApp.run

Управляет блокировкой и ошибкой административного действия.

Не журналирует аргументы и результаты секретных форм.

```typescript
async run(task: () => Promise<void>)
```

<a id="symbol-AdminApp.saveSelection"></a>

## AdminApp.saveSelection

Сохраняет общий выбор, включая скрытые текущей закладкой диалоги.

Папка не отправляется как разрешение и не включает новые чаты автоматически.

```typescript
async saveSelection()
```
