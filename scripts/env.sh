#!/usr/bin/env bash
# Этот файл подключают остальные скрипты. Системные настройки не меняются.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT" || exit 1
if [ -x "$PROJECT_ROOT/.tools/node/bin/node" ]; then
  export PATH="$PROJECT_ROOT/.tools/node/bin:$PATH"
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Нужны Node.js 22 и npm. См. README.md.' >&2
  exit 1
fi
if [ -z "${CODEX_BIN:-}" ] && ! command -v codex >/dev/null 2>&1; then
  for CODEX_CANDIDATE in /Applications/Codex.app/Contents/Resources/codex /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex; do
    if [ -x "$CODEX_CANDIDATE" ]; then export CODEX_BIN="$CODEX_CANDIDATE"; break; fi
  done
fi
