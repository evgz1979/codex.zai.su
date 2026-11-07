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

ConversationFolder содержит id, sourceId, title и conversationIds. ID папки
включает тип folder, например `telegram-<accountId>:folder:<nativeId>`. Список
содержит только ID текущего каталога; повторения между папками разрешены.
ConversationCatalog дополняет диалоги папками и признаком truncated, а admin DTO
добавляет selectedIds. Папки не записываются в отдельную таблицу разрешений.

## Память

Сервер: сессии и CSRF ролей, rate limit, временный процесс Telegram-входа,
безопасная категория отказа, каталог метаданных, Promise refresh/send. После
обработки папок адаптер сохраняет только ID и native peer диалогов; их последние
сообщения из ответа GetDialogs не становятся кешем невыбранной истории.

Клиент: снимок, адресат, раздельные черновики и состояние форм; в админке —
полученный каталог папок, текущая закладка, поиск и общий несохранённый выбор.
Имена/состав папок перечитываются при явном обновлении каталога. В SQLite
сохраняются только выбранные ID, а текущая закладка и поиск не переживают
перезагрузку страницы. Код и 2FA не являются постоянными настройками.
Дедупликация request ID действует 15 минут одного процесса и не переживает рестарт.
