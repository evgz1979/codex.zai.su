#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
if [ ! -f backend/dist/backend/src/index.js ] || [ ! -f frontend/dist/index.html ]; then
  echo 'Сначала выполните: bash scripts/npm.sh ci && bash scripts/npm.sh run build' >&2
  exit 1
fi
exec node backend/dist/backend/src/index.js
