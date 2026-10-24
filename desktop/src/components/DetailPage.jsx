import React, { useEffect, useRef, useState } from 'react';
import { fetchSeries } from '../api.js';
import SeriesCard from './SeriesCard.jsx';
import { ScoreIcon, HeatIcon, PlayIcon } from './Icons.jsx';
import { SkeletonDetail } from './Skeletons.jsx';
import Tip from './Tooltip.jsx';

// 详情页（对照原站 detail 页结构，数据来自本地 /api/series/:id）：
//   背景大图 → 返回入口 → 剧集 hero（封面/标题/热度/评分/标签/演员/简介/播放正片）
//   → 分集格子（默认一行 + 展开）→ 热评横排 → 相关短剧网格
// onPlay(seriesId, episodeId)：播放入口占位回调（播放页下一轮实现）。
// onOpen(seriesId)：相关短剧卡片点击 → 切换到该部剧的详情。

// "23000" → "2.3万"（原站点赞/收藏文案）
function formatCount(text) {
  const s = String(text || '').trim();
  if (!/^\d+$/.test(s)) return s;
  const n = Number(s);
  if (n >= 10000) {
    const w = n / 10000;
    return `${Number.isInteger(w) ? w : w.toFixed(1)}万`;
  }
  return s;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 热评星级：原站满分 10 分 → 5 颗星（每颗 2 分），四舍五入
function RatingStars({ rating }) {
  const value = Number(rating) || 0;
  const filled = Math.max(0, Math.min(5, Math.round(value / 2)));
  return (
    <span className="dt-rating-stars" aria-label={`${value}分`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          className="dt-star"
          key={i}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5.36701 1.38527C5.64027 0.884214 6.35973 0.884215 6.63299 1.38527L7.96535 3.82831L10.7005 4.34052C11.2615 4.44557 11.4838 5.12982 11.0918 5.54453L9.18 7.56663L9.53808 10.3262C9.61152 10.8922 9.02947 11.3151 8.51389 11.0704L6 9.87703L3.48611 11.0704C2.97053 11.3151 2.38848 10.8922 2.46192 10.3262L2.82 7.56663L0.908249 5.54453C0.516159 5.12981 0.738485 4.44557 1.29946 4.34052L4.03465 3.82831L5.36701 1.38527Z"
            fill="white"
            fillOpacity={i < filled ? 0.7 : 0.2}
          />
        </svg>
      ))}
    </span>
  );
}

