import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fetchSeries, fetchQualities, streamUrl } from '../api.js';
import Tip from './Tooltip.jsx';
import playingIcon from '../assets/playing.png';

// 播放页（对照原站 player 页结构，数据来自本地后端）：
//   左侧：面包屑 + 视频播放器（自定义控制栏：播放/下一集/进度/时间/清晰度/倍速/音量/全屏）
//   右侧：封面+标题+标签 → 简介 → 演员 → 选集（分段+付费锁+正在播放标识）
//        → 为你推荐（hot）
// 忽略：顶部导航栏、评论板块。

const SEGMENT_SIZE = 15;
const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

// 将分集约 15 个一组分段，返回 [{ label:'1-15', episodes:[...] }, ...]
function buildSegments(episodes) {
  const segs = [];
  for (let i = 0; i < episodes.length; i += SEGMENT_SIZE) {
    const slice = episodes.slice(i, i + SEGMENT_SIZE);
    const first = slice[0].number;
    const last = slice[slice.length - 1].number;
    segs.push({ label: `${first}-${last}`, episodes: slice });
  }
  return segs;
}

/* ===== 播放器控制栏图标（逐一取自静态原版页面内联 SVG，保持原生观感） ===== */
const PLAY_D =
  'M23.3138 17.7524C24.6953 16.9926 24.6953 15.0074 23.3138 14.2476L9.46384 6.63011C8.13093 5.89701 6.5 6.86134 6.5 8.38254L6.5 23.6175C6.5 25.1387 8.13093 26.103 9.46384 25.3699L23.3138 17.7524Z';
const PAUSE_D =
  'M9.21875 5.625C10.3692 5.625 11.3016 6.55756 11.3018 7.70801V22.292C11.3016 23.4424 10.3692 24.375 9.21875 24.375H8.17676C7.02642 24.3748 6.09393 23.4423 6.09375 22.292V7.70801C6.09393 6.55767 7.02642 5.62518 8.17676 5.625H9.21875ZM21.8184 5.625C22.9688 5.62507 23.9012 6.55761 23.9014 7.70801V22.292C23.9012 23.4424 22.9688 24.3749 21.8184 24.375H20.7764C19.626 24.3749 18.6935 23.4424 18.6934 22.292V7.70801C18.6935 6.55763 19.626 5.62511 20.7764 5.625H21.8184Z';
const VOLUME_D =
  'M16.1816 6.58192C17.106 5.71984 18.613 6.37473 18.6133 7.63856V24.3622C18.6132 25.6262 17.106 26.2819 16.1816 25.4198L12.8386 22.3021C12.4817 21.9692 12.0118 21.7841 11.5237 21.7841H8.00977C6.67896 21.7841 5.59989 20.7056 5.59961 19.3749V12.6268C5.59961 11.2959 6.67879 10.2167 8.00977 10.2167H11.5247C12.0128 10.2167 12.4827 10.0316 12.8396 9.69869L16.1816 6.58192ZM23.3809 8.5536C23.6896 8.18753 24.1893 8.18763 24.498 8.5536C27.9645 12.6667 27.9655 19.3359 24.499 23.4491C24.1903 23.8151 23.6886 23.8152 23.3799 23.4491C23.0713 23.0827 23.0722 22.4883 23.3809 22.122C26.2297 18.7415 26.2298 13.2601 23.3809 9.87977C23.0722 9.5134 23.0721 8.91995 23.3809 8.5536ZM20.8477 11.7069C21.1564 11.3408 21.6561 11.3409 21.9648 11.7069C23.9635 14.0784 23.9635 17.9234 21.9648 20.2948C21.6561 20.6606 21.1563 20.6606 20.8477 20.2948C20.5389 19.9285 20.5391 19.335 20.8477 18.9686C22.2288 17.33 22.2287 14.6718 20.8477 13.0331C20.539 12.6667 20.5389 12.0733 20.8477 11.7069Z';
