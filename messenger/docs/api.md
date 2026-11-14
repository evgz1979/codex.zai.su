# HTTP API

## WhatsApp Web

Во время тестирования — только admin-роль владельца; общий `status` не возвращает QR.
Все методы `whatsapp/*` для admin личного пользователя возвращают 403;
браузерный источник не создаётся и не восстанавливается в его runtime.
GET `whatsapp/status` возвращает временный PNG data URL и состояние;
GET `whatsapp/dialogs` — метаданные. POST `whatsapp/begin`,
`whatsapp/disconnect`, `whatsapp/selection` требуют Origin, CSRF и admin-cookie.
Префикс тот же `/api[/u/username]/admin/`. Chat-роль этих методов не получает.
После ожидания QR роль и блокировка аккаунта проверяются повторно.
QR не кешируется; cookie и профиль Chromium никогда не выдаются.

Web Push: [методы подписки, проверки и отзыва](notifications.md).

Публичный Origin: `https://msg.zai.su:8443`. Backend принимает точный Host,
POST — точный Origin. Защищённые методы требуют cookie нужной роли; изменяющие
методы также X-CSRF-Token этой роли. Content-Type application/json и лимит
20000 байт применяются к методам, которые читают тело; admin/selection допускает
200000 байт для списка до 1000 ID. Ответы no-store.

Полный [генерируемый список маршрутов](reference/http-api.md).

## Личный аккаунт

Ниже приведены пути владельца. Для гостей префикс `/api/` заменяется на
`/api/u/username/`; все действия работают только с хранилищем аккаунта из ссылки.
Cookie роли имеют Path `/api/u/username/chat` и `/api/u/username/admin`.
`session` и успешный `login` дополнительно возвращают безопасный `account`:
`{id,username,displayName,isOwner,path}`. Имя видно до входа, CSRF выдаётся после входа.
`path` — персональная ссылка: `/username/` для новых аккаунтов и сохранённая
`/u/username/` для старых. Форма публичного пути не меняет API и cookie.
В теле login по-прежнему только `{password}`. Неизвестный и заблокированный
пользователь возвращает 404 без открытия его сервисов.

Только admin владельца может использовать:

| Метод | Путь | Контракт |
| --- | --- | --- |
| GET | /api/admin/users | `{users:[{id,username,displayName,isOwner,enabled,path}]}` |
| POST | /api/admin/users/create | `{username,displayName,password}` → `{user}`; начальный пароль обеих ролей |
| POST | /api/admin/users/access | `{id,enabled}` → `{ok:true}`; владелец не блокируется |

Пароль не возвращается. Списка чужих источников, переписок и секретов нет.

## Вход обеих ролей

Для `role = admin` или `chat`:

| Метод | Путь | Контракт |
| --- | --- | --- |
| GET | /api/role/session | authenticated, setupRequired; CSRF только после входа |
| POST | /api/role/login | `{password}` → новая независимая сессия |
| POST | /api/role/logout | Отзыв текущей сессии роли |

session и login не требуют сессии, login требует Origin. Все остальные методы
проверяют роль. `/healthz` возвращает только ok/locked для автоматической установки.
При подтверждённом входе session/login также возвращают `expiresAt` — срок
веб-сессии в миллисекундах Unix. GET session продлевает действующий chat-вход
до 180 дней и обновляет cookie с тем же токеном и CSRF; запись срока — не чаще
раза в сутки. Локальное чтение без сети дополнительно ограничено восемью часами.
Настройка паролей до публикации выполняется только через серверный CLI по SSH.

## Чат

