# HongguoTV 后端提取与架构说明

> 提取自 `D:\hongguotv-web-win-x64`（对应 GitHub 仓库 https://github.com/sgsjsvc/hongguoTV 的 Web 独立服务包）。
> 本目录为后端源码的**原样副本**（SHA-256 已逐文件校验一致），未包含 `runtime/node.exe`（85MB）与 `node_modules`、前端产物 `apps/web-pc/dist`。
> 目的：理解现有后端全貌，作为自研替代后端的蓝图。

---

## 1. 整体形态

- 类型：**单进程 Node HTTP 服务**，纯 `node:http`，无 Web 框架。
- 入口：`start.cmd → scripts/service-launcher.mjs → fork custom-server/index.mjs`
- 端口：默认 **8788**（被占用时自动 +1 递增，最多 11 次；设置 `HG_PORT` 则严格使用）
- 数据目录：`%APPDATA%\HongguoTV\web-service`（`HG_DATA_DIR` 可覆盖）
- 运行时：内嵌 Node 22.20.0；代码用到 `node:sqlite`，**本机重跑需 Node ≥ 22.5**
- 数据源：红果短剧官网 `https://hongguoduanju.com`（HTML SSR 的 `_ROUTER_DATA` 抓取 + 官方视频模型接口）
- 双职责：内容聚合服务（短剧列表/详情/搜索/排行/播放流代理）+ 家庭资料库（收藏/历史/搜索/偏好/推荐信号，含远程同步客户端）

```
浏览器 / 桌面端 / TV
        │  HTTP (CORS *)
        ▼
custom-server/index.mjs   ← 主服务：路由、缓存、静态托管、预取、流代理
        │
        ├── server/provider.mjs   ← 内容提供方抽象（分类/首页/搜索/详情/流）
        │        └── vm 沙箱加载 shared/content-core/hongguo.js（GPL 第三方引擎）
        ├── shared/library-store.mjs        ← 事件溯源资料库（SQLite）
        ├── custom-server/library-sync.mjs  ← 远程同步客户端（1s tick）
        ├── custom-server/history-store.mjs ← 旧版历史存储（兼容层）
        ├── custom-server/recommendation-service.mjs ← 推荐服务
        └── custom-server/video-cache.mjs   ← 内存密文分块缓存 + 预取
```

## 2. 目录结构与模块职责