const VOLUME_MUTE_D =
  'M18.6139 24.3654C18.6138 25.6293 17.1057 26.2849 16.1813 25.423L12.8375 22.3038C12.7018 22.1773 12.5496 22.0721 12.3864 21.9904L18.6139 15.7628V24.3654ZM23.5992 5.50598C23.939 5.16623 24.49 5.16623 24.8297 5.50598C25.1359 5.81226 25.1644 6.28897 24.9186 6.62903L6.33752 25.2101C5.99746 25.4559 5.52076 25.4274 5.21448 25.1212C4.87472 24.7815 4.87472 24.2305 5.21448 23.8907L7.39905 21.7052C6.36454 21.4345 5.60046 20.4964 5.60022 19.3771V12.629C5.60022 11.2981 6.6794 10.2189 8.01038 10.2189H11.525C12.013 10.2189 12.4835 10.0341 12.8405 9.70129L16.1813 6.58508C17.1056 5.72303 18.6136 6.37791 18.6139 7.64172V10.4913L23.5992 5.50598ZM25.0709 9.30579C27.9528 13.4432 27.764 19.5797 24.5006 23.4523C24.1919 23.8186 23.6903 23.8185 23.3815 23.4523C23.0731 23.0859 23.0738 22.4923 23.3824 22.1261C26.0606 18.9483 26.2201 13.9141 23.8629 10.5138L25.0709 9.30579ZM22.2682 12.1075C23.9561 14.4933 23.8556 18.055 21.9645 20.299C21.6557 20.6652 21.1561 20.6651 20.8473 20.299C20.5386 19.9326 20.5386 19.3391 20.8473 18.9728C22.1526 17.4237 22.2228 14.9651 21.0602 13.3165L22.2682 12.1075Z';

function PlaySvg({ size = 32 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true">
      <path d={PLAY_D} fill="white" fillOpacity="0.95" />
    </svg>
  );
}

function PauseSvg({ size = 32 }) {
  return (
    <svg viewBox="0 0 30 30" width={size} height={size} fill="none" aria-hidden="true">
      <path d={PAUSE_D} fill="white" fillOpacity="0.95" shapeRendering="crispEdges" />
    </svg>
  );
}

function NextSvg({ size = 32 }) {
  return (
    <svg viewBox="0 0 30 30" width={size} height={size} fill="none" aria-hidden="true">
      <rect x="23.0513" y="6.5625" width="2.8125" height="16.875" rx="1.40625" fill="white" fillOpacity="0.95" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18.4877 13.3543C19.6799 14.1244 19.6799 15.8756 18.4877 16.6457L8.45968 23.1236C7.16399 23.9606 5.45996 23.0257 5.45996 21.4779V8.52207C5.45996 6.97425 7.16399 6.03942 8.45968 6.87641L18.4877 13.3543Z"
        fill="white"
        fillOpacity="0.95"
      />
    </svg>
  );
}

function VolumeSvg({ size = 30 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true">
      <path d={VOLUME_D} fill="white" fillOpacity="0.95" />
    </svg>
  );
}

function VolumeMuteSvg({ size = 30 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true">
      <path d={VOLUME_MUTE_D} fill="white" fillOpacity="0.95" />
    </svg>
  );
}

