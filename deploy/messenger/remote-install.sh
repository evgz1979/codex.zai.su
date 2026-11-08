#!/usr/bin/env bash
set -euo pipefail
umask 077
stage_dir="$1"
release_id="$2"
[[ "$stage_dir" == /var/tmp/zai-messenger-* && "$release_id" =~ ^[a-zA-Z0-9-]+$ ]]
root=/opt/zai-messenger
caddy_dir=/etc/codex-zai-https
python3 /opt/codex-zai-https/vpn_snapshot.py > "$stage_dir/vpn-before.json"
python3 - "$stage_dir" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1])
assert json.loads((p/'vpn-baseline.json').read_text())['invariants']==json.loads((p/'vpn-before.json').read_text())['invariants'],'VPN changed: STOP'
PY
old_release=$(readlink -f "$root/current" 2>/dev/null || true)
release="$root/releases/$release_id"
test ! -e "$release"
getent passwd zai-messenger >/dev/null || useradd --system --user-group --no-create-home --home-dir /var/lib/zai-messenger --shell /usr/sbin/nologin zai-messenger
install -d -m 0755 "$root" "$root/releases" "$release"
install -d -m 0700 -o zai-messenger -g zai-messenger /var/lib/zai-messenger
install -d -m 0700 "$stage_dir/backup"
cp -a "$caddy_dir/Caddyfile" "$stage_dir/backup/Caddyfile"
if test -e /etc/systemd/system/codex-zai-https.service.d/messenger.conf; then cp -a /etc/systemd/system/codex-zai-https.service.d/messenger.conf "$stage_dir/backup/messenger.conf"; fi
if test -e /etc/systemd/system/zai-messenger.service; then cp -a /etc/systemd/system/zai-messenger.service "$stage_dir/backup/zai-messenger.service"; fi
cp -a "$root/caddy_guard.py" "$stage_dir/backup/caddy_guard.py" 2>/dev/null || true
if test -e /etc/systemd/system/zai-whatsapp.service; then cp -a /etc/systemd/system/zai-whatsapp.service "$stage_dir/backup/zai-whatsapp.service"; fi
systemctl is-enabled --quiet zai-whatsapp.service 2>/dev/null && touch "$stage_dir/backup/whatsapp-enabled" || true
caddy_changed=0
activated=0
rollback() {
 result=$?
 if test "$result" -eq 0; then return; fi
 trap - EXIT
 echo 'Deployment failed; restoring previous application/configuration' >&2
 if test "$caddy_changed" -eq 1; then
  cp -a "$stage_dir/backup/Caddyfile" "$caddy_dir/Caddyfile"
  if test -e "$stage_dir/backup/messenger.conf"; then cp -a "$stage_dir/backup/messenger.conf" /etc/systemd/system/codex-zai-https.service.d/messenger.conf; else rm -f /etc/systemd/system/codex-zai-https.service.d/messenger.conf; fi
  if test -e "$stage_dir/backup/caddy_guard.py"; then cp -a "$stage_dir/backup/caddy_guard.py" "$root/caddy_guard.py"; fi
  systemctl daemon-reload
  systemctl restart codex-zai-https.service
 fi
 if test -e "$stage_dir/backup/zai-messenger.service"; then cp -a "$stage_dir/backup/zai-messenger.service" /etc/systemd/system/zai-messenger.service; systemctl daemon-reload; fi
 if test -e "$stage_dir/backup/zai-whatsapp.service"; then cp -a "$stage_dir/backup/zai-whatsapp.service" /etc/systemd/system/zai-whatsapp.service; else systemctl disable --now zai-whatsapp.service 2>/dev/null || true; rm -f /etc/systemd/system/zai-whatsapp.service; fi
 if test "$activated" -eq 1; then
  if test -n "$old_release" && test -d "$old_release"; then ln -sfn "$old_release" "$root/current"; systemctl restart zai-messenger.service;
  else systemctl disable --now zai-messenger.service || true; fi
 fi
 if test -e "$stage_dir/backup/whatsapp-enabled"; then systemctl daemon-reload; systemctl restart zai-whatsapp.service; fi
 python3 /opt/codex-zai-https/vpn_snapshot.py > "$stage_dir/vpn-rollback.json"
 exit "$result"
}
trap rollback EXIT
tar -xzf "$stage_dir/release.tar.gz" -C "$release" --no-same-owner
cd "$release"
/usr/local/bin/npm ci --omit=dev --ignore-scripts --no-audit --no-fund > "$stage_dir/npm-install.log" 2>&1
chown -R root:root "$release"
find "$release" -type d -exec chmod 0755 {} +
find "$release" -type f -exec chmod 0644 {} +
if test -f "$stage_dir/bootstrap.json"; then
 runuser -u zai-messenger -- env NODE_ENV=production MESSENGER_DATA_DIR=/var/lib/zai-messenger MESSENGER_PUBLIC_ORIGIN=https://msg.zai.su:8443 /usr/local/bin/node "$release/dist/server/backend/cli.js" bootstrap < "$stage_dir/bootstrap.json"
