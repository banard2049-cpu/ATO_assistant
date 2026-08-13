#!/bin/zsh
set -u

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1
PORT=8793
URL="http://127.0.0.1:${PORT}/"
mkdir -p data

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
  exec "$PHP_BIN" -S "0.0.0.0:${PORT}" -t "$SCRIPT_DIR"
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
