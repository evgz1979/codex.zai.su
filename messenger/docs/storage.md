# Данные

## Расположение

Production: `/var/lib/zai-messenger`, отдельный от кода `/opt/zai-messenger/releases`.
Путь задаётся MESSENGER_DATA_DIR; отсутствие внешнего абсолютного пути блокирует
production. Обновление/откат кода не копирует и не заменяет этот каталог.

| Файл | Данные |
| --- | --- |
| messenger.sqlite | Настройки, хеши ролей, выбор диалогов, ограниченный кеш |
| telegram.enc | AES-256-GCM: apiId, apiHash, StringSession, accountId |
| vault.key | Локальный ключ шифрования |
| server.pid | PID обычного backend |

[DDL из исходников](reference/sqlite-schema.md) строится без чтения рабочей БД.

| Таблица | Назначение |
| --- | --- |
| settings | `auth.admin`, `auth.chat`, время последнего снимка |
| selected_conversations | Разрешённые ID; пустая по умолчанию |
| conversation_cache | DTO ранее синхронизированных диалогов |
| message_cache | Message DTO с conversation_id и датой |

Запросы параметризованы. Выбор меняется атомарно. Активный кеш ограничен 40
сообщениями диалога, лента — 400 сообщениями. Исключение не удаляет архив:
обновления и чтение UI больше не обращаются к этому conversation_id. Явная
cache:clear удаляет кеш, но не пароли, выбор и Telegram-сессию. При начальной
миграции старый локальный JSON-кеш переносится без автоматического разрешения ID.

## Идентификаторы и DTO

Модели: [shared/types.ts](../shared/types.ts). Message содержит id, sourceId,
conversationId, sender, date, text, outgoing, status, attachments. Conversation
имеет kind direct/group/channel, recipient, unreadCount и canSend. Destination
фиксирует sourceId + conversationId + recipientId и проверяется сервером.

ID строится из экранированных компонентов источника, типа и native ID. После
веб-авторизации Telegram sourceId имеет вид `telegram-<accountId>`. Message ID
дополнительно включает диалог. Аккаунты, источники и типы сущностей не пересекаются.
Текущий TelegramAdapter устанавливает только received/sent; типы delivered/read
в общем контракте не означают подтверждение чтения Telegram.

## Память

Сервер: сессии и CSRF ролей, rate limit, временный процесс Telegram-входа, каталог
метаданных, Promise refresh/send. Клиент: снимок, адресат, раздельные черновики,
состояние форм. Код и 2FA не являются постоянными настройками. Дедупликация
request ID действует 15 минут одного процесса и не переживает рестарт.
