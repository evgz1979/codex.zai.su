#!/usr/bin/env bash
set -euo pipefail
MESSENGER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -x "$MESSENGER_ROOT/../.tools/node/bin/node" ]; then
  export PATH="$MESSENGER_ROOT/../.tools/node/bin:$PATH"
fi
cd "$MESSENGER_ROOT"
exec node "$MESSENGER_ROOT/dist/server/backend/index.js"
