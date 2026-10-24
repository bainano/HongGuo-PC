// 播放器分集视频缓存
// ---------------------------------------------------------------------------
// 存储方式：渲染进程 Cache API 存储视频二进制 Blob（落盘、跨会话持久），
//          配合本模块的 LRU 索引（localStorage）做容量与淘汰控制。
// 容量限制（双重约束，任一超限即按 LRU 淘汰）：
//   MAX_ENTRIES     最多缓存的“集数×清晰度”条目数
//   MAX_TOTAL_BYTES 所有条目总字节上限
//   ENTRY_MAX_BYTES 单条超过此大小则不缓存（避免超大文件撑爆磁盘，回退为直接网络流）
//   TTL_MS          条目过期时间，读时惰性淘汰（过期视为缺失）
// 淘汰策略：LRU（按 lastUsed 排序），插入/校验时若超容量则剔除最久未用条目。
// 加载逻辑（见 PlayerPage）：命中缓存 → 直接由缓存 Blob 生成 objectURL 快速加载
//          （零网络）；缺失 → 仅此一次发起网络请求并写入缓存；超大文件则跳过
//          缓存，直接走网络 Range 流式播放。
// ---------------------------------------------------------------------------

const CACHE_NAME = 'hg-episode-video-v1';
// 用固定 origin 作为 Cache API 的存储键，避免 API_BASE（端口可能变化）影响命中
const STORE_ORIGIN = 'https://hg-episode-cache.local';
const INDEX_KEY = 'hg-episode-cache-index-v1';

const MAX_ENTRIES = 8;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1GB
const ENTRY_MAX_BYTES = 200 * 1024 * 1024; // 单集 200MB 以上不缓存
const TTL_MS = 7 * 24 * 3600 * 1000; // 7 天

function keyFor(episodeId, quality, seriesId) {
  return `ep:${seriesId || '_'}:${episodeId}:${quality}`;
}
function storeUrl(key) {
  return `${STORE_ORIGIN}/${encodeURIComponent(key)}`;
}

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeIndex(idx) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    /* 配额超限忽略 */
  }
}

async function openCache() {
  if (typeof caches === 'undefined') return null;
  return caches.open(CACHE_NAME);
}

// 惰性淘汰过期条目，返回是否发生变化
function evictExpired(idx, now) {
  let changed = false;
  for (const k of Object.keys(idx)) {
    if (now - idx[k].ts > TTL_MS) {
      delete idx[k];
      changed = true;
    }
  }
  return changed;
}

// 按 LRU 淘汰直至满足“条目数”与“总字节”双重约束
async function enforceCapacity(idx, cache, incomingBytes) {
  const keys = Object.keys(idx);
  let total = keys.reduce((s, k) => s + (idx[k].size || 0), 0);
  const sorted = keys.slice().sort((a, b) => idx[a].lastUsed - idx[b].lastUsed);
  for (const k of sorted) {
    const count = Object.keys(idx).length;
    if (count <= MAX_ENTRIES && total + incomingBytes <= MAX_TOTAL_BYTES) break;
    try {
      await cache.delete(storeUrl(k));
    } catch {
      /* 忽略 */
    }
    total -= idx[k].size || 0;
    delete idx[k];
  }
}

// 命中查询：返回缓存的 Response（已更新 lastUsed），缺失/过期返回 null
export async function getCachedVideo(episodeId, quality, seriesId) {
  const cache = await openCache();
  if (!cache) return null;
  const now = Date.now();
  const idx = readIndex();
  const k = keyFor(episodeId, quality, seriesId);
  const entry = idx[k];
  if (!entry) return null;
  if (now - entry.ts > TTL_MS) {
    delete idx[k];
    writeIndex(idx);
    try {
      await cache.delete(storeUrl(k));
    } catch {
      /* 忽略 */
    }
    return null;
  }
  const resp = await cache.match(storeUrl(k));
  if (!resp) {
    delete idx[k];
    writeIndex(idx);
    return null;
  }
  entry.lastUsed = now;
  writeIndex(idx);
  return resp;
}

// 写入缓存：成功返回 true；超大或不可用返回 false（调用方回退为直接网络流）
export async function cacheVideo(episodeId, quality, seriesId, response, size) {
  const cache = await openCache();
  if (!cache) return false;
  const bytes = Number(size) || 0;
  if (bytes > ENTRY_MAX_BYTES) return false; // 超大不缓存
  const now = Date.now();
  const k = keyFor(episodeId, quality, seriesId);
  const idx = readIndex();
  evictExpired(idx, now);
  // 先删旧同名条目
  if (idx[k]) {
    try {
      await cache.delete(storeUrl(k));
    } catch {
      /* 忽略 */
    }
    delete idx[k];
  }
  await enforceCapacity(idx, cache, bytes);
  try {
    await cache.put(storeUrl(k), response.clone());
  } catch {
    return false; // 写入失败（如配额）不阻塞播放
  }
  idx[k] = { key: k, size: bytes, lastUsed: now, ts: now };
  writeIndex(idx);
  return true;
}

// 可选：清空全部缓存（供“清除缓存”类功能使用）
export async function clearVideoCache() {
  try {
    if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME);
  } catch {
    /* 忽略 */
  }
  writeIndex({});
}
