"""分析 ss/terrain 中 L/Z 形地形板块的透明边框情况。"""
import os
from PIL import Image

BASE = r"e:\Document\atonew\ss\terrain"
FILES = [
    "black-glacier-l.png",
    "black-glacier-z.png",
    "cliff-l.png",
    "cliff-z.png",
    "labyrinth-l.png",
    "labyrinth-z.png",
    "maze-fissure-l.png",
    "maze-fissure-z.png",
    "spartan-river-works-z.png",
]


def analyze(path):
    img = Image.open(path)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    w, h = img.size
    alpha = img.getchannel("A")

    # 每行/每列的完全不透明像素计数与部分透明情况
    rows = []
    for y in range(h):
        row_alpha = alpha.crop((0, y, w, y + 1))
        px = list(row_alpha.getdata())
        fully_opaque = sum(1 for v in px if v == 255)
        semi = sum(1 for v in px if 0 < v < 255)
        rows.append((fully_opaque, semi))

    cols = []
    for x in range(w):
        col_alpha = alpha.crop((x, 0, x + 1, h))
        px = list(col_alpha.getdata())
        fully_opaque = sum(1 for v in px if v == 255)
        semi = sum(1 for v in px if 0 < v < 255)
        cols.append((fully_opaque, semi))

    # 找完全不透明像素的包围盒
    bbox = alpha.getbbox()  # 非零 alpha 的包围盒（含半透明）

    # 完全透明（alpha==0）的包围盒
    opaque_bbox = None
    for y in range(h):
        for x in range(w):
            if alpha.getpixel((x, y)) == 255:
                if opaque_bbox is None:
                    opaque_bbox = [x, y, x + 1, y + 1]
                else:
                    opaque_bbox[0] = min(opaque_bbox[0], x)
                    opaque_bbox[1] = min(opaque_bbox[1], y)
                    opaque_bbox[2] = max(opaque_bbox[2], x + 1)
                    opaque_bbox[3] = max(opaque_bbox[3], y + 1)

    print(f"=== {os.path.basename(path)} ===")
    print(f"  尺寸: {w}x{h}")
    print(f"  alpha 非零包围盒(bbox): {bbox}")
    print(f"  完全不透明包围盒: {opaque_bbox}")

    # 统计顶部/底部/左侧/右侧的完全透明行/列数
    top_clear = 0
    for y in range(h):
        if rows[y][0] == 0 and rows[y][1] == 0:
            top_clear += 1
        else:
            break
    bottom_clear = 0
    for y in range(h - 1, -1, -1):
        if rows[y][0] == 0 and rows[y][1] == 0:
            bottom_clear += 1
        else:
            break
    left_clear = 0
    for x in range(w):
        if cols[x][0] == 0 and cols[x][1] == 0:
            left_clear += 1
        else:
            break
    right_clear = 0
    for x in range(w - 1, -1, -1):
        if cols[x][0] == 0 and cols[x][1] == 0:
            right_clear += 1
        else:
            break
    print(f"  完全透明边距: 上={top_clear} 下={bottom_clear} 左={left_clear} 右={right_clear}")

    # 打印中间几行的不透明像素分布，帮助理解形状
    for y in [0, h // 4, h // 2, 3 * h // 4, h - 1]:
        if 0 <= y < h:
            print(f"  y={y}: 不透明={rows[y][0]} 半透明={rows[y][1]}")
    print()


for f in FILES:
    analyze(os.path.join(BASE, f))
