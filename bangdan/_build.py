# -*- coding: utf-8 -*-
"""红果榜单页面重建生成器"""
import os, re, io, sys, json, hashlib, urllib.request, html as htmllib
from PIL import Image

BASE = r'C:\Users\KIN\Documents\hongguo\bangdan'
ASSETS = os.path.join(BASE, 'rank-assets')
OUT = os.path.join(BASE, '红果短剧官网_榜单页面.html')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'}

RANKS = [
    ('hot-drama',       '红果热播榜',   '红果热播榜_热门短剧排行榜 - 红果短剧官网.html'),
    ('hot-real-drama',  '真人剧热播榜', '真人剧热播榜_热门真人短剧排行榜 - 红果短剧官网.html'),
    ('hot-ai-drama',    'AI剧热播榜',   'AI剧热播榜_热门AI短剧排行榜 - 红果短剧官网.html'),
    ('hot-comic-drama', '漫剧热播榜',   '漫剧热播榜_热门漫剧排行榜 - 红果短剧官网.html'),
]
MOBILE_LABEL = {'hot-drama': '热播榜'}
DEFAULT_SUB = '10月22日已更新 · 基于红果内观看/互动等综合热度排序'

def find_files_dir(rank_token):
    for sub in os.listdir(BASE):
        if rank_token in sub and sub.endswith('_files'):
            return os.path.join(BASE, sub)
    return None

def get_text(el):
    # strip tags, collapse whitespace, strip svg noise
    t = re.sub(r'<svg.*?</svg>', '', el, flags=re.S)
    t = re.sub(r'<[^>]+>', '', t)
    return re.sub(r'\s+', ' ', t).strip()

def parse_items(htmlbody, filesdir, key):
    """Split rank list <ol> content into items."""
    ol = re.search(r'<ol class="pc-list-sXM2Rt"[^>]*>(.*?)</ol>', htmlbody, re.S)
    items = []
    if not ol:
        return items
    li_parts = re.split(r'<li class="pc-list-item-g83wY6">', ol.group(1))
    for idx, part in enumerate(li_parts[1:], 1):
        item = {}
        # cover
        cm = re.search(r'<img class="pc-cover-VgjqQf"[^>]*src="([^"]+)"[^>]*alt="([^"]*)"', part)
        item['cover'] = cm.group(1) if cm else ''
        item['alt'] = cm.group(2) if cm else ''
        # detail link
        dm = re.search(r'<a class="pc-cover-link-Qbvkrw"[^>]*href="([^"]+)"', part)
        item['detail'] = dm.group(1) if dm else ''
        # title
        tm = re.search(r'<h2[^>]*class="pc-title-LHxn_J"[^>]*>(.*?)</h2>', part, re.S)
        item['title'] = get_text(tm.group(1)) if tm else ''
        # heat
        hm = re.search(r'<p class="pc-metrics-tBwLTq"[^>]*>(.*?)</p>', part, re.S)
        item['heat'] = get_text(hm.group(1)) if hm else ''
        # engagement tags
        eng = []
        for lim in re.finditer(r'<li([^>]*)>(.*?)</li>', part, re.S):
            cls = re.search(r'class="([^"]*)"', lim.group(1))
            cls = cls.group(1) if cls else ''
            eng.append({'cls': cls, 'text': get_text(lim.group(2))})
        item['eng'] = eng
        # categories
        cm2 = re.search(r'<p class="pc-categories-ApVUzG"[^>]*>(.*?)</p>', part, re.S)
        cats = []
        if cm2:
            for span in re.findall(r'<span[^>]*>(.*?)</span>', cm2.group(1), re.S):
                cats.append(re.sub(r'<[^>]+>', '', span).strip())
        item['cats'] = cats
        # description
        dm2 = re.search(r'<p class="pc-description-feL298"[^>]*>(.*?)</p>', part, re.S)
        item['desc'] = get_text(dm2.group(1)) if dm2 else ''
        # play link + episode count
        pm = re.search(r'<a class="pc-play-button-qtvNsk"[^>]*href="([^"]+)"', part)
        item['play'] = pm.group(1) if pm else ''
        eps = [int(m.group(1)) for m in re.finditer(r'pc-episode-n9V57o"[^>]*aria-label="播放第(\d+)集"', part)]
        item['eps'] = max(eps) if eps else 0
        item['rank'] = idx
        items.append(item)
    return items