fi
bash "$stage_dir/install-browser.sh" "$stage_dir"
getent passwd zai-whatsapp >/dev/null || useradd --system --no-create-home --gid zai-messenger --home-dir /var/lib/zai-whatsapp --shell /usr/sbin/nologin zai-whatsapp
install -m 0644 "$stage_dir/zai-whatsapp.service" /etc/systemd/system/zai-whatsapp.service
systemd-analyze verify /etc/systemd/system/zai-whatsapp.service
install -m 0644 "$stage_dir/zai-messenger.service" /etc/systemd/system/zai-messenger.service
systemd-analyze verify /etc/systemd/system/zai-messenger.service
ln -sfn "$release" "$root/current"
activated=1
systemctl daemon-reload
systemctl enable --now zai-whatsapp.service
systemctl restart zai-whatsapp.service
systemctl enable --now zai-messenger.service
systemctl restart zai-messenger.service
for attempt in $(seq 1 20); do
 if curl -fsS --max-time 3 -H 'Host: msg.zai.su:8443' http://127.0.0.1:4318/healthz > /dev/null; then break; fi
 sleep 1
done
curl -fsS --max-time 3 -H 'Host: msg.zai.su:8443' http://127.0.0.1:4318/healthz > /dev/null
if ! grep -q '^# Z AI Messenger:' "$caddy_dir/Caddyfile"; then cat "$caddy_dir/Caddyfile" "$stage_dir/Caddyfile.append" > "$stage_dir/Caddyfile.new"; else cp "$caddy_dir/Caddyfile" "$stage_dir/Caddyfile.new"; fi
/opt/codex-zai-https/bin/caddy adapt --config "$stage_dir/Caddyfile.new" --adapter caddyfile > "$stage_dir/adapted.json" 2> "$stage_dir/adapt.log"
python3 - "$stage_dir" <<'PY'
import importlib.util,json,sys
from pathlib import Path
p=Path(sys.argv[1])
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
old=module('old','/opt/codex-zai-https/validate_config.py');new=module('new',p/'caddy_guard.py')
new.validate(json.loads((p/'adapted.json').read_text()),old.validate)
PY
# Validate the exact candidate with unchanged Caddy privileges before publication.
install -m 0644 "$stage_dir/Caddyfile.new" "$caddy_dir/Caddyfile.messenger-candidate"
install -m 0644 "$stage_dir/caddy_guard.py" "$root/caddy_guard.py"
setpriv --bounding-set=-all --no-new-privs --reuid=codex-zai-https --regid=codex-zai-https --init-groups /usr/bin/python3 "$root/caddy_guard.py" "$caddy_dir/Caddyfile.messenger-candidate"
setpriv --bounding-set=-all --no-new-privs --reuid=codex-zai-https --regid=codex-zai-https --init-groups env HOME=/var/lib/codex-zai-https XDG_CONFIG_HOME=/var/lib/codex-zai-https/config XDG_DATA_HOME=/var/lib/codex-zai-https/data /opt/codex-zai-https/bin/caddy validate --config "$caddy_dir/Caddyfile.messenger-candidate" --adapter caddyfile > "$stage_dir/caddy-validate.log" 2>&1
install -d -m 0755 /etc/systemd/system/codex-zai-https.service.d
cat > "$stage_dir/messenger.conf" <<'UNIT'
[Service]
ExecStartPre=
ExecStartPre=/usr/bin/python3 /opt/zai-messenger/caddy_guard.py /etc/codex-zai-https/Caddyfile
UNIT
caddy_changed=1
install -m 0644 "$stage_dir/messenger.conf" /etc/systemd/system/codex-zai-https.service.d/messenger.conf
install -m 0644 "$caddy_dir/Caddyfile.messenger-candidate" "$caddy_dir/Caddyfile"
systemctl daemon-reload
systemctl restart codex-zai-https.service
systemctl is-active --quiet codex-zai-https.service zai-messenger.service
python3 /opt/codex-zai-https/vpn_snapshot.py > "$stage_dir/vpn-after.json"
python3 - "$stage_dir" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);assert json.loads((p/'vpn-before.json').read_text())['invariants']==json.loads((p/'vpn-after.json').read_text())['invariants'],'VPN changed after deployment'
PY
trap - EXIT
printf '%s\n' "$old_release" > "$stage_dir/previous-release"
echo 'Messenger activated; external HTTPS verification required'
