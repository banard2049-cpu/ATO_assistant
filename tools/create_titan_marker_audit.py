"""Build pixel-preserving contact sheets of every currently enabled map Titan icon.

Uses actual map images, not generated artwork. The optional detection cache only
locates the close-up; the enabled/disabled decisions come from titan-markers.js.
Run: python tools/create_titan_marker_audit.py
"""
from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from skimage.feature import match_template

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "titan-marker-audit-20261016"
FONT = "C:/Windows/Fonts/msyh.ttc"
BOLD = "C:/Windows/Fonts/msyhbd.ttc"
PAPER, INK, GREEN, LINE = "#f6f4ed", "#24332c", "#216849", "#ccd6cb"


def load_map() -> dict:
    raw = (ROOT / "map/map-data.js").read_text(encoding="utf-8")
    return json.loads(re.search(r"=\s*(\{.*\})\s*;", raw, re.S).group(1))


def enabled_markers() -> dict:
    result = subprocess.run(
        ["node", "-e", 'process.stdout.write(JSON.stringify(require("./map/titan-markers.js").markers))'],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def locate(path: Path, template: Image.Image) -> tuple[float, float, float]:
    source = np.asarray(Image.open(path).convert("L").resize((512, 512)))
    best = (-1.0, 0.5, 0.5)
    for scale in (0.8, 1.0, 1.2):
        size = (round(template.width * scale), round(template.height * scale))
        resized = np.asarray(template.resize(size))
        scores = match_template(source, resized)
        y, x = np.unravel_index(np.argmax(scores), scores.shape)
        score = float(scores[y, x])
        if score > best[0]:
            best = (score, (int(x) + size[0] / 2) / 512, (int(y) + size[1] / 2) / 512)
    return best


def draw_center(draw: ImageDraw.ImageDraw, box: tuple, label: str, font, fill=INK):
    x, y, w = box
    bounds = draw.textbbox((0, 0), label, font=font)
    draw.text((x + (w - bounds[2]) / 2, y), label, font=font, fill=fill)


def closeup(row: dict, size=108) -> Image.Image:
    with Image.open(ROOT / row["path"]) as source:
        source = source.convert("RGB")
        w, h = source.size
        x, y = row["x"] * w, row["y"] * h
        radius = min(w, h) * 0.057
        return source.crop((round(x-radius), round(y-radius), round(x+radius), round(y+radius))).resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    enabled, data = enabled_markers(), load_map()
    cache_path = ROOT / "tmp/map-titan-audit/detections2.json"
    cache = {row["key"]: row for row in json.loads(cache_path.read_text())} if cache_path.exists() else {}
    # Exemplar is the printed C1 002 icon. For later cycles the white disc has
    # reversed colors; use the original C2 001 source as a second exemplar.
    c1_template = Image.open(ROOT / "map/images/c1-tile-002-front.jpg").convert("L").crop((141, 211, 203, 274)).resize((38, 39))
    reference = cache.get("c2:001", {"x": 0.6426, "y": 0.5342})
    im = Image.open(ROOT / "map/images/c2-tile-001-front.png").convert("L").resize((512, 512))
    x, y = reference["x"] * 512, reference["y"] * 512
    other_template = im.crop((round(x-19), round(y-19.5), round(x+19), round(y+19.5)))
    groups = {name: [] for name in ("c1", "c2", "c3", "c4", "c5-A", "c5-B")}
    rows = []
    for cycle in data["cycles"]:
        cid = cycle["id"]
        for tile in sorted(cycle["tiles"], key=lambda item: item["id"]):
            for face in (["A", "B"] if cid == "c5" else [""]):
                key = f'{cid}:{tile["id"]}' + (f":{face}" if face else "")
                if not enabled.get(key):
                    continue
                side = "back" if face == "B" else "front"
                path = ROOT / "map" / tile[side].removeprefix("./")
                if not path.is_file():
                    raise FileNotFoundError(path)
                if key in cache:
                    row = {**cache[key], "path": str(path.relative_to(ROOT))}
                else:
                    score, x, y = locate(path, c1_template if cid == "c1" else other_template)
                    row = {"key": key, "path": str(path.relative_to(ROOT)), "score": score, "x": x, "y": y}
                row["label"] = tile["id"] + (f" {face}" if face else "")
                groups[cid + (f"-{face}" if face else "")].append(row)
                rows.append(row)
                if cid == "c1" and tile["id"] == "023":
                    alternate = ROOT / "map/images/c1-tile-023-alt-front.jpg"
                    score, x, y = locate(alternate, c1_template)
                    alt = {"key": "c1:023:alt", "path": str(alternate.relative_to(ROOT)), "score": score, "x": x, "y": y, "label": "023 替代版"}
                    groups["c1"].append(alt)
                    rows.append(alt)
    assert len(rows) == len(enabled) + 1, "Every currently enabled marker must appear once, plus the C1 alternate artwork"
    headings = {"c1": "Cycle I · 19 块地图 + 1 个替代卡面", "c2": "Cycle II · 22 块地图", "c3": "Cycle III · 22 块地图",
                "c4": "Cycle IV · 19 块地图", "c5-A": "Cycle V · A 面 · 20 块地图", "c5-B": "Cycle V · B 面 · 20 块地图"}
    title_font = ImageFont.truetype(BOLD, 32)
    group_font = ImageFont.truetype(BOLD, 23)
    small_font = ImageFont.truetype(FONT, 18)
    label_font = ImageFont.truetype(BOLD, 18)
    col, cw, ch, margin = 11, 128, 146, 24
    width = col * cw + margin * 2
    blocks = []
    for name, entries in groups.items():
        height = 58 + math.ceil(len(entries) / col) * ch + 14
        sheet = Image.new("RGB", (width, height), PAPER)
        draw = ImageDraw.Draw(sheet)
        draw.text((margin, 12), headings[name], font=group_font, fill=GREEN)
        draw.line((margin, 46, width-margin, 46), fill=LINE, width=1)
        for i, row in enumerate(entries):
            x, y = margin + i % col * cw, 58 + i // col * ch
            crop = closeup(row)
            sheet.paste(crop, (x + 10, y))
            draw.rectangle((x+9, y-1, x+118, y+108), outline=LINE, width=1)
            draw_center(draw, (x, y+113, cw), row["label"], label_font)
        sheet.save(OUT / f"{name}-markers.png")
        blocks.append(sheet)
        # Each detail sheet includes the whole source card and an enlarged crop.
        dcol, dcw, dch = 4, 350, 252
        detail = Image.new("RGB", (dcol*dcw+48, 92+math.ceil(len(entries)/dcol)*dch), PAPER)
        dd = ImageDraw.Draw(detail)
        dd.text((24, 12), headings[name] + " · 原图位置核对", font=group_font, fill=GREEN)
        dd.text((24, 47), "左：原地图，金框圈出位置；右：同一位置的图标放大。", font=small_font, fill=INK)
        for i, row in enumerate(entries):
            x, y = 24 + i % dcol * dcw, 92 + i // dcol * dch
            with Image.open(ROOT / row["path"]) as source:
                thumb = source.convert("RGB").resize((216, 216), Image.Resampling.LANCZOS)
            td = ImageDraw.Draw(thumb)
            px, py = row["x"]*216, row["y"]*216
            td.rectangle((px-13, py-13, px+13, py+13), outline="#ffdf55", width=3)
            detail.paste(thumb, (x, y))
            detail.paste(closeup(row, 104), (x+228, y+45))
            dd.text((x, y+221), row["key"].replace(":alt", " 替代版"), font=label_font, fill=INK)
        detail.save(OUT / f"{name}-full-cards.jpg", quality=95, subsampling=0)
    atlas = Image.new("RGB", (width, 134 + sum(block.height for block in blocks) + 22), PAPER)
    draw = ImageDraw.Draw(atlas)
    draw.text((margin, 18), "地图泰坦标记 · 全量核对拼图", font=title_font, fill=INK)
    draw.text((margin, 66), "当前清单：102 块地图；展开 C1 替代版、C5 A/B 面，共 123 个卡面。", font=small_font, fill=INK)
    draw.text((margin, 96), "全部为本地地图原图裁切；编号对应地图 ID。其他圆形图标未混入。", font=small_font, fill=INK)
    y = 134
    for block in blocks:
        atlas.paste(block, (0, y))
        y += block.height
    atlas.save(OUT / "all-titan-markers.png")
    (OUT / "manifest.json").write_text(json.dumps({"uniqueTiles": 102, "cardFaces": len(rows), "groups": {name: len(entries) for name, entries in groups.items()}, "entries": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"atlas": str(OUT / "all-titan-markers.png"), "dimensions": atlas.size, "faces": len(rows), "groups": {name: len(entries) for name, entries in groups.items()}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
