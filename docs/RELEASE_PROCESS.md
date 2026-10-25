# 红果短剧 —— GitHub 版本发布流程（面向 AI 执行手册）

> 适用仓库：`https://github.com/bainano/HongGuo-PC`
> 目标：从「代码改动」到「Release 上可下载的安装包」全流程可复现、可校验。
> 每一步都写明 **输入 → 操作 → 输出 → 判据**，必须按编号顺序执行，前一步判据不过不要进入下一步。

---

## 0. 全局约定

| 项 | 值 |
| --- | --- |
| 仓库 | `bainano/HongGuo-PC`（公开） |
| 默认分支 | `main` |
| 版本来源 | `desktop/package.json` 的 `version`（electron-builder 取它作为安装包版本） |
| 标签格式 | `v<version>`，例如 `v1.0.1`，必须与 `desktop/package.json` 一致 |
| 发布说明 | `docs/releases/v<版本>.md`（按版本单独存放），Release 正文直接取该文件 |
| 构建方式 | **必须用 GitHub Actions 构建**（macOS 包只能在 macOS 上产出，本机 Windows 打不出 dmg） |
| 产物规范 | 每次发布固定 **7 个资产**，见第 3 节，缺一即视为发布失败 |

---

## 1. 访问令牌（token）：使用位置与方式

### 1.1 令牌是什么、放在哪里

- 类型：GitHub Personal Access Token
  - classic：勾选 `repo`、`workflow`
  - 或 fine-grained：作用于 `bainano/HongGuo-PC`，权限 `Contents: Read and write`、`Metadata: Read`、`Actions: Read and write`
- 存放位置（**禁止写入仓库**）：
  - **首选：本机 OAuth 代理工具（已全局安装）**
    - 取令牌：`hg-oauth token`（不在任何仓库里，工具在 `~/Documents/tools`）
    - 首次/重新获取：`hg-oauth login`（浏览器点一次授权）
    - 令牌以 AES-256-GCM 加密存放在 `~/.hongguo/`，权限范围 `read:user, repo, workflow`，**具备推送与 Actions 权限**，已实测可直接 `git push`
    - 详见 `~/Documents/tools/github-oauth-proxy/README.md`
  - 备选 1：环境变量 `HG_GITHUB_TOKEN`
  - 备选 2：本机文件 `C:\hg-out\gh_token.txt`（UTF-8 无 BOM、无换行，600 权限）。
    注意该目录会被系统/安全软件不定期清空，用前先确认存在；文件缺失时改用上面的 `hg-oauth token`（PAT classic 勾选 `repo`、`workflow`）
- 硬性规则：
  1. **令牌明文不得出现在任何入库文件中**（README、文档、代码、commit message、Release 正文都不行）——GitHub 会扫描到并自动吊销
  2. 本文档只说明「在哪用、怎么用」，不保存令牌明文
  3. 命令里一律用变量读取，不要把令牌拼进会被记录/回显的字符串
  4. 发布结束或令牌外泄风险出现时，立即到 GitHub → Settings → Developer settings → Personal access tokens 吊销

### 1.2 令牌的 5 个使用位置

| # | 使用位置 | 方式 | 说明 |
| --- | --- | --- | --- |
| 1 | **git 推送代码与标签** | 远程地址内嵌：`https://bainano:$TOKEN@github.com/bainano/HongGuo-PC.git` | 本机实测 `git -c http.extraheader="AUTHORIZATION: bearer ..."` 会报 `invalid credentials`，**不要**用这种方式 |
| 2 | **调用 GitHub REST API** | 请求头 `Authorization: Bearer $TOKEN` + `Accept: application/vnd.github+json` | 用于：查询/创建/修改 Release、上传与删除资产、查询工作流运行状态、手动触发 `workflow_dispatch` |
| 3 | **下载构建产物** | `GET /repos/bainano/HongGuo-PC/actions/artifacts/{artifact_id}/zip`，同样带 `Authorization: Bearer $TOKEN` | 本机 `curl.exe` 访问 api.github.com 必须加 `--ssl-no-revoke`，否则 schannel 吊销检查失败 |
| 4 | **GitHub Actions 内部** | 使用 `${{ secrets.GITHUB_TOKEN }}` | Actions 自动注入，**不使用个人令牌**；建 Release、上传资产都靠它 |
| 5 | **兜底手动补传资产** | `POST https://uploads.github.com/repos/bainano/HongGuo-PC/releases/{release_id}/assets?name=<URL编码名>`，`Content-Type: application/octet-stream`，body 为文件二进制 | 仅在 CI 产出缺失时人工补齐（第 4 节步骤 G） |

### 1.3 读取令牌的标准片段