| 文件 | 职责 |
| --- | --- |
| `scripts/service-launcher.mjs` | 守护式启动器。`start/stop/run` 三态；锁文件 `service.lock` 防并发启动；写 `service-state.json`（pid/token/port）；起一个随机端口控制服务（Bearer token 校验 `/health`、`POST /stop`）；fork 后端并走 IPC 收 `{type:'ready',port}`、发 `{type:'shutdown'}`；`HG_SERVICE=sync` 时改拉远程同步服务。 |
| `custom-server/index.mjs` | **主服务（v2.3.0）**。全部路由见 §3；静态托管 `apps/web-pc/dist`（SPA 回退）；启动时一次性把旧 history 迁移进 library；初始化引擎沙箱；推荐 warmup（240s 周期）。 |
| `server/provider.mjs` | 内容提供方：`categoryMetadata / category / categoryList / home / search / detail / stream`。附带基础设施：`mediaLookup`（自定义 DNS 双路 race，默认 119.29.29.29/223.5.5.5）、`contentTransport`（keepAlive agent + autoSelectFamily 50ms）、`sharedResource`（单飞共享请求 + AbortSignal 传播）、`createPrefetchQueue`（预取批调度）。 |
| `server/vendor/hongguo.cjs` | 引擎回退副本（provider 加载路径 1 是 shared/content-core/hongguo.js）。 |
| `shared/content-core/hongguo.js` | **第三方 GPL-3.0 引擎**「红果果短剧.js」（drpys 项目 2026-09-21 快照，`NOTICE.md` 标注）。Web/Windows/TV 三端共用同一份源码（Node 用 vm 加载，TV 用 QuickJS）。承担：请求签名、设备身份生成（freshDevice，一次一用）、播放地址解析、MP4 变换与流数据部分解密。对外接口见 §7.2。 |
| `shared/content-core/README.md` | 引擎说明：设备身份两条铁律（device id 只能成功一次；固定 id 会被上游拉黑），含调测手段。 |
| `shared/category-contract.cjs` | 官网分类页数据契约：`real-drama / comic-drama / ai-drama` 三类、题材标签提取（selectorList）、分页与 canonicalPath 校验。 |
| `shared/library-store.mjs` | 资料库事件溯源实现（`node:sqlite`）。四表结构见 §4；`write/receive/pending/acknowledge/changes/seedTarget/snapshot`。 |
| `shared/recommendation-core.cjs` | 推荐排序**纯函数核心**（Node 与 TV QuickJS 共用，无网络依赖）：seed 哈希排序、兴趣权重、近 7 天压制、类型配额、20% 探索位。 |
| `shared/listen-port.mjs` | 端口回退监听（EADDRINUSE 时 +1 重试）。 |
| `shared/http-json.mjs` | `readJson`（2MiB 上限）/ `sendJson`（统一 CORS 头）。 |
| `shared/legacy-migration.mjs` | 旧 localStorage 数据（`hg_favorites_v1` 等）→ 事件列表转换。 |
| `custom-server/history-store.mjs` | 旧版历史存储：sessions / history / tombstones / deletion_watermarks / revisions。删除水印机制防止"已删记录被客户端伪造未来时间戳复活"。 |
| `custom-server/history-routes.mjs` | `/api/history*` 路由（会话、进度、导入、列表、删除）。 |
| `custom-server/library-routes.mjs` | `/api/library*` 路由（快照、同步配置、事件写入、幂等迁移）。 |
| `custom-server/library-sync.mjs` | 远程同步**客户端**：1s tick；握手对时（clockOffset）；push 本地 pending；pull 远端增量（单轮最多 16 批）；指数退避（1s→30s）。 |
| `custom-server/recommendation-service.mjs` | 推荐服务：按会话隔离排序与游标；内容池（type/tag/page）TTL 5min / stale 30min；warmup 预热 8 页×3 类；主题由用户历史兴趣聚合。 |
| `custom-server/video-cache.mjs` | 纯内存密文分块缓存（不落盘、不记录 URL/密钥/明文）：1MiB 分块、TTL 300s、默认 128MiB、LRU、前台优先调度（并发 4）、ETag 生成、L1/L2 预取 warm。 |
| `custom-server/prefetch-metrics.mjs` | 预取指标：active/maxActive/成功/失败/取消、时间加权平均并发。 |
| `custom-server/request-timing.mjs` | `HG_TIMING=1` 时输出 Server-Timing 头与路由耗时日志（不记录 ID/query/body）。 |
| `DEPLOYMENT.md` | 原始部署文档（跨平台打包、远程共享服务、管理平台、密钥设置）。 |
| `package.json` | 依赖仅 `axios 1.13.6`；`"type":"module"`。 |

未提取：`runtime/`（内嵌 node.exe 与 Node LICENSE）、`node_modules/`（axios 等）、`apps/web-pc/dist`（前端产物，由后端直接托管）。

## 3. HTTP API 清单

