#!/usr/bin/env bash
# Одноразовая установка из отдельного staging-каталога. Не обновляет пакеты.
set -euo pipefail
test "$(id -u)" -eq 0
test -f vpn-baseline.json
sha512sum --check --ignore-missing caddy_2.11.9_checksums.txt
python3 vpn_snapshot.py > vpn-before.json
python3 - <<'PY'
import json
with open('vpn-baseline.json') as f:
    before = json.load(f)['invariants']
with open('vpn-before.json') as f:
    current = json.load(f)['invariants']
assert before == current, 'VPN/firewall изменился с исходной проверки: STOP'
assert current['firewall']['nft_ruleset_empty'], 'Нужен отдельный аудит firewall: STOP'
PY
for path in /opt/codex-zai-https /etc/codex-zai-https /srv/codex-zai-https /var/lib/codex-zai-https /etc/systemd/system/codex-zai-https.service /etc/systemd/system/codex-zai-http.socket /etc/systemd/system/codex-zai-http.service; do
  test ! -e "$path" || { echo "STOP: путь уже существует: $path" >&2; exit 1; }
done
if getent passwd codex-zai-https >/dev/null || getent group codex-zai-https >/dev/null; then
  echo 'STOP: пользователь/группа уже существует' >&2
  exit 1
fi
test -z "$(ss -H -ltn '( sport = :80 or sport = :8443 or sport = :8080 )')"
test "$(cat /proc/sys/net/ipv4/ip_unprivileged_port_start)" -gt 443
tar --extract --gzip --file=caddy_2.11.9_linux_amd64.tar.gz --no-same-owner caddy
groupadd --system codex-zai-https
useradd --system --gid codex-zai-https --no-create-home --home-dir /var/lib/codex-zai-https --shell /usr/sbin/nologin codex-zai-https
install -d -m 0755 /opt/codex-zai-https/bin /etc/codex-zai-https /srv/codex-zai-https
install -d -m 0700 -o codex-zai-https -g codex-zai-https /var/lib/codex-zai-https
install -m 0755 caddy /opt/codex-zai-https/bin/caddy
install -m 0644 validate_config.py vpn_snapshot.py /opt/codex-zai-https/
install -m 0644 index.html /srv/codex-zai-https/index.html
install -m 0644 Caddyfile /etc/codex-zai-https/Caddyfile.https
install -m 0644 Caddyfile.http-probe /etc/codex-zai-https/Caddyfile
install -m 0644 codex-zai-https.service codex-zai-http.socket codex-zai-http.service /etc/systemd/system/
/opt/codex-zai-https/bin/caddy version
/opt/codex-zai-https/bin/caddy adapt --config /etc/codex-zai-https/Caddyfile.https --adapter caddyfile > adapted-https.json
python3 - <<'PY'
import json,sys
sys.path.insert(0,'/opt/codex-zai-https')
from validate_config import validate
print('Final HTTPS config guard:', validate(json.load(open('adapted-https.json'))))
PY
systemd-analyze verify /etc/systemd/system/codex-zai-https.service /etc/systemd/system/codex-zai-http.socket /etc/systemd/system/codex-zai-http.service
systemctl daemon-reload
# Только HTTP-проба: никаких запросов сертификата до внешней проверки порта 80.
systemctl start codex-zai-https.service codex-zai-http.socket
systemctl show codex-zai-https.service -p ActiveState -p SubState -p MainPID -p User -p NoNewPrivileges -p CapabilityBoundingSet -p AmbientCapabilities --no-pager
ss -H -ltnp '( sport = :80 or sport = :443 or sport = :8443 or sport = :8080 )'
