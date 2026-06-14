param(
  [switch]$Staged
)

$ErrorActionPreference = 'Stop'

$mediaExtensions = @(
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.svg',
  '.pdf', '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.mp4', '.webm', '.mov',
  '.zip', '.7z', '.rar', '.ttf', '.otf', '.woff', '.woff2'
)

$blockedPaths = @(
  'assets/',
  'data/',
  'logs/',
  'log/',
  'story/data/',
  'story/data/storybook-data.js',
  'story/data/entity-index.json',
  'story/audio-packs/',
  'story/audio-packs/audio/manifest.js',
  'story/audio-packs/audio/manifest.json',
  'map/images/',
  'map/tokens/',
  'record/assets/',
  'story/images/battles/',
  'technology/images/',
  'tools/bgstorybook-',
  'tools/c2-storybook-diff.json',
  'tools/c4-storybook-diff.json',
  'tools/c5-storybook-diff.json'
)

$blockedNamePatterns = @(
  'php_errors.log',
  'error_log',
  '*.backup',
  '*.backup.*',
  '*.bak',
  '*.tmp',
  '*.tmp.*',
  '*.log',
  '*.lock'
)

if (-not (Test-Path -LiteralPath '.git')) {
  Write-Host 'No Git repository exists yet. Run this audit again after git init and git add.' -ForegroundColor Yellow
  exit 0
}

$files = if ($Staged) {
  @(git diff --cached --name-only --diff-filter=ACMR)
} else {
  @(git ls-files)
}

$violations = foreach ($file in $files) {
  $normalized = $file.Replace('\', '/')
  $extension = [System.IO.Path]::GetExtension($normalized).ToLowerInvariant()
  $blockedByExtension = $mediaExtensions -contains $extension
  $blockedByPath = $false
  foreach ($blockedPath in $blockedPaths) {
    if ($normalized.StartsWith($blockedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      $blockedByPath = $true
      break
    }
  }

  $blockedByName = $false
  $leafName = [System.IO.Path]::GetFileName($normalized)
  foreach ($pattern in $blockedNamePatterns) {
    if ($leafName -like $pattern) {
      $blockedByName = $true
      break
    }
  }

  if ($blockedByExtension -or $blockedByPath -or $blockedByName) {
    $normalized
  }
}

if ($violations.Count -gt 0) {
  Write-Host 'Blocked copyrighted/private resources found in Git:' -ForegroundColor Red
  $violations | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "Audit passed: checked $($files.Count) Git files." -ForegroundColor Green
