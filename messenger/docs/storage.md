# Данные и SQLite

## Общие модели

Источник истины переписки — Telegram. SQLite хранит настройки и ограниченный
снимок; весь архив не импортируется. Формат задаётся в [shared/types.ts](../shared/types.ts).

| Модель | Назначение и ключевые поля |
| --- | --- |
| Source | ID экземпляра источника, kind, name, connected |
| Recipient | ID адресата/отправителя, name, необязательный isSelf |
| Conversation | id, sourceId, title, kind, recipient, unreadCount, updatedAt, preview, canSend |
| Message | id, sourceId, conversationId, sender, date, text, outgoing, status, attachments |
| Destination | Точная тройка sourceId, conversationId, recipientId |
| Attachment | id, kind, name; необязательные mimeType и size; скачивания в MVP нет |
| DeliveryStatus | pending, received, sent, delivered, read, failed, unknown; TelegramAdapter сейчас возвращает только received/sent |
| Snapshot | sources, conversations, messages, refreshedAt, stale |

Все ID строятся как `encodeURIComponent(sourceId):encodeURIComponent(kind):encodeURIComponent(nativeId)`.
У Telegram `sourceId = telegram-personal`. Native message ID дополнительно
включает ID диалога. Sender и recipient имеют разные типы ID и не подменяют друг друга.
Даты — ISO 8601, нормализация времени выполняется при преобразовании Telegram DTO.

## Локальные файлы

Путь вычисляется от расположения модуля, не от текущего shell-каталога.
И исходный, и скомпилированный сервер используют `messenger/.local/`.

| Файл | Содержимое | Сохраняется после выхода |
| --- | --- | --- |
| messenger.sqlite | settings: password и cache | Да |
| telegram.enc | Зашифрованные apiId, apiHash, StringSession | Да |
| vault.key | Локальный ключ AES-256-GCM | Да |
| server.pid | PID обычного собранного сервера для stop.sh | До штатной остановки |

Директория `0700`, файлы `0600`. Ни один из этих файлов не входит в Git.
Шифрование и его пределы описаны в [безопасности](security.md).

## Таблица settings

[DDL из исходников](reference/sqlite-schema.md), без открытия рабочей БД:

| Ключ | value |
| --- | --- |
| password | `salt:hexHash`: scrypt, случайная соль 32 байта, результат 64 байта |
| cache | JSON Snapshot, максимум 400 сообщений; без зашифрованной Telegram-сессии |

Отдельных таблиц сообщений, пользователей, источников и миграционного реестра нет.
Используются `journal_mode=DELETE`, `secure_delete=ON` и подготовленные SQL-запросы.
`clearCache` удаляет только ключ cache и выполняет VACUUM; пароль не удаляется.
Очистка SQL не обещает удаления копий из бэкапов или снимков файловой системы.

Кеш с возрастом более суток удаляется при `loadCache`, вызываемом созданием
MessengerService. Периодического таймера удаления нет. На серверном старте
загруженный снимок получает `stale: true`. Ручное обновление заменяет снимок.

## Только в памяти

- Сервер: cookie-токены в виде SHA-256 digest, CSRF, сроки веб-сессий, попытки
  входа, активные адаптеры, снимок и Promise отправок для дедупликации.
- Браузер: CSRF, снимок, выбранный диалог, черновики по conversationId, строка поиска.
  localStorage, IndexedDB и service worker не используются.
- Повтор того же request ID защищён только в рамках процесса. Перезапуск очищает
  эту память; он не доказывает, что неудачная отправка не дошла до Telegram.

При потере кеша его можно получить повторно ограниченным чтением Telegram.
При потере пароля — запустить setup и перезапустить сервер. При потере vault.key
или telegram.enc — повторить авторизацию. Копирование только одного из этих двух
файлов не восстанавливает сессию. Бэкап секретов выполняет только владелец аккаунта.
