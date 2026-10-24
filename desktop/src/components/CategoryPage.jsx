import React, { useEffect, useState } from 'react';
import { API_BASE, resolveApiBase } from '../api.js';
import SeriesCard from './SeriesCard.jsx';
import { SkeletonGridCard } from './Skeletons.jsx';

// 分类页（对照原站结构）：
// cat-bg 背景层（920px 渐变光晕）→ 面包屑 → 类型标签 → 题材标签 → 列表卡片区
// 顶部导航联动：类型（真人剧/漫剧/AI剧/漫画）+ 题材标签筛选，切换重新拉取列表
// 类型：对齐后端分类接口（无漫画源，原站漫画为独立内容体系，未接入）
const DEFAULT_TYPE = 'real-drama';
const CONTENT_TYPES = [
  { id: 'real-drama', name: '真人剧' },
  { id: 'comic-drama', name: '漫剧' },
  { id: 'ai-drama', name: 'AI剧' }
];

async function getJSON(path) {
  await resolveApiBase();
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json();
}

// 分页箭头（对照原站 pc-direction：第一页禁用上一页，最后一页禁用下一页）
function Arrow({ dir }) {
  const d =
    dir === 'prev'
      ? 'M8.123 1.89a.563.563 0 0 0-.796 0L3.615 5.602a.563.563 0 0 0 0 .796l3.712 3.712a.563.563 0 0 0 .796-.795L4.808 6l3.315-3.315a.563.563 0 0 0 0-.795'
      : 'M3.877 10.11c.22.22.576.22.796 0l3.712-3.712a.563.563 0 0 0 0-.796L4.673 1.89a.563.563 0 0 0-.796.795L7.192 6 3.877 9.315a.563.563 0 0 0 0 .795';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      fill="none"
      overflow="visible"
      preserveAspectRatio="none"
      style={{ display: 'block' }}
      viewBox="0 0 12 12"
      className="rank-arrow"
      aria-hidden="true"
    >
      <path fill="#fff" fillOpacity={dir === 'prev' ? '0.2' : '0.7'} fillRule="evenodd" d={d} clipRule="evenodd" />
    </svg>
  );
}

