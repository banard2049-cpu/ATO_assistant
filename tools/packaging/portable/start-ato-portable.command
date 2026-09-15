#!/bin/zsh
set -eu

APP_ROOT="${0:A:h}"
cd "$APP_ROOT"
PORT=8793
URL="http://127.0.0.1:${PORT}/"
PHP_BIN="$APP_ROOT/runtime/php/bin/php"

if [[ ! -x "$PHP_BIN" ]]; then
  echo "Portable PHP runtime is missing: $PHP_BIN"
  if [[ -t 0 ]]; then read -k 1 "?Press any key to exit..." || true; fi
  exit 1
fi

if ! "$PHP_BIN" -r 'exit(extension_loaded("session") ? 0 : 1);' >/dev/null 2>&1; then
  echo "Portable PHP runtime could not load the session extension."
  echo "Please re-download or rebuild the portable package."
  if [[ -t 0 ]]; then read -k 1 "?Press any key to exit..." || true; fi
  exit 1
fi

mkdir -p "$APP_ROOT/data/sessions"
(sleep 1; open "$URL") >/dev/null 2>&1 &
echo "ATO Portable is starting: $URL"
echo "Close this window or press Control-C to stop it."
# PHP's built-in server changes the working directory to the requested script's
# directory, so a relative session.save_path resolved to api/data/sessions and
# every login session was silently dropped.  The value must be absolute;
# quoting still keeps special characters in APP_ROOT out of PHP's INI parser.
exec "$PHP_BIN" -d "session.save_path=$APP_ROOT/data/sessions" -S "0.0.0.0:${PORT}" -t "$APP_ROOT"
