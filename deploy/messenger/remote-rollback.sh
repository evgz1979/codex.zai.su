#!/usr/bin/env bash
set -euo pipefail
stage_dir="$1"
[[ "$stage_dir" == /var/tmp/zai-messenger-* ]]
root=/opt/zai-messenger
cp -a "$stage_dir/backup/Caddyfile" /etc/codex-zai-https/Caddyfile
if test -e "$stage_dir/backup/messenger.conf"; then cp -a "$stage_dir/backup/messenger.conf" /etc/systemd/system/codex-zai-https.service.d/messenger.conf; else rm -f /etc/systemd/system/codex-zai-https.service.d/messenger.conf; fi
if test -e "$stage_dir/backup/caddy_guard.py"; then cp -a "$stage_dir/backup/caddy_guard.py" "$root/caddy_guard.py"; fi
if test -e "$stage_dir/backup/zai-messenger.service"; then cp -a "$stage_dir/backup/zai-messenger.service" /etc/systemd/system/zai-messenger.service; fi
systemctl daemon-reload
previous=$(cat "$stage_dir/previous-release")
if test -n "$previous" && test -d "$previous"; then ln -sfn "$previous" "$root/current"; systemctl restart zai-messenger.service; else systemctl disable --now zai-messenger.service; fi
systemctl restart codex-zai-https.service
python3 /opt/codex-zai-https/vpn_snapshot.py > "$stage_dir/vpn-rollback.json"
python3 - "$stage_dir" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);assert json.loads((p/'vpn-before.json').read_text())['invariants']==json.loads((p/'vpn-rollback.json').read_text())['invariants'],'VPN invariants changed'
PY
echo 'Previous code/config restored; persistent data left untouched'
