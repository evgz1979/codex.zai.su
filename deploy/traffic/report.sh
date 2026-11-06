#!/usr/bin/env bash
set -euo pipefail
# Используется существующий SSH-доступ. Новые ключи и порты не создаются.
exec ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "${VPS_SSH:-lightnode-bkk}" \
  '/usr/bin/python3 /opt/codex-zai-traffic/report.py'
