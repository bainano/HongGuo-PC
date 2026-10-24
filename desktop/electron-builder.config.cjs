// electron-builder 配置（CommonJS）
// 构建产物输出到 dist-electron/；后端 custom-server 作为 extraResources 随包分发，
// 由主进程在打包模式下自动拉起（见 main.js）。
// defineConfig 仅是 electron-builder v26+ 提供的类型辅助函数，v25 不导出它。
// 这里做兼容回退，保证 v25 / v26+ 都能正常加载本配置。
const builder = require('electron-builder');
const defineConfig =
  typeof builder.defineConfig === 'function' ? builder.defineConfig : (config) => config;
const fs = require('fs');
const path = require('path');

// 优先复用本机已安装的 Electron 运行时（node_modules/electron/dist）。
// 避免每次打包都重新下载 150MB+ 运行时；在网络受限/离线环境下也能正常出包。
// 该目录不存在时回退到 electron-builder 默认的下载逻辑。
const localElectronDist = path.join(__dirname, 'node_modules', 'electron', 'dist');
const electronDist = fs.existsSync(path.join(localElectronDist, 'electron.exe'))
  ? localElectronDist
  : undefined;

module.exports = defineConfig({
  appId: 'com.hongguotv.desktop',
  productName: '红果短剧',
  copyright: 'Copyright © 2026',
  electronDist,
  directories: {
    // 可用环境变量 HG_BUILD_OUTPUT 改写产物目录（如构建到工作区之外，避开文件被占用）
    output: process.env.HG_BUILD_OUTPUT || 'dist-electron',
    buildResources: '.'
  },
  // 只打包运行所需文件；依赖由 vite 打进 dist，运行时只需 electron 自带模块
  files: [
    'package.json',
    'main.js',
    'preload.js',
    'icon.ico',
    'index.html',
    'dist/**'
  ],
  // 随包附带后端服务（含其 node_modules，已 npm install）
  extraResources: [
    {
      from: '../backend',
      to: 'backend',
      filter: [
        '**/*',
        '!**/custom-server/data/**',
        '!**/*.sqlite*',
        '!**/service-address.json'
      ]
    }
  ],
  win: {
    // x64：主流 64 位 Windows 10/11；arm64：骁龙等 ARM 设备的 Windows 10/11
    // nsis：安装器（自动提权）；zip：免安装便携版（解压即用）
    // 32 位（ia32）不出包：Electron 44 起上游不再发布 win32-ia32 运行时，
    // 本项目的 Electron 版本无法产出 32 位包（如需 32 位只能降级到 Electron 43 及更早）。
    target: [
      { target: 'nsis', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] }
    ],
    icon: 'icon.ico'
  },
  // 注意：zip 没有独立的顶层配置段（会被 schema 校验拒绝），产物名使用默认命名
  nsis: {
    oneClick: false,
    // perMachine: true → 安装器清单带 RequestExecutionLevel admin，
    // 最终用户双击安装器即自动弹出 UAC 提权（标准系统对话框，中文），
    // 无需手动「以管理员身份运行」；安装到 Program Files（所有用户可用）。
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    // 三个架构的安装器同名会互相覆盖，产物名必须带上 ${arch}
    artifactName: '红果短剧-Setup-${version}-${arch}.${ext}'
  },
  mac: {
    // 同时产出 Intel(x64) 与 Apple Silicon(arm64) 两个 dmg
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] }
    ],
    category: 'public.app-category.entertainment',
    // mac 图标：由 512×512 的 icon.png 由 electron-builder 自行转换为 icns
    icon: 'icon.png',
    // 未配置 Apple 证书时关闭加固运行与 Gatekeeper 评估，仅产出可用 dmg
    hardenedRuntime: false,
    gatekeeperAssess: false
  },
  dmg: {
    artifactName: '红果短剧-${version}-${arch}.${ext}'
  },
  // 说明：这里**不配置** publish。
  // electron-builder 在 CI 环境检测到 publish 配置时会自动尝试发布，需要 GH_TOKEN，
  // 令牌缺失会直接让构建失败（GitHub Personal Access Token is not set）。
  // 本项目的发布统一交给 GitHub Actions 的 release job（softprops/action-gh-release），
  // 它使用 Actions 内置的 GITHUB_TOKEN，构建侧只负责出包。
  publish: null
});
