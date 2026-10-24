// HongguoTV 桌面版 —— 预加载脚本：向页面暴露窗口控制 API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hgWin', {
  // 运行平台（'darwin' | 'win32' | 'linux'）：渲染层据此切换 macOS 原生标题栏布局
  platform: process.platform,
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
  onStateChange: (cb) => {
    const handler = (_event, state) => cb(state);
    ipcRenderer.on('win:state', handler);
    return () => ipcRenderer.removeListener('win:state', handler);
  },
  // 打开独立播放窗口（传剧集 ID 与单集 ID）
  openPlayer: (seriesId, episodeId) =>
    ipcRenderer.send('player:open', seriesId, episodeId || null),
  // 播放窗口 logo：最小化当前播放窗口并聚焦主窗口
  minimizeAndFocusMain: () => ipcRenderer.send('player:minimize-focus-main'),
  // 播放窗口内点击演员：在主窗口中打开演员详情页
  openCharacterInMain: (id) => ipcRenderer.send('player:open-character', id),
  // 主窗口监听：主进程转发的“打开演员详情页”请求
  onOpenCharacter: (cb) => {
    const handler = (_event, id) => cb(id);
    ipcRenderer.on('app:open-character', handler);
    return () => ipcRenderer.removeListener('app:open-character', handler);
  },
  // 播放窗口监听：主窗口在已有播放窗口中打开新剧（SPA 内部切换）
  onPlayerNavigate: (cb) => {
    const handler = (_event, payload) => cb(payload || {});
    ipcRenderer.on('player:navigate', handler);
    return () => ipcRenderer.removeListener('player:navigate', handler);
  },
  // 主窗口监听：存在活跃播放窗口时，主进程拦截关闭并请求用户确认
  onConfirmClose: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('win:confirm-close', handler);
    return () => ipcRenderer.removeListener('win:confirm-close', handler);
  },
  // 用户在关闭确认弹窗中点击“确认关闭”：联动关闭主窗口与播放窗口
  confirmClose: () => ipcRenderer.send('win:close-confirmed'),
  // 用户在关闭确认弹窗中点击“取消”：放弃本次关闭，复位主进程协调状态
  cancelClose: () => ipcRenderer.send('win:close-cancel')
});
