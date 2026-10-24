(function () {
  'use strict';
  var KEYS = ['hot-drama', 'hot-real-drama', 'hot-ai-drama', 'hot-comic-drama'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function badgeHTML(key, i) {
    var num = i;
    var svg;
    if (num === 1) {
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="20" fill="none" overflow="visible" preserveAspectRatio="none" style="display:block" viewBox="0 0 22 20" class="pc-badge-background-DuT8VG" aria-hidden="true"><path fill="url(#' + key + 'b1__a)" d="M0 8a8 8 0 0 1 8-8h14l-1.631 12.996A8 8 0 0 1 12.431 20H0z"></path><defs><linearGradient id="' + key + 'b1__a" x1="11.366" x2="9.027" y1="0" y2="19.194" gradientUnits="userSpaceOnUse"><stop stop-color="#FFD25F"></stop><stop offset="1" stop-color="#F3970B"></stop></linearGradient></defs></svg>';
    } else if (num === 2) {
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="20" fill="none" overflow="visible" preserveAspectRatio="none" style="display:block" viewBox="0 0 22 20" class="pc-badge-background-DuT8VG" aria-hidden="true"><path fill="url(#' + key + 'b2__a)" d="M0 8a8 8 0 0 1 8-8h14l-1.555 12.954A8 8 0 0 1 12.502 20H0z"></path><defs><linearGradient id="' + key + 'b2__a" x1="21.267" x2="9.167" y1="-0.526" y2="23.826" gradientUnits="userSpaceOnUse"><stop stop-color="#D4DBEC"></stop><stop offset="1" stop-color="#7F86A6"></stop></linearGradient></defs></svg>';
    } else if (num === 3) {
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="20" fill="none" overflow="visible" preserveAspectRatio="none" style="display:block" viewBox="0 0 22 20" class="pc-badge-background-DuT8VG" aria-hidden="true"><path fill="url(#' + key + 'b3__a)" d="M0 8a8 8 0 0 1 8-8h14l-1.555 12.954A8 8 0 0 1 12.502 20H0z"></path><defs><linearGradient id="' + key + 'b3__a" x1="21.267" x2="9.167" y1="-0.526" y2="23.826" gradientUnits="userSpaceOnUse"><stop stop-color="#FFCFAA"></stop><stop offset="1" stop-color="#D66A1E"></stop></linearGradient></defs></svg>';
    } else {
      svg = '<svg class="pc-badge-background-DuT8VG" viewBox="0 0 22 20" fill="none" preserveAspectRatio="none" aria-hidden="true" focusable="false"><use href="#rank-hongguo-badgeDefault"></use></svg>';
    }
    return '<span class="pc-badge-guiMWE">' + svg + '<span class="pc-badge-number-LCKjbJ">' + num + '</span></span>';
  }

  function itemHTML(key, it) {
    var i = it.rank;
    var eng = it.eng.map(function (e) {
      var icon = '';
      if (e.cls.indexOf('pc-score-tag') > -1) {
        icon = '<svg class="pc-score-icon-h6iNWV" viewBox="0 0 24 24" fill="none" preserveAspectRatio="none" aria-hidden="true" focusable="false"><use href="#rank-hongguo-score"></use></svg>';
      }
      return '<li' + (e.cls ? ' class="' + e.cls + '"' : '') + '>' + icon + esc(e.text) + '</li>';
    }).join('');
    var cats = it.cats.map(function (c, ci) {
      var div = ci < it.cats.length - 1 ? '<svg class="pc-category-divider-zW7WOD" viewBox="0 0 2 2" fill="none" preserveAspectRatio="none" aria-hidden="true" focusable="false"><use href="#rank-hongguo-categoryDivider"></use></svg>' : '';
      return '<span>' + esc(c) + '</span>' + div;
    }).join('');
    var eps = '';
    for (var e = 1; e <= it.eps; e++) {
      eps += '<a class="pc-episode-n9V57o" href="' + esc(it.play) + '" aria-label="播放第' + e + '集">' + e + '</a>';
    }
    return '<li class="pc-list-item-g83wY6">' +
      '<article class="pc-item-jlQoVk" aria-labelledby="rank-title-' + key + '-' + i + '">' +
      '<a class="pc-cover-link-Qbvkrw" aria-label="查看' + esc(it.title) + '" href="' + esc(it.detail) + '">' +
      '<picture style="display:contents"><img class="pc-cover-VgjqQf" src="' + esc(it.cover) + '" alt="' + esc(it.alt) + '" fetchpriority="' + (i <= 1 ? 'high' : 'auto') + '" loading="' + (i <= 1 ? '' : 'lazy') + '" width="160" height="224"></picture>' +
      badgeHTML(key, i) +
      '</a>' +
      '<div class="pc-content-_hELEg">' +
      '<div class="pc-heading-iLIXC9">' +
      '<a href="' + esc(it.detail) + '"><h2 id="rank-title-' + key + '-' + i + '" class="pc-title-LHxn_J">' + esc(it.title) + '</h2></a>' +
      '<p class="pc-metrics-tBwLTq"><span><svg class="pc-heat-icon-bpJYzZ" viewBox="0 0 14 14" fill="none" preserveAspectRatio="none" aria-hidden="true" focusable="false"><use href="#rank-hongguo-heat"></use></svg><svg class="mobile-heat-icon-Wo6DOw" viewBox="0 0 12 12" fill="none" preserveAspectRatio="none" aria-hidden="true" focusable="false"><use href="#rank-hongguo-heatMobile"></use></svg>' + esc(it.heat) + '</span></p>' +
      '</div>' +
      '<ul class="pc-engagement-_1DgDL" aria-label="作品互动数据">' + eng + '</ul>' +
      '<p class="pc-categories-ApVUzG">' + cats + '</p>' +
      '<p class="pc-description-feL298">' + esc(it.desc) + '</p>' +
      '<div class="pc-episodes-MJlIL5" aria-label="' + esc(it.title) + '选集">' +
      '<a class="pc-play-button-qtvNsk" href="' + esc(it.play) + '"><svg class="pc-play-icon-DCQw8H" viewBox="0 0 14 14" fill="none" preserveAspectRatio="none" aria-hidden="true" focusable="false"><use href="#rank-hongguo-play"></use></svg>播放正片</a>' +
      '<div class="pc-episode-list-container-lw6CEM"><div class="pc-episode-list-Duubqn">' + eps +
      '<button class="pc-more-OEji0A pc-episode-toggle-AyKYMG" type="button" aria-expanded="false" aria-label="查看' + esc(it.title) + '全部剧集"><svg viewBox="0 0 24 24" fill="none" preserveAspectRatio="none" aria-hidden="true" focusable="false"><use href="#rank-hongguo-expand"></use></svg></button>' +
      '</div></div></div>' +
      '</div></article></li>';
  }

  function tabsHTML(key) {
    return KEYS.map(function (k) {
      var d = RANK_DATA[k];
      return '<a href="#' + k + '"' + (k === key ? ' aria-current="page"' : '') + '>' +
        '<span class="pc-tab-label-SpYHQF">' + esc(d.h1) + '</span>' +
        '<span class="mobile-tab-label-KoxVEz">' + esc(d.mLabel) + '</span></a>';
    }).join('');
  }

  function breadcrumbHTML(key) {
    var d = RANK_DATA[key];
    return '<ol class="pc-list-INIusT"><li class="pc-item-yJU0h3"><a class="pc-link-L6wZRk" href="https://hongguoduanju.com/" title="首页">首页</a></li>' +
      '<li class="pc-item-yJU0h3"><span class="pc-separator-VJHTLO" aria-hidden="true">/</span><span class="pc-current-pJj7Mn" aria-current="page" title="' + esc(d.h1) + '">' + esc(d.h1) + '</span></li></ol>';
  }

  function paginationHTML(key) {
    var base = 'https://hongguoduanju.com/rank/' + key;
    var prev = '<span class="pc-direction-dfLMIp pc-disabled-TwZVue" aria-disabled="true"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" overflow="visible" preserveAspectRatio="none" style="display:block" viewBox="0 0 12 12" aria-hidden="true" class="pc-arrow-zxJkZZ"><path fill="#fff" fill-opacity="0.2" fill-rule="evenodd" d="M8.123 1.89a.563.563 0 0 0-.796 0L3.615 5.602a.563.563 0 0 0 0 .796l3.712 3.712a.563.563 0 0 0 .796-.795L4.808 6l3.315-3.315a.563.563 0 0 0 0-.795" clip-rule="evenodd"></path></svg></span>';
    var next = '<a class="pc-direction-dfLMIp" href="' + base + '?page=2" rel="next" aria-label="下一页"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" overflow="visible" preserveAspectRatio="none" style="display:block" viewBox="0 0 12 12" aria-hidden="true" class="pc-arrow-zxJkZZ"><path fill="#fff" fill-opacity="0.7" fill-rule="evenodd" d="M3.877 10.11c.22.22.576.22.796 0l3.712-3.712a.563.563 0 0 0 0-.796L4.673 1.89a.563.563 0 0 0-.796.795L7.192 6 3.877 9.315a.563.563 0 0 0 0 .795" clip-rule="evenodd"></path></svg></a>';
    var pages = '';
    for (var p = 1; p <= 5; p++) {
      pages += p === 1
        ? '<span class="pc-current-sgRm7A" aria-current="page">1</span>'
        : '<a class="pc-page-cUKmig" href="' + base + '?page=' + p + '" aria-label="第 ' + p + ' 页">' + p + '</a>';
    }
    return prev + pages + next;
  }

  function render(key) {
    if (!RANK_DATA[key]) key = 'hot-drama';
    var d = RANK_DATA[key];

    // hero
    var pic = document.getElementById('heroPic');
    pic.innerHTML = '<source media="(max-width: 767px)" srcset="' + esc(d.heroM) + '">' +
      '<img class="pc-hero-image-BO9Slh" src="' + esc(d.heroD) + '" alt="" fetchpriority="high" aria-hidden="true">';
    document.getElementById('heroTitle').textContent = d.h1;
    document.getElementById('heroSub').textContent = d.sub;

    // breadcrumb & tabs
    document.getElementById('crumb').innerHTML = breadcrumbHTML(key);
    document.getElementById('rankTabs').innerHTML = tabsHTML(key);

    // list
    var html = d.items.map(function (it) { return itemHTML(key, it); }).join('');
    var ol = document.getElementById('rankList');
    ol.setAttribute('aria-label', d.h1);
    ol.innerHTML = html;

    // pagination + mobile guide
    document.getElementById('pagination').innerHTML = paginationHTML(key);
    var guide = document.querySelector('.mobile-guide-MrAZje');
    if (guide && d.items.length) guide.setAttribute('href', d.items[0].play);

    // title
    document.title = d.h1 + '_热门' + (d.h1.indexOf('剧') > -1 ? d.h1 : '短剧') + '排行榜 - 红果短剧官网';

    // nav 榜单 dropdown active
    var dd = document.querySelectorAll('.pc-dropdown-menu-nW0Gzq[aria-label="热播榜单"] a');
    dd.forEach(function (a) {
      a.removeAttribute('aria-current');
      if (a.getAttribute('href') === d.canonical) a.setAttribute('aria-current', 'page');
    });
    var tabs = document.querySelectorAll('#rankTabs a');
    tabs.forEach(function (a) {
      a.addEventListener('click', function () { location.hash = a.getAttribute('href'); });
    });
  }

  // episode expand toggle (delegation)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.pc-episode-toggle-AyKYMG') : null;
    if (!btn) return;
    var art = btn.closest('.pc-item-jlQoVk');
    var epList = btn.closest('.pc-episode-list-Duubqn');
    var open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open));
    if (art) art.classList.toggle('pc-item-expanded-c4x0K4', !open);
    if (epList) epList.classList.toggle('pc-episode-list-expanded-qt1pcd', !open);
    var svg = btn.querySelector('svg');
    if (svg) svg.classList.toggle('pc-more-open-oj2L18', !open);
  });

  // nav scroll surface
  var nav = document.querySelector('.pc-page-BTzUmP');
  function onScroll() {
    if (nav) nav.style.setProperty('--pc-nav-surface-opacity', window.scrollY > 12 ? '1' : '0');
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  function currentKey() {
    var h = window.location.hash.replace('#', '');
    return RANK_DATA[h] ? h : 'hot-drama';
  }

  window.addEventListener('hashchange', function () { render(currentKey()); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { render(currentKey()); });
  } else {
    render(currentKey());
  }
})();
