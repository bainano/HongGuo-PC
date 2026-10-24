import React, { useEffect, useState } from 'react';
import Tip from './Tooltip.jsx';

const ROTATE_MS = 5000;

// 首页 Banner 推荐剧位（数据源：后端 /api/banners，即官方首页大轮播）
// 布局对照官网：通栏背景大图 + 左侧独立文字图层（艺术字剧名图 / 题材 / 简介）。
// 按产品要求：不放置「立即播放 / 加入追剧」等按钮，也不放「官方主推推荐」徽标；
// 剧名优先使用官方艺术字标题图（titleImage），缺失时回退为纯文本标题；
// 点击 Banner 任意区域进入剧集详情页（而非直接播放）。
export default function HomeBanner({ banners, onOpen }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  // 自动轮播（悬停暂停）；换批数据时回到第一张
  useEffect(() => {
    setIndex(0);
  }, [banners]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, count]);

  return (
    <section
      className="pc-banner"
      aria-label="首页推荐"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pc-banner-stage">
        {banners.map((b, i) => {
          const active = i === index;
          // 题材标签：后端 "/" 分隔字符串 → 标签数组（胶囊样式与详情页一致）
          const tagList = String(b.tags || '')
            .split('/')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 5);
          return (
            <article
              key={b.id}
              className={
                'pc-banner-slide' + (active ? ' pc-banner-slide-active' : '')
              }
              aria-hidden={active ? undefined : 'true'}
            >
              <img
                className="pc-banner-bg"
                src={b.backgroundCover || b.cover}
                alt=""
                aria-hidden="true"
                fetchpriority={i === 0 ? 'high' : 'low'}
                decoding="async"
              />
              <div className="pc-banner-shade" />
              {/* 整块可点击：进入剧集详情页 */}
              <a
                className="pc-banner-hit"
                href="#"
                tabIndex={active ? 0 : -1}
                onClick={(e) => {
                  e.preventDefault();
                  onOpen && onOpen(b.id);
                }}
              >
                <div className="pc-banner-body">
                  {b.titleImage ? (
                    <img
                      className="pc-banner-title-img"
                      src={b.titleImage}
                      alt={b.title}
                      decoding="async"
                    />
                  ) : (
                    <h2 className="pc-banner-title-text">{b.title}</h2>
                  )}
                  {tagList.length > 0 && (
                    <p className="pc-banner-tags">
                      {tagList.map((t, i) => (
                        <span className="pc-banner-tag" key={i}>
                          {t}
                        </span>
                      ))}
                    </p>
                  )}
                  {b.description && (
                    <Tip label={b.description} multiline>
                      <p className="pc-banner-desc">{b.description}</p>
                    </Tip>
                  )}
                </div>
              </a>
            </article>
          );
        })}
      </div>
      {count > 1 && (
        <div className="pc-banner-dots" aria-label="推荐切换">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`第 ${i + 1} 部推荐：${b.title}`}
              aria-current={i === index ? 'true' : undefined}
              className={
                'pc-banner-dot' + (i === index ? ' pc-banner-dot-active' : '')
              }
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
