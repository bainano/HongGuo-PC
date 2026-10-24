# GitHub OAuth 本地代理

给 Workbuddy / 本地 AI 用的 GitHub 授权工具：**双击启动 → 浏览器点一次授权 → 令牌自动交到本机**。
零第三方依赖（只用 Node 原生模块），Windows / macOS / Linux 通用。

## 为什么需要它

浏览器里的 GitHub OAuth 授权必须由人点一次「Authorize」，AI 自己完成不了。
本工具负责把这件事拆成两段：

- **人做的部分**：在浏览器里点一次授权（约 5 秒）
- **工具做的部分**：起本地服务、拼授权链接、收回调、用 code 换令牌、加密存盘、按需转交

## 运行方式

### 首次使用（需要 Node.js 20+）

**Windows**：双击 `start.cmd`
**macOS / Linux**：`bash start.sh`
**命令行**：`node github-oauth-proxy.mjs login`

启动后：

1. 本机起一个临时服务 `http://127.0.0.1:8765`
2. 自动打开浏览器
3. 若还没配置过 OAuth App，会先显示一个配置页（里面有一键创建 GitHub OAuth App 的预填链接），
   把 **Client ID / Client Secret** 粘进去点保存
4. 自动跳到 GitHub 授权页 → 点 **Authorize**
5. 终端显示「授权成功」，令牌加密落盘，服务自动退出

之后每次用都是 `node github-oauth-proxy.mjs status`，令牌长期有效，不用再授权。

### 全部子命令

| 命令 | 作用 |
| --- | --- |
| `node github-oauth-proxy.mjs login` | 一键授权（默认命令） |
| `node github-oauth-proxy.mjs login --handoff` | 授权后额外开一个一次性本地接口转交令牌 |
| `node github-oauth-proxy.mjs setup` | 只配置 Client ID / Secret，不发起授权 |
| `node github-oauth-proxy.mjs status` | 查看当前账号、权限范围、存储位置 |
| `node github-oauth-proxy.mjs token` | 把 access token 打到 stdout（供脚本取用） |
| `node github-oauth-proxy.mjs logout` | 删除本地令牌 |
| `--port 8787` | 端口被占用时换端口 |

## 授权流程

```
┌─ Workbuddy ────────┐        ┌─ 本机浏览器 ─────────┐       ┌─ GitHub ────────┐
│ 运行 start.cmd      │  ①    │ 打开授权页            │  ②    │ 用户登录并点     │
│ (起本地服务)        ├──────►│ github.com/login/...  ├──────►│ Authorize       │
│                     │       │                       │       │                 │
│ ③ 收 /callback?code │◄──────┴───────────────────────┘       └────────┬────────┘
│   POST /login/oauth │                                                │ 302 回跳
│   /access_token     │◄───────────────────────────────────────────────┘
│ ④ 加密存盘 + 转交   │
└─────────────────────┘
```

1. 工具生成随机 `state`（防 CSRF），拼 `client_id / redirect_uri / scope / state` 后 302 到 GitHub
2. 用户授权后，GitHub 302 回 `http://127.0.0.1:<port>/callback?code=...&state=...`
3. 工具校验 `state`，用 `code + client_secret` 调 `POST https://github.com/login/oauth/access_token` 换令牌
4. 调 `GET /user` 确认账号，然后把令牌加密保存并转交

默认申请的权限：`repo workflow read:user`（推代码、打标签、建 Release、读写 Actions 都需要前两项）。

## 权限转交机制

令牌**不出本机**，三种取用方式，按场景选：

| 方式 | 用法 | 适用 |
| --- | --- | --- |
| **A. 加密文件（默认）** | `~/.hongguo/oauth-token.enc`，AES-256-GCM 加密，密钥 `~/.hongguo/oauth-key.bin` 权限 600 | 长期保存，脚本随时读 |
| **B. 命令行取用** | `TOKEN=$(node github-oauth-proxy.mjs token)` | Workbuddy 直接执行并用于 git / API 调用 |
| **C. 一次性本地接口** | `login --handoff` 后打印 `http://127.0.0.1:<port>/token?key=<随机>`，5 分钟有效 | 不想碰磁盘、临时把令牌交给另一个进程 |

Workbuddy 侧的典型用法：

```powershell
# Windows PowerShell
$TOKEN = node tools\github-oauth-proxy\github-oauth-proxy.mjs token
git push "https://bainano:$TOKEN@github.com/bainano/HongGuo-PC.git" main:main
```

```python
# Python：调 GitHub API
import subprocess, urllib.request
TOKEN = subprocess.check_output(['node', 'tools/github-oauth-proxy/github-oauth-proxy.mjs', 'token']).decode().strip()
req = urllib.request.Request(url, method='POST')
req.add_header('Authorization', 'Bearer ' + TOKEN)
```

## 安全设计

- **配置与令牌都在仓库之外**：`~/.hongguo/`，不会被 `git add` 提交；`config.json` 已加入 `.gitignore`
- **令牌加密落盘**：AES-256-GCM，密钥单独存放、权限 600
- **state 校验**：防 CSRF，回调 state 不匹配直接中止
- **只监听 127.0.0.1**：不对外暴露
- **令牌不打印**：`status` 只显示脱敏形式；只有显式执行 `token` 才输出明文
- **转交接口一次性**：随机 key + 5 分钟过期

## 常见问题

**端口被占用**：`node github-oauth-proxy.mjs login --port 8787`（改端口后，回调地址也要一致，工具会自动用新端口）。

**想彻底失效令牌**：`node github-oauth-proxy.mjs logout` 只删本地副本；要到
GitHub → Settings → Applications → **Authorized OAuth Apps** 里点 Revoke 才是真的吊销。

**没有 Client ID / Secret**：首次 `login` 的配置页里有预填链接，点进去创建即可，
回调地址填 `http://127.0.0.1:8765/callback`（换端口就同步改）。

**CI 里要不要用它**：不要。GitHub Actions 用内置的 `secrets.GITHUB_TOKEN` 就够了，本工具只解决「本地人机授权」。
