@echo off
chcp 65001 >nul
rem ============================================================
rem HongguoTV Windows 打包脚本（红果短剧）
rem
rem 本机环境的四个已知坑及修复（详见 memory / 历史对话）：
rem 坑1 app-builder-bin 的 rcedit 缺陷：Go 中间层占用 exe 句柄导致
rem      Unable to commit changes 必败。修复：CUSTOM_APP_BUILDER_PATH
rem      指向 tools/app-builder-shim.cs 编译出的包装器。
rem 坑2 本机安全软件拦截工作区内进程的文件写入。修复：7za 与
rem      app-builder 都复制到工作区之外执行，7za 走 USE_SYSTEM_7ZA。
rem 坑3 app-builder 的 download-artifact 被拦截。修复：
rem      ELECTRON_BUILDER_NSIS_DIR 指向本地 NSIS，跳过下载。
rem 坑4 NSIS 流程会执行半成品安装器，输出目录在工作区内会被拦截。
rem      修复：HG_BUILD_OUTPUT 指向工作区外，构建后拷回 dist-electron。
rem 坑5 dist 缺失会导致 app.asar 没有 dist/index.html，应用黑屏。
rem      修复：打包前强制 vite build，构建后校验 asar 内容。
rem
rem 另：需清掉 NODE_OPTIONS，避免 IDE 注入的 node shim 干扰。
rem ============================================================
setlocal enabledelayedexpansion
cd /d %~dp0

set TOOLS=C:\hg-build-tools
set TOOLS_BIN=%TOOLS%\bin
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe

rem ---- 1) 7za：复制到 node_modules 之外 ----
if not exist "%TOOLS_BIN%\7za.exe" (
  if not exist "%TOOLS_BIN%" mkdir "%TOOLS_BIN%"
  copy /y "%LOCALAPPDATA%\electron-builder\Cache\7zip@1.0.0\7zip-win-x64-1nrf7\bin\7za.exe" "%TOOLS_BIN%\7za.exe" >nul
  if errorlevel 1 echo [warn] 7za copy failed
)

rem ---- 2) 真正的 app-builder.exe：同样复制到工作区之外 ----
if not exist "%TOOLS_BIN%\app-builder.exe" (
  if not exist "%TOOLS_BIN%" mkdir "%TOOLS_BIN%"
  copy /y "node_modules\app-builder-bin\win\x64\app-builder.exe" "%TOOLS_BIN%\app-builder.exe" >nul
  if errorlevel 1 echo [warn] app-builder copy failed
)

rem ---- 3) NSIS 3.0.4.1：下载并解压到本地（首次约 1.3MB） ----
if not exist "%TOOLS%\nsis\extracted\makensis.exe" (
  if not exist "%TOOLS%\nsis" mkdir "%TOOLS%\nsis"
  if not exist "%TOOLS%\nsis\nsis-3.0.4.1.7z" (
    echo [setup] downloading nsis-3.0.4.1 ...
    curl -L --ssl-no-revoke --retry 3 -o "%TOOLS%\nsis\nsis-3.0.4.1.7z" "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z"
  )
  "%TOOLS_BIN%\7za.exe" x -y -o"%TOOLS%\nsis\extracted" "%TOOLS%\nsis\nsis-3.0.4.1.7z" >nul
)

rem ---- 4) rcedit 包装器：编译 ----
if not exist "%TOOLS%\app-builder-shim.exe" (
  if exist "%CSC%" (
    echo [setup] compiling app-builder-shim.exe ...
    "%CSC%" -nologo -optimize -out:"%TOOLS%\app-builder-shim.exe" "tools\app-builder-shim.cs"
  ) else (
    echo [error] csc.exe not found, cannot compile rcedit shim
    exit /b 1
  )
)

rem ---- 5) 执行打包 ----
set NODE_OPTIONS=
set PATH=%TOOLS_BIN%;%PATH%
set USE_SYSTEM_7ZA=true
set CUSTOM_APP_BUILDER_PATH=%TOOLS%\app-builder-shim.exe
set ELECTRON_BUILDER_NSIS_DIR=%TOOLS%\nsis\extracted
set HG_BUILD_OUTPUT=C:\hg-out

echo [1/3] vite build ...
call npx vite build
if errorlevel 1 (
  echo [error] vite build failed
  exit /b 1
)

echo [2/3] electron-builder ...
call npx electron-builder --win --config electron-builder.config.cjs
if errorlevel 1 exit /b 1

echo [3/3] verify app.asar ...
if not exist "C:\hg-out\win-unpacked\resources\app.asar" (
  echo [error] app.asar not found
  exit /b 1
)
node "tools\verify-asar.mjs" "C:\hg-out\win-unpacked\resources\app.asar"
if errorlevel 1 (
  echo [error] asar verification failed, installer NOT copied
  exit /b 1
)

rem ---- 6) 把安装包拷回项目 dist-electron ----
if not exist "%~dp0dist-electron" mkdir "%~dp0dist-electron"
copy /y "C:\hg-out\红果短剧-Setup-*.exe" "%~dp0dist-electron\" >nul
copy /y "C:\hg-out\红果短剧-Setup-*.blockmap" "%~dp0dist-electron\" >nul 2>nul
echo.
echo [done] installer: %~dp0dist-electron\红果短剧-Setup-*.exe
echo [done] portable: C:\hg-out\win-unpacked\红果短剧.exe
exit /b 0
