import React from 'react';

// 单张剧集卡片（首页横排信息流、分类页网格与详情页推荐位共用）：
//   variant="home"（默认）→ 首页卡片：pc-* 类名；与分类页一致显示题材标签（"/" 分隔），
//                            不显示排名；兼容旧数据时过滤栏目名与"排名第x"
//   variant="category" → 分类页卡片：cat-* 类名；tags 以 / 分隔
//   variant="detail"   → 详情页「相关短剧」：dt-* 类名；封面 158/216 竖版网格
// sectionName：仅首页变体用于兼容旧数据（栏目名，如"热播短剧"）。
// onOpen(id)：点击卡片进入详情（详情页内点击则切换到该部剧）。
export default function SeriesCard({ item, variant = 'home', sectionName, onOpen }) {
  const isCat = variant === 'category';
  const isDetail = variant === 'detail';
  const open = (e) => {
    e.preventDefault();
    if (onOpen) onOpen(item.id);
  };
  // 首页与分类页题材标签均为 "/" 分隔（后端统一输出）；
  // 兼容旧数据格式（"·" 分隔、含栏目名与"排名第x"），过滤掉这两类前缀
  const rawTags = item.tags || '';
  const tags = (
    isCat || rawTags.includes('/') ? rawTags.split('/') : rawTags.split('·')
  )
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => isDetail || isCat || (t !== sectionName && !/^排名第\d+$/.test(t)))
    .slice(0, 3);
  const rootCls = isDetail ? 'dt-card' : isCat ? 'cat-card' : 'pc-card';
  return (
    <a
      className={rootCls}
      href="#"
      onClick={open}
      aria-label={item.title}
    >
      <div
        className={
          isDetail
            ? 'dt-img-container'
            : isCat
              ? 'cat-img-container'
              : 'pc-cover-wrap'
        }
      >
        <img
          className={
            isDetail ? 'dt-img' : isCat ? 'cat-img' : 'pc-cover'
          }
          src={item.cover}
          alt={item.title}
          loading="lazy"
          decoding="async"
        />
        {isDetail && (
          <span className="dt-bottom-cover" aria-hidden="true" />
        )}
        {item.badge && (
          <span
            className={
              isDetail ? 'dt-episode' : isCat ? 'cat-episode' : 'pc-episode'
            }
          >
            {item.badge}
          </span>
        )}
      </div>
      <p className={isDetail ? 'dt-card-title' : isCat ? 'cat-card-title' : 'pc-card-title'}>
        {item.title}
      </p>
      {tags.length > 0 && (
        <div className={isDetail ? 'dt-tags' : isCat ? 'cat-tags' : 'pc-tags'}>
          {tags.map((t, i) => (
            <span
              className={isDetail ? 'dt-tag' : isCat ? 'cat-tag' : 'pc-tag'}
              key={i}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
