@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0" || goto :invalid_directory

set "ATO_PORT=8793"
set "ATO_URL=http://127.0.0.1:%ATO_PORT%/"
set "PHP_BIN=%CD%\runtime\php\php.exe"

if not exist "%PHP_BIN%" goto :missing_php

rem Authentication requires PHP's session extension.  Fail with a useful
rem message instead of serving an empty HTTP 500 response when a bad runtime
rem is copied into the portable package.
"%PHP_BIN%" -r "exit(extension_loaded('session')?0:1);" >nul 2>nul
if errorlevel 1 goto :missing_session

if not exist "data\sessions\" mkdir "data\sessions"
if not exist "data\sessions\" goto :invalid_sessions

echo ATO Portable is starting: %ATO_URL%
echo Close this window or press Ctrl-C to stop it.
start "" "%ATO_URL%"
rem PHP's built-in server changes the working directory to the requested
rem script's directory, so a relative session.save_path resolved to
rem api\data\sessions and every login session was silently dropped.  The value
rem must be absolute: %CD% is quoted here and delayed expansion is disabled
rem above, so metacharacters in the folder name still arrive intact.
"%PHP_BIN%" -d "session.save_path=%CD%\data\sessions" -S 0.0.0.0:%ATO_PORT% -t "%CD%"
set "ATO_EXIT_CODE=%ERRORLEVEL%"
if not "%ATO_EXIT_CODE%"=="0" pause
exit /b %ATO_EXIT_CODE%

:missing_php
echo Portable PHP runtime is missing: "%PHP_BIN%"
pause
exit /b 1

:missing_session
echo Portable PHP runtime could not load the session extension.
echo Please re-download or rebuild the portable package.
pause
exit /b 1

:invalid_directory
echo Could not open the portable application directory.
pause
exit /b 1

:invalid_sessions
echo Could not create data\sessions. Extract the package to a writable folder.
pause
exit /b 1
