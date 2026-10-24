import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';
import './styles/nav.css';
import './styles/banner.css';
import './styles/sections.css';
import './styles/category.css';
import './styles/rank.css';
import './styles/detail.css';
import './styles/player.css';
import './styles/search.css';

// 启动过渡图：与主进程先加载的 loading.html 使用同一套视觉（#131414 + 320px logo），
// 应用页面接管后由 App 在首屏内容就绪时调用 __hgHideSplash 淡出。
// 最短展示 240ms，避免数据命中缓存时启动图一闪而过。
const splashEl = document.getElementById('hg-splash');
const splashStartAt = performance.now();
const MIN_SPLASH_MS = 240;
let splashHiding = false;
let splashRemoved = false;

const removeSplash = () => {
  if (splashRemoved || !splashEl) return;
  splashRemoved = true;
  splashEl.remove();
};

window.__hgHideSplash = () => {
  if (splashHiding || splashRemoved || !splashEl) return;
  splashHiding = true;
  const wait = Math.max(0, MIN_SPLASH_MS - (performance.now() - splashStartAt));
  setTimeout(() => {
    if (!splashEl.isConnected) {
      splashRemoved = true;
      return;
    }
    splashEl.classList.add('hg-splash-hide');
    splashEl.addEventListener('transitionend', removeSplash, { once: true });
    // 兜底：过渡未触发（如窗口被隐藏）时强制移除
    setTimeout(removeSplash, 600);
  }, wait);
};

// 兜底：极端情况下（接口长时间无响应）也必须让启动图退出，避免永久遮挡首页
setTimeout(() => window.__hgHideSplash(), 6000);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
