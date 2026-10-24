# 红果短剧（HongGuo-PC）

> 好看的短剧尽在红果短剧

红果短剧的 PC 桌面客户端：Windows 与 macOS 原生窗口，内置本地内容服务，打开即用，无需配置。

- **首页**：推荐栏目 + 横幅轮播，剧集海报墙
- **分类**：真人剧 / 漫剧 / AI 剧
- **榜单**：红果热播榜、真人剧热播榜、AI 剧热播榜、漫剧热播榜
- **搜索**：关键词联想（剧集 / 关键词建议），直达详情
- **详情**：剧集信息、选集、演员，一键播放
- **播放**：独立播放窗口，多清晰度切换、上下集、自动连播
- **分享链接**：粘贴手机端分享口令 / 链接，直接跳到对应剧集与选集
- **窗口体验**：无边框自绘标题栏（Windows）/ 系统原生红绿灯（macOS），关闭播放窗口时二次确认

所有内容均实时取自红果短剧官方公开接口，本地不存储、不转存任何视频文件。

---

## 下载安装

前往 [Releases](https://github.com/bainano/HongGuo-PC/releases) 下载对应平台的安装包：

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows（64 位） | `红果短剧-Setup-<版本>.exe` | 双击即可，安装器会**自动申请管理员权限**（UAC）；无需手动右键「以管理员身份运行」 |
| Windows（64 位，免安装） | `红果短剧-<版本>-portable-win-x64.zip` | 解压后直接运行 `红果短剧.exe`，不写注册表、不安装 |
| macOS（Intel） | `红果短剧-<版本>-x64.dmg` | 打开 dmg，把 App 拖进「应用程序」 |
| macOS（Apple Silicon） | `红果短剧-<版本>-arm64.dmg` | 同上，M 系列机型专用，性能更佳 |

### macOS 首次打开提示

本项目未接入 Apple 开发者签名，首次启动可能被 Gatekeeper 拦下：

1. 在「访达 → 应用程序」中找到 **红果短剧**，**右键 → 打开**；
2. 弹窗中点「打开」；
3. 或到「系统设置 → 隐私与安全性」，在「仍要打开」处确认一次。

之后即可正常双击启动。（后续若配置 Apple 证书，CI 会自动签名并公证。）

---

## 本地运行

要求：Node.js ≥ 20、npm ≥ 10。

```bash
# 1) 启动本地内容服务（后台常驻，默认端口 8788，被占用会自动递增）
cd backend
npm install
node scripts/service-launcher.mjs start
# 需要停止时：node scripts/service-launcher.mjs stop

# 2) 启动桌面端（会先执行 vite build，再拉起 Electron）
cd ../desktop
npm install
npm run desktop
```

开发模式（前端热更新，后端需单独启动）：

```bash
cd desktop
npm run dev      # Vite dev server
npm start        # 另开一个终端，拉起 Electron 窗口
```

## 打包

```bash
cd desktop
npm run pack:win           # Windows x64 安装器
npm run pack:mac:x64       # macOS Intel dmg
npm run pack:mac:arm64     # macOS Apple Silicon dmg
npm run dist               # 当前平台全量构建
```

产物输出到 `desktop/dist-electron/`。打包脚本内部都会先执行 `vite build`，
保证 `app.asar` 中包含 `dist/index.html`（缺失会导致启动黑屏）。

## 项目结构

```
hongguo/
├─ desktop/                 Electron 桌面端
│  ├─ main.js               主进程：窗口、IPC、拉起内置后端
│  ├─ preload.js            安全桥接（window.hgWin）
│  ├─ electron-builder.config.cjs
│  └─ src/                  React 渲染层
│     ├─ App.jsx            路由与状态
│     ├─ platform.js        平台判定（macOS 标题栏适配）
│     ├─ api.js             后端接口
│     ├─ components/        页面与组件
│     └─ styles/            样式
├─ backend/                 本地内容服务（Node，无框架依赖）
│  ├─ custom-server/        HTTP 服务与路由
│  ├─ server/               内容引擎适配层
│  ├─ shared/               通用工具（含纯 JS SM3 实现）
│  └─ scripts/service-launcher.mjs  服务守护启动器
├─ .github/workflows/       GitHub Actions：自动构建 + 自动发布
└─ frontend/                早期网页版参考实现
```

## 技术要点

- **Electron + React 18 + Vite**，主窗口与独立播放窗口双窗口模型，窗口间通过 IPC 协同。
- **内置后端**：打包时后端随 `extraResources` 分发，主进程以 `ELECTRON_RUN_AS_NODE` 复用 Electron 自带 Node 拉起，开箱即用。
- **SM3 兼容层**：Electron 自带 Node 使用 BoringSSL，不支持 SM3 摘要；官方接口签名依赖 SM3，
  因此 `backend/shared/sm3.mjs` 提供纯 JS 实现，由 `engine-crypto.mjs` 在引擎沙箱内做回退，
  解决「打包后播放报 502」的问题（开发环境用系统 Node 不会暴露）。
- **macOS 标题栏**：`titleBarStyle: 'hidden'` + `trafficLightPosition` 复用系统原生红绿灯，
  自绘三键在 macOS 下隐藏，标题栏左侧留出避让区，双击空白处最大化。

## 免责声明

- 本项目为**个人学习与技术交流**用途的第三方客户端，与红果短剧官方无任何隶属、授权或合作关系。
- 项目不托管、不转存、不修改任何影视内容，所有数据均实时请求官方公开接口，版权归原权利人所有。
- 请勿用于任何商业用途；因使用本项目产生的任何后果由使用者自行承担。
- 如涉及侵权，请联系删除。

## 许可证

本项目采用 **GPL-3.0**（见 [LICENSE](LICENSE)）。

原因：内容引擎 `backend/**/vendor/hongguo.cjs` 源自 GPL-3.0 授权的第三方项目
（见 `backend/server/vendor/NOTICE.md`，许可证原文见同目录 `LICENSE.drpys`），
随应用一同分发，因此整体以 GPL-3.0 开源。项目自研部分同样按 GPL-3.0 提供。
