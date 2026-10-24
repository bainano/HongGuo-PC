import React, { useEffect, useState } from 'react';
import { fetchRankList, fetchRankTypes } from '../api.js';
import heroHotDrama from '../assets/hero/hero-hot-drama.jpg';
import heroRealDrama from '../assets/hero/hero-hot-real-drama.jpg';
import heroAiDrama from '../assets/hero/hero-hot-ai-drama.jpg';
import heroComicDrama from '../assets/hero/hero-hot-comic-drama.jpg';
import { ScoreIcon, HeatIcon, PlayIcon } from './Icons.jsx';
import { SkeletonListCard } from './Skeletons.jsx';

// 榜单页（对照原站结构）：
// hero 横幅（四大榜单各一张，切榜即换图）→ 面包屑 → 榜单 tabs → 名次列表（角标/热度/状态评分收藏点赞胶囊/题材点分隔/简介/播放正片+选集展开收起）→ 分页
// 数据源：后端 /api/rank/types + /api/rank/list（官方四大榜，每榜 5 页 × 20 部，共 100 部）
// hero 图为静态品牌素材，随榜单类型本地切换；列表数据全部来自后端
const HERO_MAP = {
  'hot-drama': heroHotDrama,
  'hot-real-drama': heroRealDrama,
  'hot-ai-drama': heroAiDrama,
  'hot-comic-drama': heroComicDrama,
};
const DEFAULT_TYPE = 'hot-drama';
// 后端未返回时的临时榜单列表（防首屏空 tab）
const FALLBACK_TYPES = [
  { id: 'hot-drama', name: '红果热播榜' },
  { id: 'hot-real-drama', name: '真人剧热播榜' },
  { id: 'hot-ai-drama', name: 'AI剧热播榜' },
  { id: 'hot-comic-drama', name: '漫剧热播榜' }
];

// 名次角标：前三名金/银/铜渐变丝带，第 4 名起深色丝带（对照原站 svg 路径）
function RankBadge({ rank, uid }) {
  let fill;
  if (rank === 1) {
    fill = (
      <linearGradient id={`${uid}g`} x1="11.366" x2="9.027" y1="0" y2="19.194" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFD25F" />
        <stop offset="1" stopColor="#F3970B" />
      </linearGradient>
    );
  } else if (rank === 2) {
    fill = (
      <linearGradient id={`${uid}g`} x1="21.267" x2="9.167" y1="-0.526" y2="23.826" gradientUnits="userSpaceOnUse">
        <stop stopColor="#D4DBEC" />
        <stop offset="1" stopColor="#7F86A6" />
      </linearGradient>
    );
  } else if (rank === 3) {
    fill = (
      <linearGradient id={`${uid}g`} x1="21.267" x2="9.167" y1="-0.526" y2="23.826" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFCFAA" />
        <stop offset="1" stopColor="#D66A1E" />
      </linearGradient>
    );
  }
  const path =
    rank === 1
      ? 'M0 8a8 8 0 0 1 8-8h14l-1.631 12.996A8 8 0 0 1 12.431 20H0z'
      : rank <= 3
        ? 'M0 8a8 8 0 0 1 8-8h14l-1.555 12.954A8 8 0 0 1 12.502 20H0z'
        : 'M0 8C0 3.58172 3.58172 0 8 0H22L20.4451 12.9535C19.9624 16.9741 16.5516 20 12.5021 20H0V8Z';
  return (
    <span className="rank-badge">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="20"
        fill="none"
        overflow="visible"
        preserveAspectRatio="none"
        style={{ display: 'block' }}
        viewBox="0 0 22 20"
        aria-hidden="true"
      >
        {fill ? (
          <>
            <path fill={`url(#${uid}g)`} d={path} />
            <defs>{fill}</defs>
          </>
        ) : (
          <path fill="rgba(0,0,0,.4)" d={path} />
        )}
      </svg>
      <span className="rank-badge-num">{rank}</span>
    </span>
  );
}

