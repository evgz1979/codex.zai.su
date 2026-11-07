# HTTP API

Публичный Origin: `https://msg.zai.su:8443`. Backend принимает точный Host,
POST — точный Origin. Защищённые методы требуют cookie нужной роли; изменяющие
методы также X-CSRF-Token этой роли. Content-Type application/json и лимит
20000 байт применяются к методам, которые читают тело. Ответы no-store.

Полный [генерируемый список маршрутов](reference/http-api.md).

## Вход обеих ролей

Для `role = admin` или `chat`:

| Метод | Путь | Контракт |
| --- | --- | --- |
| GET | /api/role/session | authenticated, setupRequired; CSRF только после входа |
| POST | /api/role/login | `{password}` → новая независимая сессия |
| POST | /api/role/logout | Отзыв текущей сессии роли |

session и login не требуют сессии, login требует Origin. Все остальные методы
проверяют роль. `/healthz` возвращает только ok/locked для автоматической установки.
Настройка паролей до публикации выполняется только через серверный CLI по SSH.

## Чат

| Метод | /api/chat/… | Тело/результат |
| --- | --- | --- |
| GET | access?since=revision | Разрешённые ID, ревизия кеша, deletedIds, reset и sync; без текстов |
| GET | snapshot | Snapshot разрешённых ID с последними 10 уже загруженными сообщениями |
| POST | refresh | Метаданные и непрочитанные выбранных диалогов; без чтения истории |
| POST | inbox | `{before?}` → страница единой хронологии из SQLite |
| POST | open | `{conversationId}` → ConversationPageResult с последними 10 сообщениями этого адресата |
| POST | older | `{conversationId,before}` → ConversationPageResult с предыдущими 10 |
| POST | read | `{conversationId}` → явная отметка прочитанного |
| POST | attachment | `{conversationId,messageId,attachmentId}` → двоичное содержимое до 32 МиБ |
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

## Админка

| Метод | /api/admin/… | Тело/результат |
| --- | --- | --- |
| GET | status | Безопасный статус Telegram и число разрешённых ID |
| GET | dialogs | AdminDialogCatalog: conversations с пустыми preview, folders, truncated и selectedIds |
| POST | selection | `{ids:string[]}`; максимум 100 известных уникальных ID |
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
