@echo off
cd /d "D:\SCAN bot"
nssm set ScanBot AppStdout "D:\SCAN bot\nssm-out.log"
nssm set ScanBot AppStderr "D:\SCAN bot\nssm-err.log"
nssm set ScanBot AppDirectory "D:\SCAN bot"
net stop ScanBot 2>nul
timeout /t 2 /nobreak >nul
net start ScanBot 2>nul
timeout /t 6 /nobreak >nul
sc query ScanBot