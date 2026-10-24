import React, { useEffect, useState } from 'react';
import { fetchSearch, fetchSeries } from '../api.js';
import { HeatIcon, PlayIcon } from './Icons.jsx';
import { SkeletonListCard } from './Skeletons.jsx';

// 搜索页（对照原站 /search/:keyword 结构）：结果列表（封面+标题高亮+热度+题材+简介+选集+播放正片）→ 分页
// 结果卡片直接复用榜单页 rank-* 结构与样式（选集按钮/展开收起完全一致），差异点：
//   无名次角标、标题命中关键词高亮（#fa7705）、题材行首带「短剧」、无评分/状态胶囊
// 数据源：后端 /api/search（官网 PC 搜索同源接口：题材/热度/总页数/集数）

// 分页箭头（与榜单页/分类页同款）
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

// 选集展开/收起箭头（与榜单页同款）
function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" preserveAspectRatio="none" aria-hidden="true">
      <path
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.5 9.5L11.6143 15.6143C11.8273 15.8273 12.1727 15.8273 12.3857 15.6143L18.5 9.5"
      />
    </svg>
  );
}

// 题材分隔圆点（与榜单页同款）
function CategoryDot() {
  return (
    <svg className="rank-tag-dot" viewBox="0 0 2 2" fill="none" preserveAspectRatio="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="white"
        fillOpacity="0.5"
        d="M1 2C1.55228 2 2 1.55228 2 1C2 0.447715 1.55228 0 1 0C0.447715 0 0 0.447715 0 1C0 1.55228 0.447715 2 1 2Z"
      />
    </svg>
  );
}