export default function CategoryPage({ initialType = DEFAULT_TYPE, initialTag = '', initialPage = 1, onParamsChange, onNavigate, onTitleChange, onOpen }) {
  const [type, setType] = useState(initialType);
  const [tag, setTag] = useState(initialTag);
  const [page, setPage] = useState(initialPage);

  // URL 驱动（后退/前进、地址直达）：外部参数变化时同步内部状态
  useEffect(() => {
    setType(initialType);
    setTag(initialTag);
    setPage(initialPage);
  }, [initialType, initialTag, initialPage]);
  const [tagList, setTagList] = useState([]);
  const [items, setItems] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState(null);

  // 当前类型名上报给 App：类型 tab 滚出可视区后，导航栏用它替换“分类”二字
  const currentName = CONTENT_TYPES.find((t) => t.id === type)?.name || null;
  useEffect(() => {
    onTitleChange && onTitleChange(currentName);
    return () => onTitleChange && onTitleChange(null);
  }, [currentName, onTitleChange]);

  // 题材标签池
  useEffect(() => {
    let alive = true;
    getJSON(`/api/category/tags?type=${type}`)
      .then((data) => {
        if (alive) setTagList(data.tags || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [type]);

  // 列表数据（类型 / 题材 / 页码联动；后端 /api/category/list 返回 pagination.totalPages）
  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(null);
    const q =
      tag === ''
        ? `/api/category/list?type=${type}&page=${page}`
        : `/api/category/list?type=${type}&tag=${tag}&page=${page}`;
    getJSON(q)
      .then((data) => {
        if (!alive) return;
        setItems(data.items || []);
        setTotalPages(Math.max(Number(data.pagination?.totalPages) || 1, 1));
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [type, tag, page]);

  const switchType = (id) => {
    if (id === type) return;
    setType(id);
    setTag('');
    setPage(1);
    onParamsChange && onParamsChange(id, '', 1);
  };

  const switchTag = (id) => {
    if (id === tag) return;
    setTag(id);
    setPage(1);
    onParamsChange && onParamsChange(type, id, 1);
  };

  const gotoPage = (p) => {
    if (p < 1 || p > totalPages || p === page) return;
    setPage(p);
    onParamsChange && onParamsChange(type, tag, p);
    window.scrollTo(0, 0);
  };

  // 分页页码：≤7 页全显；更多时用窗口（1 … 当前±1 … 末页）
  // 靠近两端时多补 1 页，避免出现 1 … 3 这种只隔一页的省略号
  const pageItems = (() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => ({
        type: 'page',
        page: i + 1
      }));
    }
    const set = new Set([1, totalPages, page, page - 1, page + 1]);
    if (page <= 4) [2, 3, 4].forEach((n) => set.add(n));
    if (page >= totalPages - 3) {
      [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => set.add(n));
    }
    const sorted = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
    const items = [];
    let prev = 0;
    for (const n of sorted) {
      if (prev && n - prev > 1) items.push({ type: 'gap', key: `gap-${prev}` });
      items.push({ type: 'page', page: n });
      prev = n;
    }
    return items;
  })();

  return (
    <div className="cat-root">
      {/* 背景层：920px 渐变光晕 + 深色底（类名避开首页封面的 .pc-cover，防级联冲突） */}
      <div className="cat-bg">
        <div className="cat-bg-img" />
      </div>

      {/* 分类导航：类型 + 题材标签 */}
      <nav className="pc-category-nav" aria-label="内容分类">
        <div className="pc-content-types">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={
                'pc-content-type' + (t.id === type ? ' pc-active' : '')
              }
              onClick={() => switchType(t.id)}
            >
              <span className="pc-content-type-text">{t.name}</span>
            </button>
          ))}
        </div>
        <div className="cat-nav-tags">
          <button
            type="button"
            className={'cat-nav-tag' + (tag === '' ? ' pc-active' : '')}
            onClick={() => switchTag('')}
          >
            全部
          </button>
          {tagList.map((t) => (
            <button
              key={t.id}
              type="button"
              className={'cat-nav-tag' + (tag === t.id ? ' pc-active' : '')}
              onClick={() => switchTag(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </nav>

      {/* 列表区：卡片网格（图片区域） */}
      <section className="pc-list-section">
        <div className="pc-list-page">
          <div className="pc-list-container">
            {error && (
              <div className="load-error">内容服务未连接（{error}）</div>
            )}
            {!items && !error && (
              <div className="cat-card-grid" aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => (
                  <SkeletonGridCard key={i} />
                ))}
              </div>
            )}
            {items && items.length === 0 && (
              <div className="load-error">该分类下暂无内容</div>
            )}
            {items && items.length > 0 && (
              <div className="cat-card-grid">
                {items.map((it) => (
                  // 与首页共用 SeriesCard，variant="category" 走 cat-* 样式（含"全x集"细体徽标）
                  <SeriesCard key={it.id} item={it} variant="category" onOpen={onOpen} />
                ))}
              </div>
            )}
          </div>
          {/* 分页（对照原站 pc-pagination：上一页 / 页码 / 下一页；复用 rank-pagination 样式） */}
          {items && items.length > 0 && (
            <nav className="rank-pagination cat-pagination" aria-label="分类分页">
              <button
                type="button"
                className="rank-page rank-arrow-btn"
                disabled={page <= 1}
                onClick={() => gotoPage(page - 1)}
                aria-label="上一页"
              >
                <Arrow dir="prev" />
              </button>
              {pageItems.map((it) =>
                it.type === 'gap' ? (
                  <span key={it.key} className="rank-page rank-page-gap" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={it.page}
                    type="button"
                    className={
                      'rank-page' + (it.page === page ? ' rank-page-active' : '')
                    }
                    onClick={() => gotoPage(it.page)}
                    aria-label={`第 ${it.page} 页`}
                  >
                    {it.page}
                  </button>
                )
              )}
              <button
                type="button"
                className="rank-page rank-arrow-btn"
                disabled={page >= totalPages}
                onClick={() => gotoPage(page + 1)}
                aria-label="下一页"
              >
                <Arrow dir="next" />
              </button>
            </nav>
          )}
        </div>
      </section>
    </div>
  );
}
