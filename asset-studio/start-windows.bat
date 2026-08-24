@echo off
setlocal
cd /d "%~dp0"
set "PYTHON_BIN="

rem Optional explicit override, useful when Python is provided by Conda.
if defined ATO_PYTHON_BIN if exist "%ATO_PYTHON_BIN%" call :try_python "%ATO_PYTHON_BIN%"

rem Prefer the Python launcher when it is installed.
if not defined PYTHON_BIN where py >nul 2>nul
if not defined PYTHON_BIN if not errorlevel 1 for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do call :try_python "%%P"

rem Also search an activated Conda environment and common Conda installs.
if not defined PYTHON_BIN if defined CONDA_PREFIX call :try_python "%CONDA_PREFIX%\python.exe"
if not defined PYTHON_BIN if exist "%USERPROFILE%\anaconda3\python.exe" call :try_python "%USERPROFILE%\anaconda3\python.exe"
if not defined PYTHON_BIN if exist "%USERPROFILE%\miniconda3\python.exe" call :try_python "%USERPROFILE%\miniconda3\python.exe"
if not defined PYTHON_BIN if exist "D:\anaconda\python.exe" call :try_python "D:\anaconda\python.exe"
if not defined PYTHON_BIN if exist "D:\miniconda3\python.exe" call :try_python "D:\miniconda3\python.exe"
if not defined PYTHON_BIN for /d %%D in ("%USERPROFILE%\anaconda3\envs\*" "%USERPROFILE%\miniconda3\envs\*" "D:\anaconda\envs\*" "D:\miniconda3\envs\*") do if not defined PYTHON_BIN call :try_python "%%~fD\python.exe"

if not defined PYTHON_BIN (
  echo 需要 Python 3.11 或更高版本。请先从 python.org 安装。
  pause
  exit /b 1
)
if not exist .venv "%PYTHON_BIN%" -m venv .venv
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
exit /b 0

:try_python
if not exist "%~1" exit /b 0
"%~1" -c "import sys; raise SystemExit(0 if sys.version_info >= (3,11) else 1)" >nul 2>nul
if not errorlevel 1 set "PYTHON_BIN=%~1"
exit /b 0