### 3.1 内容 API（本地服务 8788）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 进程健康 + 播放能力：`{ok, version:"2.3.0", playback:{engineLoaded, upstreamHealthy, upstreamDegraded, stats}}`。`ok:true` 只代表进程活着，`playback` 段区分"能不能播"。 |
| GET | `/api/banners` | 首页轮播 `{banners:[{id,title,cover,backgroundCover,titleImage,description,tags}]}`，10min 缓存。 |
| GET | `/api/sections` | 首页专区 `{sections:[{type,name,items:[{id,title,cover,badge,description,tags,rank}]}]}`。 |
| GET | `/api/category/tags?type=` | 分类标签池 `{types,type,tags:[{id,name,categoryIds}],sourceUrl}`；type∈`real-drama\|comic-drama\|ai-drama`。 |
| GET | `/api/category/list?type=&tag=&page=` | 分类列表 `{type,tag,page,tags,items,pagination:{pageNum,pageSize,total,totalPages}}`。 |
| GET | `/api/rank/types` | 四榜定义（红果热播/真人剧/AI剧/漫剧）。 |
| GET | `/api/rank/list` 或 `/api/rank/page?type=&page=` | 榜单分页（1–5 页 × 20 部），30min 缓存；上游失败自动回退首页分区 + 分类池补满 20 部。 |
| GET | `/api/ranks` | 兼容旧版全量榜单 `{ranks:[{key,title,items}]}`。 |
| GET | `/api/recommend?page=&session=` | 会话化推荐（24 条/页）；返回后自动预取前 2 部详情；session 16–128 位字符，页序强制，30min 过期，上限 64 会话。 |
| GET | `/api/home?page=` | 首页推荐流（引擎失败自动降级官方分类池）。 |
| GET | `/api/search?q=&page=` | 搜索：App 通道 + Web 通道**双路 race**（各 2s 超时），按 id 去重合并。 |
| GET | `/api/series/:id` | 剧集详情 `{id,title,cover,description,badge,tags,episodes:[{id,title:"第 N 集",number}]}`；`?fresh=1` 强制刷新（绕过缓存并失效旧缓存）；响应头 `X-Cache: HIT\|MISS\|BYPASS`。 |
| GET | `/api/series/:id/related` 或 `/recommend?limit=&page=` | 单剧相关推荐：按剧集标签搜索 → 主页流 → 分类列表三级兜底。 |
| GET | `/api/episodes/:id/qualities` | 清晰度列表 `{episodeId,defaultQuality,qualities:[{key,label,qualityNum,codec,rawKey,isDefault}]}`；**过滤 bytevc2 私有编码**（会导致浏览器/电视解码器崩溃），codec 统一映射 bytevc1→HEVC。 |
| GET | `/api/episodes/:id/play?quality=&seriesId=` | 播放地址指引：返回 `{path:"/api/episodes/:id/stream?quality=...", contentType:"video/mp4"}`。 |
| GET/HEAD | `/api/episodes/:id/stream?quality=` | **MP4 解密流代理**：`resolveStream → prepareHeader → remoteRange(字节区间) → decryptPartial(按偏移解密)`；支持 `Range`（206/416）、`ETag`+`If-None-Match`（304）、`If-Range`；1MiB 分块边解边发；HEAD 只取元数据不拉媒体。 |
| POST | `/api/prefetch` | 提交预取批：`{targets:[{kind:"detail"\|"qualities"\|"stream", id, seriesId?, level?:"l1"\|"l2", quality?}]}`，1–8 个/次；返回 202 + batch 状态。 |
| GET/DELETE | `/api/prefetch/{uuid}` | 预取批次状态查询 / 取消。 |
| GET | `/api/video-cache/status` | 缓存快照（usedBytes/chunks/hits/misses/evictions/进程内存）。 |

### 3.2 资料库 API（本地）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/library` | 完整快照 `{favorites,history,recommendationSignals,searchHistory,preferences,sync:{...},serverTime}`。 |
| POST | `/api/library/operations` | 写一条本地事件，body 为 `{id?,deviceId?,seq?,kind,key,op,at?,value}`（服务端补全 id/deviceId/seq），返回 `{event}`。 |
| POST | `/api/library/import` | 幂等迁移：`{migrationId, operations[]≤10000}`；operation id 确定性生成，可安全重试。 |
| GET/POST | `/api/library/sync` | 查看 / 配置远程同步。POST `{enabled?:false\|url,key}`；响应**永不返回密钥**。 |

### 3.3 历史 API（旧版兼容层）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/DELETE | `/api/history?source=all\|web\|pc\|tv` | 历史列表 / 按来源清空。 |
| POST | `/api/history/sessions` | 注册播放会话 `{sessionId,clientId,source,series,startedAt}`。 |
| POST | `/api/history/progress` | 保存进度 `{sessionId,sequence,episodeId,episodeNumber,positionMs,durationMs,completed,observedAt}`；`sequence` 单调递增才接受。 |
| POST | `/api/history/import` | 旧数据导入 `{clientId,source,items[]≤10000}`（按删除水印过滤）。 |
| GET/DELETE | `/api/history/:seriesId` | 单条查询 / 删除（写入 tombstone）。 |

