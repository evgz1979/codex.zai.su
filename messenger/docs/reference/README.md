# Справочник исходников

Генерируется `scripts/build-documentation.mjs`. Ручное редактирование заменяется генерацией.

| Исходник | Назначение | Объявлений |
| --- | --- | --- |
| [backend/auth/auth.ts](backend--auth--auth.md) | Хеширование пароля, веб-сессии в памяти и ограничение попыток входа. | 12 |
| [backend/auth/prompt.ts](backend--auth--prompt.md) | Скрытый интерактивный ввод в TTY без отражения символов. | 3 |
| [backend/cli.ts](backend--cli.md) | Локальные команды setup, telegram и clear без вывода секретов. | 1 |
| [backend/config.ts](backend--config.md) | Фиксированные loopback-порт, Origin и пути модуля для source/build. | 5 |
| [backend/connectors/telegram/adapter.ts](backend--connectors--telegram--adapter.md) | Преобразование Telegram dialogs/messages в общие DTO и проверка назначения. | 14 |
| [backend/connectors/telegram/client.ts](backend--connectors--telegram--client.md) | Создание teleproto-клиента с приватной сессией, дедлайном RPC и выключенными логами. | 5 |
| [backend/core/service.ts](backend--core--service.md) | Единая лента, маршруты, лимиты, кеш и дедупликация отправок. | 15 |
| [backend/core/source-adapter.ts](backend--core--source-adapter.md) | Общий провайдерный контракт без реализации будущих источников. | 1 |
| [backend/http.ts](backend--http.md) | Фиксированный HTTP API, веб-вход, защита запросов и статические файлы. | 3 |
| [backend/index.ts](backend--index.md) | Сборка production-сервера, регистрация TelegramAdapter и остановка. | 1 |
| [backend/storage/private-files.ts](backend--storage--private-files.md) | Права приватных файлов и AES-256-GCM хранилище Telegram-сессии. | 8 |
| [backend/storage/store.ts](backend--storage--store.md) | SQLite settings: хеш пароля и ограниченный JSON-кеш. | 8 |
| [frontend/index.html](frontend--index.md) | HTML-точка входа, viewport и подключение React-сборки. | 0 |
| [frontend/public/favicon.svg](frontend--public--favicon.md) | Локальная иконка приложения без внешних ресурсов. | 0 |
| [frontend/src/App.tsx](frontend--src--App.md) | Единый React-интерфейс, веб-вход, адресат, черновики и состояние операций. | 14 |
| [frontend/src/api.ts](frontend--src--api.md) | Same-origin fetch, CSRF в памяти и безопасная ошибка API. | 4 |
| [frontend/src/main.tsx](frontend--src--main.md) | Создание React root и подключение локальной таблицы стилей. | 0 |
| [frontend/src/styles.css](frontend--src--styles.md) | Layout ленты и мобильной панели, safe-area, состояния и короткий viewport. | 0 |
| [frontend/vite.config.ts](frontend--vite.config.md) | React/Vite-сборка в dist/client без отдельного production-порта. | 0 |
| [playwright.config.ts](playwright.config.md) | Три браузерные конфигурации и изолированный сервер синтетических данных. | 0 |
| [scripts/build-documentation.mjs](scripts--build-documentation.md) | AST-справочник, маршруты, DDL, тестовый индекс и проверка ссылок без запуска приложения. | 16 |
| [scripts/npm.sh](scripts--npm-sh.md) | Выбор локального Node.js и запуск npm из каталога Messenger. | 0 |
| [scripts/start.sh](scripts--start-sh.md) | Запуск собранного сервера по абсолютному пути для безопасной проверки PID. | 0 |
| [scripts/stop.mjs](scripts--stop.md) | Проверка PID и команды процесса перед SIGTERM только Messenger. | 0 |
| [scripts/stop.sh](scripts--stop-sh.md) | Выбор Node.js и запуск штатного stop.mjs. | 0 |
| [shared/types.ts](shared--types.md) | Общие DTO, статусы, лимиты, ID и Destination без зависимости от Telegram. | 14 |
