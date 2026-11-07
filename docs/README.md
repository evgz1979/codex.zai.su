# Документация репозитория

## Модули

| Модуль | Начало работы | Подробная документация |
| --- | --- | --- |
| Codex-клиент: корневые frontend/backend/shared | [README проекта](../README.md) | [Ubuntu](../deploy/README.md), [статический HTTPS-тест](../deploy/https-test/README.md), [счётчик трафика](../deploy/traffic/README.md) |
| Z AI Messenger: messenger | [README модуля](../messenger/README.md) | [Оглавление Messenger](../messenger/docs/README.md) |

## Messenger

[Чат](https://msg.zai.su:8443/) и [админка](https://msg.zai.su:8443/admin) имеют
отдельные права. Подключение Telegram, закладки папок и разрешение диалогов
описаны в [руководстве](../messenger/docs/telegram.md). Устройство, API, данные,
проверки и ограничения собраны в оглавлении модуля. Состояние работающего релиза
и границы реальных проверок — в [протоколе](../messenger/docs/validation.md).

## Границы модулей

Модули имеют отдельные package.json и команды запуска. Messenger не импортирует
Codex-клиент и не использует его App Server. Перенос существующих каталогов в
`codex/` не выполнялся. Описания прошлых инфраструктурных работ не разрешают
новые изменения VPS, VPN, Caddy, DNS или публикацию приложения.
