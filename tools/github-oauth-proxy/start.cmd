@echo off
chcp 65001 >nul
title HongGuo GitHub OAuth 代理
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [error] 没找到 Node.js，请先安装 Node.js 20+ https://nodejs.org
  pause
  exit /b 1
)

echo ============================================
echo  红果短剧 · GitHub OAuth 本地代理
echo  浏览器会自动打开，点一次 Authorize 即可
echo ============================================
node "%~dp0github-oauth-proxy.mjs" login %*
echo.
pause
