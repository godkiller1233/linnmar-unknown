$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot 'github-upload.log'
Start-Transcript -Path $log -Append | Out-Null
try {
  Write-Host "Linnmar Unknown - GitHub uploader" -ForegroundColor Cyan
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is not installed. Install: https://git-scm.com/download/win" }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI is not installed. Install: https://cli.github.com/" }
  git --version
  gh --version
  gh auth status
  if ($LASTEXITCODE -ne 0) { gh auth login --hostname github.com --git-protocol https --web }
  $repo = Read-Host 'Repository name [linnmar-unknown]'; if ([string]::IsNullOrWhiteSpace($repo)) { $repo='linnmar-unknown' }
  $vis = Read-Host 'Visibility: private/public [private]'; if ([string]::IsNullOrWhiteSpace($vis)) { $vis='private' }
  if ($vis -notin @('private','public')) { throw 'Visibility must be private or public.' }
  $confirm = Read-Host "Create $repo as $vis and push? [Y/N]"; if ($confirm -notmatch '^[Yy]$') { Write-Host 'Cancelled.'; exit 0 }
  git init
  git branch -M main
  git add .
  $staged = git diff --cached --name-only
  foreach ($f in $staged) {
    if ($f -eq '.env' -or $f -match '^(data|uploads|node_modules)/') { throw "Protected file staged: $f" }
  }
  if ($staged) { git commit -m 'Initial Linnmar Unknown deployment' }
  $remote = git remote get-url origin 2>$null
  if (-not $remote) { gh repo create $repo --$vis --source=. --remote=origin --push --description 'Linnmar Unknown chat platform' }
  else { git push -u origin main }
  Write-Host 'UPLOAD COMPLETE' -ForegroundColor Green
  gh repo view --web
} catch { Write-Host "UPLOAD FAILED: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
finally { Stop-Transcript | Out-Null; Read-Host 'Press Enter to close' }
