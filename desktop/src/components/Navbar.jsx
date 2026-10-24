import React, { useEffect, useRef, useState } from 'react';
import logoTitle from '../assets/logo-title.svg';
import { fetchSuggestions } from '../api.js';
import Tip from './Tooltip.jsx';
import { macTitleBarDoubleClick } from '../platform.js';

// 顶部导航：品牌 + 导航工具（后退/前进/刷新）+ 首页/分类/榜单（含下拉）+ 搜索框
// activeNav: 'home' | 'category' | 'rank' —— 当前高亮的导航项
// catLabel: 分类页类型 tab 滚出可视区后，替换“分类”二字的类型名（如“真人剧”）
// rankLabel: 榜单页 hero 标题滚出可视区后，替换“榜单”二字的完整榜名（如“红果热播榜”）
// navTools: 标题栏导航工具节点（NavTools），由 App 注入历史栈与刷新回调
// keyword: App 当前搜索关键词（受控同步源：历史前进/后退、提交搜索时同步输入框）
// onKeywordChange(keyword): 提交搜索/点选建议时上报，供 App 记录当前关键词
// onNavigate(view, type?, origin?) 切换页面视图；origin 表示导航来源（home/category/rank），
//   决定导航栏高亮项。搜索：onNavigate('search', keyword)；建议中的剧集：onNavigate('detail', id)。
const SUGGEST_DEBOUNCE_MS = 150;

// 建议下拉中的放大镜图标（与搜索框内图标同款）
function SuggestIcon() {
  return (
    <svg
      className="pc-suggest-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="15"
      fill="none"
      viewBox="0 0 14 15"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M6.363 0a6.364 6.364 0 0 1 4.629 10.727l2.822 2.822a.638.638 0 0 1-.901.901l-2.886-2.885A6.363 6.363 0 1 1 6.363 0m0 1.273a5.091 5.091 0 1 0 0 10.182 5.091 5.091 0 0 0 0-10.182"
      />
    </svg>
  );
}

