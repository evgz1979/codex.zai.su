# Именованные сценарии тестов

Извлечены имена test(...) без запуска. Наличие сценария не означает успешный прогон.

- [test/admin.test.ts](../../test/admin.test.ts): HTTP: отдельные права и Secure cookie, отсутствие Telegram-секретов в ответах
- [test/admin.test.ts](../../test/admin.test.ts): Telegram-вход: этапы code/2FA, сохранение сессии без кода и пароля, отмена
- [test/admin.test.ts](../../test/admin.test.ts): админка: метаданные не синхронизируют историю; выбор сохраняется в SQLite
- [test/browser/admin.spec.ts](../../test/browser/admin.spec.ts): админка: отдельный вход, Telegram code/2FA и выбор галочками
- [test/browser/messenger.spec.ts](../../test/browser/messenger.spec.ts): единая лента, выбор адресата, отправка, непрочитанные, выход и мобильные границы
- [test/browser/messenger.spec.ts](../../test/browser/messenger.spec.ts): открытый чат скрывает исключённые диалоги без синхронизации истории
- [test/core.test.ts](../../test/core.test.ts): SQLite ограничивает активный кеш и сохраняет исключённый архив
- [test/core.test.ts](../../test/core.test.ts): единая лента объединяет источники и сохраняет хронологию
- [test/core.test.ts](../../test/core.test.ts): идентификаторы не конфликтуют между источниками, типами и строками
- [test/core.test.ts](../../test/core.test.ts): открытие ограничено; непрочитанные сбрасываются только явным действием
- [test/core.test.ts](../../test/core.test.ts): отправка проверяет весь маршрут; повтор HTTP не дублирует отправку
- [test/core.test.ts](../../test/core.test.ts): ошибки провайдера не выходят наружу; повтор не отправляет заново
- [test/core.test.ts](../../test/core.test.ts): пароль хешируется; сессии отзываются; перебор ограничен
- [test/core.test.ts](../../test/core.test.ts): по умолчанию ничего не выбрано; исключённые диалоги нельзя читать или отправлять
- [test/core.test.ts](../../test/core.test.ts): снятие выбора во время чтения не кеширует запоздалый результат
- [test/documentation.test.mjs](../../test/documentation.test.mjs): документация: AST не зависит от сдвига строк и обычных комментариев
- [test/documentation.test.mjs](../../test/documentation.test.mjs): документация: check не переписывает устаревший файл и находит лишний
- [test/documentation.test.mjs](../../test/documentation.test.mjs): документация: битые файлы, якоря и построчные ссылки отклоняются
- [test/documentation.test.mjs](../../test/documentation.test.mjs): документация: весь справочник побайтно стабилен после сдвигов исходников
- [test/documentation.test.mjs](../../test/documentation.test.mjs): документация: изменение сигнатуры меняет только страницу определения
- [test/documentation.test.mjs](../../test/documentation.test.mjs): документация: новый модуль требует назначения, удалённый оставляет обнаруживаемую страницу
- [test/documentation.test.mjs](../../test/documentation.test.mjs): документация: полные имена и повтор getter/setter получают разные якоря
- [test/documentation.test.mjs](../../test/documentation.test.mjs): документация: приватные и сторонние вложенные каталоги не обходятся
- [test/documentation.test.mjs](../../test/documentation.test.mjs): документация: у каждого исходника отдельная страница, включая stop.mjs и stop.sh
- [test/http.test.ts](../../test/http.test.ts): HTTP: вход, CSRF, Origin/Host, приватные API, безопасные ошибки и выход
- [test/telegram.test.ts](../../test/telegram.test.ts): Telegram: DTO, фильтр broadcast, уникальность message ID и буквальная отправка
