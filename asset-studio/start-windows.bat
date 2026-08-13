@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo 需要 Python 3.11 或更高版本。请先从 python.org 安装。
  pause
  exit /b 1
)
py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3,11) else 1)"
if errorlevel 1 (
  echo 需要 Python 3.11 或更高版本。请先从 python.org 安装。
  pause
  exit /b 1
)
if not exist .venv py -3 -m venv .venv
call .venv\Scripts\activate.bat
if not exist .venv\.ato-studio-ready (
  python -m pip install --disable-pip-version-check -r requirements.txt
  if errorlevel 1 (
    pause
    exit /b 1
  )
  type nul > .venv\.ato-studio-ready
)
python -m app.main
if errorlevel 1 pause
