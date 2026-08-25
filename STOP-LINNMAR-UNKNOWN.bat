@echo off
taskkill /FI "WINDOWTITLE eq Linnmar Unknown Server*" /T /F >nul 2>&1
echo Server stop requested.
