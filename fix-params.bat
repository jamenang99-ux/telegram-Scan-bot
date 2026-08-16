@echo off
cd /d "D:\SCAN bot"
echo. > nssm-out.log
echo. > nssm-err.log
nssm set ScanBot AppParameters ^"D:\SCAN bot\bot.js^"
net stop ScanBot 2>nul
timeout /t 2 /nobreak >nul
net start ScanBot 2>nul
timeout /t 6 /nobreak >nul
sc query ScanBot