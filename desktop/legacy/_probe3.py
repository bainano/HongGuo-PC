import os, re
d = r"C:\Users\KIN\Desktop\真人短剧_分类浏览与作品介绍 - 红果短剧官网_files"
keys = ["pc-container-_S9vFt", "breadcrumb", "category-nav", "content-types", "content-type", "pc-tags-QMxdu0", "pc-tag-vD2QT8", "pc-list-section", "pc-breadcrumb", "pc-category", "pc-active"]
for fn in sorted(os.listdir(d)):
    if not (fn.endswith(".css") or fn.endswith(".js.下载")):
        continue
    c = open(os.path.join(d, fn), encoding="utf-8", errors="replace").read()
    hits = []
    for key in keys:
        i = c.find(key)
        if i >= 0:
            hits.append((key, i))
    if hits:
        out = [fn + " -> " + str(hits)]
        for key, i in hits[:6]:
            out.append("  ctx: " + c[max(0, i-60):i+160].replace("\n", " "))
        open(r"C:\Users\KIN\Documents\hongguo\desktop\legacy\cat-nav-probe.txt", "a", encoding="utf-8").write("\n".join(out) + "\n")
print("done")
