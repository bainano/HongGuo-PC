// 红果 APP / 网页分享链接解析
// ------------------------------------------------------------------
// 实测结论（见根目录 sharelink.md）：
//   · 分享链接里的 video_id 就是本应用内部的「剧集 ID / seriesId」
//     （后端 detail 接口 https://hongguoduanju.com/detail?series_id= 用的就是它）。
//   · 分享链接里的 vid / share_toast_vid 是「选集 ID / episodeId」，
//     应用详情接口返回的 episodes[].id 直接就是该 vid，因此无需二次查表。
// 因此解析后：
//   video_id → 跳转 #/detail/{video_id}（或带 vid 时 #/player/{video_id}/{vid}）
//   vid      → 直接作为起始播放的 episodeId 传入播放器。

// 红果 APP 分享链接示例：
// https://novelquickapp.com/hongguo/ug/pages/video-animation-share
//   ?encrypt_did=...&video_id=7698294694886788121&vid=7698309376561400856
//   &share_toast_vid=7698309376561400856&share_type=4&landing_source=share
//   &user_id=&did=...&share_timestamp=1792831438&share_channel=copy_link
//   &source_channel=copy_link&entrance=video_player_share_button
//   &report_params={...}&page_type=video-animation-share

const LONG_ID = /\d{6,30}/;

// 从任意文本（支持中文说明文字与链接混排）里提取第一个 http(s) 链接。
// 采用 URL 合法字符集而非「非空白」，避免把链接后的中文/全角标点、说明文字一并吞入。
import { resolveApiBase, API_BASE } from './api.js';

function extractUrl(text) {
  const m = text.match(/https?:\/\/[\w\-./?#\[\]@!$&'()*+,;=%]+/i);
  if (!m) return null;
  let url = m[0];
  // 去除结尾可能粘连的中文/全角标点与空白（这些不属于 URL）
  url = url.replace(/[。，、；：！？…）】」』〉》\s'"]+$/, '');
  return url;
}

/**
 * 解析红果分享链接 / 文本，提取剧集与选集 ID。
 * @param {string} input 完整分享链接、带链接的文案、或纯数字 video_id
 * @returns {null | { seriesId:string, episodeId:string|null, kind:'series'|'player', raw:string }}
 */
export function parseShareLink(input) {
  if (!input || typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;

  // 1) 纯数字（>=6 位）：直接当作剧集 ID
  if (/^\d{6,30}$/.test(text)) {
    return { seriesId: text, episodeId: null, kind: 'series', raw: text };
  }

  let seriesId = null;
  let episodeId = null;

  // 2) 有 URL：优先走结构化解析
  const urlStr = extractUrl(text);
  if (urlStr) {
    try {
      const u = new URL(urlStr);
      const sp = u.searchParams;
      const vid =
        sp.get('vid') ||
        sp.get('share_toast_vid') ||
        sp.get('episode_id');
      const sid =
        sp.get('video_id') ||
        sp.get('videoId') ||
        sp.get('series_id') ||
        sp.get('seriesId') ||
        sp.get('album_id');
      if (sid && LONG_ID.test(sid)) seriesId = sid;
      if (vid && LONG_ID.test(vid)) episodeId = vid;

      // 路径式：/play/{id} /detail?… 已由 query 覆盖；再兜底 /video|album/{id}
      if (!seriesId) {
        const pm = u.pathname.match(/\/(?:play|video|album)\/(\d{6,30})/i);
        if (pm) seriesId = pm[1];
      }

      // 短链：novelquickapp.com/s/{code} 需经后端解析重定向后才能拿到 video_id
      const shortMatch = u.pathname.match(/\/s\/([\w\-]+)/i);
      if (!seriesId && shortMatch) {
        return { kind: 'shortlink', shortUrl: urlStr, raw: text };
      }
    } catch (_) {
      // URL 解析失败则落到下面的兜底正则
    }
  }

  // 3) 兜底：从整段文本里抓 video_id= / series_id= 数字
  if (!seriesId) {
    const m = text.match(/(?:video_id|series_id|album_id)[=:]\s*(\d{6,30})/i);
    if (m) seriesId = m[1];
  }
  if (!episodeId) {
    const m = text.match(/(?:vid|episode_id|share_toast_vid)[=:]\s*(\d{6,30})/i);
    if (m) episodeId = m[1];
  }

  // 4) 最后兜底：任意长数字作为剧集 ID（仅当尚未拿到 seriesId）
  if (!seriesId) {
    const m = text.match(/(\d{6,30})/);
    if (m) seriesId = m[1];
  }

  if (!seriesId) return null;
  // vid 与 seriesId 相同（异常数据）时忽略选集
  const ep = episodeId && episodeId !== seriesId ? episodeId : null;
  return {
    seriesId,
    episodeId: ep,
    kind: ep ? 'player' : 'series',
    raw: text
  };
}

// 供 UI 提示用：把解析结果转成人类可读的一句话
export function describeParse(result) {
  if (!result) return '无法识别为红果分享链接';
  if (result.kind === 'shortlink') return '已识别：红果分享短链（解析中…）';
  if (result.kind === 'player') {
    return `已识别：剧集 ${result.seriesId}（定位到分享的具体选集视频）`;
  }
  return `已识别：剧集 ${result.seriesId}`;
}

/**
 * 解析红果分享「短链」（novelquickapp.com/s/{code}）。
 * 短链不含 video_id，需后端 /api/resolve-share 跟随重定向解析出剧集/选集 ID。
 * @returns {Promise<{ seriesId:string, episodeId:string|null, kind:'series'|'player', raw:string }>}
 */
export async function resolveShareLink(shortUrl) {
  // 打包后页面以 file:// 加载，相对路径请求无法命中本机后端，
  // 必须基于运行时探测到的 API_BASE（见 api.js）。
  await resolveApiBase();
  const resp = await fetch(
    `${API_BASE}/api/resolve-share?url=${encodeURIComponent(shortUrl)}`
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.seriesId) {
    throw new Error(data.error || '分享链接解析失败');
  }
  const seriesId = String(data.seriesId);
  const episodeId = data.episodeId ? String(data.episodeId) : null;
  return {
    seriesId,
    episodeId,
    kind: episodeId ? 'player' : 'series',
    raw: shortUrl
  };
}
