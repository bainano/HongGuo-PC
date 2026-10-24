import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 全局统一悬浮提示组件，替代原生 title：
// - 包裹任意元素（host 用 display:contents，不破坏网格/弹性布局）
// - 提示气泡通过 portal 挂到 body、fixed 定位，不受 overflow 容器裁剪
// - 靠近视口顶部时自动翻转到元素下方；multiline 用于简介等长文本
export default function Tip({ label, multiline = false, children }) {
  const hostRef = useRef(null);
  const [tip, setTip] = useState(null);

  const show = useCallback(() => {
    const host = hostRef.current;
    if (!host || !label) return;
    const el = host.firstElementChild || host;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    setTip({
      cx: r.left + r.width / 2,
      // 元素距顶不足 64px（如标题栏按钮）时提示显示在下方
      below: r.top < 64,
      y: r.top < 64 ? r.bottom : r.top,
    });
  }, [label]);

  const hide = useCallback(() => setTip(null), []);

  if (!label) return children;

  return (
    <span
      ref={hostRef}
      className="hg-tip-host"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {tip &&
        createPortal(
          <span
            role="tooltip"
            className={
              'hg-tip' +
              (tip.below ? ' hg-tip-below' : '') +
              (multiline ? ' hg-tip-multiline' : '')
            }
            style={{ left: tip.cx, top: tip.y }}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}
