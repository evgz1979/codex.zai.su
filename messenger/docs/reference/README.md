# Справочник исходников

Генерируется `scripts/build-documentation.mjs`. Ручное редактирование заменяется генерацией.

| Исходник | Назначение | Объявлений |
| --- | --- | --- |
| [backend/admin/service.ts](backend--admin--service.md) | Настройки, метаданные Telegram и права выбора диалогов. | 8 |
| [backend/auth/auth.ts](backend--auth--auth.md) | Argon2id-пароли ролей admin/chat, веб-сессии в памяти и ограничение попыток входа. | 17 |
| [backend/auth/prompt.ts](backend--auth--prompt.md) | Скрытый интерактивный ввод в TTY без отражения символов. | 3 |
| [backend/auth/telegram-issue.ts](backend--auth--telegram-issue.md) | Allowlist-классификация отказов Telegram без раскрытия исходных исключений. | 1 |
| [backend/auth/telegram-login.ts](backend--auth--telegram-login.md) | Пошаговый Telegram-вход с временными callbacks кода и 2FA. | 9 |
| [backend/cli.ts](backend--cli.md) | Команды setup, bootstrap и clear без вывода секретов; Telegram подключается через админку. | 1 |
| [backend/config.ts](backend--config.md) | Фиксированные loopback-порт, Origin и пути модуля для source/build. | 6 |
| [backend/connectors/telegram/adapter.ts](backend--connectors--telegram--adapter.md) | Каталог диалогов/папок Telegram, преобразование сообщений в общие DTO и проверка назначения. | 24 |
| [backend/connectors/telegram/client.ts](backend--connectors--telegram--client.md) | Создание teleproto-клиента с приватной сессией, дедлайном RPC и выключенными логами. | 5 |
| [backend/connectors/telegram/folders.ts](backend--connectors--telegram--folders.md) | Преобразование папок и правил Telegram в общий административный каталог. | 4 |
| [backend/core/errors.ts](backend--core--errors.md) | Безопасная прикладная ошибка HTTP API. | 2 |
| [backend/core/inbox.ts](backend--core--inbox.md) | Формирование ленты только выбранных диалогов. | 3 |
| [backend/core/registry.ts](backend--core--registry.md) | Реестр подключённых SourceAdapter. | 5 |
| [backend/core/selection.ts](backend--core--selection.md) | Постоянный выбор разрешённых диалогов и ревизия доступа. | 7 |
| [backend/core/service.ts](backend--core--service.md) | Единая лента, маршруты, лимиты, кеш и дедупликация отправок. | 15 |
| [backend/core/source-adapter.ts](backend--core--source-adapter.md) | Общий контракт операций с сообщениями и необязательного каталога папок источника. | 2 |
| [backend/core/sync.ts](backend--core--sync.md) | Автоматическое заполнение полного SQLite-кеша выбранных диалогов, события и возобновляемая история. | 7 |
| [backend/http.ts](backend--http.md) | Фиксированный HTTP API, веб-вход, защита запросов и статические файлы. | 4 |
| [backend/index.ts](backend--index.md) | Сборка production-сервера, регистрация TelegramAdapter и остановка. | 1 |
| [backend/storage/private-files.ts](backend--storage--private-files.md) | Права приватных файлов и AES-256-GCM хранилище Telegram-сессии. | 9 |
| [backend/storage/store.ts](backend--storage--store.md) | SQLite: настройки ролей, выбранные диалоги и полный кеш выбранной истории с сохранением исключённого архива. | 21 |
| [frontend/index.html](frontend--index.md) | HTML-точка входа, viewport и подключение React-сборки. | 0 |
| [frontend/public/favicon.svg](frontend--public--favicon.md) | Локальная иконка приложения без внешних ресурсов. | 0 |
| [frontend/src/App.tsx](frontend--src--App.md) | Единый React-интерфейс, веб-вход, адресат, черновики и состояние операций. | 17 |
| [frontend/src/admin/AdminApp.tsx](frontend--src--admin--AdminApp.md) | Отдельная административная страница с собственным входом и формами. | 11 |
| [frontend/src/admin/ConversationPicker.tsx](frontend--src--admin--ConversationPicker.md) | Закладки папок, поиск и независимый от текущей папки выбор диалогов. | 3 |
| [frontend/src/api.ts](frontend--src--api.md) | Same-origin fetch, CSRF в памяти и безопасная ошибка API. | 4 |
| [frontend/src/main.tsx](frontend--src--main.md) | Создание React root и подключение локальной таблицы стилей. | 0 |
| [frontend/src/styles.css](frontend--src--styles.md) | Вёрстка ленты, мобильной панели и админки с закладками; safe-area и короткий viewport. | 0 |
| [frontend/vite.config.ts](frontend--vite.config.md) | React/Vite-сборка в dist/client без отдельного production-порта. | 0 |
| [playwright.config.ts](playwright.config.md) | Три браузерные конфигурации и изолированный сервер синтетических данных. | 0 |
| [scripts/build-documentation.mjs](scripts--build-documentation.md) | AST-справочник, маршруты, DDL, тестовый индекс и проверка ссылок без запуска приложения. | 16 |
| [scripts/npm.sh](scripts--npm-sh.md) | Выбор локального Node.js и запуск npm из каталога Messenger. | 0 |
| [scripts/start.sh](scripts--start-sh.md) | Запуск собранного сервера по абсолютному пути для безопасной проверки PID. | 0 |
| [scripts/stop.mjs](scripts--stop.md) | Проверка PID и команды процесса перед SIGTERM только Messenger. | 0 |
| [scripts/stop.sh](scripts--stop-sh.md) | Выбор Node.js и запуск штатного stop.mjs. | 0 |
| [shared/types.ts](shared--types.md) | Общие DTO ленты и каталога, статусы веб-авторизации, лимиты, ID и Destination. | 27 |
