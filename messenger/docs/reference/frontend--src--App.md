# frontend/src/App.tsx

Единый React-интерфейс, веб-вход, адресат, черновики и состояние операций.

[Исходный модуль](../../frontend/src/App.tsx) · [Индекс](README.md)

<a id="symbol-App"></a>

## App

Отображает вход, единую ленту и поле ввода с явным адресатом.

Держит снимок и черновики в памяти React, без хранилища браузера.

```typescript
App()
```

<a id="symbol-App.acceptSession"></a>

## App.acceptSession

Применяет состояние веб-входа и CSRF в памяти.

Не читает и не получает Telegram credentials.

```typescript
acceptSession(info: SessionInfo)
```

<a id="symbol-App.checkAccess"></a>

## App.checkAccess

Применяет изменения разрешённых диалогов к уже открытой вкладке.

Проверяет только ID раз в пять секунд, не загружая историю сообщений.

```typescript
async checkAccess()
```

<a id="symbol-App.choose"></a>

## App.choose

Выбирает адресата и подгружает его последние сообщения.

Сохраняет раздельные черновики, закрывает мобильную панель.

```typescript
async choose(c: Conversation)
```

<a id="symbol-App.fail"></a>

## App.fail

Показывает ошибку операции и обрабатывает потерю входа.

При 401 очищает снимок, адресата и черновики.

```typescript
fail(e: unknown)
```

<a id="symbol-App.listener"></a>

## App.listener

Закрывает мобильный список по Escape.

Listener снимается cleanup-функцией эффекта.

```typescript
listener(e: KeyboardEvent)
```

<a id="symbol-App.login"></a>

## App.login

Отправляет пароль локальному API и принимает новую сессию.

После успеха очищает поле пароля, во время запроса блокирует повтор.

```typescript
async login(e: FormEvent)
```

<a id="symbol-App.logout"></a>

## App.logout

Отзывает текущую веб-сессию и очищает состояние переписки UI.

Не завершает Telegram-авторизацию на сервере.

```typescript
async logout()
```

<a id="symbol-App.read"></a>

## App.read

Отправляет явную отметку прочитанного для выбранного диалога.

Снимок заменяется только после ответа API.

```typescript
async read()
```

<a id="symbol-App.refresh"></a>

## App.refresh

Обновляет общую ленту по явному действию.

Успешный ответ снимает блокировку после неизвестной отправки.

```typescript
async refresh()
```

<a id="symbol-App.send"></a>

## App.send

Фиксирует текст и Destination, затем создаёт уникальный request ID.

Очищает только отправленный черновик; ошибка требует ручной сверки ленты.

```typescript
async send(e: FormEvent)
```

<a id="symbol-Brand"></a>

## Brand

Отображает название приложения.

Не добавляет рекламные подписи и вводные тексты.

```typescript
Brand()
```

<a id="symbol-day"></a>

## day

Форматирует подпись календарной даты в ленте.

Использует локаль ru-RU и часовой пояс браузера.

```typescript
day(date: string)
```

<a id="symbol-Icon"></a>

## Icon

Выбирает локальный SVG для рабочей кнопки.

Не загружает внешние изображения или скрипты.

```typescript
Icon({ name }: {
    name: 'send' | 'refresh' | 'menu' | 'close' | 'search' | 'logout';
})
```

<a id="symbol-time"></a>

## time

Форматирует время сообщения для интерфейса.

Использует локаль ru-RU и часовой пояс браузера.

```typescript
time(date: string)
```
