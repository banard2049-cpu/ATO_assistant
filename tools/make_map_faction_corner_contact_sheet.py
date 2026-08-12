#!/usr/bin/env python3
"""Make a contact sheet of map tile bottom-right faction marks."""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "map" / "images"
OUT = ROOT / "tools" / "map-faction-corners.png"
FONT = "C:/Windows/Fonts/msyh.ttc"


def sort_key(path: Path) -> tuple[str, int, str]:
    match = re.search(r"(c\d)-tile-([A-Z]?\d+)", path.name)
    if not match:
        return ("z", 9999, path.name)
    cycle, tile = match.groups()
    num = int(re.sub(r"\D", "", tile) or 0)
    return (cycle, num, path.name)


def main() -> int:
    paths = sorted(IMAGE_DIR.glob("*-front.*"), key=sort_key)
    crops = []
    for path in paths:
        image = Image.open(path).convert("RGB")
        w, h = image.size
        # This captures the printed right-bottom corner, not the whole card edge.
        crop = image.crop((round(w * 0.70), round(h * 0.66), w, h))
        crops.append((path.stem.replace("-front", ""), crop.resize((190, 190))))

    cols = 5
    cell_w, cell_h = 220, 245
    rows = (len(crops) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "#f6f7f4")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(FONT, 24)
    for index, (label, crop) in enumerate(crops):
        x = (index % cols) * cell_w
        y = (index // cols) * cell_h
        sheet.paste(crop, (x + 15, y + 10))
        draw.text((x + 16, y + 204), label, font=font, fill="#263238")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    print(OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