```powershell
# PowerShell：从 OAuth 代理取令牌（推荐，不要 echo 出来）
# 工具输出只有一行明文令牌；前面那行 [tls] 提示不属于令牌，用 ^gho_ 过滤掉
$TOKEN = (hg-oauth token | Select-String -Pattern '^gho_' | ForEach-Object { $_.Line }).Trim()
# 备选：从本机文件读取
# $TOKEN = [System.IO.File]::ReadAllText('C:\hg-out\gh_token.txt')
$HEADERS = @{ Authorization = "Bearer $TOKEN"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'hongguo-release' }
```

```python
# Python：调用工具子进程取令牌（推荐），或从文件读取
import subprocess, io, os, urllib.request

TOKEN = subprocess.run(['hg-oauth', 'token'], capture_output=True, text=True).stdout.strip()
# 备选：TOKEN = io.open(r'C:\hg-out\gh_token.txt', encoding='utf-8').read().strip()
req = urllib.request.Request(url, data=data, method='POST')
req.add_header('Authorization', 'Bearer ' + TOKEN)
```

> 用 PowerShell 调 API 提交中文内容（仓库描述、Release 正文）时，必须显式按 UTF-8 编码请求体：
> `-ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json))`，
> 否则中文会变成 `???`。

---

## 2. 版本规范

- 语义化版本 `MAJOR.MINOR.PATCH`
- 发版时同步修改两处版本号：
  - `desktop/package.json` → `version`（决定安装包与资产名）
  - `backend/package.json` → `version`（保持一致）
- 标签必须与版本完全一致：`v1.0.1` ↔ `version: "1.0.1"`
- 已发布的标签不要移动；若必须重打，用 `git tag -f` 并 `git push -f`，且要同步修正 Release

---

## 3. 固定产物清单（每次发布必须齐全，共 7 个）

| # | 规范资产名（ASCII） | 来源 Job | 说明 |
| --- | --- | --- | --- |
| 1 | `HongGuo-PC-Setup-<版本>.exe` | build-windows | Windows 通用安装器（内含 x64 + arm64，安装时按机型自动选择） |
| 2 | `HongGuo-PC-Setup-<版本>-win-x64.exe` | build-windows | Windows 10/11 64 位安装器 |
| 3 | `HongGuo-PC-Setup-<版本>-win-arm64.exe` | build-windows | Windows 10/11 ARM64 安装器 |
| 4 | `HongGuo-PC-<版本>-win-x64.zip` | build-windows | Windows 64 位免安装便携版 |
| 5 | `HongGuo-PC-<版本>-win-arm64.zip` | build-windows | Windows ARM64 免安装便携版 |
| 6 | `HongGuo-PC-<版本>-x64.dmg` | build-macos | macOS Intel |
| 7 | `HongGuo-PC-<版本>-arm64.dmg` | build-macos | macOS Apple Silicon |

规则：

- **资产名一律 ASCII**。GitHub Release 上传接口会剥离非 ASCII 字符（中文名 `红果短剧-Setup-1.0.0.exe` 传上去会变成 `-Setup-1.0.0.exe`）。应用内与安装界面显示的产品名仍是「红果短剧」。
- 构建产物原名是中文，由 release job 的 “Normalize asset names” 步骤统一重命名为上表规范名，并逐个校验，数量不等于 7 就直接失败。
- **不提供 32 位（x86）Windows 包**：Electron 44 起上游不再发布 win32-ia32 运行时，本项目 Electron 45 无法产出；Windows 7/8 同样不支持。

---

## 4. 发布流程（按序执行）

### 步骤 A：准备改动

- **输入**：待发布的代码改动
- **操作**：
  1. 改代码（本仓库根目录：`desktop/`、`backend/`）
  2. 按要求更新 `desktop/package.json` 与 `backend/package.json` 的 `version`
  3. 新增发布说明：复制 `docs/releases/TEMPLATE.md` 为 `docs/releases/v<新版本>.md`（例如 `v1.0.1.md`），
     填写版本定位、系统支持范围、下载表（7 个资产）、新增/修复/变更、已知问题、免责声明（模板见第 5 节）
  4. 本地验证前端可构建：`cd desktop && npx vite build`（退出码 0）
- **输出**：工作区改动就绪
- **判据**：`git status` 有预期改动；`vite build` 成功

### 步骤 B：提交并打标签

- **输入**：步骤 A 的改动
- **操作**：
  ```powershell
  cd c:\Users\KIN\Documents\hongguo
  git add -A
  git commit -m "release: v1.0.1 ..."
  git tag -a v1.0.1 -m "红果短剧 v1.0.1"
  ```