// 标题关键词高亮（对照原站 pc-highlight：命中片段 #fa7705）
function Highlight({ text, keyword }) {
  const kw = String(keyword || '').trim();
  if (!kw) return <>{text}</>;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === kw.toLowerCase() ? (
          <span className="sr-highlight" key={i}>
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

// 总集数：优先后端 episodeCount，兜底从 badge（如“全46集”）解析
function totalEpisodes(it) {
  return (
    it.episodeCount ||
    parseInt(String(it.badge || '').match(/\d+/)?.[0] || '', 10) ||
    0
  );
}

export default function SearchPage({ keyword, initialPage = 1, onParamsChange, onOpen, onPlay }) {
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // 展开选集的卡片（对照原站：默认收起，点箭头展开/收起）
  const [expandedId, setExpandedId] = useState(null);

  // 关键词变化时重置到第 1 页（新搜索入口 initialPage 恒为 1，与此一致）
  // 同时清空旧结果，优先展示骨架，避免残留上一关键词内容
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
    setData(null);
    setError(null);
  }, [keyword]);

  // URL 驱动（后退/前进、地址直达）：外部页码变化时同步
  useEffect(() => {
    setPage(initialPage);
  }, [initialPage]);

  // 搜索结果（关键词 / 页码联动）
  // 兜底机制（与 api.js getJSON 的自动重试配合）：
  // 内容加载【完成前】绝不截断已有内容、也绝不提前报错，判定规则如下——
  //   1) 发起新请求时不 setData(null)，保留上一页已加载内容（仅首屏/新关键词清空）；
  //   2) 仅在请求彻底完成（成功或重试耗尽）后才做成功/失败判定；
  //   3) 失败判定：若全程都未能取到任何内容（data 为空）才展示“加载失败”，
  //      否则保留上一页内容、不抛错，等待用户再次点击即可重试，
  //      从而优先保证内容可见、最大化加载成功率。
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchSearch(keyword, page)
      .then((d) => {
        if (!alive) return;
        setData(d);
      })
      .catch((e) => {
        if (!alive) return;
        // 关键判定：内容加载完成前不触发截断/报错；
        // 仅当全程都未能取到任何内容时才视为失败
        if (!data) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [keyword, page]);

  const items = data?.items || null;
  const totalPages = Math.max(Number(data?.totalPages) || 0, 1);

  const gotoPage = (p) => {
    if (p < 1 || p > totalPages || p === page) return;
    setPage(p);
    onParamsChange && onParamsChange(p);
    window.scrollTo(0, 0);
  };

  // 分页页码：≤7 页全显；更多时用窗口（1 … 当前±1 … 末页），与分类页一致
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
    const list = [];
    let prev = 0;
    for (const n of sorted) {
      if (prev && n - prev > 1) list.push({ type: 'gap', key: `gap-${prev}` });
      list.push({ type: 'page', page: n });
      prev = n;
    }
    return list;
  })();

  // 选集点击：按集号播放（详情接口补该集 ID；失败则从第 1 集播）
  const playEpisode = async (it, n) => {
    if (!onPlay) return;
    let episodeId = null;
    try {
      const detail = await fetchSeries(it.id);
      const ep = detail && Array.isArray(detail.episodes) ? detail.episodes[n - 1] : null;
      if (ep && ep.id) episodeId = ep.id;
    } catch (_) {}
    onPlay(it.id, episodeId);
  };

  const openDetail = (e, id) => {
    e.preventDefault();
    if (onOpen) onOpen(id);
  };

  return (
    <div className="sr-root">
      <main className="sr-main">
        {/* 加载提示：换页/重试期间优先保留上一页内容，仅以提示条告知，不截断 */}
        {loading && (
          <div className="sr-loading-bar" role="status" aria-label="加载中">
            加载中…
          </div>
        )}
        {error && !items && <div className="load-error">内容服务未连接（{error}）</div>}
        {!items && !error && (
          <ol className="rank-list sr-list" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li className="rank-item" key={i}>
                <SkeletonListCard />
              </li>
            ))}
          </ol>
        )}
        {items && items.length === 0 && (
          <div className="sr-empty">
            <p className="sr-empty-title">没有找到与“{keyword}”相关的内容</p>
            <p className="sr-empty-desc">换个关键词试试吧</p>
          </div>
        )}
        {items && items.length > 0 && (
          <>
            {/* 结果列表（复用榜单页 rank-* 卡片结构，40px 行距、条目 224px） */}
            {/* 加载中保留上一页内容并轻微变暗，避免内容被截断 */}
            <ol
              className="rank-list sr-list"
              aria-label={`“${keyword}”的搜索结果`}
              aria-busy={loading || undefined}
              style={loading && data ? { opacity: 0.55 } : undefined}
            >
              {items.map((it) => {
                const total = totalEpisodes(it);
                const expanded = expandedId === it.id;
                // 收起态一行 15 格：14 集 + 1 个展开箭头（与榜单页一致）
                const shown = expanded ? total : total <= 15 ? total : 14;
                const showToggle = expanded ? total > 0 : total >= 16;
                const categories = Array.isArray(it.categories)
                  ? it.categories
                  : String(it.tags || '')
                      .split('·')
                      .map((t) => t.trim())
                      .filter(Boolean);
                // 题材行首带「短剧」（对照原站 doc_type=23 的首位分类）
                const catList = categories.length > 0 ? ['短剧', ...categories] : [];
                return (
                  <li className="rank-item" key={it.id}>
                    <article
                      className={
                        'rank-article' + (expanded ? ' rank-article-expanded' : '')
                      }
                    >
                      <a
                        className="rank-cover-link"
                        href="#"
                        onClick={(e) => openDetail(e, it.id)}
                        aria-label={`查看${it.title}`}
                      >
                        <img
                          className="rank-cover"
                          src={it.cover}
                          alt={`${it.title}封面`}
                          loading="lazy"
                          decoding="async"
                          width="160"
                          height="224"
                        />
                      </a>
                      <div className="rank-content">
                        <div className="rank-heading">
                          <h2 className="rank-title">
                            <a
                              className="rank-title-link"
                              href="#"
                              onClick={(e) => openDetail(e, it.id)}
                              aria-label={`查看${it.title}`}
                            >
                              <Highlight text={it.title} keyword={keyword} />
                            </a>
                          </h2>
                          {it.heatText && (
                            <p className="rank-heat">
                              <HeatIcon />
                              {it.heatText}
                            </p>
                          )}
                        </div>
                        {(it.favoriteText || it.likeText) && (
                          <ul className="rank-engagement" aria-label="作品互动数据">
                            {it.favoriteText && <li>{it.favoriteText}</li>}
                            {it.likeText && <li>{it.likeText}</li>}
                          </ul>
                        )}
                        {catList.length > 0 && (
                          <p className="rank-tags">
                            {catList.map((t, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <CategoryDot />}
                                <span>{t}</span>
                              </React.Fragment>
                            ))}
                          </p>
                        )}
                        {it.description && <p className="rank-desc">{it.description}</p>}
                        <div className="rank-episodes" aria-label={`${it.title}选集`}>
                          <a
                            className="rank-play-button"
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              playEpisode(it, 1);
                            }}
                            aria-label={`播放${it.title}`}
                          >
                            <PlayIcon />
                            播放正片
                          </a>
                          <div className="rank-episode-list-container">
                            <div className="rank-episode-list">
                              {Array.from({ length: shown }, (_, i) => i + 1).map((n) => (
                                <a
                                  key={n}
                                  className="rank-episode"
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    playEpisode(it, n);
                                  }}
                                  aria-label={`播放${it.title}第${n}集`}
                                >
                                  {n}
                                </a>
                              ))}
                              {showToggle && (
                                <button
                                  type="button"
                                  className={
                                    'rank-more' + (expanded ? ' rank-more-open' : '')
                                  }
                                  aria-expanded={expanded}
                                  aria-label={
                                    expanded
                                      ? `收起${it.title}剧集`
                                      : `查看${it.title}全部剧集`
                                  }
                                  onClick={() =>
                                    setExpandedId(expanded ? null : it.id)
                                  }
                                >
                                  <ExpandIcon />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>

            {/* 分页（复用榜单页样式） */}
            {totalPages > 1 && (
              <nav className="rank-pagination" aria-label="搜索结果分页">
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
          </>
        )}
      </main>
    </div>
  );
}
