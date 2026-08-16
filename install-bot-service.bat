@echo off
cd /d "D:\SCAN bot"
echo === nssm install ScanBot ===
nssm install ScanBot "C:\Program Files\nodejs\node.exe" "D:\SCAN bot\bot.js"
nssm set ScanBot AppDirectory "D:\SCAN bot"
nssm set ScanBot DisplayName "SCAN Bot (Telegram + API)"
nssm set ScanBot Description "Telegram scan bot + moderation API (node bot.js)"
nssm set ScanBot Start SERVICE_AUTO_START
nssm set ScanBot AppExit Default Restart
echo === stop old bot (free :3001) ===
taskkill /F /IM node.exe
timeout /t 2 /nobreak >nul
echo === start service ===
net start ScanBot
if errorlevel 1 (
  echo SERVICE START FAILED - restarting bot manually as fallback
  start "" node "D:\SCAN bot\bot.js"
)
echo === done ===