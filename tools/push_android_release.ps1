[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-.][0-9A-Za-z.-]+)?$')]
  [string]$Version,

  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string]$Remote = 'origin',

  [switch]$CommitAll,
  [string]$CommitMessage = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$versionText = $Version -replace '^v', ''
$tag = "v$versionText"

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed with exit code $LASTEXITCODE`: git $($Arguments -join ' ')"
  }
}

Push-Location $projectRoot
try {
  if (-not (Test-Path -LiteralPath '.git')) {
    throw 'Run this script from a Git checkout.'
  }
  if (-not (Test-Path -LiteralPath '.github\workflows\android-release.yml')) {
    throw 'Android release workflow is missing.'
  }
  if (-not (Test-Path -LiteralPath '.github\workflows\portable-release.yml')) {
    throw 'Portable release workflow is missing.'
  }

  & git remote get-url $Remote 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Git remote does not exist: $Remote" }

  if ($CommitAll) {
    Invoke-Git add --all

    $powerShell = (Get-Process -Id $PID).Path
    & $powerShell -NoProfile -File (Join-Path $projectRoot 'tools\audit-public-release.ps1') -Staged
    if ($LASTEXITCODE -ne 0) { throw 'Public release audit failed.' }

    Invoke-Git diff --cached --check
    & git diff --cached --quiet
    if ($LASTEXITCODE -eq 1) {
      $message = if ($CommitMessage) { $CommitMessage } else { "release: $tag" }
      Invoke-Git commit -m $message
    } elseif ($LASTEXITCODE -ne 0) {
      throw 'Could not inspect staged changes.'
    }
  }

  $dirty = @(git status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the Git worktree.' }
  if ($dirty.Count -gt 0) {
    throw 'The Git worktree is dirty. Commit the changes first or rerun with -CommitAll.'
  }

  $branch = (git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
    throw 'A checked-out branch is required; detached HEAD is not supported.'
  }

  $remoteTag = @(git ls-remote --tags $Remote "refs/tags/$tag")
  if ($LASTEXITCODE -ne 0) { throw "Could not query remote $Remote." }
  if ($remoteTag.Count -gt 0) {
    throw "Tag $tag already exists on $Remote. Use a new version number."
  }

  & git rev-parse --verify --quiet "refs/tags/$tag" | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $tagCommit = (git rev-list -n 1 $tag).Trim()
    $headCommit = (git rev-parse HEAD).Trim()
    if ($tagCommit -ne $headCommit) {
      throw "Local tag $tag points to a different commit. Use a new version number."
    }
    Write-Host "Reusing local tag $tag on the current commit."
  } else {
    Invoke-Git tag --annotate $tag --message "ATO Assistant $versionText"
  }

  Write-Host "Pushing $branch and $tag to $Remote..."
  Invoke-Git push --atomic $Remote "HEAD:refs/heads/$branch" "refs/tags/${tag}:refs/tags/${tag}"
  Write-Host "Release trigger pushed: $tag"
  Write-Host 'Open the repository Actions or Releases page to follow the build.'
} finally {
  Pop-Location
}
