// 轻量 hash 路由：视图状态 ↔ 可分享 URL，网页版可通过地址直接打开对应页面。
// 采用 hash 方案（而非 history 路径）：Vite dev / 任意静态托管 / Electron file:// 均无需服务端回退配置。
// 地址格式：
//   #/                                  首页
//   #/category/:type(/:tag)?page=N      分类页（type: real-drama/comic-drama/ai-drama，tag 为题材名）
//   #/rank/:slug?page=N                 榜单页（slug: hot-drama/hot-real-drama/hot-ai-drama/hot-comic-drama）
//   #/detail/:seriesId                  详情页
//   #/player/:seriesId(/:episodeId)     播放页
//   #/character/:characterId            演员页
//   #/search/:keyword?page=N            搜索页

export const HOME_ENTRY = Object.freeze({
  view: 'home',
  activeNav: 'home',
  catType: 'real-drama',
  catTag: '',
  catPage: 1,
  rankType: 'hot-drama',
  rankPage: 1,
  detailId: null,
  characterId: null,
  playerSeriesId: null,
  playerEpisodeId: null,
  searchKeyword: null,
  searchPage: 1
});

const NAV_OF = { home: 'home', category: 'category', rank: 'rank' };

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}

// 解析 hash 为路由条目（不完整/无法识别时回退首页）
export function parseHash(hash) {
  const raw = String(hash ?? window.location.hash ?? '').replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const seg = pathPart.split('/').filter(Boolean).map(safeDecode);
  const page = Math.max(
    parseInt(new URLSearchParams(queryPart || '').get('page'), 10) || 1,
    1
  );
  switch (seg[0]) {
    case undefined:
      return { view: 'home' };
    case 'category':
      return {
        view: 'category',
        catType: seg[1] || HOME_ENTRY.catType,
        catTag: seg[2] || '',
        catPage: page
      };
    case 'rank':
      return {
        view: 'rank',
        rankType: seg[1] || HOME_ENTRY.rankType,
        rankPage: page
      };
    case 'detail':
      return seg[1] ? { view: 'detail', detailId: seg[1] } : { view: 'home' };
    case 'player':
      return seg[1]
        ? { view: 'player', playerSeriesId: seg[1], playerEpisodeId: seg[2] || null }
        : { view: 'home' };
    case 'character':
      return seg[1] ? { view: 'character', characterId: seg[1] } : { view: 'home' };
    case 'search':
      return seg[1]
        ? { view: 'search', searchKeyword: seg[1], searchPage: page }
        : { view: 'home' };
    default:
      return { view: 'home' };
  }
}

// 补全条目默认字段并推导导航高亮（详情/播放/演员/搜索不属于导航项，清除高亮）
export function normalizeEntry(partial) {
  const entry = { ...HOME_ENTRY, ...partial };
  entry.activeNav = NAV_OF[entry.view] || null;
  return entry;
}

// 路由条目 → hash 地址
export function entryToHash(e) {
  const pageQS = (p) => (p && p > 1 ? `?page=${p}` : '');
  switch (e.view) {
    case 'category':
      return `#/category/${e.catType || HOME_ENTRY.catType}${
        e.catTag ? '/' + encodeURIComponent(e.catTag) : ''
      }${pageQS(e.catPage)}`;
    case 'rank':
      return `#/rank/${e.rankType || HOME_ENTRY.rankType}${pageQS(e.rankPage)}`;
    case 'detail':
      return `#/detail/${e.detailId}`;
    case 'player':
      return `#/player/${e.playerSeriesId}${
        e.playerEpisodeId ? '/' + e.playerEpisodeId : ''
      }`;
    case 'character':
      return `#/character/${e.characterId}`;
    case 'search':
      return `#/search/${encodeURIComponent(e.searchKeyword || '')}${pageQS(e.searchPage)}`;
    default:
      return '#/';
  }
}
