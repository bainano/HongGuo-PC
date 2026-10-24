import React, { useEffect, useRef, useState } from 'react';
import { parseShareLink, resolveShareLink } from '../shareLink.js';
import { fetchSeries } from '../api.js';

// 「打开分享链接」弹窗：粘贴/输入红果分享链接或网页链接 → 自动解析 → 确认后直达剧集/选集。
// 视觉沿用全局 .hg-modal（无 box-shadow，仅 1px 边框；input 聚焦高亮环符合规则例外）。
export default function ShareLinkModal({ onClose, onOpen }) {
  const [value, setValue] = useState('');
  const [detected, setDetected] = useState(null); // parseShareLink 结果（或短链解析结果）
  const [title, setTitle] = useState(null); // 最佳努力从后端取到的剧名
  const [error, setError] = useState(null);
  const [resolving, setResolving] = useState(false); // 短链异步解析中
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const loadTitle = (r) => {
    setTitle(null);
    fetchSeries(r.seriesId)
      .then((d) => {
        if (d && d.title) setTitle(d.title);
      })
      .catch(() => {});
  };

  // 智能检测：粘贴或输入时，只要内容能被解析成分享/网页链接，立即识别并进入确认态。
  // 若识别为「短链」，则异步请求后端解析重定向，拿到剧集/选集 ID 后再展示确认。
  const handleChange = (e) => {
    const v = e.target.value;
    setValue(v);
    setError(null);
    setResolving(false);
    const r = parseShareLink(v);
    if (!r) {
      setDetected(null);
      setTitle(null);
      return;
    }
    if (r.kind === 'shortlink') {
      setDetected(null);
      setResolving(true);
      resolveShareLink(r.shortUrl)
        .then((res) => {
          setResolving(false);
          setDetected(res);
          loadTitle(res);
        })
        .catch((err) => {
          setResolving(false);
          setError(err.message || '短链解析失败');
        });
      return;
    }
    setDetected(r);
    loadTitle(r);
  };

  // 手动「打开」（兜底：自动检测未触发时）
  const submitManual = () => {
    const r = parseShareLink(value);
    if (!r) {
      setError('无法识别，请粘贴红果 APP「复制链接」、官网剧集链接或分享短链');
      return;
    }
    if (r.kind === 'shortlink') {
      setResolving(true);
      resolveShareLink(r.shortUrl)
        .then((res) => onOpen(res.seriesId, res.episodeId))
        .catch((err) => {
          setResolving(false);
          setError(err.message || '短链解析失败');
        });
      return;
    }
    onOpen(r.seriesId, r.episodeId);
  };

  const confirm = () => {
    if (!detected) return;
    onOpen(detected.seriesId, detected.episodeId);
  };

  const reedit = () => {
    setDetected(null);
    setTitle(null);
    setError(null);
    setResolving(false);
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <div
      className="hg-modal-mask"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hg-share-title"
      onClick={onClose}
    >
      <div className="hg-modal hg-share-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="hg-modal-title" id="hg-share-title">打开红果分享链接</h2>

        {!detected ? (
          <>
            <p className="hg-modal-desc">
              粘贴手机红果 APP 分享链接，或官网剧集网页链接（如
              hongguoduanju.com/detail?series_id=…），系统会自动识别。
            </p>
            <input
              ref={inputRef}
              className="hg-share-input"
              type="text"
              placeholder="https://novelquickapp.com/hongguo/... 或 .../detail?series_id=..."
              value={value}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitManual();
              }}
            />
            {resolving && <p className="hg-share-hint">正在解析分享链接…</p>}
            {error && <p className="hg-share-error">{error}</p>}
            <div className="hg-modal-actions">
              <button type="button" className="hg-modal-btn" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="hg-modal-btn hg-modal-btn-primary"
                onClick={submitManual}
              >
                打开
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hg-modal-desc">已识别到红果分享链接，确认后为你打开：</p>
            <div className="hg-share-confirm">
              <p className="hg-share-title">{title || `剧集 ${detected.seriesId}`}</p>
              <p className="hg-share-sub">
                {detected.episodeId
                  ? '将打开分享指向的选集'
                  : '将打开该分享指向的剧集详情'}
                {`（seriesId ${detected.seriesId}${
                  detected.episodeId ? ` · 选集 ${detected.episodeId}` : ''
                }）`}
              </p>
            </div>
            <div className="hg-modal-actions">
              <button type="button" className="hg-modal-btn" onClick={reedit}>
                重新输入
              </button>
              <button
                type="button"
                className="hg-modal-btn hg-modal-btn-primary"
                onClick={confirm}
              >
                确认打开
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
