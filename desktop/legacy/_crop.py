from PIL import Image
img = Image.open(r"C:\Users\KIN\Documents\hongguo\desktop\cap-cat2.png")
w, h = img.size
top = img.crop((0, 0, w, int(320*1.5)))
top.save(r"C:\Users\KIN\Documents\hongguo\desktop\cap-cat2-top.png")
print("saved", top.size)
