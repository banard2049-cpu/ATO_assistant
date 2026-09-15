<#
.SYNOPSIS
  Copy locally owned BGM tracks into assets/bgm/ using the names expected by assets/bgm/manifest.js.

.DESCRIPTION
  The player only looks for exact filenames inside assets/bgm/. This helper matches files in a
  source folder against the manifest and copies (or moves) the preferred candidate of
  each track: the first entry listed for that track in manifest.js wins, so a folder
  holding both .mp3 and .ogg copies yields one file per track instead of two.

  Tracks with no candidate at all are reported and make the script exit non-zero.

  ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less UTF-8 scripts as ANSI,
  which corrupts non-ASCII text badly enough to swallow code that follows a comment.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\install-bgm.ps1 -Source D:\desktop\mp3
  powershell -ExecutionPolicy Bypass -File tools\install-bgm.ps1 -Source D:\desktop\mp3 -Move
  powershell -ExecutionPolicy Bypass -File tools\install-bgm.ps1 -Source D:\desktop\mp3 -DryRun

.EXAMPLE
  tools\install-bgm.bat D:\desktop\mp3
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Source,

  [string]$Destination,

  [switch]$Move,

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
if (-not $Destination) { $Destination = Join-Path $root 'assets\bgm' }
$manifestPath = Join-Path $Destination 'manifest.js'

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
  throw "Source folder not found: $Source"
}
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Manifest not found: $manifestPath"
}
if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
  New-Item -ItemType Directory -Path $Destination | Out-Null
}

# Keep the manifest's own order: the first candidate listed for a track is the
# preferred one (.mp3 today, .ogg as fallback).
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
$seen = @{}
$order = New-Object System.Collections.ArrayList
$stems = @{}
foreach ($match in [regex]::Matches($manifest, '"([A-Za-z0-9_.\-]+\.(?:ogg|mp3))"')) {
  $name = $match.Groups[1].Value
  if ($seen.ContainsKey($name)) { continue }
  $seen[$name] = $true
  [void]$order.Add($name)
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($name)
  if (-not $stems.ContainsKey($stem)) { $stems[$stem] = New-Object System.Collections.ArrayList }
  [void]$stems[$stem].Add($name)
}

if ($order.Count -eq 0) {
  throw 'No filenames parsed from manifest.js; the manifest format may have changed.'
}

$handled = @()
$skipped = @()
$missing = @()
$stemsSeen = @{}

foreach ($name in $order) {
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($name)
  if ($stemsSeen.ContainsKey($stem)) { continue }
  $stemsSeen[$stem] = $true

  $chosen = ''
  foreach ($candidate in $stems[$stem]) {
    if (Test-Path -LiteralPath (Join-Path $Source $candidate) -PathType Leaf) { $chosen = $candidate; break }
  }
  if (-not $chosen) {
    $missing += $stems[$stem][0]
    continue
  }

  $from = Join-Path $Source $chosen
  $to = Join-Path $Destination $chosen
  if ((Test-Path -LiteralPath $to -PathType Leaf) -and -not $Move) {
    if ((Get-Item -LiteralPath $from).Length -eq (Get-Item -LiteralPath $to).Length) {
      $skipped += $chosen
      continue
    }
  }
  if ($DryRun) {
    Write-Host ("[dry-run] {0}" -f $chosen)
    $handled += $chosen
    continue
  }
  if ($Move) {
    Move-Item -LiteralPath $from -Destination $to -Force
  } else {
    Copy-Item -LiteralPath $from -Destination $to -Force
  }
  Write-Host ("{0} {1}" -f $(if ($Move) { 'moved ' } else { 'copied' }), $chosen)
  $handled += $chosen
}

$totalMb = 0
Get-ChildItem -LiteralPath $Destination -File | Where-Object { $_.Extension -eq '.ogg' -or $_.Extension -eq '.mp3' } | ForEach-Object {
  $totalMb += $_.Length / 1MB
}

Write-Host ''
Write-Host ("Handled: {0}   Already in place: {1}   Total audio in assets/bgm/: {2:N1} MB" -f $handled.Count, $skipped.Count, $totalMb)

if ($missing.Count) {
  Write-Host ''
  Write-Host 'Missing tracks expected by the manifest (those stages stay silent):'
  $missing | ForEach-Object { Write-Host ("  {0}" -f $_) }
  exit 1
}

Write-Host ''
Write-Host 'Done. Start the app and use the music control in the console top bar.'
Write-Host 'Tip: convert .ogg to .mp3 with ffmpeg -i in.ogg -codec:a libmp3lame -q:a 2 out.mp3'
