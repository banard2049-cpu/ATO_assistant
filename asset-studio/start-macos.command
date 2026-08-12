#!/bin/zsh
set -e
SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"
PYTHON_BIN=""
for candidate in python3.13 python3.12 python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
    PYTHON_BIN="$candidate"
    break
  fi
done
if [[ -z "$PYTHON_BIN" ]]; then
  echo "需要 Python 3.11 或更高版本。请先从 python.org 安装。"
  read -k 1 "?按任意键退出..."
  exit 1
fi
if [[ ! -d .venv ]]; then
  "$PYTHON_BIN" -m venv .venv
fi
if [[ ! -f .venv/.ato-studio-ready ]]; then
  .venv/bin/python -m pip install --disable-pip-version-check -r requirements.txt
  touch .venv/.ato-studio-ready
fi
.venv/bin/python -m app.main
