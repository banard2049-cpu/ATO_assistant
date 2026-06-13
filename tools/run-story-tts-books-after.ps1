param(
  [Parameter(Mandatory = $true)][int]$WaitPid,
  [Parameter(Mandatory = $true)][string[]]$Books,
  [string]$NodePath = "C:\Users\banard\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
  [int]$DelayMs = 500,
  [int]$Retries = 2,
  [int]$RetryDelayMs = 20000,
  [int]$BanRetryMs = 3600000,
  [string]$OutDir = "story\audio",
  [switch]$NoSplit
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot
$BookList = @($Books | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

Write-Output "Waiting for process $WaitPid before generating $($BookList -join ', ')..."
try {
  Wait-Process -Id $WaitPid -ErrorAction SilentlyContinue
} catch {
  Write-Output "Wait target $WaitPid is not running; starting now."
}

foreach ($book in $BookList) {
  Write-Output "Starting story TTS generation for $book at $(Get-Date -Format s)."
  $arguments = @(
    "tools\generate-story-tts.mjs",
    "--book", $book,
    "--out", $OutDir,
    "--delay-ms", $DelayMs,
    "--retries", $Retries,
    "--retry-delay-ms", $RetryDelayMs,
    "--ban-retry-ms", $BanRetryMs
  )
  if ($NoSplit) {
    $arguments += "--no-split"
  }
  & $NodePath @arguments

  if ($LASTEXITCODE -ne 0) {
    Write-Error "Story TTS generation failed for $book with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
  }
}

Write-Output "Finished story TTS generation for $($BookList -join ', ') at $(Get-Date -Format s)."
