// HongguoTV 桌面版 —— 无边框主窗口 + 自定义窗口控制（IPC）
// 加载逻辑：VITE_DEV_SERVER_URL 存在时加载 Vite dev server；否则加载 dist 构建产物
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 注意：不要禁用硬件加速。官方视频流为 HEVC (bytevc1)，Chromium 在 Windows 上依赖
// GPU/平台硬解 HEVC；禁用硬件加速会导致播放黑屏、只有声音没有画面、偶发播放失败。

// 桌面端放开自动播放限制：播放窗口打开/换集后无需用户手势即可自动起播
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;          // 主窗口
let playerWin = null;    // 独立播放窗口
let allowMainClose = false; // 关闭确认弹窗“确认关闭”后置位，跳过 close 拦截
let closeAllPending = false;     // 关闭确认流程进行中：两窗口都暂存，待确认后统一关闭
let mainCloseReceived = false;   // 本次关闭流程中主窗口是否已收到 close（区分「一键关闭全部」与「单独关播放窗」）
let playerAloneClosing = false;  // 单独关闭播放窗口（非一键全部）的放行标记
let backendChild = null;  // 打包模式下随应用拉起的后端子进程

const isMac = process.platform === 'darwin';

// 窗口基础配置（主窗口 / 播放窗口共用）：
// - Windows / Linux：无边框（frame: false）+ 自绘右上三键窗口控制
// - macOS：保留系统窗口框架但隐藏标题栏（titleBarStyle: 'hidden'），
//   左上由系统提供「红绿灯」按钮与原生双击最大化；自绘三键在渲染层隐藏
//   （见 src/components/WindowControls.jsx），标题栏左侧留出避让区（nav.css / player.css）。
//   自绘三键无法还原 macOS 红绿灯的原生交互（悬浮展开图标、全屏并入等），故直接复用原生。
function baseWindowOptions({ width, height, minWidth, minHeight, backgroundColor }) {
  const opts = {
    width,
    height,
    minWidth,
    minHeight,
    show: false,
    backgroundColor,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
  if (isMac) {
    opts.titleBarStyle = 'hidden';
    opts.trafficLightPosition = { x: 14, y: 18 };
  } else {
    opts.frame = false;
    opts.icon = path.join(__dirname, 'icon.ico');
  }
  return opts;
}

function loadApp(target, query) {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    if (query) url.search = new URLSearchParams(query).toString();
    target.loadURL(url.toString());
    return;
  }
  const file = path.join(__dirname, 'dist', 'index.html');
  if (query) target.loadFile(file, { query });
  else target.loadFile(file);
}

// 首帧绘制完成后显示窗口，避免白屏闪烁；3s 兜底防渲染异常导致窗口永不出现
function showWhenReady(target) {
  let shown = false;
  const showWindow = () => {
    if (shown || !target || target.isDestroyed()) return;
    shown = true;
    target.show();
  };
  target.once('ready-to-show', showWindow);
  setTimeout(showWindow, 3000);
}

// 取发送 IPC 消息的渲染进程所属窗口，使窗口控制在任意窗口内均生效
function senderWin(event) {
  try {
    return event.sender.getOwnerBrowserWindow();
  } catch (_) {
    return null;
  }
}

