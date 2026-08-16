@echo off
cd /d "D:\SCAN bot"
echo. > nssm-out.log
echo. > nssm-err.log
nssm set ScanBot Application "C:\Windows\System32\cmd.exe"
nssm set ScanBot AppParameters "/c D:\run-scanbot.bat"
nssm set ScanBot AppDirectory "D:\SCAN bot"
net stop ScanBot 2>nul
timeout /t 2 /nobreak >nul
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
net start ScanBot 2>nul
timeout /t 6 /nobreak >nul
sc query ScanBot