- **输出**：本地提交 + 本地标签
- **判据**：`git log --oneline -1` 为新提交；`git tag -n1` 含 `v1.0.1`

### 步骤 C：推送（这一步会触发 CI 自动发布）

- **输入**：本地提交与标签
- **操作**（令牌使用位置 #1）：
  ```powershell
  $TOKEN = (hg-oauth token | Select-String -Pattern '^gho_' | ForEach-Object { $_.Line }).Trim()
  git push "https://bainano:$TOKEN@github.com/bainano/HongGuo-PC.git" main:main
  git push "https://bainano:$TOKEN@github.com/bainano/HongGuo-PC.git" v1.0.1
  ```
- **输出**：远端 `main` 更新、`v1.0.1` 标签创建 → 触发 `Build & Release` 工作流
- **判据**：推送输出含 `main -> main`、`[new tag]`；注意 **先推分支、再推标签**（标签先到会指向旧提交）

### 步骤 D：监控构建

- **输入**：标签名 `v1.0.1`
- **操作**（令牌使用位置 #2）：
  ```powershell
  Invoke-RestMethod -Uri 'https://api.github.com/repos/bainano/HongGuo-PC/actions/runs?per_page=3' -Headers $HEADERS
  # 取 run id 后查 job 明细
  Invoke-RestMethod -Uri "https://api.github.com/repos/bainano/HongGuo-PC/actions/runs/<run_id>/jobs" -Headers $HEADERS
  ```
- **输出**：三个 job（Windows / macOS / Release）的状态
- **判据**：`build-windows`、`build-macos` 均 `completed/success`；`release` job 成功且创建了 Release
- **失败处理**：任一构建 job 失败 → 看该 job 日志修好后，重打标签（删除远端标签 `git push --delete origin v1.0.1` 再重推）或发新补丁版本

### 步骤 E：CI 自动出包并发布

- **输入**：两个构建 job 上传的 artifacts
- **操作**（Actions 内部，令牌使用位置 #4：`secrets.GITHUB_TOKEN`）：
  1. `release` job 下载全部 artifacts
  2. 按第 3 节规范名重命名（中文原名 → ASCII 规范名），逐个校验，数量必须等于 7，否则失败
  3. 按版本定位发布说明 `docs/releases/v<版本>.md`（找不到就直接失败，避免发空正文），
     再交给 `softprops/action-gh-release@v2` 以它为正文创建（非草稿）Release 并上传 7 个资产
- **输出**：`https://github.com/bainano/HongGuo-PC/releases/tag/v1.0.1`
- **判据**：Release 存在、`draft=false`、资产数 = 7

### 步骤 F：发布后校验

- **输入**：Release id / tag
- **操作**（令牌使用位置 #2）：
  ```powershell
  Invoke-RestMethod -Uri 'https://api.github.com/repos/bainano/HongGuo-PC/releases/tags/v1.0.1' -Headers $HEADERS |
    Select-Object -ExpandProperty assets | Select-Object name, size, state
  ```
- **输出**：资产清单
- **判据**：
  - 7 个资产名与第 3 节表格**逐字一致**（含大小写与 `-win-x64` / `-win-arm64` 后缀）
  - 全部 `state = uploaded`，体积合理（exe 100MB 级、zip 145MB 级、dmg 120MB 级）
  - 抽查二进制：Windows 解包目录的 `红果短剧.exe` 用 PE 头 `machine` 校验（x64 = `0x8664`，arm64 = `0xaa64`）；dmg 尾部 512 字节含 UDIF 标识 `koly`

### 步骤 G：兜底 —— 资产缺失时手动补传

- **输入**：本地已构建好的安装包文件、Release id
- **操作**（令牌使用位置 #5）：
  ```python
  url = 'https://uploads.github.com/repos/bainano/HongGuo-PC/releases/{id}/assets?name=' + urllib.parse.quote('HongGuo-PC-Setup-1.0.1.exe')
  req = urllib.request.Request(url, data=open(path,'rb').read(), method='POST')
  req.add_header('Authorization', 'Bearer ' + TOKEN)
  req.add_header('Content-Type', 'application/octet-stream')
  ```
  若同名资产存在，先 `DELETE /releases/assets/{asset_id}`（返回 204，响应体为空，解析时不要当 JSON 处理）。
- **输出**：资产补齐到 7 个
- **判据**：回到步骤 F 重新校验

### 步骤 H：收尾

- 若本次不再需要令牌操作：吊销令牌（或确认其仅本机留存）
- 在 GitHub Release 页面确认展示正常（正文中文、资产可下载）

---

## 5. 发布说明规范（`docs/releases/v<版本>.md`）

