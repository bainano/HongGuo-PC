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

// 启动过渡图：首屏内容就绪（App 调用 __hgHideSplash）后立即淡出移除；
// 显示时长完全匹配真实加载耗时，不设最短展示限制
const splashEl = document.getElementById('hg-splash');
let splashHidden = false;
window.__hgHideSplash = () => {
  if (splashHidden || !splashEl) return;
  splashHidden = true;
  splashEl.classList.add('hg-splash-hide');
  splashEl.addEventListener('transitionend', () => splashEl.remove(), { once: true });
  // 兜底：过渡未触发时强制移除
  setTimeout(() => splashEl.parentNode && splashEl.remove(), 600);
};
// 兜底：8s 内无论内容是否就绪都关闭过渡图，避免极端情况下永久遮挡
setTimeout(() => window.__hgHideSplash(), 8000);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
