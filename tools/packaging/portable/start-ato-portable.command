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
# every login session was silently dropped.  The value must be absolute, and it
# must NOT be passed through -d: PHP parses the value of -d as INI text, so a
# folder name containing a space, & ( ) ! [ ] ... (very common:
# "ATO-Assistant-Portable-1.3.1-macos-arm64 (1)") truncates the value at that
# character -- session.save_path falls back to a path that does not exist,
# session_start() fails and every login session is dropped again.
# Instead, PHP writes the setting into a generated INI file and the server is
# started with -c pointing at it: a value that lives in an INI file only goes
# through the INI parser, never through command-line parsing, and because PHP
# derives the path from getcwd() it never appears in a shell word at all.  The
# php.ini PHP would load anyway is copied in first so extensions and other
# settings survive.
# post_max_size must stay ABOVE the API's own body cap (api/campaign-state.php
# answers 413 PAYLOAD_TOO_LARGE above 6 MiB): a body over post_max_size is
# dropped during PHP request startup, before any script runs, and PHP then
# flushes an HTML warning with a 200 status instead of the API's structured 413.
# Raising it to 12M leaves the API's own check as the one that fires.
# Only *display* is turned off (display_errors / display_startup_errors), so such
# a startup warning can never end up in the response body; logging stays ON
# (log_errors = 1) and no error_log is set, so PHP writes the warning to stderr
# -- i.e. into this launcher's own console window, which is where a local user
# looks when something breaks.  With both off, a fatal error would leave no
# trace anywhere and the failure would be an undebuggable blank 500.
# The file lives in the writable data/ folder, which router.php keeps off HTTP.
# The router script keeps the built-in server from publishing data/ (account
# password hashes, complete campaign saves, sessions and backups) as static
# files, so it must be passed like the session path: absolute.
SESSION_INI="$APP_ROOT/data/ato-session.ini"
"$PHP_BIN" -r '$d=getcwd()."/data/ato-session.ini";$q=chr(34);$s=php_ini_loaded_file();$x=["session.save_path = ".$q.getcwd()."/data/sessions".$q,"post_max_size = 12M","display_errors = 0","log_errors = 1","display_startup_errors = 0"];file_put_contents($d,($s?file_get_contents($s):"").implode(PHP_EOL,$x).PHP_EOL);'
if [[ ! -f "$SESSION_INI" ]]; then
  echo "Could not write $SESSION_INI. Extract the package to a writable folder."
  exit 1
fi
exec "$PHP_BIN" -c "$SESSION_INI" -S "0.0.0.0:${PORT}" -t "$APP_ROOT" "$APP_ROOT/router.php"
