@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "ATO_PORT=8793"
set "ATO_URL=http://127.0.0.1:%ATO_PORT%/"
set "PHP_BIN=%CD%\runtime\php\php.exe"

if not exist "%PHP_BIN%" (
  echo Portable PHP runtime is missing: %PHP_BIN%
  pause
  exit /b 1
)

if not exist data mkdir data
if not exist data\sessions mkdir data\sessions

echo ATO Portable is starting: %ATO_URL%
echo Close this window or press Ctrl-C to stop it.
start "" "%ATO_URL%"
"%PHP_BIN%" -d "session.save_path=%CD%\data\sessions" -S 0.0.0.0:%ATO_PORT% -t "%CD%"
if errorlevel 1 pause
