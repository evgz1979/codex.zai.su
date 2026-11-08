# Развёртывание на LightNode

## Браузерный WhatsApp

`zai-whatsapp.service` работает отдельным пользователем `zai-whatsapp`.
Unix socket `/run/zai-whatsapp/control.sock` имеет 0660, группу Messenger;
профили `/var/lib/zai-whatsapp/<server-key>` имеют 0700. TCP-портов нет.
MemoryHigh — 768 МиБ, MemoryMax — 896 МиБ, MemorySwapMax — 0, CPUQuota — 35%,
TasksMax — 256. При сбое завершается весь браузерный cgroup; Messenger/Telegram
работают отдельно. На данном VPS доступна одна активная WhatsApp-сессия.

`install-browser.sh` получает Chrome с официального HTTPS-источника Google,
скачивает зависимости через `apt-get --download-only` и извлекает через
`dpkg-deb -x` в `/opt/zai-whatsapp/runtime`. Установки пакетов, maintainer scripts,
изменения firewall/sysctl и рестарта сторонних сервисов нет. Chromium использует
штатный профиль AppArmor `chrome` для `/opt/google/chrome/chrome` и включённый
sandbox. При недоступности sandbox запуск прекращается; `--no-sandbox` запрещён.

Браузерные файлы сохраняются между релизами. Deploy сохраняет и восстанавливает
worker-unit вместе с приложением, сравнивает VPN snapshot до/после. Первую
привязку выполняет владелец QR-кодом в личной админке. Сообщения и восстановление
связанного аккаунта проверяются после этой привязки, отдельно от проверок QR.

Сервер: Ubuntu 24.04, 38.60.254.194, Node.js 22, 1 vCPU/2 ГБ RAM.
Выполняется только `deploy/messenger/deploy.sh` с MacBook после коммита исходников.
[Инструкции и файлы установки](../../deploy/messenger/README.md).

## Границы

- `/opt/zai-messenger/releases/<id>` — код и production-зависимости, владелец root.
- `/opt/zai-messenger/current` — ссылка на текущий релиз.
- `/var/lib/zai-messenger` — приватные настройки/данные сервисного пользователя.
- `zai-messenger.service` — отдельный непривилегированный пользователь, автозапуск,
  лимит 512 МБ, Node heap 256 МБ, рестарт при падении и systemd hardening.
- Backend только 127.0.0.1:4318. Docker, пакеты ОС и новые firewall-правила не нужны.

Существующий Caddy сохраняет Codex-site и получает отдельный блок msg.zai.su:8443.
Backup Caddyfile и прежнего drop-in хранится в закрытом staging-каталоге VPS.
Новый guard подключён через drop-in только ExecStartPre, исходный guard сохранён.
Проверяются Caddy adapt, ограниченная proxy-политика и Caddy validate с тем же
UID/пустыми capabilities до замены активной конфигурации.

После проверки перезапускается только Caddy и собственный Messenger. Xray/x-ui,
TCP 443, sysctl, firewall, сокет HTTP-01 и другие сервисы не меняются.
Непривилегированная политика Caddy по-прежнему запрещает bind к 443; ACME только
HTTP-01 через существующий 80→127.0.0.1:8080, TLS-ALPN-01 выключен.

## Проверка и откат

Локальные checks → push → архив фиксированного allowlist → SHA-256 по SSH → npm ci
--omit=dev --ignore-scripts → bootstrap при первом запуске → systemd → локальный
healthz → Caddy → доверенный внешний HTTPS без -k → / и /admin → 401 закрытых API.
Тело существующего Codex-site сравнивается побайтно до/после. Снимки VPN сравнивают
PID, время запуска, владельца 443, хеши конфигурации/бинарников и firewall.

Ошибка установки включает remote rollback. Ошибка внешней проверки восстанавливает
старую конфигурацию Caddy и предыдущий кодовый symlink; при первой неудачной установке
Messenger останавливается и отключается от автозапуска. Пользовательские данные и
секреты не откатываются и не перезаписываются. Изменения схемы должны оставаться
обратно совместимыми; разрушительные миграции этот процесс не выполняет.

SSH использует существующий known_hosts и StrictHostKeyChecking=yes. Реквизиты
не передаются аргументами команд. В Git нет архивов, хешей паролей и закрытых
снимков. Настоящий Telegram подключает только владелец после развёртывания.
