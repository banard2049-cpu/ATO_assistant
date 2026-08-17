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
  'data/',
  'logs/',
  'log/',
  'story/data/',
  'story/data/storybook-data.js',
  'story/data/entity-index.json',
  'story/audio-packs/',
  'story/audio-packs/audio/manifest.js',
  'story/audio-packs/audio/manifest.json',
  'supplements/',
  'map/images/',
  'map/tokens/',
  'record/assets/',
  'story/images/battles/',
  'technology/images/'
)

$blockedPathPatterns = @(
  'assets/*',
  'tools/bgstorybook-*.json',
  'tools/*-storybook-diff.json',
  'tools/ocr-*.json',
  'tools/fsadf.txt',
  'tools/exploration-effect-automation-report.csv',
  'tools/exploration-effect-automation-report.md'
)

$allowedPaths = @(
  'assets/exploration-card-rules.js',
  'assets/exploration-card-tags.js',
  'assets/page-focus-router.js',
  'assets/story-doom-card-data.js',
  'tools/packaging/android/app/src/main/res/drawable-nodpi/app_icon.jpg'
)

$blockedNamePatterns = @(
  'php_errors.log',
  'error_log',
  '*.backup',
  '*.backup.*',
  '*.bak',
  '*.atoback',
  '*.atoback.partial',
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
  $allowed = $false
  foreach ($allowedPath in $allowedPaths) {
    if ($normalized.Equals($allowedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      $allowed = $true
      break
    }
  }

  if ($allowed) {
    continue
  }

  $extension = [System.IO.Path]::GetExtension($normalized).ToLowerInvariant()
  $blockedByExtension = $mediaExtensions -contains $extension
  $blockedByPath = $false
  foreach ($blockedPath in $blockedPaths) {
    if ($normalized.StartsWith($blockedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      $blockedByPath = $true
      break
    }
  }

  foreach ($pattern in $blockedPathPatterns) {
    if ($normalized -like $pattern) {
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
