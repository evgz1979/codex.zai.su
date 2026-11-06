#!/usr/bin/env bash
# Первичная установка из отдельной staging-папки; без apt install и dpkg -i.
set -euo pipefail
test "$(id -u)" -eq 0
provider_gb=${1:-}
provider_recorded_at=${2:-}
printf '%s  %s\n' 14b73223590b03558d52c9a9714d66aca5e7ceeda9aa31846726b9b16c9b7ba9 vnstat_2.12-1_amd64.deb | sha256sum --check -
python3 /opt/codex-zai-https/vpn_snapshot.py > vpn-before-install.json
python3 - <<'PY'
import json,subprocess
assert json.load(open('vpn-baseline.json'))['invariants'] == json.load(open('vpn-before-install.json'))['invariants'], 'VPN/firewall changed: STOP'
routes=json.loads(subprocess.check_output(['ip','-j','route','show','default'],text=True))
assert routes and all(r['dev']=='eth1' for r in routes), 'Default route differs from eth1: STOP'
PY
for path in /opt/codex-zai-traffic /etc/codex-zai-traffic /var/lib/codex-zai-traffic /etc/systemd/system/codex-zai-traffic.service; do
  test ! -e "$path" || { echo "STOP: существующий путь $path" >&2; exit 1; }
done
if getent passwd codex-zai-traffic >/dev/null || getent group codex-zai-traffic >/dev/null; then exit 1; fi
dpkg-deb --extract vnstat_2.12-1_amd64.deb extracted
groupadd --system codex-zai-traffic
useradd --system --gid codex-zai-traffic --no-create-home --home-dir /var/lib/codex-zai-traffic --shell /usr/sbin/nologin codex-zai-traffic
install -d -m 0755 /opt/codex-zai-traffic/bin /etc/codex-zai-traffic
install -d -m 0700 -o codex-zai-traffic -g codex-zai-traffic /var/lib/codex-zai-traffic
install -m 0755 extracted/usr/bin/vnstat extracted/usr/sbin/vnstatd /opt/codex-zai-traffic/bin/
install -m 0644 report.py /opt/codex-zai-traffic/report.py
install -m 0644 vnstat.conf /etc/codex-zai-traffic/vnstat.conf
install -m 0644 codex-zai-traffic.service /etc/systemd/system/codex-zai-traffic.service
runuser -u codex-zai-traffic -- env TZ=Europe/Moscow /opt/codex-zai-traffic/bin/vnstatd --config /etc/codex-zai-traffic/vnstat.conf --initdb --noadd
runuser -u codex-zai-traffic -- env TZ=Europe/Moscow /opt/codex-zai-traffic/bin/vnstat --config /etc/codex-zai-traffic/vnstat.conf --add -i eth1
python3 - "$provider_gb" "$provider_recorded_at" <<'PY'
from datetime import datetime,timezone
from decimal import Decimal
from pathlib import Path
import json,sys
value,recorded=sys.argv[1:]
metadata={
 'version':1,'interface':'eth1','timezone':'Europe/Moscow',
 'meter_started_at_utc':datetime.now(timezone.utc).isoformat(),
 'kernel_at_start':{name:int(Path('/sys/class/net/eth1/statistics/'+name).read_text()) for name in ('tx_bytes','rx_bytes')},
 'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
}
if value:
 assert Decimal(value).is_finite() and Decimal(value)>=0
 assert datetime.fromisoformat(recorded).tzinfo is not None
 metadata['provider_observation']={'display_gb':value,'recorded_at_utc':recorded,'source':'user_report'}
path=Path('/var/lib/codex-zai-traffic/baseline.json')
path.write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
path.chmod(0o600)
PY
chown codex-zai-traffic:codex-zai-traffic /var/lib/codex-zai-traffic/baseline.json
# Первый обычный запуск может отнести весь накопленный интерфейсный счётчик
# к новой базе. Однократно синхронизируем исходную точку штатным --sync.
seed_status=0
runuser -u codex-zai-traffic -- env TZ=Europe/Moscow timeout --signal=TERM 8s \
  /opt/codex-zai-traffic/bin/vnstatd --config /etc/codex-zai-traffic/vnstat.conf --nodaemon --noadd --sync || seed_status=$?
test "$seed_status" -eq 0 || test "$seed_status" -eq 124
python3 - <<'PY'
import json,subprocess,sys
from pathlib import Path
sys.path.insert(0,'/opt/codex-zai-traffic')
from report import validate_initial_history
args=['runuser','-u','codex-zai-traffic','--','env','TZ=Europe/Moscow','/opt/codex-zai-traffic/bin/vnstat','--config','/etc/codex-zai-traffic/vnstat.conf','--json']
doc=json.loads(subprocess.check_output(args,text=True))
metadata=json.loads(Path('/var/lib/codex-zai-traffic/baseline.json').read_text())
kernel={name:int(Path('/sys/class/net/eth1/statistics/'+name).read_text()) for name in ('tx_bytes','rx_bytes')}
validate_initial_history(doc,metadata,kernel)
print('Initial history excludes pre-existing traffic: PASS')
PY
systemd-analyze verify /etc/systemd/system/codex-zai-traffic.service
systemctl daemon-reload
systemctl enable --now codex-zai-traffic.service
systemctl show codex-zai-traffic.service -p ActiveState -p MainPID -p User -p MemoryCurrent -p NRestarts --no-pager
python3 /opt/codex-zai-traffic/report.py
