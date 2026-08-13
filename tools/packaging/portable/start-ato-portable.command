#!/bin/zsh
set -eu

APP_ROOT="${0:A:h}"
cd "$APP_ROOT"
PORT=8793
URL="http://127.0.0.1:${PORT}/"
PHP_BIN="$APP_ROOT/runtime/php/bin/php"

if [[ ! -x "$PHP_BIN" ]]; then
  echo "Portable PHP runtime is missing: $PHP_BIN"
  read -k 1 "?Press any key to exit..."
  exit 1
fi

mkdir -p "$APP_ROOT/data/sessions"
(sleep 1; open "$URL") >/dev/null 2>&1 &
echo "ATO Portable is starting: $URL"
echo "Close this window or press Control-C to stop it."
exec "$PHP_BIN" -d "session.save_path=$APP_ROOT/data/sessions" -S "0.0.0.0:${PORT}" -t "$APP_ROOT"
