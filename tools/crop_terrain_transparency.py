"""裁剪 ss/terrain 中 L/Z 形地形板块四边的透明边框。

- 先将原图备份到 ss/terrain/_backup-lz-original/
- 按 alpha 通道包围盒裁剪（内容全部为完全不透明像素，无半透明边缘，安全）
- 原地覆盖保存（文件名不变，terrain-data.js / fixed_catalog.py 引用不受影响）
"""
import os
import shutil

from PIL import Image

BASE = r"e:\Document\atonew\ss\terrain"
BACKUP = os.path.join(BASE, "_backup-lz-original")
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


def main():
    os.makedirs(BACKUP, exist_ok=True)
    for name in FILES:
        src = os.path.join(BASE, name)
        img = Image.open(src)
        original_mode = img.mode
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        alpha = img.getchannel("A")
        bbox = alpha.getbbox()  # alpha>0 的包围盒
        if bbox is None:
            print(f"{name}: 全透明，跳过")
            continue

        # 备份原始文件
        bak = os.path.join(BACKUP, name)
        if not os.path.exists(bak):
            shutil.copy2(src, bak)
            print(f"  已备份 -> {bak}")

        w, h = img.size
        left, top, right, bottom = bbox
        cropped = img.crop(bbox)
        # 保持原模式（RGBA 或调色板等）
        if original_mode not in ("RGBA", "LA"):
            cropped = cropped.convert(original_mode)
        cropped.save(src, "PNG")

        print(
            f"{name}: {w}x{h} -> {cropped.size[0]}x{cropped.size[1]} "
            f"(裁掉 左{left} 上{top} 右{w-right} 下{h-bottom})"
        )


if __name__ == "__main__":
    main()
