import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import axios from "axios";
import { AsyncLocalStorage } from "node:async_hooks";
import { Resolver } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import categoryContract from '../shared/category-contract.cjs';
import { createEngineCrypto } from '../shared/engine-crypto.mjs';

// Electron 内置 Node（BoringSSL）不支持 sm3，用包装器回退到纯 JS 实现。
const engineCrypto = createEngineCrypto();

// c-ares queries do not occupy the OS getaddrinfo/libuv worker pool. On Windows,
// an unresolved CDN hostname can otherwise delay even a healthy backup lookup.
export function createMediaLookup(resolver = new Resolver({ timeout: 800, tries: 1 }), alternative = null) {
  const pending = new Map(), cache = new Map();
  return (hostname, options, callback) => {
    const family = Number(options?.family) === 6 ? 6 : 4;
    const key = `${hostname}:${family}`;
    const cached = cache.get(key);
    let work = cached && cached.until > Date.now() ? Promise.resolve(cached.addresses) : pending.get(key);
    if (!work) {
      const query = async source => {
        const rows = await (family === 6 ? source.resolve6(hostname, { ttl: true }) : source.resolve4(hostname, { ttl: true }));
        if (!rows.length) throw Object.assign(new Error('No CDN DNS addresses'), { code: 'ENODATA' });
        return rows;
      };
      // A single configured resolver can itself queue for several seconds.
      // Race independent DNS paths, accepting only successful nonempty answers.
      const queries = [query(resolver)];
      if (alternative) queries.push(query(alternative));
      work = Promise.any(queries).catch(error => { throw error.errors?.[0] || error; }).then(rows => {
        const addresses = rows.map(row => ({ address: row.address, family }));
        const ttl = Math.min(60, ...rows.map(row => Number(row.ttl) || 1));
        cache.set(key, { until: Date.now() + ttl * 1000, addresses });
        if (cache.size > 64) cache.delete(cache.keys().next().value);
        return addresses;
      });
      pending.set(key, work);
      const cleanup = () => { if (pending.get(key) === work) pending.delete(key); };
      work.then(cleanup, cleanup);
    }
    work.then(addresses => options?.all ? callback(null, addresses) : callback(null, addresses[0].address, family), error => callback(error));
  };
}
const mediaDnsServers = process.env.HG_MEDIA_DNS_SERVERS || '119.29.29.29,223.5.5.5';
const mediaDnsAlternative = mediaDnsServers === 'system' ? null : new Resolver({ timeout: 500, tries: 1 });
if (mediaDnsAlternative) mediaDnsAlternative.setServers(mediaDnsServers.split(',').map(value => value.trim()).filter(Boolean));
export const mediaLookup = createMediaLookup(undefined, mediaDnsAlternative);
// Node normally waits 250ms before each alternate address. A few unreachable
// addresses can consume most of the first-frame budget before TLS even starts.
export function createContentTransport() {
  const options = { keepAlive: true, maxSockets: 32, maxFreeSockets: 8,
    autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 50 };
  return { httpAgent: new http.Agent(options), httpsAgent: new https.Agent(options) };
}
export const contentTransport = createContentTransport();
const requestContext = new AsyncLocalStorage();
export const upstreamRequestSignal = () => requestContext.getStore();
const resourcePending = new Map();
const detailRefreshes = new Map();

// A cancelled speculative subscriber must not abort a foreground subscriber.
export function sharedResource(key, load, { signal = upstreamRequestSignal() } = {}) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  let entry = resourcePending.get(key);
  if (!entry) {
    const controller = new AbortController();
    entry = { controller, subscribers: 0 };
    resourcePending.set(key, entry);
    try { entry.promise = Promise.resolve(requestContext.run(controller.signal, load)); }
    catch (error) { entry.promise = Promise.reject(error); }
    const cleanup = () => { if (resourcePending.get(key) === entry) resourcePending.delete(key); };
    entry.promise.then(cleanup, cleanup);
  }
  entry.subscribers++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true; signal?.removeEventListener('abort', abort);
      entry.subscribers--; callback(value);
    };
    const abort = () => {
      finish(reject, signal.reason);
      if (!entry.subscribers) {
        if (resourcePending.get(key) === entry) resourcePending.delete(key);
        entry.controller.abort();
      }
    };
    signal?.addEventListener('abort', abort, { once: true });
    entry.promise.then(value => finish(resolve, value), error => finish(reject, error));
  });
}

