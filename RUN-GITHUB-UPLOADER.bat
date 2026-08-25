@echo off
set "HERE=%~dp0"
start "Linnmar Unknown - GitHub Uploader" cmd /k call "%HERE%UPLOAD-TO-GITHUB.bat"
exit /b 0
