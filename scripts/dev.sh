#!/usr/bin/env bash
# Start PocketBase (8090) and the Vite dev server (1420). Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d node_modules ] || npm install

# Export .env.local so PocketBase sees GEMINI_API_KEY (Vite only exposes VITE_* vars to the browser).
set -a; [ -f .env.local ] && . ./.env.local; set +a

npm run pb &
trap 'kill 0' EXIT INT TERM
npm run dev
