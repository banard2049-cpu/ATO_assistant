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
rem must be absolute, and it must NOT be passed through -d: PHP parses the value
rem of -d as INI text, so a folder name containing a space, & ( ) ! [ ] ...
rem (very common: "ATO-Assistant-Portable-1.3.1-windows-x64 (1)") truncates the
rem value at that character -- session.save_path falls back to a path that does
rem not exist, session_start() fails and every login session is dropped again.
rem Instead, PHP writes the setting into a generated INI file and the server is
rem started with -c pointing at it: a value that lives in an INI file only goes
rem through the INI parser, never through command-line parsing.
rem The generated file is written BY PHP (getcwd()), so the path never appears on
rem a command line and cmd's quoting rules never see it; the php.ini PHP would
rem load anyway is copied in first so extensions and other settings survive.
rem post_max_size must stay ABOVE the API's own body cap (api/campaign-state.php
rem answers 413 PAYLOAD_TOO_LARGE above 6 MiB): a body over post_max_size is
rem dropped during PHP request startup, before any script runs, and PHP then
rem flushes an HTML warning with a 200 status instead of the API's structured 413.
rem Raising it to 12M leaves the API's own check as the one that fires.
rem Only *display* is turned off (display_errors / display_startup_errors), so such
rem a startup warning can never end up in the response body; logging stays ON
rem (log_errors = 1) and no error_log is set, so PHP writes the warning to stderr
rem -- i.e. into this launcher's own console window, which is where a local user
rem looks when something breaks.  With both off, a fatal error would leave no
rem trace anywhere and the failure would be an undebuggable blank 500.
rem The file lives in the writable data\ folder, which router.php keeps off HTTP.
rem The built-in server would also publish data\ (account password hashes,
rem complete campaign saves, sessions and backups) as static files, so every
rem launch passes router.php, which rejects those private requests.  Like the
rem session path it must be absolute: PHP resolves the router after its own
rem working directory change.
set "ATO_SESSION_INI=%CD%\data\ato-session.ini"
"%PHP_BIN%" -r "$d=getcwd().'/data/ato-session.ini';$q=chr(34);$s=php_ini_loaded_file();$x=['session.save_path = '.$q.str_replace(chr(92),'/',getcwd()).'/data/sessions'.$q,'post_max_size = 12M','display_errors = 0','log_errors = 1','display_startup_errors = 0'];file_put_contents($d,($s?file_get_contents($s):'').implode(PHP_EOL,$x).PHP_EOL);"
if not exist "%ATO_SESSION_INI%" goto :invalid_session_ini
"%PHP_BIN%" -c "%ATO_SESSION_INI%" -S 0.0.0.0:%ATO_PORT% -t "%CD%" "%CD%\router.php"
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

:invalid_session_ini
echo Could not write data\ato-session.ini. Extract the package to a writable folder.
pause
exit /b 1