export default function DetailPage({ seriesId, onOpen, onOpenCharacter, onPlay, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [descOpen, setDescOpen] = useState(false);
  // 选集默认收起；仅当分集确实超出一行（受窗口宽度影响）时才显示展开/收起按钮
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [episodeOverflow, setEpisodeOverflow] = useState(false);
  const episodeGridRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setDescOpen(false);
    setEpisodesOpen(false);
    setEpisodeOverflow(false);
    fetchSeries(seriesId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [seriesId]);

  // 测量分集区域是否超出一行（收起态 max-height 为一行高度）：
  // 只有真正溢出时才渲染展开按钮，展开后按钮保留，点击收起会重新测量。
  useEffect(() => {
    const el = episodeGridRef.current;
    if (!el || !data || episodesOpen) return;
    const measure = () => {
      setEpisodeOverflow(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    } else {
      window.addEventListener('resize', measure);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', measure);
    };
  }, [data, episodesOpen]);

  if (error) {
    return (
      <main className="dt-page">
        <div className="dt-container">
          <div className="load-error">详情加载失败（{error}）</div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="dt-page">
        <SkeletonDetail />
      </main>
    );
  }

  const social = data.social || {};
  const hotScore = social.hotScore || {};
  const reviews = (social.reviews && social.reviews.items) || [];
  const reviewTotal = (social.reviews && social.reviews.total) || reviews.length;
  const celebrities = Array.isArray(data.celebrities) ? data.celebrities : [];
  const episodes = Array.isArray(data.episodes) ? data.episodes : [];
  const related = Array.isArray(data.related) ? data.related : [];
  const tags = String(data.tags || '')
    .split('/')
    .map((t) => t.trim())
    .filter(Boolean);

  const play = (episodeId) => {
    if (onPlay) onPlay(seriesId, episodeId);
  };

  return (
    <main className="dt-page">
      {/* 背景层：封面放大虚化 + 渐变（原站 pc-cover：1920/1415 铺满顶部） */}
      <div className="dt-bg">
        <img className="dt-bg-img" src={data.cover} alt="" aria-hidden="true" />
      </div>

      <div className="dt-container">
        {/* 剧集 hero */}
        <section className="dt-hero">
          <div className="dt-hero-cover-box">
            <img className="dt-hero-cover" src={data.cover} alt={data.title} />
          </div>
          <div className="dt-hero-info">
            <div className="dt-hero-title-row">
              <h1 className="dt-hero-title">{data.title}</h1>
              {hotScore.text && (
                <span className="dt-hero-heat">
                  <HeatIcon className="dt-hero-heat-icon" />
                  {hotScore.text}
                </span>
              )}
            </div>
            <div className="dt-hero-tags">
              {social.rating > 0 && (
                <span className="dt-hero-rating">
                  <ScoreIcon className="dt-score-icon" />
                  评分 {Number(social.rating).toFixed(1)}
                </span>
              )}
              {Number(social.likeCount) > 0 && (
                <span className="dt-social-tag">{formatCount(social.likeCount)}次点赞</span>
              )}
              {Number(social.favoriteCount) > 0 && (
                <span className="dt-social-tag">{formatCount(social.favoriteCount)}收藏</span>
              )}
              {tags.map((t, idx) => {
                const isFirst = idx === 0;
                const link = isFirst ? data.firstTagLink : null;
                if (link && onNavigate) {
                  return (
                    <Tip label={`查看${t}分类`} key={t}>
                      <button
                        type="button"
                        className="dt-hero-tag dt-hero-tag-link"
                        onClick={() => onNavigate('category', link.type, link.tag)}
                      >
                        {t}
                      </button>
                    </Tip>
                  );
                }
                return (
                  <span className="dt-hero-tag" key={t}>
                    {t}
                  </span>
                );
              })}
            </div>
            {celebrities.length > 0 && (
              <p className="dt-hero-actors">
                演员：
                {celebrities.map((c, i) => (
                  <React.Fragment key={c.id || i}>
                    {i > 0 && ' '}
                    {c.id && onOpenCharacter ? (
                      <button
                        type="button"
                        className="dt-hero-actor dt-hero-actor-link"
                        onClick={() => onOpenCharacter(c.id)}
                      >
                        {c.name}
                      </button>
                    ) : (
                      <span className="dt-hero-actor">{c.name}</span>
                    )}
                  </React.Fragment>
                ))}
              </p>
            )}
            {data.description && (
              <div className="dt-hero-desc-wrap">
                <Tip label={descOpen ? '收起' : '展开简介'}>
                  <p
                    className={'dt-hero-desc' + (descOpen ? ' dt-hero-desc-open' : '')}
                    onClick={() => setDescOpen((v) => !v)}
                  >
                    简介：{data.description}
                  </p>
                </Tip>
              </div>
            )}
            <div className="dt-hero-actions">
              <button
                type="button"
                className="dt-btn-play"
                onClick={() => episodes[0] && play(episodes[0].id)}
              >
                <PlayIcon className="dt-btn-play-icon" />
                <span className="dt-btn-play-text">播放正片</span>
              </button>
              {data.episodeRightText && (
                <span className="dt-episode-count">{data.episodeRightText}</span>
              )}
            </div>
          </div>
        </section>

        {/* 分集格子：默认收起为一行；超出一行时才显示展开/收起按钮。
            按钮放在网格外，避免收起时被容器裁切导致“点了没反应”。 */}
        {episodes.length > 0 && (
          <div className="dt-episode-container">
            <div
              ref={episodeGridRef}
              id="dt-episode-grid"
              className={
                'dt-episode-grid' +
                (episodesOpen ? ' dt-episode-grid-expanded' : '')
              }
            >
              {episodes.map((ep) => (
                <Tip label={ep.title} key={ep.id}>
                  <button
                    type="button"
                    className="dt-episode-cell"
                    onClick={() => play(ep.id)}
                  >
                    {ep.number}
                  </button>
                </Tip>
              ))}
            </div>
            {episodeOverflow && (
              <button
                type="button"
                className={
                  'dt-episode-toggle' +
                  (episodesOpen ? ' dt-episode-toggle-open' : '')
                }
                onClick={() => setEpisodesOpen((v) => !v)}
                aria-expanded={episodesOpen}
                aria-controls="dt-episode-grid"
              >
                <span className="dt-episode-toggle-text">
                  {episodesOpen ? '收起分集' : `展开全部 ${episodes.length} 集`}
                </span>
                <svg
                  className={
                    'dt-episode-arrow' +
                    (episodesOpen ? ' dt-episode-arrow-open' : '')
                  }
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9.5 12 15.5 18 9.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* 热评：横排卡片（网页端仅 SSR 内嵌的前 9 条） */}
        {reviews.length > 0 && (
          <section className="dt-section">
            <header className="dt-section-header">
              <div className="dt-heading">
                <strong>热评</strong>
                <i className="dt-dot" aria-hidden="true" />
                <span>{reviewTotal}</span>
              </div>
            </header>
            <div className="dt-review-list">
              {reviews.map((r, i) => (
                <article className="dt-review-card" key={r.id || i}>
                  <div className="dt-review-meta">
                    <div className="dt-review-user">
                      {r.userAvatar ? (
                        <img className="dt-review-avatar" src={r.userAvatar} alt="" />
                      ) : (
                        <span className="dt-review-avatar dt-review-avatar-empty" aria-hidden="true" />
                      )}
                      <span className="dt-review-name">{r.userName}</span>
                      {r.rating > 0 && <RatingStars rating={r.rating} />}
                    </div>
                    <time className="dt-review-date" dateTime={formatDate(r.createdAt)}>
                      {formatDate(r.createdAt)}
                    </time>
                  </div>
                  <p className="dt-review-content">{r.content}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* 相关短剧：官方 recommendations.related_list（热门短剧为冗余推荐位，已移除） */}
        {related.length > 0 && (
          <section className="dt-detail-section">
            <div className="dt-detail-header">相关短剧</div>
            <div className="dt-card-container">
              {related.map((it) => (
                <SeriesCard key={it.id} item={it} variant="detail" onOpen={onOpen} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
