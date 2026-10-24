import React, { useEffect, useState } from 'react';
import Tip from './Tooltip.jsx';

// Segoe Fluent Icons 路径（y 轴已翻转，24 viewBox 内渲染）
const MAX_D =
  'M302 0Q242 0 187.0 24.5Q132 49 90.5 90.5Q49 132 24.5 187.0Q0 242 0 302V1746Q0 1806 24.5 1861.0Q49 1916 90.5 1957.5Q132 1999 187.0 2023.5Q242 2048 302 2048H1746Q1806 2048 1861.0 2023.5Q1916 1999 1957.5 1957.5Q1999 1916 2023.5 1861.0Q2048 1806 2048 1746V302Q2048 242 2023.5 187.0Q1999 132 1957.5 90.5Q1916 49 1861.0 24.5Q1806 0 1746 0ZM1741 205Q1762 205 1780.5 213.0Q1799 221 1813.0 235.0Q1827 249 1835.0 267.5Q1843 286 1843 307V1741Q1843 1762 1835.0 1780.5Q1827 1799 1813.0 1813.0Q1799 1827 1780.5 1835.0Q1762 1843 1741 1843H307Q286 1843 267.5 1835.0Q249 1827 235.0 1813.0Q221 1799 213.0 1780.5Q205 1762 205 1741V307Q205 286 213.0 267.5Q221 249 235.0 235.0Q249 221 267.5 213.0Q286 205 307 205Z';
const RESTORE_D =
  'M1843 1441Q1843 1524 1810.0 1597.5Q1777 1671 1720.5 1725.5Q1664 1780 1589.5 1811.5Q1515 1843 1433 1843H427Q443 1889 472.0 1927.0Q501 1965 539.0 1992.0Q577 2019 622.5 2033.5Q668 2048 717 2048H1433Q1560 2048 1672.0 1999.5Q1784 1951 1867.5 1868.0Q1951 1785 1999.5 1673.0Q2048 1561 2048 1434V717Q2048 668 2033.5 622.5Q2019 577 1992.0 539.0Q1965 501 1927.0 472.0Q1889 443 1843 427ZM302 0Q242 0 187.0 24.5Q132 49 90.5 90.5Q49 132 24.5 187.0Q0 242 0 302V1336Q0 1397 24.5 1451.5Q49 1506 90.5 1547.5Q132 1589 186.5 1613.5Q241 1638 302 1638H1336Q1397 1638 1452.0 1613.5Q1507 1589 1548.0 1548.0Q1589 1507 1613.5 1452.0Q1638 1397 1638 1336V302Q1638 241 1613.5 186.5Q1589 132 1547.5 90.5Q1506 49 1451.5 24.5Q1397 0 1336 0ZM1331 205Q1352 205 1370.5 213.0Q1389 221 1403.5 235.0Q1418 249 1426.0 267.5Q1434 286 1434 307V1331Q1434 1352 1426.0 1371.0Q1418 1390 1404.0 1404.0Q1390 1418 1371.0 1426.0Q1352 1434 1331 1434H307Q286 1434 267.5 1426.0Q249 1418 235.0 1403.5Q221 1389 213.0 1370.5Q205 1352 205 1331V307Q205 286 213.0 267.5Q221 249 235.0 235.0Q249 221 267.5 213.0Q286 205 307 205Z';
const MIN_D =
  'M102 1024Q81 1024 62.5 1032.0Q44 1040 30.0 1054.0Q16 1068 8.0 1086.5Q0 1105 0 1126Q0 1147 8.0 1165.5Q16 1184 30.0 1198.5Q44 1213 62.5 1221.0Q81 1229 102 1229H1946Q1967 1229 1985.5 1221.0Q2004 1213 2018.0 1198.5Q2032 1184 2040.0 1165.5Q2048 1147 2048 1126Q2048 1105 2040.0 1086.5Q2032 1068 2018.0 1054.0Q2004 1040 1985.5 1032.0Q1967 1024 1946 1024Z';
const CLOSE_D =
  'M1024 879 175 30Q145 0 103 0Q59 0 29.5 29.5Q0 59 0 103Q0 145 30 175L879 1024L30 1873Q0 1903 0 1946Q0 1967 8.0 1986.0Q16 2005 30.0 2018.5Q44 2032 63.0 2040.0Q82 2048 103 2048Q145 2048 175 2018L1024 1169L1873 2018Q1903 2048 1946 2048Q1967 2048 1985.5 2040.0Q2004 2032 2018.0 2018.0Q2032 2004 2040.0 1985.5Q2048 1967 2048 1946Q2048 1903 2018 1873L1169 1024L2018 175Q2048 145 2048 103Q2048 82 2040.0 63.0Q2032 44 2018.5 30.0Q2005 16 1986.0 8.0Q1967 0 1946 0Q1903 0 1873 30Z';
const MAX_T = 'translate(0.000 24.000) scale(0.01172 -0.01172)';
const MIN_T = 'translate(0.000 25.201) scale(0.01172 -0.01172)';

function Icon({ d, t, id }) {
  return (
    <svg
      id={id}
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path d={d} transform={t} fill="currentColor" />
    </svg>
  );
}

// 窗口控制三键：最小化 / 最大化(还原) / 关闭
// 纯浏览器（网页版）下无 Electron preload 桥，窗口控制不可用，整体隐藏
export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const isElectron = typeof window !== 'undefined' && !!window.hgWin;

  useEffect(() => {
    const c = window.hgWin;
    if (!c) return;
    const off = c.onStateChange((state) => setMaximized(state === 'maximized'));
    return () => off && off();
  }, []);

  if (!isElectron) return null;

  const act = (fn) => {
    const c = window.hgWin;
    if (c) fn(c);
  };

  return (
    <div className="hg-win-controls" role="group" aria-label="窗口控制">
      <Tip label="最小化">
        <button
          type="button"
          className="hg-win-btn"
          id="hg-min"
          aria-label="最小化"
          onClick={() => act((c) => c.minimize())}
        >
          <Icon d={MIN_D} t={MIN_T} />
        </button>
      </Tip>
      <Tip label={maximized ? '还原' : '最大化'}>
        <button
          type="button"
          className="hg-win-btn"
          id="hg-max"
          aria-label={maximized ? '还原' : '最大化'}
          onClick={() => act((c) => c.toggleMaximize())}
        >
          <Icon d={maximized ? RESTORE_D : MAX_D} t={MAX_T} id="hg-max-icon" />
        </button>
      </Tip>
      <Tip label="关闭">
        <button
          type="button"
          className="hg-win-btn"
          id="hg-close"
          aria-label="关闭"
          onClick={() => act((c) => c.close())}
        >
          <Icon d={CLOSE_D} t={MAX_T} />
        </button>
      </Tip>
    </div>
  );
}
