from PIL import Image

src = "C:/Users/USer/Desktop/5234553412.jpg"
out = "D:/SCAN bot/mme-640x360.png"

im = Image.open(src).convert("RGB")
W, H = im.size
px = im.load()

# build RGBA: keep robot opaque, make pure-black background transparent
rgba = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rp = rgba.load()
th = 40
minx, miny, maxx, maxy = W, H, 0, 0
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        if r + g + b > th:
            rp[x, y] = (r, g, b, 255)
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
        else:
            rp[x, y] = (r, g, b, 0)

pad = 6
minx, miny = max(0, minx - pad), max(0, miny - pad)
maxx, maxy = min(W, maxx + pad), min(H, maxy + pad)
crop = rgba.crop((minx, miny, maxx, maxy))
cw, ch = crop.size
print("bbox crop", cw, ch)

# contain full robot into 640x360 on transparent canvas (no cut, no black bars)
target = (640, 360)
scale = min(target[0] / cw, target[1] / ch)
nw, nh = int(cw * scale), int(ch * scale)
resized = crop.resize((nw, nh), Image.LANCZOS)
canvas = Image.new("RGBA", target, (0, 0, 0, 0))
canvas.paste(resized, ((target[0] - nw) // 2, (target[1] - nh) // 2), resized)
canvas.save(out)
print("saved", canvas.size, "mode", canvas.mode)
