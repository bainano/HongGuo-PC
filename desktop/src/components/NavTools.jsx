import React from 'react';
import Tip from './Tooltip.jsx';

// 标题栏导航工具：后退 / 前进 / 刷新（主窗口与播放窗口标题栏共用）
export default function NavTools({
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
  onRefresh,
  onOpenShare
}) {
  return (
    <div className="nv-tools" role="group" aria-label="页面导航">
      <Tip label="后退">
        <button
          type="button"
          className="nv-tool-btn"
          disabled={!canGoBack}
          onClick={onBack}
          aria-label="后退"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Tip>
      <Tip label="前进">
        <button
          type="button"
          className="nv-tool-btn"
          disabled={!canGoForward}
          onClick={onForward}
          aria-label="前进"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Tip>
      <Tip label="刷新">
        <button
          type="button"
          className="nv-tool-btn"
          onClick={onRefresh}
          aria-label="刷新"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M13.6 8A5.6 5.6 0 1 1 8 2.4c1.5 0 2.9.6 3.9 1.6M13.5 2.2v2.8h-2.8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </Tip>
      {onOpenShare && (
        <Tip label="打开分享链接">
          <button
            type="button"
            className="nv-tool-btn"
            onClick={onOpenShare}
            aria-label="打开分享链接"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M6.5 9.5 9.5 6.5M7 4.2l.6-.6a2.8 2.8 0 0 1 3.96 3.96l-.6.6M9 11.8l-.6.6A2.8 2.8 0 0 1 4.44 8.44l.6-.6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </Tip>
      )}
    </div>
  );
}
