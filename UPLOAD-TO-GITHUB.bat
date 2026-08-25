@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "LOG=%~dp0github-upload.log"
>"%LOG%" echo Linnmar Unknown GitHub upload log - %date% %time%
call :main >>"%LOG%" 2>&1
set "RC=%ERRORLEVEL%"

echo.
echo ===============================================
if "%RC%"=="0" (
  echo            UPLOAD FINISHED SUCCESSFULLY
) else (
  echo                 UPLOAD FAILED
)
echo ===============================================
echo.
echo A full copyable log is here:
echo %LOG%
echo.
if exist "%LOG%" type "%LOG%"
echo.
if not "%RC%"=="0" (
  echo You can copy the error above, or open github-upload.log.
  echo Nothing was deleted from your project.
)
pause
exit /b %RC%

:main
echo Linnmar Unknown - GitHub uploader
echo Folder: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git is not installed.
  echo Install Git for Windows from: https://git-scm.com/download/win
  echo Then run this file again.
  exit /b 1
)

git --version

where gh >nul 2>nul
if errorlevel 1 (
  echo.
  echo GitHub CLI is not installed.
  echo Install it from: https://cli.github.com/
  echo.
  echo You can also install it with Windows Terminal:
  echo winget install --id GitHub.cli -e
  exit /b 1
)

gh --version

echo.
echo Checking GitHub login...
gh auth status
if errorlevel 1 (
  echo.
  echo Starting GitHub browser login...
  gh auth login --hostname github.com --git-protocol https --web
  if errorlevel 1 (
    echo ERROR: GitHub login failed or was cancelled.
    exit /b 1
  )
)

echo.
set "REPO_NAME="
set /p "REPO_NAME=GitHub repository name [linnmar-unknown]: "
if not defined REPO_NAME set "REPO_NAME=linnmar-unknown"

set "VISIBILITY=private"
echo.
echo Choose repository visibility:
echo   1. Private (recommended)
echo   2. Public
set "CHOICE="
set /p "CHOICE=Enter 1 or 2 [1]: "
if "%CHOICE%"=="2" set "VISIBILITY=public"

set "CONFIRM="
echo.
echo Repository: %REPO_NAME%
echo Visibility: %VISIBILITY%
echo.
set /p "CONFIRM=Create/upload this repository? [Y/N]: "
if /I not "%CONFIRM%"=="Y" (
  echo Cancelled by user.
  exit /b 0
)

if exist ".env" echo NOTE: .env exists locally and is ignored by Git.
if exist "data" echo NOTE: data\ exists locally and is ignored by Git.
if exist "uploads" echo NOTE: uploads\ exists locally and is ignored by Git.

if not exist ".gitignore" (
  echo ERROR: .gitignore is missing. Stopping to avoid uploading local data.
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo Initializing Git repository...
  git init
  if errorlevel 1 exit /b 1
)

git branch -M main

echo.
echo Staging project files...
git add .
if errorlevel 1 exit /b 1

for /f "delims=" %%F in ('git diff --cached --name-only') do call :check_file "%%F"
if defined BLOCKED (
  echo ERROR: A protected file is staged: %BLOCKED%
  echo Review .gitignore before continuing.
  git reset
  exit /b 1
)

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Initial Linnmar Unknown deployment"
  if errorlevel 1 exit /b 1
) else (
  echo No new changes to commit.
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo.
  echo Creating GitHub repository and pushing...
  gh repo create "%REPO_NAME%" --%VISIBILITY% --source=. --remote=origin --push --description "Linnmar Unknown chat platform"
  if errorlevel 1 exit /b 1
) else (
  echo Existing origin found. Pushing main...
  git push -u origin main
  if errorlevel 1 exit /b 1
)

echo.
echo Repository uploaded successfully.
for /f "delims=" %%U in ('gh repo view --json url --jq .url 2^>nul') do echo GitHub URL: %%U
exit /b 0

:check_file
set "F=%~1"
set "T=!F:/=\!"
if /I "!T!"==".env" set "BLOCKED=!F!"
if /I "!T:~0,5!"=="data\" set "BLOCKED=!F!"
if /I "!T:~0,8!"=="uploads\" set "BLOCKED=!F!"
if /I "!T:~0,12!"=="node_modules\" set "BLOCKED=!F!"
exit /b 0
