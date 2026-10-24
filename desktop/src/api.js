// 本地内容服务地址（后端：backend/custom-server）
// 端口不固定：官方原版可能占用 8788（且不含新详情字段），本地后端会自动递增（8789/8790…）。
// 启动时按候选列表探测 /health，命中后固化 API_BASE 并写入 localStorage；8788 放最后兜底。
const CANDIDATE_BASES = [
  'http://127.0.0.1:8789',
  'http://127.0.0.1:8790',
  'http://127.0.0.1:8791',
  'http://127.0.0.1:8799',
  'http://127.0.0.1:8788',
  'http://localhost:8789',
  'http://localhost:8788'
];
const STORE_KEY = 'hg_api_base';

export let API_BASE =
  (typeof localStorage !== 'undefined' && localStorage.getItem(STORE_KEY)) ||
  (typeof window !== 'undefined' && window.__HG_API_BASE__) ||
  CANDIDATE_BASES[0];

let readyPromise = null;

async function probe(base) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(base + '/health', { signal: ctrl.signal });
    if (!res.ok) return false;
    // 旧版打包后端（如 D:\hongguotv-web-win-x64）/health 与本后端完全一致，
    // 但详情接口缺 related/hot/celebrities/social.reviews 字段；
    // 官方原版（8788）缺演员页排序字段 createTime。
    // 必须校验能力标记，否则误连旧后端会导致详情页/播放页板块消失、演员页排序错乱
    const data = await res.json().catch(() => null);
    return Boolean(
      data &&
        data.ok &&
        data.capabilities &&
        data.capabilities.detailExtras &&
        data.capabilities.characterSortFields
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// 探测一次本地服务，返回可用的 API_BASE（失败则保持默认值，由调用方抛错）
// 候选端口并发探测（避免死端口顺序等待拖慢首屏）
export function resolveApiBase() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
      const candidates = [...new Set([saved, window.__HG_API_BASE__, ...CANDIDATE_BASES].filter(Boolean))];
      const results = await Promise.all(
        candidates.map(async (base) => ({ base, ok: await probe(base) }))
      );
      const hit = results.find((r) => r.ok);
      if (!hit) throw new Error('本地服务未连接');
      API_BASE = hit.base;
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, hit.base);
      return hit.base;
    })();
  }
  return readyPromise;
}

async function getJSON(path) {
  await resolveApiBase();
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json();
}

// 首页四栏：官方首页推荐四大专区（与官网首页内容一致）
// /api/sections 返回 { sections: [{ type, name, 热播短剧/热播真人剧/热播漫剧/热播AI剧, items[] }] }
export async function fetchHome() {
  const data = await getJSON('/api/sections');
  return data.sections || [];
}

// 首页 Banner 推荐剧位：官方首页大轮播（桌面端首页顶部横幅）
// /api/banners 返回 { banners: [{id,title,cover,backgroundCover,titleImage,description,tags}] }
export async function fetchBanners() {
  const data = await getJSON('/api/banners');
  return data.banners || [];
}

// 榜单页：官方四大排行榜（红果/真人/AI/漫剧）
// /api/rank/types 返回 { types: [{ id, slug, name, key }] }
export async function fetchRankTypes() {
  const data = await getJSON('/api/rank/types');
  return data.types || [];
}

// 指定榜单分页列表：/api/rank/list?type=hot-drama&page=1
// 返回 { slug, title, page, totalPages, total, updatedText, items[{id,rank,title,cover,badge,heatText,scoreText,favoriteText,likeText,statusTags,episodeCount,tags,description}] }
export async function fetchRankList(type, page = 1) {
  const data = await getJSON(`/api/rank/list?type=${encodeURIComponent(type)}&page=${page}`);
  return data;
}

// 搜索结果页：/api/search?q=...&page=...
// 返回 { items[{id,title,cover,description,badge,tags,categories[],heatText,episodeCount}],
//        page, totalPages, total, hasMore }
export async function fetchSearch(q, page = 1) {
  const data = await getJSON(`/api/search?q=${encodeURIComponent(q)}&page=${page}`);
  return data;
}

// 搜索框建议下拉：/api/search/suggestion?q=...
// 返回 { items[{type:'drama'|'keyword', id, title, cover, subtitle, episodeCount}] }
// drama：带封面的剧集建议（点击进详情）；keyword：纯关键词建议（点击发起搜索）
export async function fetchSuggestions(q) {
  const data = await getJSON(`/api/search/suggestion?q=${encodeURIComponent(q)}`);
  return data.items || [];
}

// 详情页：/api/series/:id
// 返回 { id, title, cover, description, badge, tags,
//        episodes[{id,title,number}],
//        social{ rating, ratingCount, likeCount, favoriteCount, hotScore{score,text},
//                reviews{ total, items[{id,createdAt,diggCount,rating,userName,userAvatar,content}] } },
//        related[{id,title,cover,description,badge,tags}],  // 官方「相关短剧」
//        hot[...],                                          // 官方「热门短剧」
//        celebrities[{id,name,avatar,role}], episodeRightText, payType,
//        episodeCount, accessibleEpisodeCount, seriesStatus }
export async function fetchSeries(id) {
  return getJSON(`/api/series/${encodeURIComponent(id)}`);
}

// 演员详情：/api/characters/:id
// 返回 { id, name, avatar, role, description, gender, isBlueVip, hasRegistered,
//        followCount, fansCount, diggedCount, items[{id,title,cover,description,badge,tags,heatText,heatScore}] }
export async function fetchCharacter(id) {
  return getJSON(`/api/characters/${encodeURIComponent(id)}`);
}

// 单集清晰度列表：/api/episodes/:id/qualities
// 返回 { episodeId, defaultQuality, qualities:[{key,label,qualityNum,codec,rawKey,isDefault}] }
export async function fetchQualities(episodeId) {
  return getJSON(`/api/episodes/${encodeURIComponent(episodeId)}/qualities`);
}

// 单集流媒体地址（直接返回可塞入 <video src> 的相对/绝对路径）
// 后端 /api/episodes/:id/play 返回 { path, contentType }；stream 接口支持 Range。
export function streamUrl(episodeId, quality = '1080P', seriesId) {
  const q = encodeURIComponent(quality);
  const s = seriesId ? `&seriesId=${encodeURIComponent(seriesId)}` : '';
  return `${API_BASE}/api/episodes/${encodeURIComponent(episodeId)}/stream?quality=${q}${s}`;
}
