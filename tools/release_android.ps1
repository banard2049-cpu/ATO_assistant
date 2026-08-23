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
$requiredSigningVariables = @(
  'ATO_ANDROID_KEYSTORE_PATH',
  'ATO_ANDROID_KEYSTORE_PASSWORD',
  'ATO_ANDROID_KEY_ALIAS',
  'ATO_ANDROID_KEY_PASSWORD'
)

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
    $missingSigning = @($requiredSigningVariables | Where-Object {
      [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
    })
    if ($missingSigning.Count -gt 0) {
      throw "Publishing requires a persistent Android signing key. Missing environment variables: $($missingSigning -join ', ')"
    }
    $keystore = [Environment]::GetEnvironmentVariable('ATO_ANDROID_KEYSTORE_PATH')
    if (-not (Test-Path -LiteralPath $keystore -PathType Leaf)) {
      throw "Android release keystore does not exist: $keystore"
    }
  }

  $python = Find-Python
  Write-Host "Building Android release $versionText..."
  $previousPythonUtf8 = [Environment]::GetEnvironmentVariable('PYTHONUTF8', 'Process')
  $previousPythonIoEncoding = [Environment]::GetEnvironmentVariable('PYTHONIOENCODING', 'Process')
  try {
    [Environment]::SetEnvironmentVariable('PYTHONUTF8', '1', 'Process')
    [Environment]::SetEnvironmentVariable('PYTHONIOENCODING', 'utf-8', 'Process')
    Invoke-Checked $python (Join-Path $projectRoot 'tools\export_android.py') '--version' $versionText
  } finally {
    [Environment]::SetEnvironmentVariable('PYTHONUTF8', $previousPythonUtf8, 'Process')
    [Environment]::SetEnvironmentVariable('PYTHONIOENCODING', $previousPythonIoEncoding, 'Process')
  }

  $apk = Join-Path $projectRoot "export\ATO-Assistant-$versionText.apk"
  if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) {
    throw "Android builder did not create $apk"
  }
  $apkInfo = Get-Item -LiteralPath $apk
  if ($apkInfo.Length -le 0) { throw 'Android builder created an empty APK.' }

  $hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
  $checksum = "$apk.sha256"
  Set-Content -LiteralPath $checksum -Value "$hash  $($apkInfo.Name)" -Encoding utf8
  Write-Host "APK: $apk"
  Write-Host "SHA-256: $hash"

  if (-not $Publish) {
    Write-Host 'Local release build complete. Nothing was uploaded.'
    return
  }

  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $gh) { throw 'GitHub CLI (gh) is required for -Publish.' }
  Invoke-Checked $gh.Source 'auth' 'status'

  & $gh.Source release view $releaseTag '--json' 'tagName' 2>$null | Out-Null
  $releaseExists = $LASTEXITCODE -eq 0
  if ($releaseExists) {
    Invoke-Checked $gh.Source 'release' 'upload' $releaseTag $apk $checksum '--clobber'
  } else {
    $arguments = @(
      'release', 'create', $releaseTag, $apk, $checksum,
      '--title', "ATO Assistant $versionText",
      '--target', (git rev-parse HEAD),
      '--generate-notes'
    )
    if ($Draft) { $arguments += '--draft' }
    if ($Prerelease) { $arguments += '--prerelease' }
    # The Portable workflow can create the same tag release concurrently.
    & $gh.Source @arguments
    if ($LASTEXITCODE -ne 0) {
      & $gh.Source release view $releaseTag '--json' 'tagName' 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "Could not create or find GitHub Release $releaseTag."
      }
      Invoke-Checked $gh.Source 'release' 'upload' $releaseTag $apk $checksum '--clobber'
    }
  }
  Write-Host "GitHub Release ready: $releaseTag"
} finally {
  Pop-Location
}
