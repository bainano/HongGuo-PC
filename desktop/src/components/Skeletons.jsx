import React from 'react';

// 骨架屏占位组件：替代“加载中…”文字提示，样式定义在 global.css（.sk 微光动画）

// 榜单/搜索结果卡片骨架：左封面 + 右标题/标签/简介/选集行
export function SkeletonListCard() {
  return (
    <article className="rank-article sk-card" aria-hidden="true">
      <div className="sk sk-cover" />
      <div className="rank-content">
        <div className="sk sk-line" style={{ width: '42%', height: 28 }} />
        <div className="sk sk-line" style={{ width: '30%', height: 24, marginTop: 12 }} />
        <div className="sk sk-line" style={{ width: '36%', height: 20, marginTop: 12 }} />
        <div className="sk sk-line" style={{ width: '100%', height: 48, marginTop: 8 }} />
        <div className="sk-episode-row">
          <div className="sk" style={{ width: 168, height: 46, borderRadius: 12 }} />
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="sk" style={{ width: 46, height: 46, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    </article>
  );
}

// 海报网格卡片骨架（首页栏目 / 分类页）
export function SkeletonGridCard() {
  return (
    <div className="sk-grid-card" aria-hidden="true">
      <div className="sk sk-poster" />
      <div className="sk sk-line" style={{ width: '86%', height: 20, marginTop: 8 }} />
      <div className="sk sk-line" style={{ width: '60%', height: 14, marginTop: 6 }} />
    </div>
  );
}

// 首页栏目骨架：两个栏目（标题 + 一排海报），置于 content 容器内
export function SkeletonRails() {
  return (
    <>
      {[0, 1].map((s) => (
        <section className="sk-section" key={s} aria-hidden="true">
          <div className="sk sk-line" style={{ width: 180, height: 30, marginBottom: 20 }} />
          <div className="sk-rail">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonGridCard key={i} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

// 首页骨架：Banner 横幅 + 栏目
export function SkeletonHome() {
  return (
    <>
      <div className="sk sk-banner" aria-hidden="true" />
      <main className="content content-has-banner" aria-hidden="true">
        <SkeletonRails />
      </main>
    </>
  );
}

// 详情页骨架：横幅区（封面 + 标题/标签/简介/按钮）
export function SkeletonDetail() {
  return (
    <div className="sk-detail" aria-hidden="true">
      <div className="sk sk-detail-cover" />
      <div className="sk-detail-info">
        <div className="sk sk-line" style={{ width: '38%', height: 40 }} />
        <div className="sk sk-line" style={{ width: '52%', height: 24, marginTop: 16 }} />
        <div className="sk sk-line" style={{ width: '44%', height: 24, marginTop: 12 }} />
        <div className="sk sk-line" style={{ width: '100%', height: 72, marginTop: 16 }} />
        <div className="sk" style={{ width: 168, height: 45, borderRadius: 12, marginTop: 24 }} />
      </div>
    </div>
  );
}

// 演员页骨架：头像 + 名称/数据 + 海报网格
export function SkeletonCharacter() {
  return (
    <div className="sk-character" aria-hidden="true">
      <div className="sk-character-head">
        <div className="sk sk-avatar" />
        <div style={{ flex: 1 }}>
          <div className="sk sk-line" style={{ width: 200, height: 32 }} />
          <div className="sk sk-line" style={{ width: '50%', height: 20, marginTop: 12 }} />
          <div className="sk sk-line" style={{ width: '70%', height: 20, marginTop: 10 }} />
        </div>
      </div>
      <div className="sk-rail" style={{ marginTop: 32 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonGridCard key={i} />
        ))}
      </div>
    </div>
  );
}
