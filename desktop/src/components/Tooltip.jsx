import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/*
 * 全局统一悬浮提示（替代原生 title）。
 *
 * === 为什么最小化 / 切窗口后 tooltip 会残留（根因）===
 * 1. 提示的显隐原本只绑定在宿主元素的 hover 上（onMouseEnter 显示 / onMouseLeave 隐藏）。
 * 2. 点击“回到主界面 / 最小化”时，窗口立刻被最小化或切换，
 *    光标并没有“移出”按钮 —— 窗口直接消失在光标下方，渲染进程被挂起，
 *    浏览器**不会派发 mouseleave**，于是 tip 状态残留。
 * 3. 窗口恢复 / 重新聚焦时，Chromium 会在“上次光标所在位置”补发一次 hover / focus，
 *    把残留（或刚清掉的）提示重新点亮 —— 表现为切回后提示仍在。
 *
 * === 修复策略（全局生命周期管理 + 抑制）===
 * - 任意窗口生命周期变化（失焦 / 聚焦 / 可见性变化 / 缩放 / pagehide）都立即清除所有提示，
 *   并进入“抑制”状态：此期间 hover / focus 不再显示提示；
 * - 抑制期间只有“指针确实移动过（坐标变化超过阈值）”或“指针真正离开宿主元素（mouseleave）”
 *   才解除抑制 —— 这样窗口切回时补发的陈旧 hover 会被忽略，不会复活；
 * - 滚动 / 滚轮 / 按下鼠标 / 触摸时只隐藏（定位已失效），不进入抑制；
 * - 键盘操作（Tab 等）视为活跃操作，解除抑制。
 */
const MOVE_THRESHOLD = 3; // px：位移超过该阈值才认为是真实移动

// 模块级全局状态（所有 Tip 实例共享）
let suppressed = false;
let suppressX = null;
let suppressY = null;
let lastX = null;
let lastY = null;
const hideCallbacks = new Set();
let installed = false;

function registerHide(cb) {
  hideCallbacks.add(cb);
  return () => hideCallbacks.delete(cb);
}

function hideAll() {
  hideCallbacks.forEach((cb) => {
    try {
      cb();
    } catch (_) {
      /* 单个实例异常不影响其它 */
    }
  });
}

function suppressAll() {
  suppressed = true;
  suppressX = lastX;
  suppressY = lastY;
  hideAll();
}

function armAll() {
  suppressed = false;
}

// 指针是否自抑制以来真实移动过（坐标变化超过阈值）
function pointerMoved(e) {
  if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return false;
  if (suppressX == null || suppressY == null) return false;
  return (
    Math.abs(e.clientX - suppressX) > MOVE_THRESHOLD ||
    Math.abs(e.clientY - suppressY) > MOVE_THRESHOLD
  );
}

function installGlobalListeners() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // 窗口生命周期变化：立即清空并抑制，避免切回时补发的 hover 复活提示
  const onLifecycle = () => suppressAll();
  window.addEventListener('blur', onLifecycle);
  window.addEventListener('focus', onLifecycle);
  window.addEventListener('resize', onLifecycle);
  window.addEventListener('pagehide', onLifecycle);
  document.addEventListener('visibilitychange', onLifecycle);

  // 交互 / 位移：只隐藏（定位会失效），不进入抑制
  const onDismiss = () => hideAll();
  window.addEventListener('scroll', onDismiss, true);
  window.addEventListener('wheel', onDismiss, { passive: true, capture: true });
  document.addEventListener('mousedown', onDismiss, true);
  document.addEventListener('touchstart', onDismiss, true);

  // 记录指针位置；若抑制后指针真实移动，则解除抑制
  document.addEventListener(
    'mousemove',
    (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (suppressed && pointerMoved(e)) armAll();
    },
    true
  );

  // 键盘操作（Tab 等）也视为用户在活跃操作，解除抑制
  document.addEventListener('keydown', () => armAll(), true);
}

installGlobalListeners();

export default function Tip({ label, multiline = false, children }) {
  const hostRef = useRef(null);
  const [tip, setTip] = useState(null);

  const show = useCallback(
    (e) => {
      // 抑制期间：非真实移动（补发的陈旧 hover）一律忽略，不显示
      if (suppressed) {
        if (!e || !pointerMoved(e)) return;
        armAll();
      }
      const host = hostRef.current;
      if (!host || !label) return;
      const el = host.firstElementChild || host;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      setTip({
        cx: r.left + r.width / 2,
        // 元素距顶不足 64px（如标题栏按钮）时提示显示在下方
        below: r.top < 64,
        y: r.top < 64 ? r.bottom : r.top
      });
    },
    [label]
  );

  const hide = useCallback(() => setTip(null), []);

  // 指针真正离开宿主元素：隐藏并解除抑制（用户重新悬停时提示可正常出现）
  const onLeave = useCallback(() => {
    hide();
    armAll();
  }, [hide]);

  // 把本实例的隐藏回调注册到全局（生命周期变化时统一清空）
  React.useEffect(() => registerHide(hide), [hide]);

  // 组件卸载（如导航离开播放窗口）时确保清理提示状态
  React.useEffect(() => () => setTip(null), []);

  if (!label) return children;

  return (
    <span
      ref={hostRef}
      className="hg-tip-host"
      onMouseEnter={show}
      onMouseLeave={onLeave}
      onFocus={() => {
        // 键盘聚焦才显示；抑制期间（窗口刚切回）不显示
        if (!suppressed) show();
      }}
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
