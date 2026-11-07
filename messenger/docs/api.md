# HTTP API

Базовый адрес локальной версии: `http://127.0.0.1:4318`.
Обработчик: [createApp](reference/backend--http.md#symbol-createApp).
Автоматически извлечённый [список веток маршрутизации](reference/http-api.md)
проверяет наличие всех путей, но не заменяет описание валидации ниже.

## Общие требования

- Host должен точно совпадать с `127.0.0.1:4318`. `localhost` и proxy-заголовки
  не служат альтернативой.
- POST требует точный Origin `http://127.0.0.1:4318`, `Content-Type: application/json`
  для методов с телом и JSON-объект до 20 000 байт.
- Кроме `/api/login`, каждый POST API требует авторизованную cookie и
  `X-CSRF-Token`. GET `/api/snapshot` также требует cookie.
- Ответы JSON, `Cache-Control: no-store`. Веб-сессия — `zai_session`, `HttpOnly`,
  `SameSite=Strict`, Path `/`, до 8 часов. `Secure` для loopback HTTP не установлен.

## Методы

| Метод и путь | Тело | Успешный ответ | Авторизация |
| --- | --- | --- | --- |
| GET `/api/session` | нет | `SessionInfo`: authenticated, setupRequired; csrfToken только после входа | Нет |
| POST `/api/login` | `password: string`, максимум 512 символов | `SessionInfo`, новая cookie | Нет; проверка пароля и Origin |
| POST `/api/logout` | UI отправляет `{}`; обработчик тело не читает | `{ ok: true }`, истёкшая cookie | Cookie + CSRF |
| GET `/api/snapshot` | нет | `Snapshot` из памяти, без сетевого обновления | Cookie |
| POST `/api/refresh` | UI отправляет `{}`; обработчик тело не читает | Обновлённый `Snapshot` | Cookie + CSRF |
| POST `/api/open` | `conversationId: string` | `Snapshot` с последними сообщениями диалога | Cookie + CSRF |
| POST `/api/read` | `conversationId: string` | `Snapshot` после отметки прочитанного | Cookie + CSRF |
| POST `/api/send` | `SendRequest` | Отправленный `Message` | Cookie + CSRF |

## SendRequest

```typescript
{
  destination: { sourceId: string; conversationId: string; recipientId: string };
  text: string;
  requestId: string;
}
```

Текст должен содержать непробельный символ и иметь длину до 4096 UTF-16 code units
(JavaScript `length`). request ID проверяется шаблоном `[a-zA-Z0-9-]{16,80}`;
штатный клиент передаёт UUID. Внешние/native Telegram ID напрямую не принимаются.
Сервер сравнивает маршрут с `destinationFor(Conversation)` и проверяет `canSend`.
Повтор payload с тем же ID в пределах 15 минут одного процесса не создаёт новую
отправку. Схема API не является строгой JSON Schema: неизвестные поля не удаляются
и сами по себе не отклоняются, обязательные поля проверяются обработчиками.

Типы: [SendRequest](reference/shared--types.md#symbol-SendRequest),
[Snapshot](reference/shared--types.md#symbol-Snapshot),
[Message](reference/shared--types.md#symbol-Message).

## Ошибки

Тело: `{ error: string }`. Исходные исключения teleproto, секреты и тела запросов
не сериализуются.

| HTTP | Причина |
| --- | --- |
| 400 | Некорректный JSON/текст/адресат или поле запроса |
| 401 | Вход не выполнен, сессия истекла, пароль неверен |
| 403 | Host, Origin или CSRF не совпали |
| 404 | API-путь, диалог или статический файл не найден |
| 405 | Метод не разрешён |
| 409 | Источник/получатель изменился, запись запрещена, request ID уже использован иначе |
| 413 / 415 | Превышен размер читаемого тела / ожидается JSON |
| 429 | Достигнут предел 5 попыток входа за минуту на процесс |
| 502 | Неизвестен результат отправки; требуется ручная сверка |
| 503 | Обновление, операция провайдера или внутренняя операция недоступна |

HTTP `requestTimeout` 15 секунд ограничивает получение запроса, а не общее время
обновления ленты. Telegram RPC по умолчанию получает дедлайн 15 секунд на отдельный
вызов; refresh выполняет несколько вызовов последовательно. Универсальных методов
shell, RPC-прокси и выдачи Telegram-секретов нет.