export function createPrefetchQueue(load, { enabled = true, concurrency = 1 } = {}) {
  const batches = new Map(), tasks = new Map();
  let running = 0, foreground = 0, scheduled = false, closed = false;
  const schedule = () => {
    if (scheduled || closed) return;
    scheduled = true;
    setImmediate(() => { scheduled = false; pump(); });
  };
  const pump = () => {
    if (closed || foreground) return;
    for (const task of tasks.values()) {
      if (running >= Math.max(1, Math.min(2, concurrency))) break;
      if (task.state !== 'queued') continue;
      task.state = 'running'; running++;
      Promise.resolve().then(() => requestContext.run(task.controller.signal, () => load(task.target, task.controller.signal)))
        .then(result => { if (task.state !== 'cancelled') { task.state = 'done'; task.result = result; } }, () => { if (task.state !== 'cancelled') task.state = 'failed'; })
        .finally(() => {
          running--; if (tasks.get(task.key) === task) tasks.delete(task.key);
          for (const batch of task.batches) if (batch.tasks.every(row => !['queued', 'running'].includes(row.state))) batch.finishedAt = Date.now();
          schedule();
        });
    }
  };
  const status = id => {
    const batch = batches.get(id);
    if (!batch) return null;
    return { id, enabled, state: batch.cancelled ? 'cancelled' : batch.tasks.some(row => ['queued', 'running'].includes(row.state)) ? 'pending' : 'complete',
      targets: batch.tasks.map(row => ({ ...row.target, state: row.state, ...(row.result === undefined ? {} : { result: row.result }) })) };
  };
  const cancel = id => {
    const batch = batches.get(id);
    if (!batch) return null;
    batch.cancelled = true; batch.finishedAt = Date.now();
    for (const task of batch.tasks) {
      task.batches.delete(batch);
      if (!task.batches.size && ['queued', 'running'].includes(task.state)) {
        task.state = 'cancelled'; task.controller.abort();
        if (tasks.get(task.key) === task) tasks.delete(task.key);
      }
    }
    schedule(); return status(id);
  };
  return {
    submit(targets) {
      if (closed) throw Object.assign(new Error('预取服务已关闭'), { status: 503 });
      if (!Array.isArray(targets) || !targets.length || targets.length > 8) throw Object.assign(new Error('每次预取需包含 1–8 个目标'), { status: 400 });
      const normalized = targets.map(target => {
        if (!target || !['detail', 'qualities', 'stream'].includes(target.kind)) throw Object.assign(new Error('不支持的预取类型'), { status: 400 });
        if (typeof target.id !== 'string' || !/^\d{1,30}$/.test(target.id) || (target.seriesId !== undefined && (typeof target.seriesId !== 'string' || !/^\d{1,30}$/.test(target.seriesId)))) throw Object.assign(new Error('ID 必须是数字字符串'), { status: 400 });
        if (target.kind === 'stream' && (target.level !== undefined && !['l1', 'l2'].includes(target.level) || target.quality !== undefined && (typeof target.quality !== 'string' || !/^(auto|\d{3,4}P)$/i.test(target.quality)))) throw Object.assign(new Error('不支持的预缓存级别或画质'), { status: 400 });
        return { kind: target.kind, id: target.id, ...(target.seriesId ? { seriesId: target.seriesId } : {}), ...(target.kind === 'stream' ? { level: target.level || 'l1', quality: target.quality?.toLowerCase() === 'auto' ? 'auto' : target.quality?.toUpperCase() || '1080P' } : {}) };
      });
      if (!enabled) return { enabled: false, id: null, state: 'disabled', targets: [] };
      for (const [id, batch] of batches) if (batch.finishedAt && Date.now() - batch.finishedAt > 60000) batches.delete(id);
      if (batches.size >= 64) for (const [id, batch] of batches) { if (batch.finishedAt) batches.delete(id); if (batches.size < 64) break; }
      const targetKey = target => `${target.kind}:${target.id}${target.kind === 'stream' ? `:${target.quality}:${target.level}` : ''}`;
      const additional = new Set(normalized.map(targetKey).filter(key => !tasks.has(key))).size;
      if (tasks.size + additional > 32 || batches.size >= 64) throw Object.assign(new Error('预取队列已满'), { status: 429 });
      const batch = { id: crypto.randomUUID(), tasks: [], cancelled: false };
      for (const target of normalized) {
        const key = targetKey(target);
        let task = tasks.get(key);
        if (!task) { task = { key, target, state: 'queued', batches: new Set(), controller: new AbortController() }; tasks.set(key, task); }
        task.batches.add(batch); if (!batch.tasks.includes(task)) batch.tasks.push(task);
      }
      batches.set(batch.id, batch); schedule(); return status(batch.id);
    },
    status, cancel,
    async foreground(work) { foreground++; try { return await work(); } finally { foreground--; schedule(); } },
    close() { closed = true; for (const id of batches.keys()) cancel(id); batches.clear(); },
  };
}

