// 平台判定：Electron 桌面端由 preload 暴露 window.hgWin.platform；网页版无该桥接。
// macOS 下窗口使用系统原生红绿灯（main.js: titleBarStyle 'hidden'），自绘窗口三键隐藏，
// 标题栏左侧需留出避让区，故在 <html> 上打 is-mac 标记供 CSS 使用。
export const IS_ELECTRON =
  typeof window !== 'undefined' && !!window.hgWin;

export const IS_MAC =
  IS_ELECTRON && window.hgWin.platform === 'darwin';

if (typeof document !== 'undefined' && IS_MAC) {
  document.documentElement.classList.add('is-mac');
}

// macOS 隐藏标题栏后，双击标题栏空白处切换最大化（对齐系统原生行为）。
// 交互元素（输入框/按钮/链接/下拉）上的双击不触发，避免误操作。
export function macTitleBarDoubleClick(e) {
  if (!IS_MAC) return;
  const target = e && e.target;
  if (target && typeof target.closest === 'function') {
    if (target.closest('input, textarea, button, a, select, .pc-dropdown-menu')) return;
  }
  if (window.hgWin && window.hgWin.toggleMaximize) window.hgWin.toggleMaximize();
}
