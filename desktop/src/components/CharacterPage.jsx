import React, { useEffect, useState } from 'react';
import { fetchCharacter } from '../api.js';
import { SkeletonCharacter } from './Skeletons.jsx';
import Tip from './Tooltip.jsx';
import officialVPng from '../assets/official-v.png';
import registeredPng from '../assets/registered.png';

// 演员详情页（对照原站 character 页结构）：
//   顶部 hero：圆形头像（右下角蓝V认证标识）+ 姓名（旁“已入驻”标识）+ 角色 + 简介
//             + 关注/粉丝/获赞
//   下方：最新短剧 / 最热短剧 tabs + 短剧网格（5 列）
// onOpen(seriesId)：点击短剧卡片 → 切换到该剧详情。

function formatCount(text) {
  const s = String(text || '').trim();
  if (!/^\d+$/.test(s)) return s;
  const n = Number(s);
  if (n >= 100000000) {
    const y = n / 100000000;
    return `${Number.isInteger(y) ? y : y.toFixed(1)}亿`;
  }
  if (n >= 10000) {
    const w = n / 10000;
    return `${Number.isInteger(w) ? w : w.toFixed(1)}万`;
  }
  return s;
}

export default function CharacterPage({ characterId, onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('new'); // 'new' 最新短剧 | 'hot' 最热短剧

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setSortBy('new');
    fetchCharacter(characterId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [characterId]);

  if (error) {
    return (
      <main className="ch-page">
        <div className="dt-container">
          <div className="load-error">演员页加载失败（{error}）</div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="ch-page">
        <SkeletonCharacter />
      </main>
    );
  }

  const items = Array.isArray(data.items) ? data.items : [];
  // 最新短剧：按上架时间倒序；最热短剧：按热度分倒序
  const sortedItems =
    sortBy === 'hot'
      ? [...items].sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0))
      : [...items].sort((a, b) => (b.createTime || 0) - (a.createTime || 0));

  return (
    <main className="ch-page">
      <div className="dt-container">
        {/* hero：头像 + 信息 */}
        <section className="ch-hero">
          <div className="ch-avatar-box">
            {data.avatar ? (
              <img className="ch-avatar" src={data.avatar} alt={data.name} />
            ) : (
              <span className="ch-avatar ch-avatar-empty" aria-hidden="true" />
            )}
            {data.isBlueVip && (
              <Tip label="蓝V认证">
                <img
                  className="ch-avatar-v"
                  src={officialVPng}
                  alt="蓝V认证"
                  draggable="false"
                />
              </Tip>
            )}
          </div>
          <div className="ch-info">
            <div className="ch-name-row">
              <h1 className="ch-name">{data.name}</h1>
              {data.hasRegistered && (
                <Tip label="已入驻">
                  <img
                    className="ch-registered"
                    src={registeredPng}
                    alt="已入驻"
                    draggable="false"
                  />
                </Tip>
              )}
            </div>
            {data.role && <div className="ch-role">{data.role}</div>}
            {data.description && <p className="ch-desc">{data.description}</p>}
            <div className="ch-stats">
              <div className="ch-stat">
                <span className="ch-stat-value">{formatCount(data.followCount)}</span>
                <span className="ch-stat-label">关注</span>
              </div>
              <div className="ch-stat">
                <span className="ch-stat-value">{formatCount(data.fansCount)}</span>
                <span className="ch-stat-label">粉丝</span>
              </div>
              <div className="ch-stat">
                <span className="ch-stat-value">{formatCount(data.diggedCount)}</span>
                <span className="ch-stat-label">获赞</span>
              </div>
            </div>
          </div>
        </section>

        {/* 短剧列表：最新 / 最热 tabs */}
        {items.length > 0 && (
          <section className="ch-section">
            <div className="ch-tabs" role="tablist" aria-label="短剧列表">
              <button
                type="button"
                role="tab"
                aria-pressed={sortBy === 'new'}
                className={'ch-tab' + (sortBy === 'new' ? ' ch-tab-active' : '')}
                onClick={() => setSortBy('new')}
              >
                最新短剧
              </button>
              <button
                type="button"
                role="tab"
                aria-pressed={sortBy === 'hot'}
                className={'ch-tab' + (sortBy === 'hot' ? ' ch-tab-active' : '')}
                onClick={() => setSortBy('hot')}
              >
                最热短剧
              </button>
            </div>
            <div className="ch-card-list">
              {sortedItems.map((it) => (
                <CharacterCard key={it.id} item={it} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function CharacterCard({ item, onOpen }) {
  const tags = String(item.tags || '')
    .split('/')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);
  return (
    <a className="ch-card" href="#" onClick={(e) => { e.preventDefault(); onOpen && onOpen(item.id); }}>
      <div className="ch-card-cover-box">
        <img className="ch-card-cover" src={item.cover} alt={item.title} loading="lazy" />
        {item.heatText && <span className="ch-card-heat">{item.heatText}</span>}
      </div>
      <p className="ch-card-title">{item.title}</p>
      {tags.length > 0 && (
        <div className="ch-card-tags">
          {tags.map((t, i) => (
            <span className="ch-card-tag" key={i}>{t}</span>
          ))}
        </div>
      )}
    </a>
  );
}
