[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:[-.][0-9A-Za-z.-]+)?$')]
  [string]$Version,

  [string]$Tag = '',
  [switch]$Publish,
  [switch]$Draft,
  [switch]$Prerelease,
  [switch]$AllowDirty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$versionText = $Version -replace '^v', ''
$releaseTag = if ($Tag) { $Tag } else { "v$versionText" }
$portableTargets = @('windows-x64', 'macos-arm64', 'macos-x64')

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

function Find-Python {
  $localPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
  if (Test-Path -LiteralPath $localPython) { return $localPython }
  foreach ($name in @('python3', 'python')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
  }
  throw 'Python 3 was not found.'
}

function Ensure-GitHubRelease {
  param([Parameter(Mandatory = $true)][string]$GhPath)

  & $GhPath release view $releaseTag '--json' 'tagName' 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { return }

  $arguments = @(
    'release', 'create', $releaseTag,
    '--title', "ATO Assistant $versionText",
    '--target', (git rev-parse HEAD),
    '--generate-notes'
  )
  if ($Draft) { $arguments += '--draft' }
  if ($Prerelease) { $arguments += '--prerelease' }

  # Android and Portable workflows can start together for the same tag. If
  # another job creates the release between view and create, use that release.
  & $GhPath @arguments
  if ($LASTEXITCODE -ne 0) {
    & $GhPath release view $releaseTag '--json' 'tagName' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Could not create or find GitHub Release $releaseTag."
    }
  }
}

Push-Location $projectRoot
try {
  if (-not (Test-Path -LiteralPath '.git')) {
    throw 'Run this script from a Git checkout.'
  }

  $dirty = @(git status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the Git worktree.' }
  if ($dirty.Count -gt 0 -and (-not $AllowDirty -or $Publish)) {
    throw 'The Git worktree is dirty. Commit the release sources first. Use -AllowDirty only for a local, unpublished test build.'
  }

  Write-Host 'Auditing public release inputs...'
  $powerShell = (Get-Process -Id $PID).Path
  Invoke-Checked $powerShell '-NoProfile' '-File' (Join-Path $projectRoot 'tools\audit-public-release.ps1')

  if ($Publish) {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) { throw 'GitHub CLI (gh) is required for -Publish.' }
    Invoke-Checked $gh.Source 'auth' 'status'
  }

  $python = Find-Python
  $arguments = @((Join-Path $projectRoot 'tools\export_portable.py'), '--version', $versionText)
  foreach ($target in $portableTargets) { $arguments += @('--target', $target) }
  Write-Host "Building Portable release $versionText..."
  $previousPythonUtf8 = [Environment]::GetEnvironmentVariable('PYTHONUTF8', 'Process')
  $previousPythonIoEncoding = [Environment]::GetEnvironmentVariable('PYTHONIOENCODING', 'Process')
  try {
    [Environment]::SetEnvironmentVariable('PYTHONUTF8', '1', 'Process')
    [Environment]::SetEnvironmentVariable('PYTHONIOENCODING', 'utf-8', 'Process')
    Invoke-Checked $python @arguments
  } finally {
    [Environment]::SetEnvironmentVariable('PYTHONUTF8', $previousPythonUtf8, 'Process')
    [Environment]::SetEnvironmentVariable('PYTHONIOENCODING', $previousPythonIoEncoding, 'Process')
  }

  $exportRoot = Join-Path $projectRoot 'export'
  $artifacts = @(
    (Join-Path $exportRoot "ATO-Assistant-Portable-$versionText-windows-x64.zip"),
    (Join-Path $exportRoot "ATO-Assistant-Portable-$versionText-macos-arm64.zip"),
    (Join-Path $exportRoot "ATO-Assistant-Portable-$versionText-macos-x64.zip")
  )
  foreach ($artifact in $artifacts) {
    if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
      throw "Portable builder did not create $artifact"
    }
    if ((Get-Item -LiteralPath $artifact).Length -le 0) {
      throw "Portable builder created an empty archive: $artifact"
    }
    Write-Host "Portable: $artifact"
  }

  if (-not $Publish) {
    Write-Host 'Local Portable release build complete. Nothing was uploaded.'
    return
  }

  Ensure-GitHubRelease -GhPath $gh.Source
  $uploadArguments = @('release', 'upload', $releaseTag) + $artifacts + @('--clobber')
  Invoke-Checked $gh.Source @uploadArguments
  Write-Host "GitHub Release ready: $releaseTag"
} finally {
  Pop-Location
}