def extract_rank(key, title, fn):
    path = os.path.join(BASE, fn)
    raw = open(path, encoding='utf-8', errors='replace').read()
    filesdir = find_files_dir(title)
    data = {'key': key, 'h1': title}
    # hero sources
    hm = re.search(r'<section class="pc-hero-QEbapp">(.*?)</section>', raw, re.S)
    hero = {'d_img': '', 'm_img': '', 'd_webp': '', 'm_webp': ''}
    if hm:
        sec = hm.group(1)
        # sources with media attr (mobile)
        for m in re.finditer(r'<source media="([^"]*)" srcset="([^"]+)"([^>]*)>', sec):
            typ = re.search(r'type="([^"]+)"', m.group(3))
            if m.group(1) == '(max-width: 767px)':
                if typ and typ.group(1) == 'image/webp':
                    hero['m_webp'] = m.group(2)
                else:
                    hero['m_img'] = m.group(2)
            else:
                if typ and typ.group(1) == 'image/webp':
                    hero['d_webp'] = m.group(2)
                else:
                    hero['d_img'] = m.group(2)
        # sources without media attr (desktop)
        for m in re.finditer(r'<source srcset="([^"]+)"([^>]*)>', sec):
            typ = re.search(r'type="([^"]+)"', m.group(2))
            if typ and typ.group(1) == 'image/webp':
                if not hero['d_webp']:
                    hero['d_webp'] = m.group(1)
            else:
                if not hero['d_img']:
                    hero['d_img'] = m.group(1)
        im = re.search(r'<img class="pc-hero-image-BO9Slh"[^>]*src="([^"]+)"', sec)
        hero['local_img'] = im.group(1) if im else ''
        pm = re.search(r'<p[^>]*>([^<]*)</p>\s*</div>\s*</section>', sec)
        if pm:
            data['sub'] = pm.group(1).strip()
    if 'sub' not in data:
        data['sub'] = DEFAULT_SUB
    # canonical
    cm = re.search(r'"canonicalUrl":"([^"]+)"', raw)
    data['canonical'] = cm.group(1) if cm else 'https://hongguoduanju.com/rank/' + key
    data['hero'] = hero
    data['items'] = parse_items(raw, filesdir, key)
    return data

