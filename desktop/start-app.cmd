@echo off
chcp 65001 >nul
cd /d "%~dp0"
where.exe pwsh >nul 2>nul
if %ERRORLEVEL%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-app.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-app.ps1" %*
)
set RC=%ERRORLEVEL%
if not %RC%==0 pause
exit /b %RC%