| Метод | /api/chat/… | Тело/результат |
| --- | --- | --- |
| GET | access?since=revision | Разрешённые ID, ревизия кеша, deletedIds, reset и sync; без текстов |
| GET | snapshot | Snapshot разрешённых ID с последними 10 уже загруженными сообщениями |
| GET | badge | `{count}` из метаданных выбранных диалогов, без текстов; требует chat-cookie |
| POST | refresh | Метаданные и непрочитанные выбранных диалогов; без чтения истории |
| POST | inbox | `{before?}` → страница единой хронологии из SQLite |
| POST | offline | `{conversationIds:string[]}` (1–20 разных выбранных ID) → `{messages,readyIds}`; по пять последних сообщений чата из SQLite без open/read |
| POST | open | `{conversationId}` → ConversationPageResult с последними 10 сообщениями этого адресата |
| POST | older | `{conversationId,before}` → ConversationPageResult с предыдущими 10 |
| POST | read | `{conversationId,messageId?}` → отметка до показанного сообщения; без messageId — ручная |
| POST | pin | `{conversationId,pinned:boolean}` → Snapshot с обновлённым порядком чатов |
| POST | avatar | `{conversationId,refresh?:boolean}` → JPEG/PNG/WebP до 512 КиБ только выбранного диалога, no-store |
| POST | attachment | `{conversationId,messageId,attachmentId,variant?:'preview'}` → оригинал до 32 МиБ или миниатюра до 512 КиБ |
| POST | transcribe | `{conversationId,messageId,attachmentId}` → `{text,pending}` встроенной расшифровки голосового |
| POST | send | `{destination,text,requestId}` → отправленный Message |

Destination содержит sourceId, conversationId, recipientId. Текст 1–4096 UTF-16
code units с непробельным символом. UUID штатного клиента удовлетворяет шаблону
request ID `[a-zA-Z0-9-]{16,80}`. Диалог проверяется по сохранённому выбору,
серверной модели, canSend и native peer адаптера. Один request ID нельзя использовать
с другим payload. Неизвестный результат отправки требует ручной сверки.

ConversationPageResult содержит `{snapshot,page}`. MessagePage содержит
`{conversationId,messages,nextCursor,oldestCursor,historyComplete,cached,sourceUpdatedAt}`.
conversationId=`inbox` обозначает общую ленту. Курсор SQLite привязан к диалогу
либо общей ленте, дате и ID. Null завершает историю; при незавершённой фоновой
загрузке курсор может остаться тем же до новой ревизии. Размер страницы — 10.
Все операции open/older/inbox читают только SQLite; исключённые диалоги запрещены.
Внутренний historyPage адаптера имеет отдельные Telegram-курсоры и предел 100;
браузер не вызывает его и не задаёт размер фоновой страницы.
Snapshot.sync сообщает pendingConversations и необязательный pausedUntil.
У закреплённых чатов есть `pinOrder`. Чем больше значение, тем выше чат.
`pin` принимает только выбранные чаты текущего аккаунта. Повтор запроса с тем же
состоянием сохраняет позицию. Запрос выполняется в SQLite без обращения к источнику.
Сохранённый refresh оставлен для совместимости API; пользовательский UI его не вызывает.


В отличие от JSON-методов, `attachment` возвращает тело файла с Content-Length,
Content-Type и Content-Disposition attachment. X-Attachment-Kind сообщает
image/video/audio/file, X-Attachment-Name — имя в percent encoding UTF-8. Ответ
no-store; имена не используются как пути. Запрос требует chat-cookie, Origin и
CSRF; admin-cookie не даёт доступа. GET этого метода не поддерживается.
Проверяются выбранность, сохранённое сообщение, его источник и конкретное вложение.
Проверка повторяется после загрузки и перед каждой порцией ответа. В случае отзыва
после отправки заголовков соединение закрывается, а не возвращает усечённый успех.
Лимит — два одновременных запроса, срок — 60 секунд, размер — 32 МиБ. 413 означает
превышение размера, 415 — неподдерживаемый объект Telegram, 408 — прерывание.
Старое unsupported-вложение уточняется одним запросом конкретного сообщения;
история остальных сообщений для этого не загружается. Публичных файловых GET URL нет.

При variant=preview адаптер выбирает готовый малый размер Telegram либо встроенные
байты миниатюры; большой оригинал не скачивается. Для небольшого изображения без
миниатюры допустим оригинал до 512 КиБ. Отсутствие превью возвращает 415 и запоминается
для этой версии сообщения. Параметр с другим значением возвращает 400. Права и CSRF
идентичны оригиналу; метаданные миниатюры не подменяют метаданные полного файла.

