# Z AI Messenger

Локальный однопользовательский мессенджер. React + TypeScript, Node.js 22,
teleproto, SQLite. Рабочий источник MVP — личный Telegram. Лента и поле ввода
общие; источники подключаются через `SourceAdapter`.

Версия приложения: `0.1.0`. [Оглавление документации](docs/README.md).

## Локальный запуск

Из корня checkout `/Users/evgz/Documents/zai.su`:

```bash
bash messenger/scripts/npm.sh ci
bash messenger/scripts/npm.sh run build
bash messenger/scripts/npm.sh run setup
bash messenger/scripts/npm.sh run telegram:login
bash messenger/scripts/npm.sh start
```

Адрес: **http://127.0.0.1:4318**. Команды `setup` и `telegram:login` выполняются
в интерактивном терминале при остановленном сервере. Все поля вводятся скрыто.
Остановка: `Ctrl+C` либо `bash messenger/scripts/stop.sh`.

Порядок получения `api_id`/`api_hash`, входа с кодом и 2FA, повторной авторизации
и отзыва сессии — в [инструкции Telegram](docs/telegram.md).

## Документация

| Раздел | Содержание |
| --- | --- |
| [Эксплуатация](docs/operations.md) | Node.js, сборка, запуск, остановка, диагностика |
| [Архитектура](docs/architecture.md) | SourceAdapter, единая лента, маршруты и лимиты MVP |
| [Сценарии](docs/flows.md) | Авторизация, обновление, выбор адресата, отправка, выход |
| [HTTP API](docs/api.md) | Методы, поля запросов, ответы и ошибки |
| [Данные](docs/storage.md) | SQLite, DTO, файлы и восстановление после рестарта |
| [Безопасность](docs/security.md) | Секреты, вход, CSRF, ограничения локального доступа |
| [Разработка](docs/development.md) | TypeScript, React, Node.js, SQLite и поддержка справочника |
| [Справочник](docs/reference/README.md) | Модули, объявления и устойчивые ссылки на определения |
| [Проверки](docs/testing.md) | Автоматические и ручные проверки, границы тестовых адаптеров |
| [Протокол](docs/validation.md) | Фактически выполненные проверки и непроверенные сценарии |
| [Журнал](docs/CHANGELOG.md) | Изменения реализации и документации |

## Границы

Модуль находится целиком в `messenger/`. Существующий Codex-клиент остаётся в
корневых `frontend/`, `backend/`, `shared/`. Корневой remote —
`https://github.com/evgz1979/codex.zai.su`; переименовывать checkout не требуется.

Сервер слушает только `127.0.0.1:4318`. `msg.zai.su` пока не развёрнут.
Доступ с физического iPhone по сети не настроен. Telegram-секреты вводятся только
в терминале; `.local/`, БД, кеш и логи исключены из Git. Сообщения в ИИ не передаются.