const upstreamClient = axios.create({ ...contentTransport, maxContentLength: 16 * 1024 * 1024, maxBodyLength: 1024 * 1024 });
upstreamClient.interceptors.request.use(config => {
  const signal = upstreamRequestSignal();
  if (signal) config.signal = config.signal ? AbortSignal.any([config.signal, signal]) : signal;
  return config;
});

// Trusted, pinned GPL source. This is a compatibility wrapper, not a sandbox for user scripts.
const source = fs.readFileSync(
  fs.existsSync(new URL("../shared/content-core/hongguo.js", import.meta.url)) ? new URL("../shared/content-core/hongguo.js", import.meta.url) : new URL("./vendor/hongguo.cjs", import.meta.url),
  "utf8"
);
const context = vm.createContext({
  require: (name) => {
    if (name === "node:crypto") return engineCrypto;
    throw new Error("Unsupported module");
  },
  Buffer,
  URL,
  URLSearchParams,
  AbortController,
  mediaLookup,
  axios: upstreamClient,
});
vm.runInContext(
  source +
    "\nthis.api = {categoryPage, categoryData, itemToCard, appSearchPage, routerData, resolveStream, prepareHeader, remoteRange, decryptPartial, streamCache, videoInfoCache, pageCache, appSearchCache};",
  context,
  { timeout: 5000 }
);
const api = context.api;
const SITE = "https://hongguoduanju.com";
// 官网 Web 搜索/建议接口（/api/search/result、/api/search/suggestion）用的桌面浏览器 UA
const SEARCH_WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const card = (row) => ({
  id: String(row.url),
  title: row.title,
  cover: row.img || "",
  description: row.content || "",
  badge: row.desc || "",
  tags: row.tname || "",
});
const cards = (rows) =>
  Array.from(rows)
    .filter((r) => /^\d+$/.test(String(r.url)) && r.title)
    .map(card);

// 官网 Web 搜索结果（/api/search/result）→ 应用卡片字段：
// 比 App 搜索多出题材分类 categories、热度 heatText、总集数 episodeCount，供搜索页展示
const SEARCH_PAGE_SIZE = 10; // 官网 Web 搜索接口每页 10 条
function webResultCard(row) {
  const video = row?.video_data && typeof row.video_data === "object" ? row.video_data : {};
  const id = String(video.series_id || row?.keyword || "");
  const title = String(row?.name || video.series_title || "");
  if (!/^\d+$/.test(id) || !title) return null;
  const categories = Array.isArray(video.category_list)
    ? video.category_list.map((c) => c && c.name).filter(Boolean)
    : [];
  return {
    id,
    title,
    cover: video.series_cover ? String(video.series_cover) : "",
    description: video.series_intro ? String(video.series_intro) : "",
    badge: video.episode_right_text
      ? String(video.episode_right_text)
      : video.episode_cnt
        ? `全${video.episode_cnt}集`
        : "",
    tags: categories.join("·"),
    categories,
    heatText: video.hot_score_data && video.hot_score_data.text
      ? String(video.hot_score_data.text)
      : "",
    // 互动数据（对照原站搜索卡片 pc-engagement：收藏/点赞金底胶囊）
    favoriteText: video.favorite_text ? String(video.favorite_text) : "",
    likeText: video.like_text ? String(video.like_text) : "",
    episodeCount: Number(video.episode_cnt) || 0,
  };
}

