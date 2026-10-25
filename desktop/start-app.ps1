#Requires -Version 5.1
<#
.SYNOPSIS
    红果短剧 PC 端 —— 一键启动（应用版）

.DESCRIPTION
    默认「应用版」形态，与打包安装后一致：
      1) 构建前端产物 -> desktop/dist（vite build）
      2) 启动后端服务 -> backend/custom-server/index.mjs
      3) 拉起 Electron 桌面窗口，加载本地 dist 产物（不是浏览器网页）

    后端运行在独立的新 PowerShell 窗口中（最小化，可随时打开看日志）。
    关闭本窗口或按 Ctrl + C 结束脚本时，后端会被一并结束，不留残留进程。

.PARAMETER Dev
    开发模式：改为启动 Vite 开发服务器，并让应用加载 http://localhost:5173（支持热更新）。

.PARAMETER SkipBuild
    跳过前端构建，直接沿用现有的 desktop/dist（二次启动更快）。
#>
param(
    [switch]$Dev,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

# 控制台统一 UTF-8，避免中文提示乱码（配合 start-app.cmd 里的 chcp 65001）
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$OutputEncoding = [System.Text.Encoding]::UTF8

$DesktopDir = $PSScriptRoot
$RootDir    = Split-Path -Parent $DesktopDir
$BackendDir = Join-Path $RootDir 'backend'
$VitePort   = 5173

$backendProc = $null
$viteProc    = $null

# 子进程窗口宿主：优先 PowerShell 7 (pwsh)，未安装则回退 Windows PowerShell 5.1。
# 不使用 cmd.exe —— 统一用 PowerShell 型窗口，行为一致且便于看日志。
$psHost = $null
if (Get-Command pwsh -ErrorAction SilentlyContinue) {
    $psHost = 'pwsh.exe'
} elseif (Get-Command powershell -ErrorAction SilentlyContinue) {
    $psHost = 'powershell.exe'
    Write-Host '[env ] 未检测到 PowerShell 7 (pwsh)，已回退 Windows PowerShell 5.1。' -ForegroundColor Yellow
    Write-Host '       如需新版：winget install --id Microsoft.PowerShell --source winget' -ForegroundColor DarkGray
}
if (-not $psHost) { throw '未检测到 PowerShell，无法启动后端窗口。' }

function Write-Step {
    param([string]$Text)
    Write-Host $Text -ForegroundColor Cyan
}

# 在新 PowerShell 窗口中运行命令，返回该窗口进程（用于结束进程树）
function Start-PsWindow {
    param(
        [string]$Title,
        [string]$Command,
        [string]$WorkingDirectory
    )
    $script = @"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { `$Host.UI.RawUI.WindowTitle = '$Title' } catch { }
Set-Location -LiteralPath '$WorkingDirectory'
$Command
"@
    return Start-Process -FilePath $psHost -ArgumentList @('-NoProfile', '-NoExit', '-Command', $script) `
        -WorkingDirectory $WorkingDirectory -WindowStyle Minimized -PassThru
}

# 结束进程及其子进程树（PowerShell 窗口 + 其中的 node 进程一起带走）
function Stop-ProcTree {
    param([System.Diagnostics.Process]$Process)
    if ($null -eq $Process) { return }
    try {
        if (-not $Process.HasExited) {
            & taskkill.exe /PID $Process.Id /T /F 2>&1 | Out-Null
        }
    } catch { }
}

function Test-PortOpen {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        return $task.Wait(400) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

# 校验后端 /health：必须带 capabilities 能力标记，
# 避免误连同端口的旧版后端（/health 完全一致但接口缺字段）
function Test-BackendHealth {
    param([int]$Port)
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2 -ErrorAction Stop
        return [bool]($res.ok -and $res.capabilities)
    } catch {
        return $false
    }
}

# 拿到后端实际端口：优先读后端写出的 service-address.json（按 pid 匹配，最准），
# 拿不到再退化为端口扫描（后端端口被占用时会自动递增）
function Wait-BackendReady {
    param([System.Diagnostics.Process]$Process, [int]$TimeoutSec = 40)

    $addrFile = Join-Path $BackendDir 'custom-server\data\service-address.json'
    $deadline = (Get-Date).AddSeconds($TimeoutSec)

    while ((Get-Date) -lt $deadline) {
        if (Test-Path $addrFile) {
            try {
                $info = Get-Content -LiteralPath $addrFile -Raw -ErrorAction Stop | ConvertFrom-Json
                if ($info.pid -eq $Process.Id -and (Test-BackendHealth ([int]$info.port))) {
                    return [int]$info.port
                }
            } catch { }
        }
        foreach ($p in 8788..8799) {
            if (Test-BackendHealth $p) { return $p }
        }
        if ($Process.HasExited) { return 0 }
        Start-Sleep -Milliseconds 500
    }
    return 0
}

function Ensure-Deps {
    param([string]$Dir, [string]$Label)
    if (Test-Path (Join-Path $Dir 'node_modules')) { return }
    Write-Host "[deps] 首次运行，正在安装 $Label 依赖，请稍候..." -ForegroundColor Yellow
    & npm.cmd install --prefix $Dir --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "$Label 依赖安装失败（exit=$LASTEXITCODE）。" }
}

try {
    Write-Host ''
    Write-Host '===============================================' -ForegroundColor Green
    Write-Host '  红果短剧 PC 端 · 一键启动（应用版）' -ForegroundColor Green
    Write-Host '===============================================' -ForegroundColor Green
    Write-Host ''

    # ---------- 0. 环境检查 ----------
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '未检测到 Node.js，请先安装 Node 18+ 并加入 PATH。' }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw '未检测到 npm，请检查 Node.js 安装。' }
    if (-not (Test-Path $BackendDir)) { throw "未找到后端目录：$BackendDir" }

    # IDE（如 CodeBuddy）会往 NODE_OPTIONS 里注入 --require shim。
    # 该 shim 在 Electron 主进程中加载会失败，表现为「窗口一闪即退」，
    # 因此在拉起任何子进程前先清除，子进程会继承这份干净的环境。
    if ($env:NODE_OPTIONS -and $env:NODE_OPTIONS -match 'CodeBuddy|genie|node-language-shim') {
        Write-Host '[env ] 已清除 IDE 注入的 NODE_OPTIONS（会导致 Electron 启动即退出）' -ForegroundColor DarkGray
        Remove-Item Env:\NODE_OPTIONS -ErrorAction SilentlyContinue
    }

    Write-Host "[env ] Node $((& node -v).Trim())  ·  窗口宿主：$psHost" -ForegroundColor DarkGray

    Ensure-Deps -Dir $DesktopDir -Label '桌面端'
    Ensure-Deps -Dir $BackendDir -Label '后端'

    Set-Location -LiteralPath $DesktopDir

    # ---------- 1. 前端：构建产物（应用版默认） ----------
    if ($Dev) {
        if (Test-PortOpen $VitePort) {
            throw "端口 $VitePort 已被占用，Vite 开发服务器无法启动。请关闭占用程序后再试。"
        }
        Write-Step "[1/3] 启动前端开发服务器 (Vite :$VitePort) ..."
        $viteProc = Start-PsWindow -Title '红果短剧 · 前端 Vite' -Command 'npm run dev' -WorkingDirectory $DesktopDir

        $viteReady = $false
        for ($i = 0; $i -lt 60; $i++) {
            if (Test-PortOpen $VitePort) { $viteReady = $true; break }
            if ($viteProc.HasExited) { throw "Vite 意外退出（exit=$($viteProc.ExitCode)），请打开「前端 Vite」窗口查看日志。" }
            Start-Sleep -Milliseconds 500
        }
        if (-not $viteReady) { throw "前端启动超时：30 秒内未连上 http://localhost:$VitePort。" }
        Write-Host "      前端已就绪：http://localhost:$VitePort" -ForegroundColor DarkGray
    } else {
        if ($SkipBuild -and (Test-Path (Join-Path $DesktopDir 'dist\index.html'))) {
            Write-Step '[1/3] 跳过前端构建，沿用现有 desktop/dist ...'
        } else {
            Write-Step '[1/3] 构建前端产物 (vite build) ...'
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw "前端构建失败（exit=$LASTEXITCODE）。" }
        }
        Write-Host '      前端已就绪：desktop/dist' -ForegroundColor DarkGray
    }

    # 应用版走本地 dist，确保不会因外部环境变量误连开发服务器
    if ($Dev) { $env:VITE_DEV_SERVER_URL = "http://localhost:$VitePort" }
    else { Remove-Item Env:\VITE_DEV_SERVER_URL -ErrorAction SilentlyContinue }

    # ---------- 2. 启动后端 ----------
    Write-Step '[2/3] 启动后端服务 (backend/custom-server) ...'
    $backendProc = Start-PsWindow -Title '红果短剧 · 后端服务' -Command 'node custom-server/index.mjs' -WorkingDirectory $BackendDir

    $backendPort = Wait-BackendReady -Process $backendProc
    if ($backendPort -eq 0) {
        if ($backendProc.HasExited) { throw '后端进程已退出，请打开「后端服务」窗口查看日志。' }
        throw '后端启动超时：40 秒内未探测到可用的 /health 接口。'
    }
    Write-Host "      后端已就绪：http://127.0.0.1:$backendPort" -ForegroundColor DarkGray

    # ---------- 3. 启动 Electron 桌面应用 ----------
    Write-Step '[3/3] 启动 Electron 桌面窗口 ...'
    Write-Host '      （关闭本窗口或按 Ctrl + C，后端与前端会一并停止）' -ForegroundColor DarkGray
    Write-Host ''

    & node electron-starter.js
    $exitCode = $LASTEXITCODE
} catch {
    Write-Host ''
    Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
} finally {
    Write-Host ''
    Write-Host '正在停止前端与后端进程 ...' -ForegroundColor Yellow
    Stop-ProcTree -Process $viteProc
    Stop-ProcTree -Process $backendProc
    Remove-Item Env:\VITE_DEV_SERVER_URL -ErrorAction SilentlyContinue
    Write-Host '已全部停止。' -ForegroundColor Green
    Write-Host ''
}

exit $exitCode
