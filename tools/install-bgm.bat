@echo off
rem Copy locally owned BGM tracks into assets\bgm\ using the names expected by assets\bgm\manifest.js.
rem Usage: tools\install-bgm.bat "D:\path\to\your\music"
rem        tools\install-bgm.bat "D:\path\to\your\music" -Move
rem        tools\install-bgm.bat "D:\path\to\your\music" -DryRun
setlocal
set "SCRIPT=%~dp0install-bgm.ps1"
if "%~1"=="" (
  echo Usage: %~nx0 "source folder" [-Move] [-DryRun]
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Source %*
exit /b %ERRORLEVEL%