发布说明**按版本单独存放**在 `docs/releases/` 下，文件名就是版本号（带 `v`，如 `v1.0.1.md`；
不带 `v` 的 `1.0.1.md` 也能被识别）。该文件**就是** Release 正文，每次发版新增一份，不要覆盖旧版本文件。

目录约定见 `docs/releases/README.md`，模板文件为 `docs/releases/TEMPLATE.md`；模板内容：

```markdown
# 红果短剧 vX.Y.Z

> 好看的短剧尽在红果短剧

一句话定位（支持系统、本次提供哪些安装包）。

## 系统支持范围

**支持的操作系统：Windows 10 与 Windows 11。**
（x64 支持 / ARM64 支持 / 32 位 x86 不提供及原因 / Windows 7、8 不支持）

## 下载

（7 个资产表：文件名 + 适用平台，必须与第 3 节规范名一致）

## 本版本更新

### 新增
- ...

### 修复
- ...

### 变更
- ...

## 已知问题

- ...

## 说明与免责

本项目为个人学习与技术交流用途的第三方客户端，与红果短剧官方无隶属、授权或合作关系；
不托管、不转存任何影视内容，版权归原权利人所有。源码按 GPL-3.0 开源。
```

---

## 6. 已踩过的坑（必须遵守）

1. **资产名必须 ASCII**：GitHub 上传接口会吞掉中文，构建产物的中文名必须在 release job 里重命名后再上传。
2. **macOS 包只能由 GitHub Actions 产出**：本机 Windows 无法构建 dmg；不要再用 `macos-13`（Intel runner 长时间排队等不到机器），统一用 `macos-14` 一台机器同时出 x64 + arm64。
3. **electron-builder 没有顶层 `zip` 配置段**：写 `zip: {...}` 会被 schema 校验拒绝（`unknown property 'zip'`），zip 产物只能用默认命名，最终在 release job 里改成规范名。
4. **多架构 NSIS 产物名必须带 `${arch}`**：否则三个安装器互相覆盖。
5. **本机打包前先关掉正在运行的应用**（含它拉起的后端子进程），否则解包时 `EPERM: operation not permitted, unlink d3dcompiler_47.dll`。
6. **PowerShell 提交中文 API 请求体**必须手动 UTF-8 编码（见 1.3）。
7. **本机 `curl.exe`** 访问 GitHub API 需要 `--ssl-no-revoke`。
8. **推送顺序**：先分支后标签；改过代码要重打标签时，`git tag -f` + `git push -f` 同步更新。
9. **调试打包版**用 `--remote-debugging-port`，端口 9222 常被 Edge 占用，换 9333 等；判窗口是否被置顶可用 `GetWindowLongPtr(GWL_EXSTYLE=-20) & 0x8 (WS_EX_TOPMOST)`。
10. **平台范围已定（决策，勿擅自改动）**：**Windows + macOS 双平台都保留**，每次固定 7 个资产（见第 3 节）。Windows 侧只有 x64 与 ARM64（Electron 45 起上游不再发布 `win32-ia32`，**不出 32 位包**，且 Electron 45 不支持 Windows 7/8）；macOS 侧 x64 + arm64 两个 dmg 由 `macos-14` runner 产出。任何试图删除 macOS job、删 `mac` 配置段、或把资产清单减到 5 项的改动都视为破坏发布规范，须先经用户确认。

---

## 7. 常用命令速查

```powershell
# 读取令牌与请求头
$TOKEN = (hg-oauth token | Select-String -Pattern '^gho_' | ForEach-Object { $_.Line }).Trim()
$HEADERS = @{ Authorization = "Bearer $TOKEN"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'hongguo-release' }

# 查最新 Release
Invoke-RestMethod -Uri 'https://api.github.com/repos/bainano/HongGuo-PC/releases/latest' -Headers $HEADERS

# 手动触发构建（不发布，用于验证链路）
Invoke-RestMethod -Method POST -Uri 'https://api.github.com/repos/bainano/HongGuo-PC/actions/workflows/build.yml/dispatches' `
  -Headers $HEADERS -ContentType 'application/json; charset=utf-8' `
  -Body ([System.Text.Encoding]::UTF8.GetBytes('{"ref":"main"}'))

# 查运行状态 / 取消运行
Invoke-RestMethod -Uri 'https://api.github.com/repos/bainano/HongGuo-PC/actions/runs?per_page=5' -Headers $HEADERS
Invoke-RestMethod -Method POST -Uri 'https://api.github.com/repos/bainano/HongGuo-PC/actions/runs/<run_id>/cancel' -Headers $HEADERS

# 本机只出 Windows 包（调试用，正式发布走 CI）
cd desktop; npm run pack:win          # x64 + arm64
```
