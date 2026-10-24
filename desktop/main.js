// HongguoTV 桌面版 —— 无边框主窗口 + 自定义窗口控制（IPC）
// 加载逻辑：VITE_DEV_SERVER_URL 存在时加载 Vite dev server；否则加载 dist 构建产物
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// 注意：不要禁用硬件加速。官方视频流为 HEVC (bytevc1)，Chromium 在 Windows 上依赖
// GPU/平台硬解 HEVC；禁用硬件加速会导致播放黑屏、只有声音没有画面、偶发播放失败。
// 启动流程：窗口先加载 loading.html（启动图）→ 首帧就绪后显示窗口 → 再切到应用，
// 应用内联同一张启动图，数据就绪后淡出，整个过程不会出现黑屏、闪烁或重复显示。

// 桌面端放开自动播放限制：播放窗口打开/换集后无需用户手势即可自动起播
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;          // 主窗口
let playerWin = null;    // 独立播放窗口
let allowMainClose = false; // 关闭确认弹窗“确认关闭”后置位，跳过 close 拦截

// ===== 启动流程：loading.html → 应用 =====
// 窗口先加载 loading.html（纯背景色 + logo，不依赖构建产物/接口），
// 启动页首帧绘制完成后立即显示窗口；随后再把同一窗口切到真正的应用。
// 应用 index.html 内联了与 loading.html 完全一致的启动图，切换时视觉连续，
// 冷启动不会出现黑屏、闪烁或重复显示；应用数据就绪后由渲染层淡出启动图。

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

// 返回 startApp（可重复调用，应用只会加载一次）
function bootWithLoading(target, query, label = '[hongguo]') {
  target.loadFile(path.join(__dirname, 'loading.html'));

  let appStarted = false;
  const startApp = () => {
    if (appStarted || !target || target.isDestroyed()) return;
    appStarted = true;
    loadApp(target, query);
  };

  // 启动页首帧已绘制：显示窗口（此时窗口内容就是启动图），再切到应用
  target.once('ready-to-show', () => {
    if (!target || target.isDestroyed()) return;
    target.show();
    target.focus();
    // 等启动图完成一帧合成再切应用，避免新页面在同一帧内覆盖启动页
    setTimeout(startApp, 60);
  });

  // 启动页/应用加载失败都不能卡住：直接进入应用（已启动过则无副作用）
  target.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
    console.error(`${label} did-fail-load:`, code, desc);
    if (isMainFrame !== false) startApp();
  });

  // 极端兜底：ready-to-show 未触发时，8s 后仍显示窗口并进入应用
  setTimeout(() => {
    if (!target || target.isDestroyed() || target.isVisible()) return;
    target.show();
    startApp();
  }, 8000);

  return startApp;
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
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#131414',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // 先加载轻量启动页，启动图首帧就绪后再切到应用（见 bootWithLoading）
  bootWithLoading(win);

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
      win.webContents.send('win:confirm-close');
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

  playerWin = new BrowserWindow({
    width: 1600,
    height: 940,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#121212',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // 与主窗口一致：先加载 loading.html，启动图就绪后再进入播放页
  bootWithLoading(
    playerWin,
    {
      player: '1',
      seriesId,
      episodeId: episodeId || ''
    },
    '[hongguo-player]'
  );

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
  if (playerWin && !playerWin.isDestroyed()) playerWin.close();
  if (win && !win.isDestroyed()) win.close();
  allowMainClose = false;
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
