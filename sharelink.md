# 红果 APP 分享链接 · 应用内解析 尝试报告

> 目标：手机红果 APP 分享出来的链接，能否在电脑端（本桌面应用）直接解析并定位到对应短剧。
> 结论：**可行，且无需任何查表/二次请求**——分享链接里的 `video_id` 就是本应用内部的剧集 ID，`vid` 就是选集 ID，二者属于同一 ID 命名空间。

---

## 1. 待测链接

```
https://novelquickapp.com/hongguo/ug/pages/video-animation-share
  ?encrypt_did=...
  &video_id=7698294694886788121
  &vid=7698309376561400856
  &share_toast_vid=7698309376561400856
  &share_type=4
  &landing_source=share
  &user_id=
  &did=90c0ff159d6b578533cd83c6dd3b1293
  &share_timestamp=1792831438
  &share_channel=copy_link
  &source_channel=copy_link
  &entrance=video_player_share_button
  &report_params={"entrance":"video_player_share_button",...}
  &page_type=video-animation-share
```

### 参数拆解

| 参数 | 含义 | 是否用于解析 |
|---|---|---|
| `page_type` | 分享页类型（`video-animation-share`） | 否（仅标识来源） |
| `video_id` | **剧集 ID**（合集/短剧 id） | ✅ 解析为应用 `seriesId` |
| `vid` | 分享时所在选集的视频 ID | ✅ 解析为应用 `episodeId` |
| `share_toast_vid` | 与 `vid` 同值（分享弹层使用的 vid） | ✅ 兜底取选集 |
| `share_type` | 分享类型（`4`） | 否 |
| `landing_source` / `entrance` | 落地来源 / 入口 | 否 |
| `user_id` / `did` / `encrypt_did` | 用户/设备标识 | 否（隐私字段，忽略） |
| `share_timestamp` | 分享时间戳 | 否 |
| `share_channel` / `source_channel` | 分享渠道 | 否 |
| `report_params` | 上报参数 JSON | 否 |

> 解析只需 `video_id` 与 `vid` 两个字段，其余均为渠道/上报冗余，且 `encrypt_did` 是加密设备标识，**不能也不应**用于内容定位。

---

## 2. 关键实测结论（为什么能直接解析）

应用后端（`backend/custom-server`）拉取官方详情用的是 `https://hongguoduanju.com/detail?series_id={id}`，
详情接口返回 `seriesDetail.vid_list`（每集的视频 id 数组），**前端把每个 `vid` 直接当成选集 `episodeId` 使用**
（`backend/server/provider.mjs` 的 `detail()`：`episodes = vid_list.map(vid => ({ id: String(vid), ... }))`）。

我做了两次真实请求验证：

1. 把分享链接里的 `video_id=7698294694886788121` 当作 `series_id` 请求官方详情
   → 返回**有效剧集**（`episode_cnt=1000`，且 `vid_list[0] === 7698309376561400856`）。
2. 把 `vid=7698309376561400856` 当作 `series_id` 请求
   → `no seriesDetail`，说明 `vid` 不是剧集 ID，而是**选集 ID**。

**结论：**

- `video_id` ⇔ 应用 `seriesId`（`#/detail/{video_id}` 即可打开详情）
- `vid` ⇔ 应用 `episodeId`（详情页 `episodes[]` 中的 `id` 就长这样，可直接带入播放器 `#/player/{video_id}/{vid}`）
- 二者与官网 `hongguoduanju.com` 的 `series_id` / `vid_list` 完全同源同义

因此「应用内链接解析」本质是**字符串提取 + ID 透传**，不依赖搜索、不需新建映射表，也不会受剧名/演员变更影响。

---

## 3. 解析器实现（`desktop/src/shareLink.js`）

`parseShareLink(input)` 入参宽容，支持以下形态，均返回 `{ seriesId, episodeId, kind, raw }` 或 `null`：

| 输入形态 | 结果 |
|---|---|
| 完整 APP 分享链接 | `seriesId=video_id`，`episodeId=vid` |
| 夹带文案的链接（如“朋友分享 https://…”） | 自动抽取首个 http(s) 链接后解析 |
| 纯数字 `7698294694886788121` | 当作 `seriesId` |
| 网页版 `https://hongguoduanju.com/play/{id}` | 路径提取 `seriesId` |
| 网页版 `https://hongguoduanju.com/detail?series_id={id}` | query 提取 |
| `video_id=7698294694886788121` | 正则兜底提取 |
| 无关文本 / 空串 | 返回 `null`（UI 提示无法识别） |

解析优先级：query 显式参数（`video_id`/`vid` 等）> 路径式 `/play|video|album/{id}` > 整段正则兜底 > 任意长数字兜底。

---

## 4. 已落地的应用内入口（本次「解析尝试」的实装）

为验证可行性，已在桌面端接好最小可用闭环：

- `NavTools.jsx` 工具栏新增「打开分享链接」按钮（带 `data-tip` 悬浮提示，符合项目 Tooltip 规范）。
- `ShareLinkModal.jsx` 弹窗：粘贴链接 → 调 `parseShareLink` →
  - 有 `episodeId` → `onNavigate('player', seriesId, episodeId)`（直达分享的具体选集）
  - 仅 `seriesId` → `onNavigate('detail', seriesId)`（打开剧集详情）
  - 解析失败 → 行内错误提示，不跳转。
- 样式沿用全局 `.hg-modal`，输入框用 1px 边框 + `:focus` 高亮环，**未引入装饰性 box-shadow**（遵守项目视觉规则）。

