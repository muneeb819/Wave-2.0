#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install
  else
    npm install
  fi
fi

if command -v uv >/dev/null 2>&1 && [ ! -d .venv ]; then
  uv sync
fi

exec python3 start.py "$@"
