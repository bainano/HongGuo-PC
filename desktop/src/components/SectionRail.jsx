import React, { useEffect, useRef, useState } from 'react';
import SeriesCard from './SeriesCard.jsx';

// sections 的 type（all/human/comic/ai）→ 官方四大排行榜 slug（对齐后端 /api/rank/types）
const RANK_MAP = {
  all: 'hot-drama',
  human: 'hot-real-drama',
  comic: 'hot-comic-drama',
  ai: 'hot-ai-drama'
};

// 横排信息流：栏目标题行 + 可横向滚动的卡片轨道（边缘渐变遮罩 + 滚动箭头，到两端自动隐藏）
export default function SectionRail({ section, onNavigate, onOpen }) {
  const trackRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  const gotoRank = (e) => {
    e.preventDefault();
    onNavigate && onNavigate('rank', RANK_MAP[section.type] || 'hot-drama');
  };

  // 轨道滚动位置 → 左右遮罩/箭头显隐：到最左隐藏左箭头，到最右隐藏右箭头
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft < max - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <section className="pc-section">
      <div className="pc-header">
        <a
          className="pc-title-link"
          href="#"
          onClick={gotoRank}
          title={`查看更多${section.name}`}
        >
          <h2 className="pc-title">{section.name}</h2>
          <svg
            className="pc-title-arrow"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M4.33801 8.87409C4.09573 9.11769 4.09573 9.51124 4.33801 9.75485C4.58217 10.0003 4.97943 10.0003 5.22358 9.75485L8.51761 6.44284C8.76083 6.19829 8.76083 5.8018 8.51761 5.55726L5.22358 2.24525C4.97943 1.99977 4.58217 1.99977 4.33801 2.24525C4.09573 2.48885 4.09573 2.88241 4.33801 3.12601L7.19645 6.00005L4.33801 8.87409Z"
              fill="white"
            />
          </svg>
        </a>
      </div>
      <div className="pc-rail-wrap">
        <div
          className={'pc-rail-mask pc-rail-mask-left' + (canLeft ? '' : ' pc-mask-hidden')}
        >
          <button
            className="pc-rail-arrow pc-rail-arrow-left"
            type="button"
            aria-label="向左查看更多"
            onClick={() => scroll(-1)}
          >
            <svg
              className="pc-rail-arrow-icon"
              viewBox="0 0 56 72"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M26 24.25L18 36L26 47.75"
                stroke="white"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>
        <div
          className={'pc-rail-mask pc-rail-mask-right' + (canRight ? '' : ' pc-mask-hidden')}
        >
          <button
            className="pc-rail-arrow pc-rail-arrow-right"
            type="button"
            aria-label="向右查看更多"
            onClick={() => scroll(1)}
          >
            <svg
              className="pc-rail-arrow-icon"
              viewBox="0 0 56 72"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M30 24.25L38 36L30 47.75"
                stroke="white"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>
        <div className="pc-card-rail" ref={trackRef}>
          {section.items.map((item) => (
            <SeriesCard
              key={item.id}
              item={item}
              sectionName={section.name}
              onOpen={onOpen}
            />
          ))}
          {/* 查看更多卡片：轨道末尾入口，进入对应榜单 */}
          <a
            className="pc-view-all-card"
            href="#"
            onClick={gotoRank}
            title={`查看更多${section.name}`}
          >
            <span className="pc-view-all-text">查看全部</span>
            <svg
              className="pc-view-all-arrow"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M4.5 2.75 8.75 7 4.5 11.25"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
