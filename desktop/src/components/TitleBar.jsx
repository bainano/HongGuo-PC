import React from 'react';
import NavTools from './NavTools.jsx';
import WindowControls from './WindowControls.jsx';
import Tip from './Tooltip.jsx';
import iconPc from '../assets/icon-pc.svg';

// 独立播放窗口标题栏：复用主窗口标题栏组件（logo + 导航工具 + 窗口控制），
// 仅保留 logo 展示区与窗口控制区，移除导航链接与搜索框；
// logo 为无文字版红果图标，点击 = 最小化播放窗口并聚焦主窗口。
export default function TitleBar({
  onLogoClick,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
  onRefresh
}) {
  return (
    <div className="pl-titlebar">
      <Tip label="回到主界面">
        <button
          type="button"
          className="tb-logo"
          onClick={onLogoClick}
          aria-label="回到主界面"
        >
          <img className="tb-logo-img" src={iconPc} alt="" draggable="false" />
          <span className="tb-logo-text">回到主界面</span>
        </button>
      </Tip>
      <NavTools
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={onBack}
        onForward={onForward}
        onRefresh={onRefresh}
      />
      <WindowControls />
    </div>
  );
}