### 3.4 远程同步服务（独立部署包，`HG_SERVICE=sync`，端口 8791，本包未包含）

`GET /api/sync/handshake`（实例身份/协议版本/serverTime）、`POST /api/sync/push`（收事件+确认）、`GET /api/sync/pull?cursor=N`（增量）、`GET /api/admin/library`、`POST /api/admin/operations`、`GET|POST /api/admin/key`（管理台密钥）。均要求 `Authorization: Bearer <家庭密钥>`。

## 4. 数据模型（SQLite）

### library.sqlite（WAL、synchronous=FULL、busy_timeout=5000）

```sql
CREATE TABLE library_meta(
  key TEXT PRIMARY KEY, value TEXT NOT NULL);          -- deviceId/instanceId/sequence/lastTime/clockOffset/
                                                        -- syncConfig/ackCursor:<target>/cursor:<target>/
                                                        -- migration:<id>/seed:<target>/legacyBackendMigrated
CREATE TABLE library_events(
  revision INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL, device_id TEXT NOT NULL, seq INTEGER NOT NULL,
  kind TEXT NOT NULL, item_key TEXT NOT NULL, event_time INTEGER NOT NULL,
  event_json TEXT NOT NULL, fingerprint TEXT NOT NULL, is_local INTEGER NOT NULL,
  UNIQUE(device_id, seq));                              -- 事件日志（append-only）
CREATE INDEX library_event_item ON library_events(kind, item_key, event_time);
CREATE TABLE library_records(                            -- 物化后的当前值（快照来源）
  kind TEXT NOT NULL, item_key TEXT NOT NULL, event_json TEXT NOT NULL,
  PRIMARY KEY(kind, item_key));
CREATE TABLE library_ack(target TEXT NOT NULL, event_id TEXT NOT NULL,
  PRIMARY KEY(target, event_id));                       -- 每远程目标的确认表
```

**事件字段**：`{id, deviceId, seq, kind, key, op, at, value}`
- `kind ∈ history | favorite | search | preference | recommendation`；`op ∈ set | delete | clear`（clear 仅 `key="*"`）
- 全序：`at → deviceId(字典序) → seq`；`fingerprint = SHA256(event 的 JSON)` 用于防 ID 复用与篡改
- 本地写：`at` 用 `max(clock, lastTime+1)` 保证单调；`seq` 自增
- 快照：物化 records 上按 clear/set 过滤，排序后输出 `favorites/history/recommendationSignals/searchHistory(最近10条)/preferences(默认 quality=1080P, speed=1, mode=mixed)`

### history.sqlite（旧版兼容，来源 web/pc/tv）

```sql
sessions(session_order PK, session_id UNIQUE, client_id, source, series_id,
         series_json, started_at, sequence, deleted);
history(series_id, source, item_json, updated_at, imported, revision, PK(series_id,source));
tombstones(series_id, source, deleted_at, PK(series_id,source));      -- 删除标记
deletion_watermarks(source, deleted_at, PK(source));                  -- 清空水印
revisions(id INTEGER PK AUTOINCREMENT);                               -- 单调版本号
```

## 5. 同步协议要点（本地 → 远程）

