# frontend/src/App.tsx

Единый React-интерфейс, веб-вход, адресат, черновики и состояние операций.

[Исходный модуль](../../frontend/src/App.tsx) · [Индекс](README.md)

<a id="symbol-App"></a>

## App

Отображает вход, список чатов и отдельную переписку с явным адресатом.

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

<a id="symbol-App.back"></a>

## App.back

Восстанавливает список либо разрешённый чат кнопками браузера.

История содержит только ID; переходы не переносят черновики между адресатами.

```typescript
back(event: PopStateEvent)
```

<a id="symbol-App.backToList"></a>

## App.backToList

Обрабатывает кнопку назад без выхода со страницы Messenger.

У открытого уведомлением чата также есть собственная запись истории.

```typescript
backToList()
```

<a id="symbol-App.cancelView"></a>

## App.cancelView

Отменяет устаревший HTTP-запрос и запрещает применение позднего ответа.

Не отзывает уже отправленный Telegram RPC или пользовательскую сессию.

```typescript
cancelView()
```

<a id="symbol-App.check"></a>

## App.check

Проверяет и продлевает веб-вход при запуске, возвращении и восстановлении сети.

Без связи API возвращает только ранее разрешённое локальное чтение.

```typescript
check()
```

<a id="symbol-App.checkAccess"></a>

## App.checkAccess

Получает разрешения и ревизию SQLite без запросов к Telegram.

Изменения и удаления автоматически применяются только к разрешённой ленте.

```typescript
async checkAccess()
```

<a id="symbol-App.choose"></a>

## App.choose

Выбирает адресата и подгружает его последние сообщения.

Сохраняет раздельные черновики и открывает отдельный экран переписки.

```typescript
async choose(c: Conversation, push = true)
```

<a id="symbol-App.enterChat"></a>

## App.enterChat

Открывает экран переписки с отдельной записью истории браузера.

Переключение адресата заменяет текущую запись, кнопка назад ведёт к списку.

```typescript
enterChat(id: string, push = true)
```

<a id="symbol-App.escape"></a>

## App.escape

Возвращает из переписки в список по Escape без закрытия вложения.

Модальное окно обрабатывает собственный Escape самостоятельно.

```typescript
escape(event: KeyboardEvent)
```

<a id="symbol-App.expire"></a>

## App.expire

Уточняет истёкший вход у сервера без явного выхода и отзыва push.

Минутный таймер поддерживает длительные сессии без переполнения setTimeout.

```typescript
expire()
```

<a id="symbol-App.fail"></a>

## App.fail

Показывает ошибку операции и обрабатывает потерю входа.

При 401 очищает снимок, адресата и черновики.

```typescript
fail(e: unknown)
```

<a id="symbol-App.loadView"></a>

## App.loadView

Показывает сохранённую первую страницу и запрашивает актуальные сообщения или более раннюю страницу.

Переход и изменение доступа отменяют оба результата, догрузка сохраняет позицию прокрутки.

```typescript
async loadView(conversation?: Conversation, older = false)
```

<a id="symbol-App.localLogout"></a>

## App.localLogout

Очищает интерфейс при выходе в другом окне того же личного аккаунта.

Событие не переносит тексты или токены между окнами.

```typescript
localLogout()
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

<a id="symbol-App.openArrival"></a>

## App.openArrival

Открывает список при обычном входе и точный разрешённый диалог по push.

Возврат из фона сохраняет текущую переписку; ID уведомления проверяется до open.

```typescript
async openArrival(intent: {
    conversationId?: string;
    explicit: boolean;
}, signal: AbortSignal)
```

<a id="symbol-App.openInbox"></a>

## App.openInbox

Открывает общую ленту отдельным действием из списка чатов.

Общее поле ввода остаётся заблокированным до выбора точного адресата.

```typescript
async openInbox(push = true)
```

<a id="symbol-App.preserveFeedPosition"></a>

## App.preserveFeedPosition

Запоминает видимую позицию перед обновлением сообщений.

При обновлении свежей страницы лента следует за концом, если читатель находится внизу.

```typescript
preserveFeedPosition(followBottom = false)
```

<a id="symbol-App.read"></a>

## App.read

Отправляет явную отметку прочитанного для выбранного диалога.

Снимок заменяется только после ответа API.

```typescript
async read()
```

<a id="symbol-App.send"></a>

## App.send

Фиксирует текст и Destination, затем создаёт уникальный request ID.

Очищает только отправленный черновик; ошибка требует ручной сверки ленты.

```typescript
async send(e: FormEvent)
```

<a id="symbol-App.showList"></a>

## App.showList

Возвращает к списку, отменяя поздние переходы и чтение скрытой ленты.

Черновики, поисковая строка и прокрутка списка сохраняются в памяти.

```typescript
showList()
```

<a id="symbol-App.updateFromCache"></a>

## App.updateFromCache

Автоматически перечитывает изменившийся кеш без ожидания MTProto.

Сохраняет старые страницы и не прерывает явный выбор или прокрутку.

```typescript
async updateFromCache(revision: number, reconnecting = false)
```

<a id="symbol-App.visibleCheck"></a>

## App.visibleCheck

Обновляет срок только видимого окна, не меняя переписку и черновики.

Фоновое окно не удерживает вход бесконечными запросами.

```typescript
visibleCheck()
```

<a id="symbol-Brand"></a>

## Brand

Отображает название приложения.

Не добавляет рекламные подписи и вводные тексты.

```typescript
Brand()
```

<a id="symbol-conversationTime"></a>

## conversationTime

Форматирует дату последнего сообщения в списке чатов.

Сегодня показывает время, за последнюю неделю — день, дальше — календарную дату.

```typescript
conversationTime(date: string)
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
    name: 'send' | 'back' | 'inbox' | 'search' | 'logout';
})
```

<a id="symbol-time"></a>

## time

Форматирует время сообщения для интерфейса.

Использует локаль ru-RU и часовой пояс браузера.

```typescript
time(date: string)
```
