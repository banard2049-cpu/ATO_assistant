@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0\..\.."

set "NODE_BIN="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_BIN set "NODE_BIN=%%N"
if not defined NODE_BIN if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_BIN=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_BIN if exist "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" set "NODE_BIN=%USERPROFILE%\scoop\apps\nodejs\current\node.exe"

if not defined NODE_BIN (
  echo 没有找到 Node.js。请先安装 Node.js 18 或更高版本：
  echo   https://nodejs.org/
  pause
  exit /b 1
)

echo 使用 Node: %NODE_BIN%
echo 正在启动故事书语音工具包，浏览器会自动打开。
echo 关闭此窗口即可停止服务。
echo.
"%NODE_BIN%" "tools\tts-toolkit\server.mjs"
if errorlevel 1 pause
exit /b 0