// ---------- 详情页原始 HTML 解析（相关短剧 / 热评 / 社交数据）----------
// 官网详情页把大部分数据放在内联 `_ROUTER_DATA` 里，但「相关短剧 / 热门短剧」
// 是由后续的 mergeLoaderData 脚本注入的（data-fn-args 为 HTML 实体编码的 JSON）。
// 引擎的 routerData() 只返回解析后的 loaderData，拿不到这段，因此详情页自建一次原始 HTML 抓取。
const DETAIL_PAGE_TTL = 10 * 60 * 1000;
const DETAIL_PAGE_UA =
  "com.phoenix.read/71332 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)";
const detailPageCache = new Map();

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;|&#47;/gi, "/")
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function extractAssignedJson(source, marker = "_ROUTER_DATA") {
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const first = source.indexOf("{", start);
  if (first < 0) return null;
  let depth = 0, quote = false, escaped = false;
  for (let i = first; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quote = false;
      continue;
    }
    if (ch === '"') { quote = true; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(source.slice(first, i + 1)); } catch (_) { return null; }
      }
    }
  }
  return null;
}

// mergeLoaderData("detail_page", [{key, routerDataFnName, routerDataFnArgs:[<json string>]}])
// 官网用它把 recommendations 追加进 loaderData；此处按 routeKey/key 直接收集。
// 属性可能用双引号或单引号包裹（SSR 流式脚本存在两种写法）。
function extractMergeLoaderData(html) {
  const merged = {};
  for (const match of html.matchAll(/<script\b([^>]*data-fn-args[^>]*)>/g)) {
    const raw = /data-fn-args=(["'])([\s\S]*?)\1/.exec(match[1]);
    if (!raw) continue;
    let args;
    try { args = JSON.parse(decodeHtmlEntities(raw[2])); } catch (_) { continue; }
    if (!Array.isArray(args) || args.length < 2 || typeof args[0] !== "string") continue;
    for (const entry of args[1] || []) {
      if (!entry || typeof entry.key !== "string" || !Array.isArray(entry.routerDataFnArgs)) continue;
      let value;
      try { value = JSON.parse(entry.routerDataFnArgs[0]); } catch (_) { continue; }
      if (!merged[args[0]]) merged[args[0]] = {};
      merged[args[0]][entry.key] = value;
    }
  }
  return merged;
}

function mapCelebrities(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => ({
      id: String(row?.celebrity_id || ""),
      name: String(row?.nickname || ""),
      avatar: String(row?.avatar || ""),
      role: String(row?.sub_title || ""),
    }))
    .filter((row) => row.id || row.name);
}

function mapSocial(social) {
  if (!social || typeof social !== "object") return null;
  const block = social.reviews && typeof social.reviews === "object" ? social.reviews : null;
  const items = Array.isArray(block?.reviews)
    ? block.reviews.map((row, index) => ({
        id: `${row?.create_time || 0}:${row?.user_name || index}`,
        createdAt: Number(row?.create_time) || 0,
        diggCount: String(row?.digg_count ?? "0"),
        rating: Number(row?.rating) || 0,
        userName: String(row?.user_name || ""),
        userAvatar: String(row?.user_avatar || ""),
        content: String(row?.content || ""),
      }))
    : [];
  const hotScore = social.hot_score_data && typeof social.hot_score_data === "object"
    ? { score: Number(social.hot_score_data.score) || 0, text: String(social.hot_score_data.text || "") }
    : null;
  return {
    rating: Number(social.rating) || 0,
    ratingCount: String(social.rating_count ?? "0"),
    likeCount: String(social.series_like_count ?? "0"),
    favoriteCount: String(social.series_favorite_count ?? "0"),
    hotScore,
    reviews: { total: String(block?.total_count ?? items.length), items },
  };
}

function mapRelatedRows(list, excludeId) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(excludeId ? [String(excludeId)] : []);
  const rows = [];
  for (const item of list) {
    const mapped = card(api.itemToCard(item));
    if (!/^\d+$/.test(mapped.id) || !mapped.title || seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    rows.push(mapped);
  }
  return rows;
}

async function loadDetailPage(id, { fresh = false, signal = upstreamRequestSignal() } = {}) {
  const url = `${SITE}/detail?series_id=${id}`;
  if (!fresh) {
    const cached = detailPageCache.get(url);
    if (cached && Date.now() - cached.time < (cached.ttl || DETAIL_PAGE_TTL)) return cached.value;
  }
  const resp = await upstreamClient.get(url, {
    headers: { "User-Agent": DETAIL_PAGE_UA, "Accept-Language": "zh-CN,zh;q=0.9" },
    timeout: 20000,
    responseType: "text",
    ...(signal ? { signal } : {}),
  });
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}: ${url}`);
  const html = typeof resp.data === "string" ? resp.data : String(resp.data);
  // 提取首标签对应的分类链接（原站首个题材标签为 <a href="/category/{type}/{tag}">）
  // 用于详情页首标签跳转到分类页对应题材
  const firstTagLink = (() => {
    const m = html.match(/href="\/category\/(real-drama|comic-drama|ai-drama)\/([-a-z]+)"/);
    if (!m) return null;
    return { type: m[1], tag: m[2] };
  })();
  const value = {
    routerData: extractAssignedJson(html) || {},
    merged: extractMergeLoaderData(html),
    firstTagLink,
  };
  // 只缓存解析成功的页面（至少要有 detail_page）。
  // 上游 SSR 偶发漏注入 mergeLoaderData 推荐脚本：此时缩短缓存 TTL，
  // 避免「相关短剧」为空的结果占满正常 TTL（热门首图剧最容易先被访问而中招）。
  if (value.routerData?.loaderData?.detail_page) {
    const hasRecommendations = Boolean(
      value.merged?.detail_page?.recommendations?.recommendationGroups
    );
    detailPageCache.set(url, {
      time: Date.now(),
      value,
      ttl: hasRecommendations ? DETAIL_PAGE_TTL : 15 * 1000,
    });
    if (detailPageCache.size > 64) detailPageCache.delete(detailPageCache.keys().next().value);
  }
  return value;
}

export const provider = {
  async categoryMetadata(type='real-drama') {
    if(!categoryContract.types.some(row=>row.id===type)){const error=new Error('不支持的分类类型');error.status=400;throw error;}
    const data=await api.routerData(`${SITE}/category/${type}`);
    const {types,tags,sourceUrl}=categoryContract.officialCategory(data,type);
    return {types,type,tags,sourceUrl};
  },
  async category(type, tag = '', page = 1) {
    if(!['real-drama','comic-drama','ai-drama'].includes(type)||!/^[-a-z]*$/.test(tag))throw new Error('Unsupported category');
    const data=await api.routerData(`${SITE}/category/${type}${tag?`/${tag}`:''}${page>1?`?page=${page}`:''}`);
    const result=categoryContract.officialCategory(data,type,tag,page);
    return cards(result.rows.map(api.itemToCard)).map(row=>({...row,contentType:type}));
  },
  async categoryList(type,tag='',page=1) {
    const metadata=await this.categoryMetadata(type);
    if(tag&&!metadata.tags.some(row=>row.id===tag)){const error=new Error('当前类型不支持该题材');error.status=400;throw error;}
    const data=await api.routerData(`${SITE}/category/${type}${tag?`/${tag}`:''}${page>1?`?page=${page}`:''}`);
    const {rows,...result}=categoryContract.officialCategory(data,type,tag,page);
    return {...result,items:cards(rows.map(api.itemToCard)).map(row=>({...row,contentType:type}))};
  },
  async home(page = 1) {
    const data = await api.categoryPage("tab=1&sort_type=1", page);
    const pageData =
      data?.loaderData?.category_page || data?.loaderData?.["category_$"];
    if (!Array.isArray(pageData?.recommendList))
      throw new Error("首页数据结构已变化");
    return { items: cards(pageData.recommendList.map(api.itemToCard)), page };
  },
  async search(keyword, page = 1) {
    const word = String(keyword || "").trim();
    const race = (promise, ms) => Promise.race([
      promise,
      new Promise((_, reject) => {
        const t = setTimeout(() => reject(new Error("搜索请求超时")), ms);
        if (t.unref) t.unref();
      }),
    ]);

    // 官网 PC 搜索页同源接口（/api/search/result，无需签名）：
    // 字段最全（题材分类/热度/总集数/总页数/免费集数），与官网搜索结果页完全一致，作为首选源。
    // 上游网关偶发 502/503（连续请求搜索+建议时更易触发）：递增退避重试至多 3 次，
    // 仍失败则走下面的 App 搜索 / SSR 兜底。
    const fetchWebApiOnce = async () => {
      const resp = await upstreamClient.get(
        `${SITE}/api/search/result/?query=${encodeURIComponent(word)}&page=${page}`,
        {
          headers: { "User-Agent": SEARCH_WEB_UA, "Accept-Language": "zh-CN,zh;q=0.9" },
          timeout: 8000,
          responseType: "json",
        }
      );
      const data = resp?.data || {};
      const list = Array.isArray(data.searchList)
        ? data.searchList.map(webResultCard).filter(Boolean)
        : [];
      const totalPages = Number(data.totalPages) || 0;
      return {
        items: list,
        totalPages,
        total: Number(data.totalCount) || 0,
        hasMore: Boolean(data.hasMore) || (totalPages > 0 ? page < totalPages : list.length >= SEARCH_PAGE_SIZE),
      };
    };
    const fetchWebApi = async () => {
      const backoff = [0, 400, 1200];
      let lastError;
      for (let attempt = 0; attempt < backoff.length; attempt++) {
        if (backoff[attempt]) await new Promise((resolve) => setTimeout(resolve, backoff[attempt]));
        try {
          return await fetchWebApiOnce();
        } catch (error) {
          const status = Number(error?.response?.status || 0);
          if (status < 500 && status !== 429) throw error;
          lastError = error;
        }
      }
      throw lastError;
    };

    const fetchApp = async () => {
      const result = await api.appSearchPage(word, 11, page, 20);
      return {
        items: Array.isArray(result.list) ? cards(result.list) : [],
        hasMore: Boolean(result.hasMore),
      };
    };
    const fetchWeb = async () => {
      const data = await api.routerData(
        `${SITE}/search/${encodeURIComponent(word)}?page=${page}`
      );
      const pageData =
        data?.loaderData?.["search_(keyword)/page"] ||
        data?.loaderData?.search_page;
      if (!Array.isArray(pageData?.searchList)) throw new Error("搜索数据不可用");
      return cards(pageData.searchList.map(api.itemToCard));
    };

    const [webApiRes, appRes, webRes] = await Promise.allSettled([
      race(fetchWebApi(), 6000),
      race(fetchApp(), 2000),
      race(fetchWeb(), 2000),
    ]);

    const items = [];
    const seen = new Set();
    const addItem = (item) => {
      if (item && item.id && !seen.has(String(item.id))) {
        seen.add(String(item.id));
        items.push(item);
      }
    };

    // 首选官网 Web 搜索接口；其结果为空或失败时，依次回退 App 搜索、官网 SSR
    if (webApiRes.status === "fulfilled") webApiRes.value.items.forEach(addItem);
    if (!items.length && appRes.status === "fulfilled") appRes.value.items.forEach(addItem);
    if (!items.length && webRes.status === "fulfilled") webRes.value.forEach(addItem);

    if (!items.length) {
      // 任一上游源失败（超时/502 等）而其余源返回空：属于瞬态故障而非“真无结果”，
      // 必须抛错让前端显示错误态，避免翻页时闪现“没有找到相关内容”空态
      const anyRejected =
        webApiRes.status === "rejected" ||
        appRes.status === "rejected" ||
        webRes.status === "rejected";
      if (anyRejected) {
        throw (webApiRes.reason?.message !== "搜索请求超时" ? webApiRes.reason : null) ||
          webApiRes.reason || appRes.reason || webRes.reason ||
          new Error("搜索暂时失败");
      }
    }

    const meta = webApiRes.status === "fulfilled" ? webApiRes.value : null;
    return {
      items,
      page,
      totalPages: meta ? meta.totalPages : 0,
      total: meta ? meta.total : 0,
      hasMore: meta
        ? meta.hasMore
        : appRes.status === "fulfilled"
          ? appRes.value.hasMore
          : items.length >= 20,
    };
  },
  async suggest(keyword) {
    const word = String(keyword || "").trim();
    if (!word) return { items: [] };
    const resp = await upstreamClient.get(
      `${SITE}/api/search/suggestion/?query=${encodeURIComponent(word)}`,
      {
        headers: { "User-Agent": SEARCH_WEB_UA, "Accept-Language": "zh-CN,zh;q=0.9" },
        timeout: 6000,
        responseType: "json",
      }
    );
    const list = Array.isArray(resp?.data?.suggestionList) ? resp.data.suggestionList : [];
    const items = list
      .map((row) => {
        const video = row?.video_data && typeof row.video_data === "object" ? row.video_data : {};
        const isDrama = Boolean(video.series_id);
        const cats = Array.isArray(video.category_list)
          ? video.category_list.map((c) => c && c.name).filter(Boolean)
          : [];
        const heat = video.hot_score_data && video.hot_score_data.text
          ? String(video.hot_score_data.text)
          : "";
        return {
          // drama：带封面的剧集建议（点击进详情）；keyword：纯关键词建议（点击发起搜索）
          type: isDrama ? "drama" : "keyword",
          id: isDrama ? String(video.series_id) : null,
          title: String(row?.name || video.series_title || ""),
          cover: video.series_cover ? String(video.series_cover) : "",
          subtitle: isDrama ? [...cats, heat].filter(Boolean).join(" · ") : "",
          episodeCount: Number(video.episode_cnt) || 0,
        };
      })
      .filter((item) => item.title);
    return { items };
  },
  detailCacheStatus(id) {
    if (detailRefreshes.has(id)) return 'MISS';
    return detailPageCache.get(`${SITE}/detail?series_id=${id}`) ? 'HIT' : 'MISS';
  },
  async detail(id, { fresh = false, signal = upstreamRequestSignal() } = {}) {
    if (typeof id !== 'string' || !/^\d{1,30}$/.test(id)) throw Object.assign(new Error('剧集 ID 必须是数字字符串'), { status: 400 });
    if (signal?.aborted) throw signal.reason;
    let refreshKey = detailRefreshes.get(id);
    if (fresh && !refreshKey) {
      refreshKey = `detail:${id}:fresh:${crypto.randomUUID()}`;
      detailRefreshes.set(id, refreshKey);
    }
    const key = refreshKey || `detail:${id}`;
    const loadOnce = async (bypassPageCache) => {
    if (bypassPageCache) {
      // fresh 路径（key 不同）需先等掉同 id 的普通在途请求；同 key 重试不能 await 自己，否则死锁
      const old = resourcePending.get(`detail:${id}`);
      if (old && key !== `detail:${id}`) await old.promise.catch(() => {});
      upstreamRequestSignal()?.throwIfAborted();
      detailPageCache.delete(`${SITE}/detail?series_id=${id}`);
      api.pageCache.delete(`${SITE}/detail?series_id=${id}`);
    }
    const page = await loadDetailPage(id, { fresh: Boolean(bypassPageCache), signal });
    const detailPage = page.routerData?.loaderData?.detail_page || {};
    const merged = page.merged?.detail_page || {};
    const series = detailPage.seriesDetail;
    if (!series || !Array.isArray(series.vid_list) || !series.vid_list.length)
      throw new Error("剧集不存在或分集暂不可用");
    const episodes = Array.from(series.vid_list, (vid, index) => ({
      id: String(vid),
      title: `第 ${index + 1} 集`,
      number: index + 1,
    }));
    if (
      episodes.some((e) => !/^\d+$/.test(e.id)) ||
      new Set(episodes.map((e) => e.id)).size !== episodes.length
    )
      throw new Error("分集数据异常");
    const recommendations = merged.recommendations && typeof merged.recommendations === "object"
      ? merged.recommendations
      : {};
    const groups = recommendations.recommendationGroups && typeof recommendations.recommendationGroups === "object"
      ? recommendations.recommendationGroups
      : {};
    // 相关短剧 = 官方 related_list；热门短剧 = hot_list；videoList 为两者并集（缺失时退化用它）
    const related = mapRelatedRows(groups.related_list, id);
    const hot = mapRelatedRows(groups.hot_list, id);
    const fallbackRelated = related.length ? related : mapRelatedRows(recommendations.videoList, id);
    const episodeInfo = series.series_episode_info && typeof series.series_episode_info === "object"
      ? series.series_episode_info
      : {};
    return {
      ...card(api.itemToCard(series)),
      id,
      episodes,
      social: mapSocial(detailPage.seriesSocialInfo),
      related: fallbackRelated,
      hot: hot.length ? hot : fallbackRelated.slice(0, 8),
      celebrities: mapCelebrities(series.celebrities),
      episodeRightText: String(series.episode_right_text || ""),
      payType: Number(series.pay_type) || 0,
      episodeCount: Number(series.episode_cnt) || episodes.length,
      accessibleEpisodeCount: Number(series.accessible_episode_cnt) || 0,
      seriesStatus: Number(episodeInfo.series_status) || 0,
      firstTagLink: page.firstTagLink || null,
      _hasRecommendations: Boolean(groups.related_list?.length || recommendations.videoList?.length),
    };
    };
    const result = await sharedResource(key, async () => {
      let data = await loadOnce(Boolean(refreshKey));
      // 上游 SSR 偶发漏注入推荐脚本：相关短剧为空时绕过缓存重拉一次
      if (!data._hasRecommendations && !refreshKey) {
        data = await loadOnce(true);
      }
      const { _hasRecommendations, ...payload } = data;
      return payload;
    }, { signal });
    if (refreshKey) {
      const clear = () => { if (detailRefreshes.get(id) === refreshKey) detailRefreshes.delete(id); };
      resourcePending.get(key)?.promise.then(clear, clear);
    }
    return result;
  },
  async character(id, { signal = upstreamRequestSignal() } = {}) {
    if (typeof id !== 'string' || !/^\d{1,30}$/.test(id)) throw Object.assign(new Error('演员 ID 必须是数字字符串'), { status: 400 });
    if (signal?.aborted) throw signal.reason;
    const data = await api.routerData(`${SITE}/character/${encodeURIComponent(id)}`);
    const page = data?.loaderData?.["character_(id)/page"] || data?.loaderData?.character_page || {};
    const userInfo = page.userInfo || {};
    const relation = userInfo.user_relation_info || {};
    const videoList = Array.isArray(page.videoList) ? page.videoList : [];
    const items = videoList
      .map((item) => {
        const categoryList = Array.isArray(item.category_list)
          ? item.category_list.map((c) => c?.name || '').filter(Boolean)
          : [];
        const hot = item.hot_score_data || {};
        return {
          id: String(item.series_id || ''),
          title: String(item.series_title || ''),
          cover: String(item.series_cover || ''),
          description: String(item.series_intro || ''),
          badge: String(item.episode_right_text || (item.episode_cnt ? `全${item.episode_cnt}集` : '')),
          tags: categoryList.slice(0, 5).join('/'),
          heatText: String(hot.text || ''),
          heatScore: Number(hot.score) || 0,
          createTime: Number(item.create_time) || 0,
        };
      })
      .filter((r) => /^\d+$/.test(r.id) && r.title);
    return {
      id: String(page.person_id || userInfo.person_id || userInfo.actor_id || id),
      name: String(userInfo.user_name || ''),
      avatar: String(userInfo.user_avatar || ''),
      role: Array.isArray(userInfo.subtitle_list) ? userInfo.subtitle_list.join(' ') : '',
      description: String(userInfo.description || ''),
      gender: Number(userInfo.gender) || 0,
      isBlueVip: Boolean(userInfo.is_blue_vip),
      hasRegistered: Boolean(userInfo.has_registered),
      followCount: Number(relation.follow_user_num) || 0,
      fansCount: Number(relation.fans_num) || 0,
      diggedCount: String(relation.digged_count ?? '0'),
      items,
    };
  },
  async stream(id, fresh = false) {
    if (fresh) {
      api.streamCache.delete(`${id}|auto`);
      api.videoInfoCache.delete(id);
    }
    const stream = await api.resolveStream(id, "auto");
    const prepared = await api.prepareHeader(stream);
    return {
      total: prepared.total,
      chunk: async (start, end) =>
        api.decryptPartial(
          (await api.remoteRange(stream, start, end)).data,
          start,
          stream.key,
          prepared
        ),
    };
  },
};

// Limit the pinned upstream's otherwise unbounded caches during long-lived home use.
setInterval(() => {
  for (const cache of [
    api.streamCache,
    api.videoInfoCache,
    api.pageCache,
    api.appSearchCache,
  ]) {
    for (const [key, value] of cache)
      if (Date.now() - value.time > 300000) cache.delete(key);
    while (cache.size > 100) cache.delete(cache.keys().next().value);
  }
}, 60000).unref();