function createWindow() {
  win = new BrowserWindow(
    baseWindowOptions({
      width: 1440,
      height: 900,
      minWidth: 960,
      minHeight: 600,
      backgroundColor: '#131414'
    })
  );

  // 直接加载应用页面
  loadApp(win);
  showWhenReady(win);

  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[hongguo] did-fail-load:', code, desc);
  });

  // 记录渲染进程崩溃，便于排查“窗口不出现”问题
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[hongguo] render-process-gone:', details);
  });

  // 最大化 / 还原状态同步给渲染进程（含系统手势触发的变化）
  win.on('maximize', () => win.webContents.send('win:state', 'maximized'));
  win.on('unmaximize', () => win.webContents.send('win:state', 'restored'));

  // 页面内的外链一律交给系统默认浏览器，不让壳子自己被导航走
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭拦截：存在活跃播放窗口时，先经渲染进程确认再决定是否联动关闭
  win.on('close', (e) => {
    if (allowMainClose) return;
    if (playerWin && !playerWin.isDestroyed()) {
      e.preventDefault();
      mainCloseReceived = true;
      if (!closeAllPending) {
        closeAllPending = true;
        raiseMainForConfirm();
        win.webContents.send('win:confirm-close');
      }
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

// 创建独立播放窗口：左侧播放器 + 右侧信息栏，自带原生风格自绘标题栏
function createPlayerWindow(seriesId, episodeId) {
  // 已有播放窗口则复用：向渲染进程推送导航消息（SPA 内部切换并压入播放历史，不再整页重载）
  if (playerWin && !playerWin.isDestroyed()) {
    playerWin.webContents.send('player:navigate', {
      seriesId: String(seriesId),
      episodeId: episodeId ? String(episodeId) : null
    });
    if (playerWin.isMinimized()) playerWin.restore();
    playerWin.focus();
    return;
  }

  playerWin = new BrowserWindow(
    baseWindowOptions({
      width: 1600,
      height: 940,
      minWidth: 1200,
      minHeight: 700,
      backgroundColor: '#121212'
    })
  );

  // 直接加载播放页
  loadApp(playerWin, {
    player: '1',
    seriesId,
    episodeId: episodeId || ''
  });
  showWhenReady(playerWin);

  playerWin.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[hongguo-player] did-fail-load:', code, desc);
  });

  playerWin.webContents.on('render-process-gone', (_e, details) => {
    console.error('[hongguo-player] render-process-gone:', details);
  });

  // 播放窗口自身的最大化/还原状态同步
  playerWin.on('maximize', () => playerWin && playerWin.webContents.send('win:state', 'maximized'));
  playerWin.on('unmaximize', () => playerWin && playerWin.webContents.send('win:state', 'restored'));

  // 播放窗口内的外链交系统浏览器
  playerWin.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  playerWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭拦截：配合「任务栏一键关闭全部窗口」。
  // 单独关闭播放窗口时，200ms 内若主窗口未收到 close，判定为单独关闭，正常放行；
  // 若主窗口也收到 close（一键关闭全部），则聚焦主窗口并弹确认，两窗口均暂存，确认后统一关闭。
  playerWin.on('close', (e) => {
    if (allowMainClose || playerAloneClosing) return;
    if (closeAllPending) {
      e.preventDefault();
      return;
    }
    if (win && !win.isDestroyed()) {
      e.preventDefault();
      raiseMainForConfirm();
      setTimeout(() => {
        if (mainCloseReceived) {
          // 主窗口也进入关闭流程 → 一键关闭全部：聚焦主窗口并弹确认
          if (!closeAllPending) {
            closeAllPending = true;
            win.webContents.send('win:confirm-close');
          }
        } else {
          // 仅关闭播放窗口：放行
          playerAloneClosing = true;
          playerWin.close();
        }
      }, 200);
    }
  });

  playerWin.on('closed', () => {
    playerWin = null;
  });
}

// 窗口控制：作用于发送消息的窗口本身（主窗口 / 播放窗口通用）
ipcMain.on('win:minimize', (event) => {
  const w = senderWin(event);
  if (w) w.minimize();
});
ipcMain.on('win:toggle-maximize', (event) => {
  const w = senderWin(event);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
});
ipcMain.on('win:close', (event) => {
  const w = senderWin(event);
  if (w) w.close();
});

// 由渲染进程请求打开独立播放窗口
ipcMain.on('player:open', (_event, seriesId, episodeId) => {
  if (seriesId) createPlayerWindow(String(seriesId), episodeId ? String(episodeId) : null);
});

// 关闭确认弹窗“确认关闭”：联动关闭主窗口与播放窗口
ipcMain.on('win:close-confirmed', () => {
  allowMainClose = true;
  closeAllPending = false;
  mainCloseReceived = false;
  playerAloneClosing = false;
  try {
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
  } catch (_) {}
  if (playerWin && !playerWin.isDestroyed()) playerWin.close();
  if (win && !win.isDestroyed()) win.close();
  allowMainClose = false;
});

// 关闭确认弹窗“取消”：放弃本次关闭，复位协调状态，后续关闭恢复正常
ipcMain.on('win:close-cancel', () => {
  closeAllPending = false;
  mainCloseReceived = false;
  playerAloneClosing = false;
  try {
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
  } catch (_) {}
});

// 聚焦主窗口：隐藏/最小化则还原显示；已关闭则兜底重建，保证“回到主界面”可靠可用
function focusMainWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// 「关闭全部窗口」场景下播放窗口仍开着，临时置顶主窗口以确保确认弹窗可见，待确认/取消后还原
function raiseMainForConfirm() {
  focusMainWindow();
  try {
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(true);
  } catch (_) {}
}

// 播放窗口 logo 点击：最小化播放窗口并聚焦主窗口
ipcMain.on('player:minimize-focus-main', (event) => {
  const w = senderWin(event);
  if (w) w.minimize();
  focusMainWindow();
});

// 播放窗口内点击演员：聚焦主窗口并在主窗口中打开演员详情页
ipcMain.on('player:open-character', (_event, id) => {
  if (!id) return;
  if (!win || win.isDestroyed()) {
    // 主窗口已关闭：兜底重建，待页面加载完成后再投递演员详情导航
    createWindow();
    win.webContents.once('did-finish-load', () => {
      if (win && !win.isDestroyed()) win.webContents.send('app:open-character', String(id));
    });
    return;
  }
  focusMainWindow();
  win.webContents.send('app:open-character', String(id));
});

// 打包模式下，随应用拉起内置后端（custom-server），使安装包开箱即用。
// 以 ELECTRON_RUN_AS_NODE 复用 Electron 自带的 Node 运行后端入口，无需额外分发 Node。
// dev 模式下后端由开发者单独启动（见 README），此处跳过。
function startBackend() {
  if (!app.isPackaged) return;
  try {
    const backendEntry = path.join(process.resourcesPath, 'backend', 'custom-server', 'index.mjs');
    const dataDir = path.join(app.getPath('userData'), 'backend-data');
    fs.mkdirSync(dataDir, { recursive: true });
    backendChild = spawn(process.execPath, [backendEntry], {
      cwd: dataDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HG_DATA_DIR: dataDir
      },
      stdio: 'ignore'
    });
    backendChild.on('error', (e) => console.error('[backend] spawn error:', e));
    backendChild.on('exit', (code) => console.log('[backend] exited with', code));
    console.log('[backend] started:', backendEntry);
  } catch (e) {
    console.error('[backend] failed to start:', e);
  }
}

function stopBackend() {
  if (backendChild && !backendChild.killed) {
    try {
      backendChild.kill('SIGTERM');
    } catch (_) {}
    backendChild = null;
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => app.quit());
