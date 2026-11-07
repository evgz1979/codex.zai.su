#!/usr/bin/env bash
set -euo pipefail
umask 077
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
export PATH="$project_root/.tools/node/bin:$PATH"
vps=root@38.60.254.194
ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15)
bootstrap_dir="${MESSENGER_BOOTSTRAP_DIR:-$HOME/Library/Application Support/Z AI Messenger/deploy}"
# No deployment with uncommitted or untracked source; runtime directories are ignored.
test -z "$(git status --porcelain)" || { echo 'Commit source changes before deployment' >&2; exit 1; }
bash messenger/scripts/npm.sh test
bash messenger/scripts/npm.sh run build
bash messenger/scripts/npm.sh run docs:check
bash messenger/scripts/npm.sh run docs:test
bash messenger/scripts/npm.sh run test:browser
python3 -m unittest discover -s deploy/messenger -p 'test_*.py' -v
python3 -m unittest discover -s deploy/https-test -p 'test_*.py' -v
git push origin HEAD
release_id="$(TZ=Europe/Moscow date +%Y%m%dT%H%M%S)-$(git rev-parse --short HEAD)"
audit="$project_root/.local/messenger-deploy/$release_id"
mkdir -p "$audit"
ssh "${ssh_options[@]}" "$vps" 'python3 /opt/codex-zai-https/vpn_snapshot.py' > "$audit/vpn-baseline.json"
curl --noproxy '*' -fsS --max-time 15 https://codex.zai.su:8443/ > "$audit/codex-before.html"
MESSENGER_BOOTSTRAP_DIR="$bootstrap_dir" node deploy/messenger/credentials.mjs
# Fixed allowlist only: no .local, .env, histories, logs or working Telegram sessions.
tar -czf "$audit/release.tar.gz" -C messenger dist/client dist/server package.json package-lock.json
(cd "$audit" && shasum -a 256 release.tar.gz > release.sha256)
stage=$(ssh "${ssh_options[@]}" "$vps" 'mktemp -d /var/tmp/zai-messenger-XXXXXX')
[[ "$stage" == /var/tmp/zai-messenger-* ]]
printf '%s\n' "$stage" > "$audit/remote-stage"
scp "${ssh_options[@]}" "$audit/release.tar.gz" "$audit/release.sha256" "$audit/vpn-baseline.json" deploy/messenger/zai-messenger.service deploy/messenger/Caddyfile.append deploy/messenger/caddy_guard.py deploy/messenger/remote-install.sh deploy/messenger/remote-rollback.sh "$vps:$stage/"
# Hashes only, sent separately over SSH; never included in a release or printed.
scp "${ssh_options[@]}" "$bootstrap_dir/bootstrap.json" "$vps:$stage/bootstrap.json"
ssh "${ssh_options[@]}" "$vps" "cd '$stage' && sha256sum -c release.sha256 && bash remote-install.sh '$stage' '$release_id'"
activated=1
confirmed=0
on_exit() {
 result=$?
 if test "$result" -ne 0 && test "$activated" -eq 1 && test "$confirmed" -eq 0; then ssh "${ssh_options[@]}" "$vps" "bash '$stage/remote-rollback.sh' '$stage'" || true; fi
}
trap on_exit EXIT
external_failed=0
for attempt in $(seq 1 12); do
 if curl --noproxy '*' -fsS --max-time 8 https://msg.zai.su:8443/healthz > "$audit/health.json" 2>/dev/null; then external_failed=0; break; fi
 external_failed=1; sleep 3
done
if test "$external_failed" -eq 0; then
 for path in / /admin; do curl --noproxy '*' -fsS --max-time 10 "https://msg.zai.su:8443$path" > "$audit/$(test "$path" = / && echo chat || echo admin).html" || external_failed=1; done
 for path in /api/chat/snapshot /api/admin/status /api/admin/dialogs; do
  status=$(curl --noproxy '*' -sS --max-time 10 -o /dev/null -w '%{http_code}' "https://msg.zai.su:8443$path")
  test "$status" = 401 || external_failed=1
 done
 curl --noproxy '*' -fsS --max-time 15 https://codex.zai.su:8443/ > "$audit/codex-after.html" || external_failed=1
 cmp -s "$audit/codex-before.html" "$audit/codex-after.html" || external_failed=1
fi
if test "$external_failed" -ne 0; then echo 'HTTPS validation failed; rolled back' >&2; exit 1; fi
ssh "${ssh_options[@]}" "$vps" "set -e; python3 /opt/codex-zai-https/vpn_snapshot.py > '$stage/vpn-final.json'; systemctl is-enabled zai-messenger.service; systemctl is-active zai-messenger.service; rm -f '$stage/bootstrap.json'"
scp "${ssh_options[@]}" "$vps:$stage/vpn-final.json" "$audit/vpn-final.json"
python3 - "$audit" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);assert json.loads((p/'vpn-baseline.json').read_text())['invariants']==json.loads((p/'vpn-final.json').read_text())['invariants'],'VPN invariants changed'
PY
confirmed=1
trap - EXIT
printf 'Deployed %s\nhttps://msg.zai.su:8443/\nhttps://msg.zai.su:8443/admin\n' "$release_id"
