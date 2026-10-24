import re
p = r"C:\Users\KIN\Desktop\真人短剧_分类浏览与作品介绍 - 红果短剧官网.html"
t = open(p, encoding="utf-8").read()
out = []
urls = re.findall(r'https?://[^\s"\'<>]+', t)
out.append("urls: %d" % len(urls))
for u in urls[:30]:
    out.append(u[:150])
# 背景层 HTML 原文
i = t.find("pc-cover-x4A4V5")
out.append("---cover context---")
out.append(t[i-100:i+900])
open(r"C:\Users\KIN\Documents\hongguo\desktop\legacy\cat-urls.txt", "w", encoding="utf-8").write("\n".join(out))
print("done")
