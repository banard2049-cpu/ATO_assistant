$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$port = 8765
$python = "C:\Users\banard\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
    Start-Process -FilePath $python -ArgumentList @("-m", "http.server", "$port", "--bind", "127.0.0.1") -WorkingDirectory $root -WindowStyle Hidden
    Start-Sleep -Milliseconds 800
}

Start-Process "http://127.0.0.1:$port/tools/map-faction-labeler/"
