param(
  [Parameter(Mandatory = $true)][int]$WaitPid,
  [Parameter(Mandatory = $true)][string]$Book,
  [string]$NodePath = "C:\Users\banard\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
  [int]$DelayMs = 1500,
  [int]$Retries = 2,
  [int]$RetryDelayMs = 20000,
  [int]$BanRetryMs = 3600000
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Output "Waiting for process $WaitPid before generating $Book..."
try {
  Wait-Process -Id $WaitPid -ErrorAction SilentlyContinue
} catch {
  Write-Output "Wait target $WaitPid is not running; starting $Book now."
}

Write-Output "Starting story TTS generation for $Book at $(Get-Date -Format s)."
& $NodePath "tools\generate-story-tts.mjs" `
  --book $Book `
  --delay-ms $DelayMs `
  --retries $Retries `
  --retry-delay-ms $RetryDelayMs `
  --ban-retry-ms $BanRetryMs

exit $LASTEXITCODE
