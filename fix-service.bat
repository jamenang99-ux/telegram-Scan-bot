@echo off
cd /d "D:\SCAN bot"
echo === stop ScanBot ===
net stop ScanBot 2>nul
timeout /t 2 /nobreak >nul
echo === start ScanBot ===
net start ScanBot 2>nul
net continue ScanBot 2>nul
timeout /t 5 /nobreak >nul
echo === is node running? ===
tasklist | findstr /i "node.exe"
if errorlevel 1 (
  echo NODE MISSING via service - launching detached fallback
  start "" node "D:\SCAN bot\bot.js"
)
echo === service state ===
sc query ScanBot