// 火焰装饰图标（对照原站 hero 标题两侧）
function FlameIcon({ className }) {
  const p =
    'M8.082 1.193C9.147.22 11.196 0 11.196 0s-.428 2.034-1.493 3.003c-1.064.97-1.917 1.01-2.365.507-.448-.502-.325-1.352.74-2.322zM4.019 3.492C4.21 2.06 5.64.56 5.64.56s.976 1.835.779 3.266c-.193 1.432-.823 2.019-1.484 1.924-.665-.09-1.113-.825-.916-2.257M1.906 7.712c-.123-1.442.941-3.221.941-3.221s1.35 1.57 1.474 3.012-.365 2.148-1.03 2.208-1.262-.557-1.385-1.999M.499 12.079c-.414-1.387.26-3.35.26-3.35s1.642 1.257 2.056 2.64c.414 1.381.083 2.177-.557 2.37s-1.35-.283-1.764-1.665zM.568 17.002C-.157 15.76.04 13.686.04 13.686s1.893.83 2.617 2.078.596 2.098.015 2.441c-.577.343-1.38.05-2.104-1.198zM1.434 21.45C.389 20.462 0 18.419 0 18.419s2.045.259 3.09 1.248c1.044.99 1.153 1.844.694 2.337-.458.492-1.31.437-2.355-.552zM3.491 25.602c-1.29-.626-2.276-2.456-2.276-2.456s2.025-.378 3.32.249c1.292.626 1.652 1.407 1.366 2.013-.29.607-1.119.816-2.41.194M6.36 28.86c-1.429-.11-3.001-1.457-3.001-1.457s1.754-1.088 3.183-.98c1.43.11 2.045.707 1.991 1.383-.05.671-.749 1.168-2.178 1.059zM10.195 31.09c-1.424.165-3.218-.86-3.218-.86s1.518-1.406 2.942-1.57 2.138.303 2.217.974c.074.671-.517 1.288-1.941 1.452zM5.471 8.408c1.163-.716 3.114-.552 3.114-.552s-.754 1.825-1.921 2.536c-1.163.716-1.966.596-2.297.05-.33-.548-.064-1.318 1.1-2.034zM4.573 11.945c1.055-.875 3.006-.99 3.006-.99s-.493 1.915-1.542 2.785c-1.05.87-1.863.87-2.267.378-.404-.497-.246-1.298.803-2.173M4.47 15.524c.96-.974 2.892-1.287 2.892-1.287s-.3 1.954-1.262 2.928c-.96.974-1.769 1.054-2.217.602s-.375-1.268.586-2.243M4.9 19.288c.536-1.263 2.217-2.277 2.217-2.277s.433 1.924-.104 3.192-1.256 1.64-1.838 1.387c-.586-.254-.813-1.04-.276-2.302M6.354 22.699c.227-1.358 1.626-2.735 1.626-2.735s.872 1.77.64 3.127c-.231 1.358-.842 1.89-1.468 1.78s-1.03-.815-.803-2.172zM8.78 25.33c-.158-1.368.803-3.088.803-3.088s1.325 1.452 1.483 2.819-.286 2.053-.917 2.123c-.63.075-1.217-.492-1.37-1.86zM11.634 27.282c-.36-1.328.33-3.172.33-3.172s1.527 1.233 1.887 2.56.03 2.073-.586 2.242c-.611.17-1.277-.303-1.636-1.625zM7.105 4.95c1.134-.765 3.09-.69 3.09-.69S9.52 6.113 8.392 6.88c-1.129.765-1.937.685-2.292.153S5.977 5.716 7.11 4.95z';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="31.108"
      fill="none"
      overflow="visible"
      preserveAspectRatio="none"
      style={{ display: 'block' }}
      viewBox="0 0 14 31.108"
      className={className}
      aria-hidden="true"
    >
      <g fill="#fff">
        <path d={p} />
      </g>
    </svg>
  );
}

// 选集展开/收起箭头（#rank-hongguo-expand）
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

// 题材分隔圆点（#rank-hongguo-categoryDivider）
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

// 分页箭头
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

