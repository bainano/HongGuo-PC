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
    // nsis：安装器（自动提权）；zip：免安装便携版（解压即用）
    target: ['nsis', 'zip'],
    icon: 'icon.ico'
  },
  zip: {
    artifactName: '红果短剧-${version}-portable-win-${arch}.${ext}'
  },
  nsis: {
    oneClick: false,
    // perMachine: true → 安装器清单带 RequestExecutionLevel admin，
    // 最终用户双击安装器即自动弹出 UAC 提权（标准系统对话框，中文），
    // 无需手动「以管理员身份运行」；安装到 Program Files（所有用户可用）。
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    artifactName: '红果短剧-Setup-${version}.${ext}'
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
  // GitHub Release 发布目标：配合 tag 推送 + GH_TOKEN 自动上传安装包
  publish: [
    {
      provider: 'github',
      owner: 'bainano',
      repo: 'HongGuo-PC'
    }
  ]
});
