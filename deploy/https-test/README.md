# Статический HTTPS-тест на VPS

Дата: 2026-11-06. URL: **https://codex.zai.su:8443**.

Публикуется только `index.html` с текстом:

```text
Codex Z AI — Bangkok VPS — HTTPS OK
```

Веб-клиент Codex, backend, авторизация и App Server на VPS не копируются.
Фактические результаты — в [VERIFICATION.md](VERIFICATION.md).

## Порты и изоляция

| Порт | Назначение |
| --- | --- |
| TCP 443 | Существующий Xray/VLESS REALITY. Не изменяется. |
| TCP 8443 | Статическая HTTPS-страница Caddy; HTTP/1.1 и HTTP/2. |
| TCP 80 | Отдельный socket systemd для HTTP-01, остальным запросам — 404. |
| TCP 8080 | Только `127.0.0.1`, внутренний HTTP-01 backend Caddy. |

DNS: прямая `A codex.zai.su → 38.60.254.194`, без CDN/CNAME и ошибочного AAAA.
Для ACME используется только Let's Encrypt HTTP-01: внешний 80 передаётся на
локальный 8080. TLS-ALPN-01 явно отключён через `disable_tlsalpn_challenge`.
Это поддерживается [конфигурацией ACME Caddy](https://caddyserver.com/docs/caddyfile/directives/tls).
Переадресации на 443, HTTP/3 и административный API Caddy выключены.

Caddy не имеет root и capabilities; `NoNewPrivileges=true`, capability bounding
set пуст. При каждом запуске guard проверяет отсутствие прав и значение
`ip_unprivileged_port_start > 443`. Поэтому даже ошибочная попытка bind к 443
будет запрещена ядром. Sysctl не меняется. На этом VPS дополнительная проверка
`SocketBindDeny` не дала ожидаемой защиты, поэтому на неё не полагаемся.

Порт 80 открывает PID 1 по ровно одному `ListenStream=0.0.0.0:80` в отдельном
socket unit. Штатный непривилегированный
[systemd-socket-proxyd](https://manpages.debian.org/bookworm/systemd/systemd-socket-proxyd.8.en.html)
передаёт байты на `127.0.0.1:8080`; он не получает права открывать 443.

Сервис ограничен 256 МБ RAM, `GOMEMLIMIT=192MiB`, `GOMAXPROCS=1` и низким
CPUWeight. Forwarder ограничен 32 МБ. Пакеты не устанавливаются и не обновляются:
используется официальный статический Caddy 2.11.9, проверенный по SHA-512.
Это исключает побочные рестарты VPN из post-install/needrestart.

## Файлы на VPS

- `/opt/codex-zai-https/bin/caddy` — отдельный бинарник.
- `/opt/codex-zai-https/validate_config.py` — guard перед каждым запуском.
- `/opt/codex-zai-https/vpn_snapshot.py` — чтение состояния VPN/firewall.
- `/etc/codex-zai-https/Caddyfile` — активная конфигурация.
- `/etc/codex-zai-https/Caddyfile.https` — HTTPS-конфигурация после HTTP-пробы.
- `/srv/codex-zai-https/index.html` — единственная публикуемая страница.
- `/var/lib/codex-zai-https/` — закрытое состояние ACME и ключи, вне Git.
- Три отдельных unit: `codex-zai-https.service`, `codex-zai-http.socket`,
  `codex-zai-http.service`. Пользователь и группа: `codex-zai-https`.

Конфигурация и unit x-ui/Xray не изменяются. Firewall и sysctl не меняются.
Снимки не содержат текста конфигурации VPN: только хеши файлов, PID и время
старта. Не сохранять снимки, сертификатные ключи и журналы в Git.

## Одноразовая подготовка

Только после read-only аудита VPS и подтверждения отсутствия конфликта портов.
Если состояние VPN изменилось, есть неизвестные firewall-правила или порт занят,
нужно остановиться. `prepare.sh` не перезаписывает существующие пути.

Команды на MacBook из корня проекта; нужен существующий SSH-доступ:

```bash
VPS_SSH=root@38.60.254.194
mkdir -p .tools/deploy .local/deploy-task2
curl -fL https://github.com/caddyserver/caddy/releases/download/v2.11.9/caddy_2.11.9_linux_amd64.tar.gz -o .tools/deploy/caddy_2.11.9_linux_amd64.tar.gz
curl -fL https://github.com/caddyserver/caddy/releases/download/v2.11.9/caddy_2.11.9_checksums.txt -o .tools/deploy/caddy_2.11.9_checksums.txt
(cd .tools/deploy && shasum -a 512 -c caddy_2.11.9_checksums.txt --ignore-missing)
ssh "$VPS_SSH" 'python3 -' < deploy/https-test/vpn_snapshot.py > .local/deploy-task2/vpn-before.json
HTTPS_STAGE=$(ssh "$VPS_SSH" 'mktemp -d /var/tmp/codex-zai-https.XXXXXX')
scp .tools/deploy/caddy_2.11.9_linux_amd64.tar.gz .tools/deploy/caddy_2.11.9_checksums.txt deploy/https-test/Caddyfile deploy/https-test/Caddyfile.http-probe deploy/https-test/index.html deploy/https-test/*.service deploy/https-test/*.socket deploy/https-test/validate_config.py deploy/https-test/vpn_snapshot.py deploy/https-test/prepare.sh "$VPS_SSH:$HTTPS_STAGE/"
scp .local/deploy-task2/vpn-before.json "$VPS_SSH:$HTTPS_STAGE/vpn-baseline.json"
ssh "$VPS_SSH" "cd '$HTTPS_STAGE' && bash prepare.sh"
```

Использовать проверенный known_hosts; при несовпадении ключа SSH остановиться.
Не менять SSH/VPN и не обходить проверки ключа. `prepare.sh` запускает только
HTTP-пробу — сертификат ещё не запрашивается.

## Проверка HTTP-01 и включение HTTPS

С MacBook, извне VPS:

```bash
curl --noproxy '*' --fail --resolve codex.zai.su:80:38.60.254.194 http://codex.zai.su/.well-known/acme-challenge/codex-zai-reachability
```

Ожидается `Codex Z AI HTTP-01 reachability OK`, код 200. Если порт 80 недоступен,
отключить тестовые units, предложить DNS-01 и ждать согласования. Не включать
TLS-ALPN-01 и не пытаться использовать 443.

Перед переключением снять свежий VPN snapshot и сравнить поле `invariants`
с исходным: любое отличие требует остановки. Только после успешной внешней
пробы HTTP-01 выполнить на VPS:

```bash
sudo install -m 0644 /etc/codex-zai-https/Caddyfile.https /etc/codex-zai-https/Caddyfile
sudo systemctl restart codex-zai-https.service
```

Перезапускается только новый сервис теста. После успешной проверки HTTPS
можно включить его запуск при перезагрузке:

```bash
sudo systemctl enable codex-zai-https.service codex-zai-http.socket
```

## Проверки и iPhone

```bash
python3 -m unittest discover -s deploy/https-test -p 'test_*.py' -v
curl --noproxy '*' --fail --show-error https://codex.zai.su:8443/
ssh "$VPS_SSH" 'python3 /opt/codex-zai-https/vpn_snapshot.py' > .local/deploy-task2/vpn-after.json
```

Не использовать `curl -k`: нужен доверенный сертификат для `codex.zai.su`.
Сравнить `invariants` снимков до/после: boot ID, PID, start ticks, NRestarts,
состояние x-ui, владелец 443, хеши конфигурации/бинарников и firewall должны
совпасть. Счётчики трафика/изменяемая БД x-ui в сравнение не входят.

На iPhone отключить Wi-Fi и VPN, оставить российский мобильный интернет и
открыть **https://codex.zai.su:8443/**. Ожидается точный текст без предупреждения
сертификата. Проверка с MacBook сама по себе не подтверждает доступность у
российского мобильного оператора. Не обходить предупреждения браузера.

Диагностика только теста:

```bash
sudo systemctl status codex-zai-https.service codex-zai-http.socket codex-zai-http.service
sudo journalctl -u codex-zai-https.service --no-pager -n 30
sudo ss -ltnp '( sport = :80 or sport = :443 or sport = :8443 or sport = :8080 )'
```

## Безопасное отключение

На VPS:

```bash
sudo systemctl disable --now codex-zai-http.socket codex-zai-https.service
sudo systemctl stop codex-zai-http.service
```

Это освобождает только внешние 80/8443 и локальный 8080. Xray, x-ui, TCP 443,
firewall и VPN-команды не затрагиваются. Ключи и файлы можно оставить закрытыми
для последующего повторного теста. Для отключения не нужно удалять данные,
пользователей, пакеты или менять DNS.