function FullscreenSvg({ size = 30 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true">
      <path d="M24 16L24 10C24 8.89543 23.1046 8 22 8L16 8" stroke="white" strokeOpacity="0.95" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16V22C8 23.1046 8.89543 24 10 24H16" stroke="white" strokeOpacity="0.95" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FullscreenExitSvg({ size = 30 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.49888 11.3453C7.65868 11.3453 8.59888 12.2855 8.59888 13.4453V16.0548C8.59888 16.3862 8.33025 16.6548 7.99888 16.6548C7.66751 16.6548 7.39888 16.3862 7.39888 16.0548V13.4453C7.39888 13.425 7.3982 13.4049 7.39688 13.3849L4.33602 16.1719C4.1826 16.3116 3.9465 16.3061 3.79978 16.1594C3.65349 16.0131 3.64752 15.7778 3.78621 15.6243L6.56549 12.5478C6.5435 12.5461 6.52128 12.5453 6.49888 12.5453H4.00131C3.66994 12.5453 3.40131 12.2767 3.40131 11.9453C3.40131 11.614 3.66994 11.3453 4.00131 11.3453H6.49888Z"
        fill="white"
      />
      <path d="M15.999 8.05481L13.5015 8.05481C12.673 8.05481 12.0015 7.38324 12.0015 6.55481V3.94529" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M13.0367 7.89314C12.799 8.15628 12.3893 8.16667 12.1386 7.91592C11.8885 7.66585 11.8981 7.25755 12.1596 7.01945L15.6643 3.82821C15.8177 3.68852 16.0538 3.69404 16.2006 3.84076C16.3469 3.98705 16.3528 4.22234 16.2141 4.37586L13.0367 7.89314Z" fill="white" />
    </svg>
  );
}

