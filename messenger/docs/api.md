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
| GET | snapshot | Snapshot только разрешённых ID |
| POST | refresh | Обновлённая лента выбранных диалогов |
| POST | open | `{conversationId}` → снимок с последними сообщениями |
| POST | read | `{conversationId}` → явная отметка прочитанного |
| POST | send | `{destination,text,requestId}` → отправленный Message |

Destination содержит sourceId, conversationId, recipientId. Текст 1–4096 UTF-16
code units с непробельным символом. UUID штатного клиента удовлетворяет шаблону
request ID `[a-zA-Z0-9-]{16,80}`. Диалог проверяется по сохранённому выбору,
серверной модели, canSend и native peer адаптера. Один request ID нельзя использовать
с другим payload. Неизвестный результат отправки требует ручной сверки.

## Админка

| Метод | /api/admin/… | Тело/результат |
| --- | --- | --- |
| GET | status | Безопасный статус Telegram и число разрешённых ID |
| GET | dialogs | Метаданные до 1000 диалогов, пустые preview и selectedIds |
| POST | selection | `{ids:string[]}`; максимум 100 известных уникальных ID |
| POST | telegram/begin | `{apiId:number,apiHash:string,phone:string}` → stage |
| POST | telegram/code | `{value:string}` → следующий stage |
| POST | telegram/password | `{value:string}` → следующий stage |
| POST | telegram/cancel | Отмена текущего входа |
| POST | telegram/disconnect | Отзыв/удаление локальной сессии, снятие выбора |
| POST | password | `{role:'admin'|'chat',password:string}`; 16–512 символов |

Сохранённые ключи и сессия не выдаются ни одним методом. TelegramAuthStage —
idle/connecting/code/password/connected/error, без введённых секретов.
Чатная cookie, её переименование и знание адреса admin API не дают прав admin.

## Ошибки

`{error:string}`, без исходных исключений и данных запроса. 400 — поля/JSON;
401 — нет нужной сессии; 403 — Host/Origin/CSRF/выбор; 404 — неизвестный путь/диалог;
405 — метод; 409 — неверный этап, маршрут или повтор request ID; 413/415 — тело;
429 — rate limit; 502 — неизвестная отправка; 503 — недоступность операции.
HTTP requestTimeout ограничивает получение тела, а не суммарное время refresh.
Отдельный Telegram RPC получает дедлайн 15 секунд; общая операция содержит несколько RPC.
