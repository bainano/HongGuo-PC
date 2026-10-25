import React, { useEffect, useRef, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import NavTools from './components/NavTools.jsx';
import ShareLinkModal from './components/ShareLinkModal.jsx';
import TitleBar from './components/TitleBar.jsx';
import WindowControls from './components/WindowControls.jsx';
import SectionRail from './components/SectionRail.jsx';
import CategoryPage from './components/CategoryPage.jsx';
import RankPage from './components/RankPage.jsx';
import DetailPage from './components/DetailPage.jsx';
import PlayerPage from './components/PlayerPage.jsx';
import CharacterPage from './components/CharacterPage.jsx';
import SearchPage from './components/SearchPage.jsx';
import HomeBanner from './components/HomeBanner.jsx';
import { SkeletonRails } from './components/Skeletons.jsx';
import { fetchBanners, fetchHome } from './api.js';
import { parseHash, normalizeEntry, entryToHash } from './router.js';

// 从 URL 查询参数解析播放窗口参数（?player=1&seriesId=X&episodeId=Y）
function parsePlayerQuery() {
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('player') === '1') {
      return {
        playerMode: true,
        seriesId: sp.get('seriesId') || null,
        episodeId: sp.get('episodeId') || null
      };
    }
  } catch (_) {}
  return { playerMode: false, seriesId: null, episodeId: null };
}

export default function App() {
  const playerQuery = parsePlayerQuery();

  // 独立播放窗口模式：仅渲染标题栏 + PlayerPage，不带导航栏
  if (playerQuery.playerMode) {
    return (
      <PlayerWindowApp
        seriesId={playerQuery.seriesId}
        episodeId={playerQuery.episodeId}
      />
    );
  }

  return <MainApp />;
}

