@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist .env call npm run setup
start "Linnmar Unknown Server" cmd /k "npm start"
timeout /t 2 >nul
start http://localhost:3000