1. **握手**：`POST /api/library/sync {url, key}` → 远程 `/api/sync/handshake` 返回 `{protocolVersion:1, instanceId, serverTime}`；用往返时间估算 `clockOffset` 写入 meta。
2. **实例绑定**：`target = sha256(url + "\n" + instanceId + "\n" + key)`，所有游标/确认按 target 隔离。
3. **首次播种**：`seedTarget` 把现有物化记录标记为 `is_local=1`，全量推给新远程。
4. **上行**：`pending(target)` 取未确认本地事件 → `POST /api/sync/push {events, instanceId}` → 返回 `{acked[], events[]}`（ack 推进 `ackCursor:<target>`，确认行即时清理）。
5. **下行**：`GET /api/sync/pull?cursor=N` 增量拉取（单轮 ≤16 批，256 条/批），`receive(events, {canonical:true})` 幂等合入并校正物化值。
6. **冲突**：远端 instanceId 更换 → 409 要求重新验证；失败指数退避 1s→30s；`pending` 仅统计游标之后未确认事件。
7. **删除语义**：删除/清空也是事件（op=delete/clear），迟到的旧事件按 `at` 排序不能"复活"已删记录。

## 6. 配置环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HG_PORT` | 8788 | 指定后严格使用该端口（不递增尝试） |
| `HG_HOST` | 0.0.0.0 | 绑定地址 |
| `HG_DATA_DIR` | `%APPDATA%\HongguoTV\web-service` | 数据目录（service.log/锁/状态/SQLite） |
| `HG_WEB_DIR` | `../apps/web-pc/dist` | 前端静态目录 |
| `HG_MEDIA_DNS_SERVERS` | `119.29.29.29,223.5.5.5` | 媒体域名 DNS；`system` 用系统解析 |
| `HG_PREFETCH_ENABLED` | 开 | `0` 关闭预取与视频缓存 |
| `HG_VIDEO_CACHE_MB` | 128 | 内存密文缓存上限（4–512） |
| `HG_VIDEO_CACHE_FULL_MB` | 30 | L2 全片缓存上限（1–128） |
| `HG_RECOMMEND_WARMUP` | 开 | `0` 关闭推荐预热 |
| `HG_TIMING` | 关 | `1` 开启请求计时（Server-Timing） |
| `HG_SERVICE` | — | `sync` 时启动远程共享服务 |
| `HG_SYNC_KEY` / `HG_MANAGED` | — | 远程密钥 / 托管模式（由 launcher 设置） |

## 7. 关键机制

### 7.1 官网数据抓取
`axios.get("https://hongguoduanju.com/...")` → 正则提取 `_ROUTER_DATA = {...};` → `JSON.parse` → 读 `data.loaderData.*`（`category_$` / `detail_page` / `search_(keyword)/page` 等）。首页/分类 10min 缓存、榜单 30min、热点接口 50MiB LRU/300s。

### 7.2 引擎沙箱（vm）
`vm.createContext` 只注入白名单：`require` 仅放行 `node:crypto`；`Buffer/URL/URLSearchParams/AbortController/mediaLookup/axios`。`vm.runInContext(source + "\nthis.api = {...}", ctx, {timeout:5000})`。随后通过 `this.api` 导出的 9 个函数调用引擎：
`fetchVideoInfo`（画质元数据）、`resolveStream`（取流+密钥材料）、`qualityLabel/qualityNumber`（档位换算）、`prepareHeader`（构建 MP4 头+total）、`remoteRange`（上游 Range 拉密文）、`decryptPartial`（按偏移解密）、`rankData`（榜单 HTML 解析）、`upstreamStats`（上游健康计数）。

### 7.3 播放流链路（stream 代理）
```
fetchVideoInfo(episodeId) → resolveStream(id, quality) → prepareHeader(stream)
  → remoteRange(stream, start, end) 拉密文块
  → decryptPartial(data, start, key, prepared) 解密
  → HTTP 206 分块返回（支持 Range/ETag/304，断流即 abort 上游）
```
bytevc2 私有编码在 qualities 接口过滤；首块先校验再写 200/206 头（防坏流白占连接）。HEAD 请求只取元数据。

### 7.4 预取与缓存
- `/api/recommend` 命中后自动预取前 2 部 `detail`；detail 预热首集画质；`stream` 目标按码率估算 warm L1（默认 ~4MiB）或 L2 全片（≤30MiB 才整片）。
- 队列约束：单批 1–8 targets、队列 ≤32 任务/64 批；前台（播放/详情）请求可提升排队任务优先级。
- `sharedResource` 做**单飞合并**：同 key 并发只发一次上游请求，订阅方独立 AbortSignal，最后一个订阅者取消时才真正中断上游。
- 取消传播：`AsyncLocalStorage` 持有当前 AbortSignal，axios 请求拦截器自动合并。

