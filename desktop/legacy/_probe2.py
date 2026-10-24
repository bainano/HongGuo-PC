import os, re
d = r"C:\Users\KIN\Desktop\真人短剧_分类浏览与作品介绍 - 红果短剧官网_files"
out = []
for fn in ["q9.ba6672c040.js.下载", "category.b95ffbb3c9.js.下载", "j.5d1f4b76d6.js.下载", "t.9b13d24d9f.css"]:
    fp = os.path.join(d, fn)
    if not os.path.exists(fp):
        out.append("MISSING " + fn)
        continue
    c = open(fp, encoding="utf-8", errors="replace").read()
    out.append("=== " + fn + " len=" + str(len(c)))
    for key in ["bgc", "2880", "cover", "backgroundImage", "category-nav", "contentTypes", "content-types", "tagList"]:
        idxs = [m.start() for m in re.finditer(re.escape(key), c)]
        if idxs:
            out.append("  key %s x%d first@%d" % (key, len(idxs), idxs[0]))
    # 打印含 2880 或 byteimg 背景的片段
    for key in ["2880", "bgc"]:
        i = c.find(key)
        if i >= 0:
            out.append("  ---ctx---")
            out.append(c[max(0,i-200):i+300].replace("\n", " "))
open(r"C:\Users\KIN\Documents\hongguo\desktop\legacy\cat-js-probe.txt", "w", encoding="utf-8").write("\n".join(out))
print("done")