### Расшифровка голосовых

`POST /api/chat/transcribe` принимает `{conversationId,messageId,attachmentId}`,
возвращает `{text:string,pending:boolean}`. Для личных пользователей используется
тот же метод под `/api/u/username/chat/`. Нужны chat-cookie, Origin и CSRF;
admin-cookie не даёт доступа. Сервер проверяет выбранность, источник и точное
голосовое до RPC и перед ответом. Параметр variant не поддерживается.

Готовый результат возвращается из SQLite. Одновременные повторы объединяются;
не более двух разных заданий на аккаунт. Pending обновляется событиями Telegram;
повторный запрос источника возможен не чаще раза в 30 секунд. HTTP-ожидание
ограничено 25 секундами. Ошибки: 403 — Telegram требует Premium, 422 — слишком
длинная запись, 429 — лимит, 502 — речь не распознана, 503/504 — временный отказ.
Общие ошибки доступа к диалогу также сохраняются. Native transcription ID в API
не передаётся. В Message необязательное поле `voiceTranscription` содержит
`{text,pending}` той же версии голосового.

## Админка

| Метод | /api/admin/… | Тело/результат |
| --- | --- | --- |
| GET | status | Безопасный статус Telegram и число разрешённых ID |
| GET | dialogs | AdminDialogCatalog: conversations с пустыми preview, folders, truncated и selectedIds |
| POST | selection | `{ids:string[]}`; максимум 1000 известных уникальных ID |
| POST | telegram/begin | `{apiId:number,apiHash:string,phone:string}` → stage |
| POST | telegram/code | `{value:string}` → следующий stage |
| POST | telegram/password | `{value:string}` → следующий stage |
| POST | telegram/cancel | Отмена текущего входа |
| POST | telegram/disconnect | Отзыв/удаление локальной сессии, снятие выбора |
| POST | password | `{role:'admin'|'chat',password:string}`; 8–512 символов |

Сохранённые ключи и сессия не выдаются ни одним методом. TelegramAuthStage —
idle/connecting/code/password/connected/error, без введённых секретов.
После отказа `status.telegram.issue` содержит `{code:TelegramAuthIssueCode}` и
необязательное целое `retryAfterSeconds` (1–31536000). Категории определены в
[общем контракте](reference/shared--types.md); исходные исключения отсутствуют.
Поле доступно только admin и существует в памяти до следующего входа, отмены
или перезапуска. Для повторяемой ошибки код/2FA stage остаётся code/password;
при отказе на пятой проверке или позднее вход завершается stage=error.
Ответ begin/code/password по-прежнему содержит stage; подробность клиент
получает отдельным status.
Чатная cookie, её переименование и знание адреса admin API не дают прав admin.

`folders` — массив `{id,sourceId,title,conversationIds}`. ID папки включает
источник и тип folder. Список ID состоит только из диалогов текущего каталога,
сначала закреплённые. Пересечения папок допустимы. `truncated=true` означает
неполную выборку метаданных: максимум 1000 диалогов. Папки доступны только admin,
не содержат access_hash, native peer, телефон или содержимое сообщений. Изменение
текущей закладки не отправляет запрос выбора и не расширяет разрешения чата.

## Ошибки

`{error:string}`, без исходных исключений и данных запроса. 400 — поля/JSON;
401 — нет нужной сессии; 403 — Host/Origin/CSRF/выбор; 404 — неизвестный путь/диалог;
405 — метод; 409 — неверный этап, маршрут или повтор request ID; 413/415 — тело;
429 — rate limit; 502 — неизвестная отправка; 503 — недоступность операции.
HTTP requestTimeout ограничивает получение тела, а не суммарное время refresh.
Отдельный Telegram RPC получает дедлайн 15 секунд; общая операция содержит несколько RPC.


## Публичная версия сборки

GET `/version.json` возвращает `{version,buildId}` с `Cache-Control: no-store` и
JSON Content-Type. Публичный файл создаётся Vite вместе с JavaScript, одинаков
для всех аккаунтов и не содержит переписок или секретов. Личные приложения
проверяют корневой файл, а обновление сохраняет их собственный адрес.