// 建议标题关键词高亮（命中片段 #fa7705）
function SuggestHighlight({ text, keyword }) {
  const kw = String(keyword || '').trim();
  if (!kw) return <>{text}</>;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === kw.toLowerCase() ? (
          <span className="pc-suggest-highlight" key={i}>
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

export default function Navbar({
  activeNav = 'home',
  onNavigate,
  catLabel = null,
  rankLabel = null,
  navTools = null,
  keyword = null,
  onKeywordChange = null
}) {
  // 切换视图后移除按钮焦点，避免分类下拉菜单因 :focus-within 保持展开
  const go = (v, type, e, origin) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    // category: onNavigate(view, type, tag, origin)；其余: onNavigate(view, type, origin)
    if (v === 'category') onNavigate && onNavigate(v, type, undefined, origin);
    else onNavigate && onNavigate(v, type, origin);
  };
  const isActive = (v) => activeNav === v;

  // 分类下拉项：切换到应用内分类页并选中对应类型（对齐后端分类接口：无漫画源）
  const CATEGORY_ITEMS = [
    { id: 'real-drama', name: '真人剧' },
    { id: 'comic-drama', name: '漫剧' },
    { id: 'ai-drama', name: 'AI剧' }
  ];
  // 榜单下拉项：切换到应用内榜单页对应榜单（对齐后端 /api/rank/types）
  const RANK_ITEMS = [
    { id: 'hot-drama', name: '红果热播榜' },
    { id: 'hot-real-drama', name: '真人剧热播榜' },
    { id: 'hot-ai-drama', name: 'AI剧热播榜' },
    { id: 'hot-comic-drama', name: '漫剧热播榜' }
  ];

  // ===== 搜索框：输入值本地管理（避免每次击键都联动 App 重建搜索页）；
  //      App 关键词变化时（提交/历史导航）再同步进来 =====
  const [inputValue, setInputValue] = useState(keyword || '');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);
  const lastKeywordRef = useRef(keyword);

  useEffect(() => {
    if (keyword !== lastKeywordRef.current) {
      lastKeywordRef.current = keyword;
      setInputValue(keyword || '');
      closeSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const closeSuggestions = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    seqRef.current += 1; // 作废在途请求
    setSuggestOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const loadSuggestions = async (q) => {
    const seq = (seqRef.current += 1);
    try {
      const items = await fetchSuggestions(q);
      if (seq !== seqRef.current) return;
      setSuggestions(Array.isArray(items) ? items : []);
      setActiveIndex(-1);
      setSuggestOpen(true);
    } catch (_) {
      if (seq !== seqRef.current) return;
      setSuggestions([]);
    }
  };

  const onInputChange = (e) => {
    const v = e.target.value;
    setInputValue(v);
    if (!v.trim()) {
      closeSuggestions();
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadSuggestions(v.trim()), SUGGEST_DEBOUNCE_MS);
  };

  const submitSearch = (kw) => {
    const word = String(kw || '').trim();
    if (!word) return;
    closeSuggestions();
    if (onKeywordChange) onKeywordChange(word);
    onNavigate && onNavigate('search', word);
  };

  // 点选建议：剧集 → 详情页；关键词 → 以该关键词搜索
  const selectSuggestion = (item) => {
    if (!item) return;
    closeSuggestions();
    if (item.type === 'drama' && item.id) {
      onNavigate && onNavigate('detail', item.id);
      return;
    }
    if (item.title) submitSearch(item.title);
  };

  const onInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeSuggestions();
      return;
    }
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  };

  const showSuggestions = suggestOpen && suggestions.length > 0 && inputValue.trim();

  return (
    // macOS：隐藏标题栏后双击空白切换最大化
    <header className="pc-container-header" onDoubleClick={macTitleBarDoubleClick}>
      <Tip label="回到首页">
        <a
          className="pc-brand-link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go('home', e);
          }}
        >
          <img className="pc-icon-link" src={logoTitle} alt="红果短剧logo" />
        </a>
      </Tip>
      {navTools}
      <div className="links">
        <button
          type="button"
          className={'pc-link' + (isActive('home') ? ' pc-link-active' : '')}
          onClick={(e) => go('home', e)}
        >
          首页
        </button>
        <div className="pc-dropdown-nav">
          <button
            type="button"
            className={'pc-link' + (isActive('category') ? ' pc-link-active' : '')}
            aria-haspopup="true"
            onClick={(e) => go('category', undefined, e, 'category')}
          >
            {catLabel || '分类'}
          </button>
          <nav className="pc-dropdown-menu" aria-label="内容分类">
            {CATEGORY_ITEMS.map((c) => (
              <button
                key={c.id}
                type="button"
                className="pc-dropdown-item"
                onClick={(e) => go('category', c.id, e, 'category')}
              >
                {c.name}
              </button>
            ))}
          </nav>
        </div>
        <div className="pc-dropdown-nav">
          <button
            type="button"
            className={'pc-link' + (isActive('rank') ? ' pc-link-active' : '')}
            aria-haspopup="true"
            onClick={(e) => go('rank', undefined, e, 'rank')}
          >
            {rankLabel || '榜单'}
          </button>
          <nav className="pc-dropdown-menu" aria-label="热播榜单">
            {RANK_ITEMS.map((r) => (
              <button
                key={r.id}
                type="button"
                className="pc-dropdown-item"
                onClick={(e) => go('rank', r.id, e, 'rank')}
              >
                {r.name}
              </button>
            ))}
          </nav>
        </div>
      </div>
      {/* 搜索框：header 直接子元素（与 links 同级），margin-left:auto 推至右端 */}
      <div className="pc-actions">
        <div className="pc-search-box">
          <form
            className="pc-form"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch(inputValue);
            }}
          >
            <input
              className="pc-input"
              name="keyword"
              placeholder="请输入"
              type="search"
              aria-label="搜索短剧或演员"
              autoComplete="off"
              value={inputValue}
              onChange={onInputChange}
              onKeyDown={onInputKeyDown}
              onBlur={() => {
                // 延迟关闭，给建议项 click 留出时间（项上 onMouseDown 已阻止失焦）
                setTimeout(() => setSuggestOpen(false), 150);
              }}
              aria-expanded={showSuggestions}
              aria-controls="pc-search-suggestion-list"
            />
            <button
              className="pc-submit"
              type="submit"
              aria-label="搜索"
            >
              <svg
                className="pc-search-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="15"
                fill="none"
                viewBox="0 0 14 15"
                aria-hidden="true"
              >
                <path
                  fill="#fff"
                  fillOpacity="0.4"
                  d="M6.363 0a6.364 6.364 0 0 1 4.629 10.727l2.822 2.822a.638.638 0 0 1-.901.901l-2.886-2.885A6.363 6.363 0 1 1 6.363 0m0 1.273a5.091 5.091 0 1 0 0 10.182 5.091 5.091 0 0 0 0-10.182"
                />
              </svg>
              <span className="pc-submit-text">搜索</span>
            </button>
          </form>
          {/* 搜索建议下拉：剧集建议（封面+题材+热度）与关键词建议 */}
          {showSuggestions && (
            <ul
              className="pc-search-suggestion"
              id="pc-search-suggestion-list"
              role="listbox"
              aria-label="搜索建议"
            >
              {suggestions.map((item, i) => (
                <li
                  key={`${item.type}-${item.id || item.title}-${i}`}
                  className={
                    'pc-suggest-item' + (i === activeIndex ? ' pc-suggest-item-active' : '')
                  }
                  role="option"
                  aria-selected={i === activeIndex}
                  // 阻止 mousedown 默认行为（先失焦），保证 click 能触发
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <SuggestIcon />
                  {item.type === 'drama' && item.cover && (
                    <img
                      className="pc-suggest-cover"
                      src={item.cover}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <div className="pc-suggest-body">
                    <p className="pc-suggest-title">
                      <SuggestHighlight text={item.title} keyword={inputValue} />
                    </p>
                    {item.subtitle && <p className="pc-suggest-sub">{item.subtitle}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </header>
  );
}