def download(url, dest, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    with open(dest, 'wb') as f:
        f.write(data)
    return len(data)

def process_image(src, dst, max_w, quality=82, force_jpeg=True):
    im = Image.open(src)
    im = im.convert('RGB')
    w, h = im.size
    if w > max_w:
        nh = round(h * max_w / w)
        im = im.resize((max_w, nh), Image.LANCZOS)
    im.save(dst, 'JPEG', quality=quality, optimize=True, progressive=True)
    return im.size

def main():
    os.makedirs(ASSETS, exist_ok=True)
    print('== extracting rank data ==')
    ranks = {}
    for key, title, fn in RANKS:
        d = extract_rank(key, title, fn)
        ranks[key] = d
        print(f'  {key}: h1={d["h1"]} items={len(d["items"])} hero={d["hero"]}')

    # ---- assets: covers (dedupe by sha1) ----
    print('== building cover assets ==')
    cover_map = {}   # original local path -> asset name
    sha_seen = {}
    seq = 0
    for key, d in ranks.items():
        filesdir = find_files_dir(d['h1'])
        for it in d['items']:
            loc = it['cover']
            if not loc or loc.startswith(('http', 'data:')):
                continue
            name = os.path.basename(loc)
            srcp = os.path.join(filesdir, name) if filesdir else None
            if not srcp or not os.path.exists(srcp):
                print('   MISSING cover file:', loc)
                continue
            with open(srcp, 'rb') as f:
                digest = hashlib.sha1(f.read()).hexdigest()[:10]
            if digest in sha_seen:
                asset = sha_seen[digest]
            else:
                seq += 1
                asset = f'cover-{seq}.jpg'
                dst = os.path.join(ASSETS, asset)
                if not os.path.exists(dst):
                    try:
                        process_image(srcp, dst, 640, 78)
                    except Exception as e:
                        print('   cover FAIL', loc, e)
                        continue
                sha_seen[digest] = asset
            cover_map[loc] = 'rank-assets/' + asset
    print(f'  covers: {seq} unique -> {len(cover_map)} refs')

    # ---- assets: heroes ----
    print('== building hero assets ==')
    hero_assets = {}
    for key, d in ranks.items():
        hero = d['hero']
        d_url = hero.get('d_webp') or hero.get('d_img')
        m_url = hero.get('m_webp') or hero.get('m_img')
        d_dst = os.path.join(ASSETS, f'hero-{key}.jpg')
        m_dst = os.path.join(ASSETS, f'hero-{key}-m.jpg')
        # desktop
        if os.path.exists(d_dst):
            ok = True
        else:
            ok = False
            if d_url:
                try:
                    tmp = os.path.join(ASSETS, f'hero-{key}.src')
                    download(d_url, tmp)
                    process_image(tmp, d_dst, 1920, 82)
                    os.remove(tmp)
                    ok = True
                except Exception as e:
                    print('   desktop hero FAIL', key, e)
            if not ok:
                # fall back to local
                loc = hero.get('local_img', '')
                if loc:
                    srcp = os.path.join(find_files_dir(d['h1']), os.path.basename(loc))
                    if os.path.exists(srcp):
                        try:
                            process_image(srcp, d_dst, 1920, 82)
                            ok = True
                        except Exception as e:
                            print('   desktop hero local FAIL', key, e)
        # mobile
        if not os.path.exists(m_dst) and m_url:
            try:
                tmp = os.path.join(ASSETS, f'hero-{key}-m.src')
                download(m_url, tmp)
                process_image(tmp, m_dst, 750, 80)
                os.remove(tmp)
            except Exception as e:
                print('   mobile hero FAIL', key, e)
        hero_assets[key] = {'d': 'rank-assets/hero-' + key + '.jpg' if os.path.exists(d_dst) else (d_url or ''), 
                            'm': 'rank-assets/hero-' + key + '-m.jpg' if os.path.exists(m_dst) else (m_url or '')}
        print(f'  {key}: desktop={hero_assets[key]["d"]} mobile={hero_assets[key]["m"]}')

    # ---- shared assets: logo/qr/app ----
    filesdir = find_files_dir('红果热播榜')
    for src_name, dst_name in [('logo-pc.5633495cb2.svg', 'logo.svg'),
                               ('pc_code_0910.17e98bd206a74e89268989c2544894e3.png', 'qr.png'),
                               ('ca465a50c0d79a94c39a51676e20e4c6.png~tplv-wu9im5hjhw-image.image', 'app.png')]:
        for f in os.listdir(filesdir):
            if f.startswith(src_name.split('.')[0]) or src_name in f:
                import shutil
                shutil.copyfile(os.path.join(filesdir, f), os.path.join(ASSETS, dst_name))
                print('  copied', f, '->', dst_name)
                break

    # ---- build JSON data ----
    payload = {}
    for key, d in ranks.items():
        items = []
        for it in d['items']:
            cover = cover_map.get(it['cover'], it['cover'])
            items.append({
                'rank': it['rank'], 'cover': cover, 'alt': it['alt'],
                'detail': it['detail'], 'title': it['title'], 'heat': it['heat'],
                'eng': it['eng'], 'cats': it['cats'], 'desc': it['desc'],
                'play': it['play'], 'eps': it['eps'],
            })
        payload[key] = {
            'h1': d['h1'], 'sub': d['sub'], 'canonical': d['canonical'],
            'heroD': hero_assets[key]['d'], 'heroM': hero_assets[key]['m'],
            'mLabel': MOBILE_LABEL.get(key, d['h1']),
            'items': items,
        }
    json_blob = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    print('== JSON blob size:', len(json_blob))

    # ---- templates ----
    nav_pc = open(os.path.join(BASE, '_tmpl_nav_pc.html'), encoding='utf-8').read()
    # template already ends with the rank-desktop-nav closing div (original markup);
    # we wrap it ourselves below, so drop that trailing </div> to keep nesting balanced
    if nav_pc.rstrip().endswith('</div>'):
        nav_pc = nav_pc.rstrip()[:-len('</div>')]
    nav_pc = nav_pc.replace('./红果热播榜_热门短剧排行榜 - 红果短剧官网_files/logo-pc.5633495cb2.svg', 'rank-assets/logo.svg')
    nav_pc = nav_pc.replace('./红果热播榜_热门短剧排行榜 - 红果短剧官网_files/pc_code_0910.17e98bd206a74e89268989c2544894e3.png', 'rank-assets/qr.png')
    breadcrumb = open(os.path.join(BASE, '_tmpl_breadcrumb.html'), encoding='utf-8').read()
    tabs = open(os.path.join(BASE, '_tmpl_tabs.html'), encoding='utf-8').read()
    svgdefs = open(os.path.join(BASE, '_tmpl_svgdefs.html'), encoding='utf-8').read()
    hero_full = open(os.path.join(BASE, '_tmpl_hero.html'), encoding='utf-8').read()
    # hero content part = everything after </picture>
    hero_content = hero_full.split('</picture>', 1)[1]
    hero_content = hero_content.replace('<h1>', '<h1 id="heroTitle">').replace('<p>', '<p id="heroSub">')
    mobile_guide = open(os.path.join(BASE, '_tmpl_mobile_guide.html'), encoding='utf-8').read()

    # give containers ids
    breadcrumb = breadcrumb.replace('<ol class="pc-list-INIusT">', '<ol class="pc-list-INIusT" id="crumb">')
    tabs = '<nav class="pc-tabs-bXRdGA" id="rankTabs" aria-label="热播榜单分类">' + tabs + '</nav>'
    hero_picture = '<picture class="pc-hero-picture-iUYZGp" id="heroPic"></picture>'

    # footer from raw
    raw_hg = open(os.path.join(BASE, '红果热播榜_热门短剧排行榜 - 红果短剧官网.html'), encoding='utf-8', errors='replace').read()
    fm = re.search(r'(<div class="pc-page-c99OQM[^"]*"[^>]*>.*?</footer>)</div>', raw_hg, re.S)
    footer = fm.group(1) if fm else ''
    print('footer extracted:', len(footer))

    css = open(os.path.join(BASE, '_6.288036d487_pretty.css'), encoding='utf-8').read()
    # remove the pretty newlines issue: it's fine as CSS (whitespace ok). Rebuild minified-ish by collapsing
    css = re.sub(r'\n\s*', '', css)
    css_t = open(os.path.join(BASE, '_t.9b13d24d9f_pretty.css'), encoding='utf-8').read()
    css_t = re.sub(r'\n\s*', '', css_t)
    # m-page base rules were not saved with the pages; restore the essential ones
    css_extra = ('@media screen and (min-width:768px){.m-page-IGqlPw{display:none}}'
                 '@media screen and (max-width:767px){.pc-rank-nav-yvlI5B.m-page-IGqlPw{position:fixed;left:0;right:0;top:0;z-index:100}}')

    # ---- assemble html ----
    html = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no,viewport-fit=cover">
<title>红果热播榜_热门短剧排行榜 - 红果短剧官网</title>
<style>
''' + css_extra + css_t + css + '''
</style>
</head>
<body>
<div class="pc-page-rz8CSC">
<div class="rank-desktop-nav-TWHCw7">''' + nav_pc + '''</div>
<div class="pc-rank-nav-yvlI5B m-page-IGqlPw"><div class="m-container-W0A2CT"><a class="m-brand-link-rNxXs7" href="https://hongguoduanju.com/"><img class="m-icon-link-cajPqx" src="rank-assets/logo.svg" alt="红果短剧logo"></a><div class="links-s40c6A"><a class="pc-link-UBmRbj m-link-MAkZDJ" href="https://hongguoduanju.com/">首页</a><a class="pc-link-UBmRbj m-link-MAkZDJ m-link-active-BXeGFL" href="https://hongguoduanju.com/rank/hot-drama">榜单</a><a class="m-search-entry-yTtTEx" href="https://hongguoduanju.com/search" aria-label="搜索"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="15" fill="none" viewBox="0 0 14 15" aria-hidden="true" class="m-search-icon-VjI2fx"><path fill="#fff" fill-opacity="0.4" d="M6.363 0a6.364 6.364 0 0 1 4.629 10.727l2.822 2.822a.638.638 0 0 1-.901.901l-2.886-2.885A6.363 6.363 0 1 1 6.363 0m0 1.273a5.091 5.091 0 1 0 0 10.182 5.091 5.091 0 0 0 0-10.182"></path></svg></a></div></div></div>
<nav class="pc-breadcrumb-sx5CP7 pc-navigation-breadcrumb-SmQ1v2" aria-label="面包屑">''' + breadcrumb + '''</nav>
<section class="pc-hero-QEbapp">
''' + hero_picture + '''
<div class="pc-hero-content-KSZiHy">''' + hero_content + '''</div>
</section>
<main class="pc-main-hA8uwe">
''' + tabs + '''
''' + svgdefs + '''
<ol class="pc-list-sXM2Rt" id="rankList" aria-label="红果热播榜"></ol>
<nav class="pc-pagination-CkIOH3" id="pagination" aria-label="榜单分页"></nav>
</main>
''' + mobile_guide + '''
''' + footer + '''
</div>
<script>
window.RANK_DATA = ''' + json_blob + ''';
</script>
<script>
''' + open(os.path.join(BASE, '_rank.js'), encoding='utf-8').read() + '''
</script>
</body>
</html>'''
    open(OUT, 'w', encoding='utf-8').write(html)
    print('== written', OUT, len(html))

if __name__ == '__main__':
    main()
