# Сквозные сценарии

## Создание пароля и веб-вход

`npm run setup` → `cli.main` → `secretPrompt` → `passwordHash` →
`Store.set('password', hash)`. Только CLI задаёт пароль; HTTP-метода настройки нет.
После смены пароля сервер нужно перезапустить для отзыва старых веб-сессий.

Браузер вызывает `GET /api/session`. Без пароля показывает команду настройки,
с паролем — форму входа. `POST /api/login` проверяет Origin, JSON, длину пароля,
rate limit и scrypt-хеш. Успешный вход создаёт cookie и CSRF-токен; затем браузер
загружает снимок. Сам вход не подключается к Telegram и не запрашивает историю.

Код: [Auth.login](reference/backend--auth--auth.md#symbol-Auth.login),
[createApp](reference/backend--http.md#symbol-createApp),
[App](reference/frontend--src--App.md#symbol-App).

## Обновление общей ленты

Кнопка «Обновить» → `POST /api/refresh` → `MessengerService.refresh`.
Параллельные refresh используют один Promise. Для каждого адаптера вызываются
`connect` и `listConversations`; диалоги сортируются по времени. Для последних
12 диалогов запрашиваются по 20 сообщений. Сообщения объединяются по `id`,
сортируются по `date` и `id`, ограничиваются 400 и сохраняются в SQLite.

TelegramAdapter при необходимости открывает сохранённую сессию и проверяет
авторизацию. `getDialogs(limit: 100)` фильтруется до личных чатов и групп.
Медиа не скачиваются. Обновление целиком заменяет предыдущий снимок; сообщения
ранее открытого диалога вне этих 12 не обязаны остаться в ленте.
Ошибка сохраняет старый снимок в памяти с `stale: true` и возвращает 503.

Код: [MessengerService.refresh](reference/backend--core--service.md#symbol-MessengerService.refresh),
[TelegramAdapter.listConversations](reference/backend--connectors--telegram--adapter.md#symbol-TelegramAdapter.listConversations).

## Выбор адресата и черновик

Выбор диалога или «Ответить» устанавливает `targetId`; исходящая форма получает
`Destination` из выбранного `Conversation`. `POST /api/open` загружает до 40
сообщений этого диалога и добавляет их в ту же общую ленту. Другого экрана по
источнику нет. Ошибка открытия оставляет выбранного адресата и показывает ошибку;
получателя можно изменить вручную.

`drafts[conversationId]` хранится только в памяти React. Переключение адресата
показывает его собственный черновик. Чтение ленты и открытие диалога не сбрасывают
непрочитанные. Явная кнопка вызывает `POST /api/read`; коннектор отмечает сообщения
до последнего загруженного ID, затем локальный счётчик устанавливается в ноль.
При следующем обновлении счётчик снова берётся из Telegram.

## Отправка

Форма фиксирует адресата и текст, создаёт `requestId` через `crypto.randomUUID()`.
`POST /api/send` → `MessengerService.send`: проверка текста, request ID,
наличия диалога, `canSend`, совпадения source/recipient с серверной моделью.
`TelegramAdapter.sendText` повторно сверяет получателя со своим native dialog ID.
Текст отправляется без разметки и предпросмотра ссылок. Успех возвращает Message,
обновляет память/SQLite; UI очищает только черновик этого получателя.

Тот же request ID с тем же текстом и маршрутом использует прежний Promise до
15 минут в пределах процесса. Другой payload с тем же ID отклоняется с 409.
Ошибка может означать, что Telegram уже принял сообщение: UI оставляет черновик
и требует ручного обновления перед новой попыткой. После рестарта сервер не
помнит request ID. Автоматического повторения формы нет.

Код: [MessengerService.send](reference/backend--core--service.md#symbol-MessengerService.send),
[TelegramAdapter.sendText](reference/backend--connectors--telegram--adapter.md#symbol-TelegramAdapter.sendText).

## Выход и остановка

`POST /api/logout` удаляет текущую веб-сессию, истекает cookie. React удаляет
снимок, выбранного адресата и все черновики. Сессия Telegram и SQLite остаются.

SIGINT/SIGTERM → `backend/index.stop`: закрытие HTTP-сервера, `disconnect`
всех адаптеров, закрытие SQLite, удаление PID-файла. При следующем запуске
веб-вход повторяется, Telegram использует зашифрованную сессию, кеш помечается
устаревшим. Кеш без корректного `refreshedAt` или старше суток очищается при загрузке.
