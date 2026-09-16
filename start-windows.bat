@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
if not exist "data\sessions\" mkdir "data\sessions"
if not exist "data\sessions\" (
  echo 无法创建 data\sessions。请把本目录放到可写位置后再启动。
  pause
  exit /b 1
)
set "ATO_URL=http://127.0.0.1:8793/"
set "PHP_BIN="
set "DOCKER_BIN="

if defined ATO_PHP_BIN call :try_php "%ATO_PHP_BIN%"
if defined CONDA_PREFIX call :try_php "%CONDA_PREFIX%\php.exe"
if defined CONDA_PREFIX call :try_php "%CONDA_PREFIX%\Library\bin\php.exe"
if not defined PHP_BIN for /f "delims=" %%P in ('where php 2^>nul') do call :try_php "%%P"

call :scan_conda_root "%USERPROFILE%\anaconda3\envs"
call :scan_conda_root "%USERPROFILE%\miniconda3\envs"
call :scan_conda_root "%USERPROFILE%\miniforge3\envs"
call :scan_conda_root "%USERPROFILE%\mambaforge\envs"
call :scan_conda_root "%USERPROFILE%\.conda\envs"
call :scan_conda_root "%ProgramData%\anaconda3\envs"
call :scan_conda_root "%ProgramData%\miniconda3\envs"
if exist "%USERPROFILE%\.conda\environments.txt" for /f "usebackq delims=" %%E in ("%USERPROFILE%\.conda\environments.txt") do (
  call :try_php "%%E\php.exe"
  call :try_php "%%E\Library\bin\php.exe"
)

call :try_php "C:\php\php.exe"
call :try_php "%ProgramFiles%\PHP\php.exe"
call :try_php "%ProgramFiles(x86)%\PHP\php.exe"
call :try_php "%LOCALAPPDATA%\Programs\PHP\php.exe"
call :try_php "%USERPROFILE%\scoop\apps\php\current\php.exe"
call :try_php "%ChocolateyInstall%\lib\php\tools\php.exe"
call :try_php "C:\xampp\php\php.exe"
call :try_php "C:\laragon\bin\php\php.exe"
if not defined PHP_BIN for /d %%D in ("C:\laragon\bin\php\php-*") do call :try_php "%%~fD\php.exe"
if not defined PHP_BIN for /d %%D in ("C:\wamp64\bin\php\php*") do call :try_php "%%~fD\php.exe"
if not defined PHP_BIN for /d %%D in ("C:\tools\php*") do call :try_php "%%~fD\php.exe"
if defined PHP_BIN goto run_php

for /f "delims=" %%D in ('where docker 2^>nul') do if not defined DOCKER_BIN set "DOCKER_BIN=%%D"
if not defined DOCKER_BIN if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" set "DOCKER_BIN=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not defined DOCKER_BIN (
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  ) else (
    echo 没有找到 PHP 8.1+ 或 Docker Desktop。
    echo 请安装其中之一后再次双击本脚本：
    echo   PHP: https://windows.php.net/download/
    echo   Docker Desktop: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
  )
)

"%DOCKER_BIN%" info >nul 2>nul
if errorlevel 1 (
  echo 正在等待 Docker Desktop 启动……
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  for /l %%I in (1,1,60) do (
    "%DOCKER_BIN%" info >nul 2>nul
    if not errorlevel 1 goto run_docker
    timeout /t 2 /nobreak >nul
  )
  echo Docker Desktop 未能启动，请启动后重试。
  pause
  exit /b 1
)

:run_docker
echo 正在启动 ATO_assistant（首次运行会下载 PHP 镜像）……
"%DOCKER_BIN%" compose up -d ato
if errorlevel 1 (
  echo 启动失败，请检查 Docker Desktop 的错误信息。
  pause
  exit /b 1
)
start "" "http://127.0.0.1:11451/"
echo ATO_assistant 已启动：http://127.0.0.1:11451/
echo 以后可在本目录运行 docker compose down 停止。
pause
exit /b 0

:run_php
echo ATO_assistant 正在启动：%ATO_URL%
for /f "delims=" %%V in ('"%PHP_BIN%" -r "echo PHP_VERSION;"') do set "PHP_VERSION=%%V"
echo 使用 PHP：%PHP_BIN%（%PHP_VERSION%）
echo 关闭此窗口或按 Ctrl-C 即可停止。
start "" "%ATO_URL%"
rem The built-in server would publish data\ (account hashes, campaign saves,
rem sessions, backups) as static files; router.php rejects those requests.
rem session.save_path must be absolute (PHP's built-in server chdir's to the
rem requested script), and it must NOT go through -d: PHP parses the value of -d
rem as INI text, so a folder name with a space, & ( ) ! [ ] (very common:
rem "ATO_assistant (1)") truncates the value there -- session_start() then fails
rem and every login is dropped.  PHP therefore writes the setting into a
rem generated INI file (path derived by getcwd(), so it never appears on a
rem command line) and the server starts with -c pointing at it; the php.ini PHP
rem would load anyway is copied in first, so extensions and settings survive.
rem post_max_size must stay ABOVE the API's own body cap (api/campaign-state.php
rem answers 413 PAYLOAD_TOO_LARGE above 6 MiB): a body over post_max_size is
rem dropped during PHP request startup, before any script runs, and PHP then
rem flushes an HTML warning with a 200 status instead of the API's structured 413.
rem Only *display* is turned off (display_errors / display_startup_errors), so such
rem a startup warning can never end up in the response body; logging stays ON
rem (log_errors = 1) and no error_log is set, so PHP writes the warning to stderr
rem -- i.e. into this launcher's own console window, which is where a local user
rem looks when something breaks.  With both off, a fatal error would leave no
rem trace anywhere and the failure would be an undebuggable blank 500.
rem The file sits in data\, which router.php keeps off HTTP.
set "ATO_SESSION_INI=%CD%\data\ato-session.ini"
"%PHP_BIN%" -r "$d=getcwd().'/data/ato-session.ini';$q=chr(34);$s=php_ini_loaded_file();$x=['session.save_path = '.$q.str_replace(chr(92),'/',getcwd()).'/data/sessions'.$q,'post_max_size = 12M','display_errors = 0','log_errors = 1','display_startup_errors = 0'];file_put_contents($d,($s?file_get_contents($s):'').implode(PHP_EOL,$x).PHP_EOL);"
if not exist "%ATO_SESSION_INI%" goto :session_ini_failed
"%PHP_BIN%" -c "%ATO_SESSION_INI%" -S 0.0.0.0:8793 -t "%CD%" "%CD%\router.php"
if errorlevel 1 pause
exit /b 0

:session_ini_failed
echo 无法写入 data\ato-session.ini。请把本目录放到可写位置后再启动。
pause
exit /b 1

:try_php
if defined PHP_BIN exit /b 0
if "%~1"=="" exit /b 0
if not exist "%~1" exit /b 0
"%~1" -r "exit(version_compare(PHP_VERSION, '8.1.0', '>=') ? 0 : 1);" >nul 2>nul
if not errorlevel 1 set "PHP_BIN=%~1"
exit /b 0

:scan_conda_root
if defined PHP_BIN exit /b 0
if "%~1"=="" exit /b 0
if not exist "%~1" exit /b 0
for /d %%E in ("%~1\*") do call :try_php "%%~fE\php.exe"
for /d %%E in ("%~1\*") do call :try_php "%%~fE\Library\bin\php.exe"
exit /b 0
