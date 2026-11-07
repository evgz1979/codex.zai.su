# Документация репозитория

## Модули

| Модуль | Начало работы | Подробная документация |
| --- | --- | --- |
| Codex-клиент: корневые frontend/backend/shared | [README проекта](../README.md) | [Ubuntu](../deploy/README.md), [статический HTTPS-тест](../deploy/https-test/README.md), [счётчик трафика](../deploy/traffic/README.md) |
| Z AI Messenger: messenger | [README модуля](../messenger/README.md) | [Оглавление Messenger](../messenger/docs/README.md) |

Модули имеют отдельные package.json и команды запуска. Messenger не импортирует
Codex-клиент и не использует его App Server. Перенос существующих каталогов в
`codex/` не выполнялся. Описания прошлых инфраструктурных работ не разрешают
новые изменения VPS, VPN, Caddy, DNS или публикацию приложения.
