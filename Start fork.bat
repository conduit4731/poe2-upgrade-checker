@echo off
rem Starts this local fork of PoE Upgrade Checker from source, with the same data as the installed app
rem (%APPDATA%\PoE2 Upgrade Checker). Only one of the two can run at a time.
cd /d "%~dp0"
tasklist /fi "imagename eq PoE Upgrade Checker.exe" | find /i "PoE Upgrade Checker.exe" >nul && goto running
tasklist | find /i "PoE-Upgrade-Checker-Portable" >nul && goto running
if not exist node_modules\electron\dist\electron.exe (
  echo Electron is missing. Run "npm install" in this folder first (needs Node.js).
  pause
  exit /b 1
)
start "" node_modules\electron\dist\electron.exe .
exit /b 0

:running
echo The original PoE Upgrade Checker is still running.
echo Quit it first (tray icon - Quit), then start this again.
pause
exit /b 1