使用路径：电脑端点工具栏「链接」图标 → 手机复制的分享链接粘贴进来 → 「打开」即直达该剧/该集。

---

## 5. 可行性与风险评估

| 维度 | 评估 |
|---|---|
| 可行性 | **高**。ID 同源，零额外请求、零映射表。 |
| 命中准确率 | 高。`video_id` 唯一对应一部剧，`vid` 唯一对应一集。 |
| 鲁棒性 | 高。解析器对链接形态容错（带文案、纯数字、网页版链接均覆盖）。 |
| 隐私 | 安全。忽略 `user_id`/`did`/`encrypt_did`，仅取内容定位所需 ID。 |
| 风险点 | 仅当分享链接结构大改（如改字段名、改用非数字 ID）时需同步解析器；当前 `encrypt_did` 无法反推用户，属预期。 |

---

## 6. 后续可选项（本次未做，供决策）

1. **一键直达（系统级）**：注册 `hongguo://` 自定义协议 / Electron deep-link，手机分享时若同账号或扫码，可直接拉起桌面端并定位——体验最优，但需 OS 协议注册与桌面端 `second-instance`/`open-url` 处理。
2. **搜索框自动识别**：在搜索框 `onPaste` 时若命中分享链接，直接解析跳转，省去独立按钮。
3. **Web 端分享落地**：若网页版也需支持，可在启动时读 `?share=` query 自动解析（当前路由为 hash 模式，需兼容）。
4. **解析结果预览**：弹窗解析成功后先展示剧名/封面（调 `/api/series/{id}`）再确认打开，避免贴错链接。

> 当前实装已满足「手机分享链接一出来，电脑就能方便地找到那个剧」的核心诉求；上述为体验增强项。

---

## 7. 本轮改动（2026-10-24 更新）

### 7.1 输入框改为单行 + 智能剪切板检测
- `ShareLinkModal.jsx`：`<textarea>` 改为单行 `<input type="text">`，移除可伸缩特性。
- **智能检测**：在 `onChange`（覆盖粘贴/输入）时实时调用 `parseShareLink`；一旦内容可被解析为分享/网页链接，立即从「输入态」切换到「确认态」弹窗，展示识别到的剧集（并尽力从后端 `/api/series/{id}` 拉取剧名增强可读性），由用户「确认打开 / 重新输入」。未触发自动识别时仍保留手动「打开」兜底。
- 确认后：带 `episodeId` 走 `onPlay`（桌面端拉起独立播放窗口），否则进详情页。

### 7.2 支持官网网页链接
- 形如 `https://hongguoduanju.com/detail?series_id=7690961604636052505` 的链接（开发参考的原版网页）已被解析器支持：取 `series_id` 作为 `seriesId`，验证解析结果为 `{"seriesId":"7690961604636052505","episodeId":null,"kind":"series"}`。

### 7.3 任务栏「关闭所有窗口」修复
原问题：Windows 任务栏「关闭所有窗口」向两窗口各发 `WM_CLOSE`，播放窗口无拦截器会立即关闭，主窗口随后触发确认弹窗却无人点确认，导致「先关播放窗、主窗口被保留」。

修复（`main.js` + `preload.js` + `App.jsx`）：
- 播放窗口新增 `close` 拦截：收到关闭时**不立即关闭**，200ms 内观察主窗口是否也收到 `close`——
  - 主窗口也收到（一键关闭全部）→ 聚焦主窗口并弹出确认弹窗，两窗口均暂存；
  - 仅播放窗口收到（单独关播放窗）→ 直接放行，不再弹确认。
- 主窗口 `close` 拦截记录 `mainCloseReceived` 并防止重复弹确认。
- 确认弹窗「取消」新增 `win:close-cancel` IPC 复位协调状态，保证取消后后续关闭恢复正常。
- 预期行为达成：任务栏「关闭全部窗口」时，先聚焦主窗口 → 弹确认 → 确认后才统一关闭全部窗口（仅在存在播放窗口时走确认）。
- 本轮补充：原来 `focusMainWindow()` 仅在「播放窗口先收到 close」分支触发，主窗口先收到 close 的场景不会聚焦；并且播放窗口仍开着会盖住确认弹窗。已新增 `raiseMainForConfirm()`：两处关闭拦截均调用，临时把主窗口 `setAlwaysOnTop(true)` 确保确认弹窗可见，确认/取消时还原。

### 7.4 优化链接解析：混排文本清洗 + 短链支持
- **混排清洗**：`extractUrl` 由「非空白字符」改为按 URL 合法字符集匹配，并去除结尾粘连的中文/全角标点与空白，可准确从
  `漫剧《…》 - 免费好剧…点击链接打开👉https://novelquickapp.com/s/XJpeMUFkNHQ/ 复制本条消息…` 这类中文+链接混排中剥离出纯净 URL（校验通过：短链/无空格邻接/网页链接三种形态均正确）。
- **短链解析**：红果分享短链 `novelquickapp.com/s/{code}/` 不含 `video_id`，需重定向解析。新增后端 `/api/resolve-share?url=`：用 axios 跟随重定向，从最终 URL 或页面体提取 `video_id`/`vid`（实测 `…/s/XJpeMUFkNHQ/` → `video_id=7690059679510055960`），前端 `resolveShareLink()` 调用它；`ShareLinkModal` 识别到「短链」时进入「解析中…」态，解析成功再弹确认框。
