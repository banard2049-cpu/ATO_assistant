#!/usr/bin/env python3
"""Draw candidate faction-slot rectangles on sample map tiles."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "map" / "images"
OUT_DIR = ROOT / "tools" / "map-faction-slot-debug"
FONT = "C:/Windows/Fonts/msyh.ttc"


SAMPLES = [
    "c1-tile-003-front.jpg",
    "c1-tile-004-front.jpg",
    "c1-tile-020-front.jpg",
    "c2-tile-055-front.png",
    "c3-tile-008-front.png",
    "c3-tile-077-front.png",
]

# Current guess: inner and outer right-bottom slots.
SLOTS = {
    "inner": (0.735, 0.835, 0.850, 0.965),
    "outer": (0.845, 0.835, 0.965, 0.965),
}


def draw_slots(path: Path) -> Path:
    image = Image.open(path).convert("RGB")
    w, h = image.size
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT, 26)
    colors = {"inner": "#ffd500", "outer": "#ff3333"}
    for label, ratio_box in SLOTS.items():
        left, top, right, bottom = ratio_box
        box = (round(w * left), round(h * top), round(w * right), round(h * bottom))
        draw.rectangle(box, outline=colors[label], width=5)
        draw.text((box[0], max(0, box[1] - 30)), label, font=font, fill=colors[label])
    out = OUT_DIR / f"{path.stem}-slots.jpg"
    image.save(out, quality=92)
    return out


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for sample in SAMPLES:
        path = IMAGE_DIR / sample
        if path.exists():
            print(draw_slots(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