// 独立播放窗口外壳：共享标题栏（logo 回主窗口 + 前进/后退/刷新 + 窗口控制）+ 播放器页面。
// 播放历史栈：推荐区换剧、主窗口在已有播放窗口中打开新剧，均压栈；标题栏箭头快速切换。
function PlayerWindowApp({ seriesId, episodeId }) {
  // 历史栈（可变对象，配合 histState 驱动渲染）
  const histRef = useRef(null);
  if (histRef.current === null) {
    histRef.current = {
      stack: [{ seriesId, episodeId }],
      idx: 0
    };
  }
  const [cur, setCur] = useState({ seriesId, episodeId });
  const [histState, setHistState] = useState({ canBack: false, canForward: false });
  const [refreshKey, setRefreshKey] = useState(0);

  const syncHist = () => {
    const h = histRef.current;
    setHistState({
      canBack: h.idx > 0,
      canForward: h.idx < h.stack.length - 1
    });
  };

  const pushEntry = (entry) => {
    const h = histRef.current;
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(entry);
    h.idx = h.stack.length - 1;
    setCur(entry);
    syncHist();
  };

  // 推荐区点击换剧：压入播放历史
  const onOpen = (id) => {
    if (!id) return;
    const sid = String(id);
    if (sid === cur.seriesId) return;
    pushEntry({ seriesId: sid, episodeId: null });
  };

  // 主窗口在已有播放窗口中打开新剧：主进程转发 player:navigate，压入播放历史
  useEffect(() => {
    const c = window.hgWin;
    if (!c || !c.onPlayerNavigate) return;
    return c.onPlayerNavigate((payload) => {
      const sid = payload.seriesId ? String(payload.seriesId) : null;
      if (!sid) return;
      const eid = payload.episodeId ? String(payload.episodeId) : null;
      const h = histRef.current;
      const top = h.stack[h.idx];
      if (top && top.seriesId === sid && top.episodeId === eid) return;
      pushEntry({ seriesId: sid, episodeId: eid });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = () => {
    const h = histRef.current;
    if (h.idx <= 0) return;
    h.idx--;
    setCur(h.stack[h.idx]);
    syncHist();
  };
  const goForward = () => {
    const h = histRef.current;
    if (h.idx >= h.stack.length - 1) return;
    h.idx++;
    setCur(h.stack[h.idx]);
    syncHist();
  };

  // logo：最小化播放窗口并聚焦主窗口
  const onLogoClick = () => {
    const c = window.hgWin;
    if (c && c.minimizeAndFocusMain) c.minimizeAndFocusMain();
  };

  // 刷新：重挂当前播放页（重新拉取详情/清晰度/流）
  const onRefresh = () => setRefreshKey((k) => k + 1);

  // 演员入口：聚焦主窗口并在主窗口中打开演员详情页
  const onOpenCharacter = (id) => {
    const c = window.hgWin;
    if (c && c.openCharacterInMain) c.openCharacterInMain(id);
  };

  return (
    <div className="pl-win-root">
      <TitleBar
        onLogoClick={onLogoClick}
        canGoBack={histState.canBack}
        canGoForward={histState.canForward}
        onBack={goBack}
        onForward={goForward}
        onRefresh={onRefresh}
      />
      <PlayerPage
        key={`${cur.seriesId}-${cur.episodeId || 'ep1'}-r${refreshKey}`}
        seriesId={cur.seriesId}
        episodeId={cur.episodeId}
        onOpen={onOpen}
        onOpenCharacter={onOpenCharacter}
      />
    </div>
  );
}

function MainApp() {
  // ===== URL 路由：初始视图由地址决定（网页版可通过地址直接打开对应页面） =====
  const initRef = useRef(null);
  if (initRef.current === null) {
    initRef.current = normalizeEntry(parseHash());
  }
  const [route, setRoute] = useState(initRef.current);
  const routeRef = useRef(route);
  routeRef.current = route;
  const {
    view, activeNav, catType, catTag, catPage, rankType, rankPage,
    detailId, characterId, playerSeriesId, playerEpisodeId, searchKeyword, searchPage
  } = route;

  const [sections, setSections] = useState(null);
  const [banners, setBanners] = useState(null); // 首页 Banner 推荐剧位（官方首页大轮播）
  const [error, setError] = useState(null);
  // 导航不透明度：随页面滚动 0 → 1（0~240px 线性渐变）
  const [navOpacity, setNavOpacity] = useState(0);
  // 分类/榜单页标题滚出可视区后，导航对应二字替换为完整名称
  const [catTitle, setCatTitle] = useState(null);
  const [catTitleHidden, setCatTitleHidden] = useState(false);
  const [rankTitle, setRankTitle] = useState(null);
  const [rankTitleHidden, setRankTitleHidden] = useState(false);
  // 刷新计数：标题栏刷新按钮按下时 +1，各页面 key 带上该值实现重挂载刷新
  const [refreshKey, setRefreshKey] = useState(0);

  // ===== 浏览器历史（标题栏后退/前进箭头 + 网页版浏览器前进/后退）=====
  // history.state = { hgId, maxId, entry, scrollY }；
  // hgId 单调递增：canBack = idx > 0，canForward = idx < max（页面刷新后从 state 恢复）
  const histRef = useRef(null);
  if (histRef.current === null) {
    const st = window.history.state;
    const idx = st && Number.isInteger(st.hgId) ? st.hgId : 0;
    const max = st && Number.isInteger(st.maxId) && st.maxId >= idx ? st.maxId : idx;
    histRef.current = { idx, max };
  }
  const [histState, setHistState] = useState({
    canBack: histRef.current.idx > 0,
    canForward: histRef.current.idx < histRef.current.max
  });
  const syncHist = () => {
    const h = histRef.current;
    setHistState({ canBack: h.idx > 0, canForward: h.idx < h.max });
  };

  // 程序化滚动期间（跳转回顶/恢复滚动位置）暂停滚动位置写回，避免污染 history.state
  const suppressScrollSaveUntilRef = useRef(0);
  const suppressScrollSave = () => {
    suppressScrollSaveUntilRef.current = Date.now() + 400;
  };
  const saveScrollNow = () => {
    const st = window.history.state;
    if (st && Number.isInteger(st.hgId)) {
      window.history.replaceState({ ...st, scrollY: window.scrollY }, '');
    }
  };

  // 挂载：接管浏览器滚动恢复；将初始条目写入 history.state（刷新/地址直达后状态完整）
  useEffect(() => {
    try {
      window.history.scrollRestoration = 'manual';
    } catch (_) {}
    const h = histRef.current;
    window.history.replaceState(
      { hgId: h.idx, maxId: h.max, entry: initRef.current, scrollY: 0 },
      '',
      entryToHash(initRef.current)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新页面导航：压入浏览器历史并回顶；与当前地址一致时仅回顶不重复压栈
  const pushEntry = (entry) => {
    if (entryToHash(entry) === entryToHash(routeRef.current)) {
      window.scrollTo(0, 0);
      return;
    }
    saveScrollNow();
    const h = histRef.current;
    const id = h.max + 1;
    h.idx = id;
    h.max = id;
    window.history.pushState(
      { hgId: id, maxId: id, entry, scrollY: 0 },
      '',
      entryToHash(entry)
    );
    suppressScrollSave();
    setRoute(entry);
    window.scrollTo(0, 0);
    syncHist();
  };

  // 页内参数变化（分类/榜单/搜索翻页与 tab、播放页换集）：仅替换当前地址，不压栈
  const replaceEntry = (partial) => {
    const entry = normalizeEntry({ ...routeRef.current, ...partial });
    if (entryToHash(entry) === entryToHash(routeRef.current)) return;
    const h = histRef.current;
    window.history.replaceState(
      { hgId: h.idx, maxId: h.max, entry, scrollY: window.scrollY },
      '',
      entryToHash(entry)
    );
    setRoute(entry);
  };

  useEffect(() => {
    fetchHome()
      .then(setSections)
      .catch((e) => setError(e.message));
  }, [refreshKey]);

  // 首页 Banner 推荐剧位（/api/banners）：与栏目数据并行拉取，失败不阻塞首页
  useEffect(() => {
    let alive = true;
    let retryTimer = null;
    const load = async (attempt = 0) => {
      try {
        const list = await fetchBanners();
        // 后端刚启动时可能还没抓完官方首页，首次拿到空列表时延迟重试一次，
        // 避免冷启动阶段（尤其是打包版）首页 Banner 区整块不出现
        if (alive && Array.isArray(list) && list.length === 0 && attempt === 0) {
          retryTimer = setTimeout(() => {
            if (alive) load(1);
          }, 1200);
          return;
        }
        if (alive) setBanners(Array.isArray(list) ? list : []);
      } catch {
        if (alive) setBanners([]);
      }
    };
    load();
    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [refreshKey]);

  // 标题隐藏阈值（判断式，完全滑入固定导航 64px 下方即不可见）：
  // 榜单 hero 标题底 186px（顶 141 + 高 45）→ scrollY > 122
  // 分类类型 tab 底 166px（margin-top 134 + 高 32）→ scrollY > 102
  useEffect(() => {
    const RANK_TITLE_HIDE_SCROLL_Y = 186 - 64;
    const CAT_TITLE_HIDE_SCROLL_Y = 166 - 64;
    let saveTimer = null;
    const onScroll = () => {
      setNavOpacity(Math.min(window.scrollY / 240, 1));
      setRankTitleHidden(window.scrollY > RANK_TITLE_HIDE_SCROLL_Y);
      setCatTitleHidden(window.scrollY > CAT_TITLE_HIDE_SCROLL_Y);
      // 滚动位置防抖写回 history.state，供后退/前进恢复
      if (Date.now() < suppressScrollSaveUntilRef.current) return;
      if (saveTimer) return;
      saveTimer = setTimeout(() => {
        saveTimer = null;
        saveScrollNow();
      }, 150);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (saveTimer) clearTimeout(saveTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 浏览器前进/后退（含标题栏箭头触发的 history.back/forward）：恢复视图与滚动位置
  useEffect(() => {
    const onPop = (ev) => {
      const st = ev.state;
      if (st && Number.isInteger(st.hgId) && st.entry) {
        histRef.current.idx = st.hgId;
        histRef.current.max = Math.max(histRef.current.max, st.maxId || 0, st.hgId);
        suppressScrollSave();
        setRoute(normalizeEntry(st.entry));
        requestAnimationFrame(() => window.scrollTo(0, st.scrollY || 0));
        syncHist();
      } else {
        // 外部 hash 变更（手动编辑地址等无 state 场景）：解析后按新导航处理
        pushEntry(normalizeEntry(parseHash()));
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 导航统一入口：onNavigate('home') / onNavigate('category', type?, tag?)
  //             / onNavigate('rank', slug?) / onNavigate('detail', seriesId)
  //             / onNavigate('player', seriesId, episodeId) / onNavigate('character', id)
  //             / onNavigate('search', keyword)；
  // 详情/播放/演员/搜索为“点开的页面”，不属于任何导航项，一律清除导航高亮（由 normalizeEntry 处理）。
  const onNavigate = (next, type, arg3) => {
    let partial = null;
    if (next === 'detail') {
      if (!type) return;
      partial = { view: 'detail', detailId: String(type) };
    } else if (next === 'player') {
      if (!type) return;
      partial = {
        view: 'player',
        playerSeriesId: String(type),
        playerEpisodeId: arg3 ? String(arg3) : null
      };
    } else if (next === 'character') {
      if (!type) return;
      partial = { view: 'character', characterId: String(type) };
    } else if (next === 'search') {
      const kw = type ? String(type) : '';
      if (!kw) return;
      partial = { view: 'search', searchKeyword: kw, searchPage: 1 };
    } else if (next === 'category') {
      partial = {
        view: 'category',
        catType: type || catType,
        catTag: arg3 || '',
        catPage: 1
      };
    } else if (next === 'rank') {
      partial = { view: 'rank', rankType: type || rankType, rankPage: 1 };
    } else if (next === 'home') {
      partial = { view: 'home' };
    } else {
      return;
    }
    pushEntry(normalizeEntry(partial));
  };

  const goBack = () => {
    if (histRef.current.idx <= 0) return;
    saveScrollNow();
    window.history.back();
  };
  const goForward = () => {
    if (histRef.current.idx >= histRef.current.max) return;
    saveScrollNow();
    window.history.forward();
  };

  const onRefresh = () => setRefreshKey((k) => k + 1);

  // 播放窗口内点击演员：主进程转发 app:open-character → 主窗口打开演员详情页
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  useEffect(() => {
    const c = window.hgWin;
    if (!c || !c.onOpenCharacter) return;
    return c.onOpenCharacter((id) => {
      if (id) navigateRef.current('character', id);
    });
  }, []);

  // 主窗口关闭确认：存在活跃播放窗口时，主进程拦截 close 并转发到此弹窗
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  // 「打开分享链接」弹窗：粘贴手机红果 APP 分享链接 → 解析 → 直达剧集/选集
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => {
    const c = window.hgWin;
    if (!c || !c.onConfirmClose) return;
    return c.onConfirmClose(() => setCloseConfirmOpen(true));
  }, []);

  // 播放入口：桌面端打开独立播放窗口；网页版无窗口能力，走应用内播放页路由
  const onPlay = (seriesId, episodeId) => {
    const c = window.hgWin;
    if (c && c.openPlayer) {
      c.openPlayer(seriesId, episodeId || null);
    } else {
      onNavigate('player', seriesId, episodeId);
    }
  };

  const pageClass = 'pc-page';
  const catNavLabel =
    view === 'category' && catTitleHidden && catTitle ? catTitle : null;
  const rankNavLabel =
    view === 'rank' && rankTitleHidden && rankTitle ? rankTitle : null;

  return (
    <div className="pc-container">
      <div
        className={pageClass}
        style={{ '--pc-nav-surface-opacity': navOpacity }}
      >
        <Navbar
          activeNav={activeNav}
          onNavigate={onNavigate}
          catLabel={catNavLabel}
          rankLabel={rankNavLabel}
          keyword={searchKeyword}
          navTools={
            <NavTools
              canGoBack={histState.canBack}
              canGoForward={histState.canForward}
              onBack={goBack}
              onForward={goForward}
              onRefresh={onRefresh}
              onOpenShare={() => setShareOpen(true)}
            />
          }
        />
        <WindowControls />
      </div>
      {view === 'player' ? (
        <PlayerPage
          key={`${playerSeriesId}-r${refreshKey}`}
          seriesId={playerSeriesId}
          episodeId={playerEpisodeId}
          onOpen={(id) => onNavigate('detail', id)}
          onOpenCharacter={(id) => onNavigate('character', id)}
          onEpisodeChange={(epId) => replaceEntry({ playerEpisodeId: epId })}
        />
      ) : view === 'detail' ? (
        <DetailPage
          key={`${detailId}-r${refreshKey}`}
          seriesId={detailId}
          onOpen={(id) => onNavigate('detail', id)}
          onOpenCharacter={(id) => onNavigate('character', id)}
          onPlay={onPlay}
          onNavigate={onNavigate}
        />
      ) : view === 'character' ? (
        <CharacterPage
          key={`${characterId}-r${refreshKey}`}
          characterId={characterId}
          onOpen={(id) => onNavigate('detail', id)}
        />
      ) : view === 'home' ? (
        <>
          {/* 首页 Banner 推荐剧位：通栏大图轮播，位于栏目区上方；未就绪时显示横幅骨架 */}
          {banners && banners.length > 0 ? (
            <HomeBanner
              banners={banners}
              onOpen={(id) => onNavigate('detail', id)}
              onPlay={onPlay}
            />
          ) : (
            !sections && !error && <div className="sk sk-banner" aria-hidden="true" />
          )}
          <main
            className={
              'content' +
              (banners && banners.length > 0 ? ' content-has-banner' : '')
            }
          >
            {error && (
              <div className="load-error">
                内容服务未连接（{error}）。请先启动后端。
              </div>
            )}
            {!sections && !error && <SkeletonRails />}
            {sections &&
              sections.map((s) => (
                <SectionRail
                  key={s.type}
                  section={s}
                  onNavigate={onNavigate}
                  onOpen={(id) => onNavigate('detail', id)}
                />
              ))}
          </main>
        </>
      ) : view === 'rank' ? (
        <RankPage
          key={`rank-r${refreshKey}`}
          initialType={rankType}
          initialPage={rankPage}
          onParamsChange={(t, p) => replaceEntry({ rankType: t, rankPage: p })}
          onNavigate={onNavigate}
          onTitleChange={setRankTitle}
          onOpen={(id) => onNavigate('detail', id)}
          onPlay={onPlay}
        />
      ) : view === 'search' ? (
        <SearchPage
          key={`search-r${refreshKey}`}
          keyword={searchKeyword}
          initialPage={searchPage}
          onParamsChange={(p) => replaceEntry({ searchPage: p })}
          onOpen={(id) => onNavigate('detail', id)}
          onPlay={onPlay}
          onNavigate={onNavigate}
        />
      ) : (
        <CategoryPage
          key={`cat-r${refreshKey}`}
          initialType={catType}
          initialTag={catTag}
          initialPage={catPage}
          onParamsChange={(t, g, p) => replaceEntry({ catType: t, catTag: g, catPage: p })}
          onNavigate={onNavigate}
          onTitleChange={setCatTitle}
          onOpen={(id) => onNavigate('detail', id)}
        />
      )}
      {/* 关闭确认弹窗：有正在播放的内容时，确认是否联动关闭主窗口与播放窗口 */}
      {closeConfirmOpen && (
        <div
          className="hg-modal-mask"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hg-close-confirm-title"
          onClick={() => {
            // 点遮罩关闭 = 取消：必须同步通知主进程复位（含撤销主窗口临时置顶），
            // 否则主窗口会一直处于置顶状态、抢走其他应用窗口的焦点
            setCloseConfirmOpen(false);
            const c = window.hgWin;
            if (c && c.cancelClose) c.cancelClose();
          }}
        >
          <div className="hg-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="hg-modal-title" id="hg-close-confirm-title">确认关闭？</h2>
            <p className="hg-modal-desc">
              当前有正在播放的内容。关闭主窗口将同时关闭关联的播放窗口。
            </p>
            <div className="hg-modal-actions">
              <button
                type="button"
                className="hg-modal-btn"
                onClick={() => {
                  setCloseConfirmOpen(false);
                  const c = window.hgWin;
                  if (c && c.cancelClose) c.cancelClose();
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="hg-modal-btn hg-modal-btn-primary"
                onClick={() => {
                  setCloseConfirmOpen(false);
                  const c = window.hgWin;
                  if (c && c.confirmClose) c.confirmClose();
                }}
              >
                确认关闭
              </button>
            </div>
          </div>
        </div>
      )}
      {shareOpen && (
        <ShareLinkModal
          onClose={() => setShareOpen(false)}
          onOpen={(seriesId, episodeId) => {
            setShareOpen(false);
            // 与其它播放入口一致：桌面端拉起独立播放窗口，网页版回退应用内播放页
            if (episodeId) onPlay(seriesId, episodeId);
            else onNavigate('detail', seriesId);
          }}
        />
      )}
    </div>
  );
}