export default function RankPage({ initialType = DEFAULT_TYPE, initialPage = 1, onParamsChange, onNavigate, onTitleChange, onOpen }) {
  const [types, setTypes] = useState(null);
  const [type, setType] = useState(initialType);
  const [page, setPage] = useState(initialPage);

  // URL 驱动（后退/前进、地址直达）：外部参数变化时同步内部状态
  useEffect(() => {
    setType(initialType);
    setPage(initialPage);
  }, [initialType, initialPage]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // 展开选集的卡片（对照原站 pc-item-expanded：默认全部收起，点箭头展开/收起）
  const [expandedId, setExpandedId] = useState(null);

  // 榜单类型池（后端 /api/rank/types）
  useEffect(() => {
    let alive = true;
    fetchRankTypes()
      .then((t) => {
        if (alive) setTypes(t);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 榜单列表（类型 / 页码联动，后端 /api/rank/list）
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setExpandedId(null);
    fetchRankList(type, page)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [type, page]);

  const tabs = types && types.length > 0 ? types : FALLBACK_TYPES;
  const currentName =
    tabs.find((t) => t.id === type)?.name || data?.title || '榜单';

  // 当前榜名上报给 App：hero 标题滚出可视区后，导航栏用它替换“榜单”二字
  useEffect(() => {
    onTitleChange && onTitleChange(currentName);
    return () => onTitleChange && onTitleChange(null);
  }, [currentName, onTitleChange]);
  const updatedText =
    data?.updatedText || '今日已更新 · 基于红果内观看/互动等综合热度排序';
  const hero = HERO_MAP[type] || HERO_MAP[DEFAULT_TYPE];
  const totalPages = Math.max(data?.totalPages || 1, 1);
  const items = data?.items || null;

  const switchType = (id) => {
    if (id === type) return;
    setType(id);
    setPage(1);
    onParamsChange && onParamsChange(id, 1);
    window.scrollTo(0, 0);
  };
  const gotoPage = (p) => {
    if (p < 1 || p > totalPages || p === page) return;
    setPage(p);
    onParamsChange && onParamsChange(type, p);
    window.scrollTo(0, 0);
  };

  // 分页页码列表（1..totalPages，最多 5 页时全显）
  const pages = [];
  for (let i = 1; i <= totalPages; i++) pages.push(i);

  return (
    <div className="rank-root">
      {/* hero 横幅：切榜换图 */}
      <section className="rank-hero">
        <img
          className="rank-hero-img"
          src={hero}
          alt=""
          aria-hidden="true"
          fetchpriority="high"
        />
        <div className="rank-hero-content">
          <div className="rank-hero-title">
            <FlameIcon />
            <h1>{currentName}</h1>
            <FlameIcon className="rank-hero-title-right" />
          </div>
          <p className="rank-hero-sub">{updatedText}</p>
        </div>
      </section>

      <main className="rank-main">
        {/* 榜单 tabs */}
        <nav className="rank-tabs" aria-label="热播榜单分类">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={'rank-tab' + (t.id === type ? ' rank-tab-active' : '')}
              onClick={() => switchType(t.id)}
            >
              {t.name}
            </button>
          ))}
        </nav>

        {/* 榜单列表 */}
        <ol className="rank-list" aria-label={currentName}>
          {error && <li className="load-error">内容服务未连接（{error}）</li>}
          {!items && !error &&
            Array.from({ length: 4 }, (_, i) => (
              <li className="rank-item" key={i} aria-hidden="true">
                <SkeletonListCard />
              </li>
            ))}
          {items && items.length === 0 && (
            <li className="load-error">该榜单暂无内容</li>
          )}
          {items &&
            items.length > 0 &&
            items.map((it) => {
              // 总集数：优先后端 episodeCount，兜底从 badge（如“全80集/更新至12集”）解析
              const total =
                it.episodeCount ||
                parseInt(String(it.badge || '').match(/\d+/)?.[0] || '', 10) ||
                0;
              const expanded = expandedId === it.id;
              // 收起态容器（868px）一行 15 格：14 集 + 1 个展开箭头（对照原站 container-query 规则）
              const shown = expanded ? total : total <= 15 ? total : 14;
              const showToggle = expanded ? total > 0 : total >= 16;
              const statusTags = Array.isArray(it.statusTags) ? it.statusTags : [];
              const tagList = String(it.tags || '')
                .split('·')
                .map((t) => t.trim())
                .filter(Boolean);
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
                      onClick={(e) => {
                        e.preventDefault();
                        if (onOpen) onOpen(it.id);
                      }}
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
                      <RankBadge rank={it.rank} uid={`${type}-${it.rank}`} />
                    </a>
                    <div className="rank-content">
                      <div className="rank-heading">
                        <h2 className="rank-title">
                          <a
                            className="rank-title-link"
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              if (onOpen) onOpen(it.id);
                            }}
                            aria-label={`查看${it.title}`}
                          >
                            {it.title}
                          </a>
                        </h2>
                        <p className="rank-heat">
                          <HeatIcon />
                          {it.heatText}
                        </p>
                      </div>
                      <ul className="rank-engagement" aria-label="作品互动数据">
                        {statusTags.map((t) => (
                          <li className="rank-status-tag" key={t}>
                            {t}
                          </li>
                        ))}
                        {it.scoreText && (
                          <li className="rank-score-tag">
                            <ScoreIcon />
                            {it.scoreText}
                          </li>
                        )}
                        {it.favoriteText && <li>{it.favoriteText}</li>}
                        {it.likeText && <li>{it.likeText}</li>}
                      </ul>
                      {tagList.length > 0 && (
                        <p className="rank-tags">
                          {tagList.map((t, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <CategoryDot />}
                              <span>{t}</span>
                            </React.Fragment>
                          ))}
                        </p>
                      )}
                      {it.description && <p className="rank-desc">{it.description}</p>}
                      <div
                        className="rank-episodes"
                        aria-label={`${it.title}选集`}
                      >
                        <a
                          className="rank-play-button"
                          href="#"
                          onClick={(e) => e.preventDefault()}
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
                                onClick={(e) => e.preventDefault()}
                                aria-label={`播放第${n}集`}
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

        {/* 分页 */}
        {items && items.length > 0 && (
          <nav className="rank-pagination" aria-label="榜单分页">
            <button
              type="button"
              className="rank-page rank-arrow-btn"
              disabled={page <= 1}
              onClick={() => gotoPage(page - 1)}
              aria-label="上一页"
            >
              <Arrow dir="prev" />
            </button>
            {pages.map((p) => (
              <button
                key={p}
                type="button"
                className={'rank-page' + (p === page ? ' rank-page-active' : '')}
                onClick={() => gotoPage(p)}
                aria-label={`第 ${p} 页`}
              >
                {p}
              </button>
            ))}
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
      </main>
    </div>
  );
}