### 7.5 推荐
- 会话隔离：`RecommendationSession(seed, mode, profile)`，每客户端独立排序与已发集合。
- 数据源：hot（榜单）/ discovery（分类流）/ topic（用户主题）三池；轮次加载；热门不覆盖 discovery/topic 来源。
- 排序：`interest×2 + seededHash×4 - 近期看过?100`；类型配额（mixed 模式保底 10%）；20% 探索位；最终按 seed 打散顺序。

## 8. 许可与合规提示（重要）

- `shared/content-core/hongguo.js`、`server/vendor/hongguo.cjs`、`custom-server/vendor/hongguo.cjs` 是**同一份**第三方代码：drpys 项目 `spider/js/红果果短剧.js`（GPL-3.0，2026-09-21 快照），三处均为未修改副本（`NOTICE.md` 已标注）。
- 该引擎包含：对上游接口的请求签名、**设备身份生成（每次请求新生成，规避上游设备封禁）**、播放地址解析、CENC 样本索引解析与**流数据解密**。这部分是对上游技术保护措施的绕行实现，两点风险：
  1. **GPL-3.0 传染性**：把这份代码复制进你的项目，整个分发物都须按 GPL-3.0 开源；
  2. **规避技术措施的法律风险**：直接照搬其签名/解密逻辑用于自研后端，可能涉及规避技术保护措施的相关法律条款（著作权法、信息网络传播权保护条例等）。
  → 建议：自研时把"内容引擎"当作**黑盒接口**（只依赖 §7.2 的 9 个公开函数签名），用你自己的实现填充；不要逐行复制其签名/解密细节。
- `custom-server/`、`server/`、`shared/` 中的其余模块是本项目原创代码，包内未附明确许可证。本次提取仅限个人学习研究；若对外发布，请先与上游作者确认许可（仓库 LICENSE 为 GPL-3.0 时，整个派生作品同样受其约束）。

## 9. 自研后端重写路线图

| 阶段 | 目标 | 关键点 |
| --- | --- | --- |
| M1 最小服务 | `node:http` 起服务 + `/health` + 静态托管 | 直接用系统 Node ≥22.5；`node:sqlite` 可用即可 |
| M2 内容 API | banners / sections / category / rank / search / home | 先写死 UA 抓 `_ROUTER_DATA`；LRU 缓存 10min |
| M3 详情 | `/api/series/:id` + `/api/series/:id/related` | 详情页 loaderData 解析；分集 vid_list |
| M4 播放 | qualities / play / stream | 先透传官方直链验证；再实现 Range 代理与解密（或接入你自己的播放源） |
| M5 资料库 | library 事件溯源 + history 兼容 + 迁移 | 照 §4 表结构；事件校验/排序/指纹必须一致才能对接现有前端 |
| M6 同步 | sync 客户端 + 远程服务 + 管理台 | 照 §5 协议；Bearer + instanceId + 游标 |
| M7 增强 | 预取队列、视频缓存、推荐、指标 | 可选；按需取舍 |

**必须保持兼容的契约**（如果你还要服务现有前端/App）：API 路径与响应形状（§3）、事件协议（§4/§5）、`/api/episodes/:id/stream` 的 Range/ETag 语义、`/health` 的 playback 段。

## 10. 运行方式（本提取包）

提取包不含 `runtime/node.exe` 与 `node_modules`，本机重跑需：

```powershell
cd hongguotv-backend
npm install          # 仅需 axios
node scripts/service-launcher.mjs start   # 或直接 node custom-server/index.mjs
```

或从原包复制 `runtime/node.exe` 到 `runtime/` 后使用 `start.cmd`（此时需自行补齐 node_modules）。

---

*提取时间：2026-10-21 · 校验：27 个文件 SHA-256 与源目录逐一比对，0 差异。*
