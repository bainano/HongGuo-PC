import os
d = r"C:\Users\KIN\Desktop\真人短剧_分类浏览与作品介绍 - 红果短剧官网_files"
c = open(os.path.join(d, "category_$.1327576dae.css"), encoding="utf-8", errors="replace").read()
open(r"C:\Users\KIN\Documents\hongguo\desktop\legacy\category-full.css", "w", encoding="utf-8").write(c)
print("len", len(c))
