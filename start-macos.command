#!/bin/zsh
set -u

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1
PORT=8793
URL="http://127.0.0.1:${PORT}/"
mkdir -p data/sessions

open_later() {
  (sleep 1; open "$URL") >/dev/null 2>&1 &
}

PHP_BIN=""
PHP_CANDIDATES=(
  "${ATO_PHP_BIN:-}"
  "$(command -v php 2>/dev/null || true)"
  "/opt/homebrew/bin/php"
  "/usr/local/bin/php"
  "/opt/local/bin/php"
)
if [[ -n "${CONDA_PREFIX:-}" ]]; then
  PHP_CANDIDATES+=("$CONDA_PREFIX/bin/php")
fi
CONDA_ENV_ROOTS=(
  "$HOME/anaconda3/envs"
  "$HOME/miniconda3/envs"
  "$HOME/miniforge3/envs"
  "$HOME/mambaforge/envs"
  "$HOME/.conda/envs"
  "/opt/anaconda3/envs"
  "/opt/miniconda3/envs"
  "/opt/homebrew/Caskroom/miniconda/base/envs"
  "/opt/homebrew/Caskroom/miniforge/base/envs"
)
for env_root in "${CONDA_ENV_ROOTS[@]}"; do
  if [[ -d "$env_root" ]]; then
    for candidate in "$env_root"/*/bin/php(N); do
      PHP_CANDIDATES+=("$candidate")
    done
  fi
done
if [[ -f "$HOME/.conda/environments.txt" ]]; then
  while IFS= read -r env_prefix; do
    [[ -n "$env_prefix" ]] && PHP_CANDIDATES+=("$env_prefix/bin/php")
  done < "$HOME/.conda/environments.txt"
fi
for candidate in \
  "$HOME"/*conda*/envs/*/bin/php(N) \
  "$HOME"/*forge*/envs/*/bin/php(N) \
  /Applications/MAMP/bin/php/php*/bin/php(N); do
  PHP_CANDIDATES+=("$candidate")
done
for candidate in "${PHP_CANDIDATES[@]}"; do
  if [[ -n "$candidate" && -x "$candidate" ]] \
    && "$candidate" -r 'exit(version_compare(PHP_VERSION, "8.1.0", ">=") ? 0 : 1);' 2>/dev/null; then
    PHP_BIN="$candidate"
    break
  fi
done

if [[ -n "$PHP_BIN" ]]; then
  echo "ATO_assistant 正在启动：$URL"
  echo "使用 PHP：$PHP_BIN（$($PHP_BIN -r 'echo PHP_VERSION;')）"
  echo "关闭此窗口或按 Control-C 即可停止。"
  open_later
  # The built-in server would publish data/ (account hashes, campaign saves,
  # sessions, backups) as static files; router.php rejects those requests.
  # session.save_path must be absolute (the built-in server chdir's to the
  # requested script), and it must NOT go through -d: PHP parses the value of -d
  # as INI text, so a folder name with a space, & ( ) ! [ ] (very common:
  # "ATO_assistant (1)") truncates the value there -- session_start() then fails
  # and every login is dropped.  PHP therefore writes the setting into a
  # generated INI file (path derived by getcwd(), so it never appears in a shell
  # word) and the server starts with -c pointing at it; the php.ini PHP would
  # load anyway is copied in first, so extensions and settings survive.
  # post_max_size must stay ABOVE the API's own body cap (api/campaign-state.php
  # answers 413 PAYLOAD_TOO_LARGE above 6 MiB): a body over post_max_size is
  # dropped during PHP request startup, before any script runs, and PHP then
  # flushes an HTML warning with a 200 status instead of the API's structured 413.
  # Only *display* is turned off (display_errors / display_startup_errors), so such
  # a startup warning can never end up in the response body; logging stays ON
  # (log_errors = 1) and no error_log is set, so PHP writes the warning to stderr
  # -- i.e. into this launcher's own console window, which is where a local user
  # looks when something breaks.  With both off, a fatal error would leave no
  # trace anywhere and the failure would be an undebuggable blank 500.
  # The file sits in data/, which router.php keeps off HTTP.
  SESSION_INI="$SCRIPT_DIR/data/ato-session.ini"
  "$PHP_BIN" -r '$d=getcwd()."/data/ato-session.ini";$q=chr(34);$s=php_ini_loaded_file();$x=["session.save_path = ".$q.getcwd()."/data/sessions".$q,"post_max_size = 12M","display_errors = 0","log_errors = 1","display_startup_errors = 0"];file_put_contents($d,($s?file_get_contents($s):"").implode(PHP_EOL,$x).PHP_EOL);'
  if [[ ! -f "$SESSION_INI" ]]; then
    echo "无法写入 $SESSION_INI。请把本目录放到可写位置后再启动。"
    read -k 1 "?按任意键退出..."
    exit 1
  fi
  exec "$PHP_BIN" -c "$SESSION_INI" -S "0.0.0.0:${PORT}" -t "$SCRIPT_DIR" "$SCRIPT_DIR/router.php"
fi

DOCKER_BIN="$(command -v docker 2>/dev/null || true)"
if [[ -z "$DOCKER_BIN" && -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]]; then
  DOCKER_BIN="/Applications/Docker.app/Contents/Resources/bin/docker"
fi
if [[ -z "$DOCKER_BIN" ]]; then
  if [[ -d "/Applications/Docker.app" ]]; then
    open -a Docker
  else
    echo "没有找到 PHP 8.1+ 或 Docker Desktop。"
    echo "请安装其中之一后再次双击本脚本："
    echo "  PHP: https://www.php.net/downloads.php"
    echo "  Docker Desktop: https://www.docker.com/products/docker-desktop/"
    read -k 1 "?按任意键退出..."
    exit 1
  fi
fi

if ! "$DOCKER_BIN" info >/dev/null 2>&1; then
  echo "正在等待 Docker Desktop 启动……"
  open -a Docker >/dev/null 2>&1 || true
  for _ in {1..60}; do
    "$DOCKER_BIN" info >/dev/null 2>&1 && break
    sleep 2
  done
fi

if ! "$DOCKER_BIN" info >/dev/null 2>&1; then
  echo "Docker Desktop 未能启动，请启动后重试。"
  read -k 1 "?按任意键退出..."
  exit 1
fi

echo "正在启动 ATO_assistant（首次运行会下载 PHP 镜像）……"
if ! "$DOCKER_BIN" compose up -d ato; then
  echo "启动失败，请检查 Docker Desktop 的错误信息。"
  read -k 1 "?按任意键退出..."
  exit 1
fi
open "http://127.0.0.1:11451/"
echo "ATO_assistant 已启动：http://127.0.0.1:11451/"
echo "以后可在本目录运行 'docker compose down' 停止。"
read -k 1 "?按任意键关闭此窗口（服务会继续运行）..."