// 清晰度/倍速菜单选中对勾（SVG，不用字符）
function CheckSvg() {
  return (
    <svg className="pl-menu-check" viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M4.5 12.5 10 18 19.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PlayerPage({ seriesId, episodeId, onOpen, onOpenCharacter, onEpisodeChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [descOpen, setDescOpen] = useState(false);
  const [segIndex, setSegIndex] = useState(0);

  // 播放状态
  const [currentEpId, setCurrentEpId] = useState(episodeId || null);
  const [qualities, setQualities] = useState([]);
  const [quality, setQuality] = useState(null);
  const [videoSrc, setVideoSrc] = useState('');
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [showQuality, setShowQuality] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [volHover, setVolHover] = useState(false);
  const [volDrag, setVolDrag] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playError, setPlayError] = useState(null);

  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const volBarRef = useRef(null);
  const hideTimer = useRef(null);
  const draggingRef = useRef(false);
  // 用户主动暂停标记：区分“用户点了暂停”与“自动播放被策略拦截的暂停”，
  // 保证新源就绪后能自动起播，但用户暂停后不会被意外拉起
  const userPausedRef = useRef(false);
  // 用 ref 保存最新值，避免视频事件回调（onEnded 等）闭包过期
  const episodesRef = useRef([]);
  const currentEpIdRef = useRef(null);
  useEffect(() => {
    episodesRef.current = Array.isArray(data?.episodes) ? data.episodes : [];
  }, [data]);
  useEffect(() => {
    currentEpIdRef.current = currentEpId;
  }, [currentEpId]);

  // ===== URL 换集同步（仅主窗口网页版传入 onEpisodeChange）=====
  // 外部 episodeId 变化（浏览器后退/前进）→ 同步内部换集
  useEffect(() => {
    if (!episodeId) return;
    setCurrentEpId((cur) => (episodeId !== cur ? episodeId : cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);
  // 内部换集（点选集/自动下一集/首集自动选定）→ 上报给 App 替换当前地址
  const onEpisodeChangeRef = useRef(onEpisodeChange);
  onEpisodeChangeRef.current = onEpisodeChange;
  const prevEpNotifyRef = useRef(episodeId || null);
  useEffect(() => {
    if (currentEpId && currentEpId !== prevEpNotifyRef.current) {
      prevEpNotifyRef.current = currentEpId;
      if (onEpisodeChangeRef.current) onEpisodeChangeRef.current(currentEpId);
    }
  }, [currentEpId]);

  // 拉取剧集详情
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetchSeries(seriesId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        // 播放窗口启动过渡图：详情数据就绪即关闭
        window.__hgHideSplash && window.__hgHideSplash();
        const eps = Array.isArray(d.episodes) ? d.episodes : [];
        if (!currentEpId && eps.length) {
          setCurrentEpId(eps[0].id);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
        window.__hgHideSplash && window.__hgHideSplash();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId]);

  // 切换集数时：拉取清晰度 + 设置视频源
  useEffect(() => {
    if (!currentEpId) return;
    let alive = true;
    setLoading(true);
    setPlayError(null);
    setQualities([]);
    fetchQualities(currentEpId)
      .then((q) => {
        if (!alive) return;
        const list = Array.isArray(q.qualities) ? q.qualities : [];
        setQualities(list);
        const def = list.find((x) => x.isDefault) || list[0];
        setQuality(def ? def.key : null);
      })
      .catch((e) => alive && setPlayError(e.message));
    return () => {
      alive = false;
    };
  }, [currentEpId]);

  // 根据清晰度生成视频源
  useEffect(() => {
    if (!currentEpId || !quality) return;
    setVideoSrc(streamUrl(currentEpId, quality, seriesId));
  }, [currentEpId, quality, seriesId]);

  // 视频源变化时重置进度，并恢复自动起播意图
  useEffect(() => {
    if (!videoRef.current) return;
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setLoading(true);
    setPlayError(null);
    userPausedRef.current = false;
    videoRef.current.load();
  }, [videoSrc]);

  // video 事件绑定
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    const onProg = () => {
      try {
        if (v.buffered.length) {
          setBuffered(v.buffered.end(v.buffered.length - 1));
        }
      } catch (_) {}
    };
    const onWaiting = () => setLoading(true);
    // 恢复播放/可播放时清除错误浮层：即使出现过瞬时错误，只要能继续播放就不遮挡画面
    const onPlaying = () => {
      setLoading(false);
      setPlayError(null);
    };
    const onCanPlay = () => {
      setLoading(false);
      setPlayError(null);
      // 自动起播：新源就绪后若仍暂停且非用户主动暂停，直接拉起播放
      //（配合 Electron autoplay-policy=no-user-gesture-required 开关，
      //  播放窗口打开/换集后无需手动点击）
      if (v.paused && !userPausedRef.current) v.play().catch(() => {});
    };
    const onErr = () => {
      const err = v.error;
      // 忽略 MEDIA_ERR_ABORTED(code=1)：切换剧集/清晰度或重复 load() 会中止在途请求，
      // 属于正常流程，新源仍在继续加载，不应提示"加载失败"
      if (!err || err.code === 1) return;
      setLoading(false);
      setPlayError('视频加载失败，请切换清晰度或重试');
    };
    const onVol = () => {
      setVolume(v.volume);
      setMuted(v.muted);
    };
    const onEnded = () => {
      // 自动播下一集
      goNext();
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('loadedmetadata', onDur);
    v.addEventListener('progress', onProg);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('error', onErr);
    v.addEventListener('volumechange', onVol);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('loadedmetadata', onDur);
      v.removeEventListener('progress', onProg);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('error', onErr);
      v.removeEventListener('volumechange', onVol);
      v.removeEventListener('ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc, data]);

  // 倍速
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate]);

  // 全屏监听
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // 控制栏自动隐藏（音量悬浮/拖动时也保持可见）
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing && !showQuality && !showSpeed && !volHover && !volDrag) setControlsVisible(false);
    }, 2800);
  }, [playing, showQuality, showSpeed, volHover, volDrag]);

  useEffect(() => {
    showControls();
    return () => hideTimer.current && clearTimeout(hideTimer.current);
  }, [playing, showControls]);

  // 播放控制
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      userPausedRef.current = false;
      v.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      v.pause();
    }
  }, []);

  const goNext = useCallback(() => {
    const eps = episodesRef.current;
    const idx = eps.findIndex((e) => e.id === currentEpIdRef.current);
    if (idx >= 0 && idx < eps.length - 1) {
      setCurrentEpId(eps[idx + 1].id);
    }
  }, []);

  const selectEpisode = (ep) => {
    setCurrentEpId(ep.id);
  };

  // 进度条拖动
  const onProgressMouseDown = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    draggingRef.current = true;
    const seek = (clientX) => {
      const bar = e.currentTarget;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      v.currentTime = pct * duration;
    };
    seek(e.clientX);
    const onMove = (ev) => draggingRef.current && seek(ev.clientX);
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // 竖直音量条：按 Y 坐标计算音量（底部=0，顶部=1），支持点击与拖动
  const setVolumeFromClientY = (clientY) => {
    const v = videoRef.current;
    const bar = volBarRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (rect.bottom - clientY) / rect.height));
    v.volume = pct;
    v.muted = pct === 0;
  };

  const onVolumeMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setVolDrag(true);
    setVolumeFromClientY(e.clientY);
    const onMove = (ev) => setVolumeFromClientY(ev.clientY);
    const onUp = () => {
      setVolDrag(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  };

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          v.currentTime = Math.min(duration, v.currentTime + 5);
          break;
        case 'ArrowLeft':
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'm':
          toggleMute();
          break;
        default:
          break;
      }
      showControls();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration, togglePlay, showControls]);

  if (error) {
    return (
      <main className="pl-page">
        <div className="pl-container">
          <div className="pl-player">
            <div className="pl-left">
              <div className="pl-stage">
                <div className="pl-error-overlay">
                  <p>播放页加载失败（{error}）</p>
                  <button
                    type="button"
                    className="pl-retry-btn"
                    onClick={() => window.location.reload()}
                  >
                    重试
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="pl-page">
        <div className="pl-container">
          <div className="pl-player">
            <div className="pl-left">
              <div className="pl-stage">
                <div className="pl-loading">
                  <div className="pl-spinner" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const episodes = Array.isArray(data.episodes) ? data.episodes : [];
  const currentEp = episodes.find((e) => e.id === currentEpId) || episodes[0];
  const segments = buildSegments(episodes);
  const curSeg = segments[segIndex] || segments[0];
  const celebrities = Array.isArray(data.celebrities) ? data.celebrities : [];
  const hot = Array.isArray(data.hot) ? data.hot : [];
  const tags = String(data.tags || '')
    .split('/')
    .map((t) => t.trim())
    .filter(Boolean);

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <main className="pl-page">
      <div className="pl-container">
        <div className="pl-player">
          {/* 左侧：播放器 */}
          <div className="pl-left">
            <div className="pl-stage" ref={stageRef} onMouseMove={showControls}>
              <div className="pl-video-wrap" onClick={togglePlay}>
                <video
                  ref={videoRef}
                  className="pl-video"
                  src={videoSrc}
                  autoPlay
                  playsInline
                  preload="auto"
                />
                {loading && !playError && (
                  <div className="pl-loading">
                    <div className="pl-spinner" />
                  </div>
                )}
                {playError && (
                  <div className="pl-error-overlay">
                    <p>{playError}</p>
                    <button
                      type="button"
                      className="pl-retry-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (videoRef.current) videoRef.current.load();
                      }}
                    >
                      重试
                    </button>
                  </div>
                )}
                {!playing && !loading && !playError && (
                  <div className="pl-center-play" onClick={togglePlay}>
                    <PlaySvg size={70} />
                  </div>
                )}

                {/* 控制栏 */}
                <div
                  className={'pl-controls' + (controlsVisible ? ' pl-controls-show' : '')}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 进度条 */}
                  <div
                    className="pl-progress"
                    onMouseDown={onProgressMouseDown}
                    role="slider"
                    aria-label="播放进度"
                  >
                    <div className="pl-progress-bg" />
                    <div className="pl-progress-buffered" style={{ width: `${bufferedPct}%` }} />
                    <div className="pl-progress-played" style={{ width: `${progressPct}%` }} />
                    <div className="pl-progress-thumb" style={{ left: `${progressPct}%` }} />
                  </div>

                  <div className="pl-controls-row">
                    <button type="button" className="pl-ctrl-btn" onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
                      {playing ? <PauseSvg size={32} /> : <PlaySvg size={32} />}
                    </button>

                    <Tip label="下一集">
                      <button type="button" className="pl-ctrl-btn pl-next-btn" onClick={goNext} aria-label="下一集">
                        <NextSvg size={32} />
                      </button>
                    </Tip>

                    <span className="pl-time">
                      {fmtTime(currentTime)} / {fmtTime(duration)}
                    </span>

                    <div className="pl-spacer" />

                    {/* 清晰度 */}
                    <div className="pl-menu">
                      <button
                        type="button"
                        className="pl-ctrl-btn pl-text-btn"
                        onClick={() => { setShowQuality((v) => !v); setShowSpeed(false); }}
                      >
                        {quality || '清晰度'}
                      </button>
                      {showQuality && (
                        <div className="pl-menu-panel">
                          {qualities.map((q) => (
                            <button
                              type="button"
                              key={q.key}
                              className={'pl-menu-item' + (q.key === quality ? ' pl-menu-item-active' : '')}
                              onClick={() => { setQuality(q.key); setShowQuality(false); }}
                            >
                              {q.label}
                              {q.key === quality && <CheckSvg />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 倍速 */}
                    <div className="pl-menu">
                      <button
                        type="button"
                        className="pl-ctrl-btn pl-text-btn"
                        onClick={() => { setShowSpeed((v) => !v); setShowQuality(false); }}
                      >
                        {rate}x
                      </button>
                      {showSpeed && (
                        <div className="pl-menu-panel">
                          {SPEEDS.map((s) => (
                            <button
                              type="button"
                              key={s}
                              className={'pl-menu-item' + (s === rate ? ' pl-menu-item-active' : '')}
                              onClick={() => { setRate(s); setShowSpeed(false); }}
                            >
                              {s}x
                              {s === rate && <CheckSvg />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 音量（悬浮竖直滑块：上方数值 + 120px 橙色轨道 + 白色圆头，对齐原版） */}
                    <div
                      className="pl-volume"
                      onMouseEnter={() => setVolHover(true)}
                      onMouseLeave={() => setVolHover(false)}
                    >
                      <button type="button" className="pl-ctrl-btn" onClick={toggleMute} aria-label={muted ? '取消静音' : '静音'}>
                        {muted || volume === 0 ? <VolumeMuteSvg /> : <VolumeSvg />}
                      </button>
                      <div
                        className={
                          'pl-vol-panel' + (volHover || volDrag ? ' pl-vol-panel-show' : '')
                        }
                      >
                        <div className="pl-vol-value">
                          {Math.round((muted ? 0 : volume) * 100)}
                        </div>
                        <div
                          className="pl-vol-bar"
                          ref={volBarRef}
                          onMouseDown={onVolumeMouseDown}
                          role="slider"
                          aria-label="音量"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round((muted ? 0 : volume) * 100)}
                        >
                          <div
                            className="pl-vol-fill"
                            style={{ height: `${(muted ? 0 : volume) * 100}%` }}
                          >
                            <span className="pl-vol-thumb" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <button type="button" className="pl-ctrl-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? '退出全屏' : '全屏'}>
                      {isFullscreen ? <FullscreenExitSvg /> : <FullscreenSvg />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：信息栏 */}
          <aside className="pl-right">
            <div className="pl-sidebar">
              {/* 顶部：封面 + 标题 + 标签 */}
              <div className="pl-top">
                <div className="pl-cover-box">
                  <img className="pl-cover" src={data.cover} alt={data.title} />
                </div>
                <div className="pl-top-right">
                  <h1 className="pl-title">{data.title}</h1>
                  {tags.length > 0 && (
                    <div className="pl-tags">
                      {tags.map((t) => (
                        <span className="pl-tag" key={t}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 简介 */}
              {data.description && (
                <div className="pl-section">
                  <div className="pl-section-header">简介</div>
                  <div className="pl-desc-box">
                    <p className={'pl-desc' + (descOpen ? ' pl-desc-open' : '')}>
                      {data.description}
                    </p>
                    <button
                      type="button"
                      className="pl-desc-toggle"
                      onClick={() => setDescOpen((v) => !v)}
                    >
                      {descOpen ? '收起' : '展开'}
                    </button>
                  </div>
                </div>
              )}

              {/* 演员 */}
              {celebrities.length > 0 && (
                <div className="pl-section">
                  <div className="pl-actors">
                    {celebrities.slice(0, 8).map((c) => (
                      <div className="pl-actor" key={c.id || c.name}>
                        {c.id && onOpenCharacter ? (
                          <button
                            type="button"
                            className="pl-avatar-btn"
                            onClick={() => onOpenCharacter(c.id)}
                            aria-label={c.name}
                          >
                            <div className="pl-avatar-box">
                              {c.avatar ? (
                                <img className="pl-avatar" src={c.avatar} alt={c.name} />
                              ) : (
                                <span className="pl-avatar pl-avatar-empty" />
                              )}
                            </div>
                          </button>
                        ) : (
                          <div className="pl-avatar-box">
                            {c.avatar ? (
                              <img className="pl-avatar" src={c.avatar} alt={c.name} />
                            ) : (
                              <span className="pl-avatar pl-avatar-empty" />
                            )}
                          </div>
                        )}
                        {c.id && onOpenCharacter ? (
                          <button
                            type="button"
                            className="pl-actor-name pl-actor-name-link"
                            onClick={() => onOpenCharacter(c.id)}
                          >
                            {c.name}
                          </button>
                        ) : (
                          <div className="pl-actor-name">{c.name}</div>
                        )}
                        {c.role && <div className="pl-actor-role">{c.role}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 选集 */}
              {episodes.length > 0 && (
                <div className="pl-section">
                  <div className="pl-section-header">选集</div>
                  {segments.length > 1 && (
                    <div className="pl-segments">
                      <div className="pl-seg-list">
                        {segments.map((seg, i) => (
                          <button
                            type="button"
                            key={seg.label}
                            className={'pl-seg' + (i === segIndex ? ' pl-seg-active' : '')}
                            onClick={() => setSegIndex(i)}
                          >
                            {seg.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="pl-episodes">
                    {curSeg?.episodes.map((ep) => {
                      const active = ep.id === currentEpId;
                      return (
                        <Tip label={`第${ep.number}集`} key={ep.id}>
                          <button
                            type="button"
                            className={
                              'pl-episode' +
                              (active ? ' pl-episode-active' : '')
                            }
                            onClick={() => selectEpisode(ep)}
                          >
                            <span className={'pl-episode-text' + (active ? ' pl-episode-text-active' : '')}>
                              {ep.number}
                            </span>
                            {active && <img className="pl-playing" src={playingIcon} alt="正在播放" />}
                          </button>
                        </Tip>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 为你推荐 */}
              {hot.length > 0 && (
                <div className="pl-section">
                  <div className="pl-section-header">为你推荐</div>
                  <div className="pl-card-list">
                    {hot.map((it) => (
                      <RecCard key={it.id} item={it} onOpen={onOpen} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

// 推荐卡片（同系列 / 为你推荐 共用）
function RecCard({ item, onOpen }) {
  const tags = String(item.tags || '')
    .split('/')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);
  return (
    <a className="pl-card" href="#" onClick={(e) => { e.preventDefault(); onOpen && onOpen(item.id); }}>
      <div className="pl-card-cover-box">
        <img className="pl-card-cover" src={item.cover} alt={item.title} loading="lazy" />
        {item.badge && <span className="pl-card-badge">{item.badge}</span>}
      </div>
      <p className="pl-card-title">{item.title}</p>
      {tags.length > 0 && (
        <div className="pl-card-tags">
          {tags.map((t, i) => (
            <span className="pl-card-tag" key={i}>{t}</span>
          ))}
        </div>
      )}
    </a>
  );
}
