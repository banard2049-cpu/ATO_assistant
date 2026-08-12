#!/usr/bin/env python3
"""Detect right-bottom faction marks on map tile fronts."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[1]
MAP_DATA = ROOT / "map" / "map-data.js"
IMAGE_DIR = ROOT / "map" / "images"
ALLY_DIR = ROOT / "record" / "assets" / "ally"
OUT_CSV = ROOT / "tools" / "map-tile-faction-detections.csv"
OUT_JSON = ROOT / "tools" / "map-tile-faction-detections.json"
OUT_SHEET = ROOT / "tools" / "map-tile-faction-detections.png"
FONT = "C:/Windows/Fonts/msyh.ttc"

FACTION_BY_FILE = {
    "MINOANS": "minoians",
    "LABYRINTHIANS": "labyrinthians",
    "HORNSWORN": "hornsworn",
    "HELOTS": "helots",
    "CYCLOPES": "cyclopes",
    "SYMMACHY": "symmachy",
    "SUNHEIRS": "sunheirs",
    "DELPHIANS": "delphians",
    "TWILIGHTWATCH": "twilightWatch",
}

FACTION_LABELS = {
    "minoians": {"zh": "米诺斯人", "en": "Minoans"},
    "labyrinthians": {"zh": "迷宫徒", "en": "Labyrinthians"},
    "hornsworn": {"zh": "角誓者", "en": "Hornsworn"},
    "helots": {"zh": "希洛人", "en": "Helots"},
    "cyclopes": {"zh": "独眼巨人", "en": "Cyclopes"},
    "symmachy": {"zh": "邦联同盟", "en": "Symmachy"},
    "sunheirs": {"zh": "太阳后裔", "en": "Sunheirs"},
    "delphians": {"zh": "德尔菲人", "en": "Delphians"},
    "twilightWatch": {"zh": "暮光守望", "en": "Twilight Watch"},
}

FACTIONS_BY_CYCLE = {
    "c1": {"minoians", "labyrinthians", "hornsworn"},
    "c2": {"helots", "cyclopes", "symmachy"},
    "c3": {"sunheirs", "delphians", "twilightWatch"},
}

# Fixed bottom-right faction slots. A tile may have either the outer slot only
# or both inner+outer slots.
SLOTS = {
    "right_inner": (0.735, 0.835, 0.850, 0.965),
    "right_outer": (0.845, 0.835, 0.965, 0.965),
}


def load_map_tiles() -> list[dict[str, str]]:
    text = MAP_DATA.read_text(encoding="utf-8")
    match = re.search(r"window\.ATO_MAP_DATA\s*=\s*(\{.*\});?\s*$", text, re.S)
    if not match:
        raise RuntimeError("Could not parse map-data.js")
    data = json.loads(match.group(1))
    rows = []
    for cycle in data["cycles"]:
        for tile in cycle["tiles"]:
            rows.append({
                "cycle": cycle["id"],
                "tile_id": tile["id"],
                "label": tile.get("label", tile["id"]),
                "front": str((ROOT / "map" / tile["front"]).resolve()),
            })
    return rows


def symbol_mask(image: Image.Image, size: int = 96) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        image = image.crop(bbox)
    gray = ImageOps.grayscale(image)
    alpha = image.getchannel("A")
    bg = Image.new("L", image.size, 255)
    bg.paste(gray, mask=alpha)
    bg = ImageOps.autocontrast(bg)
    bg = bg.resize((size, size), Image.Resampling.LANCZOS)
    # Dark foreground on light background. This keeps template and tile crops comparable.
    threshold = 210
    return bg.point(lambda p: 255 if p < threshold else 0).filter(ImageFilter.MedianFilter(3))


def crop_fixed_slot(tile_path: Path, slot: str) -> Image.Image:
    image = Image.open(tile_path).convert("RGB")
    w, h = image.size
    left, top, right, bottom = SLOTS[slot]
    return image.crop((round(w * left), round(h * top), round(w * right), round(h * bottom)))


def tile_mask(crop: Image.Image, size: int = 96) -> tuple[Image.Image, float]:
    gray = ImageOps.grayscale(crop)
    # Focus on the inner part of the white faction square and keep the dark
    # symbol strokes as white pixels on a black background.
    w, h = gray.size
    gray = gray.crop((round(w * 0.10), round(h * 0.10), round(w * 0.90), round(h * 0.90)))
    gray = ImageOps.autocontrast(gray)
    best = gray.point(lambda p: 255 if p < 135 else 0)
    ink_ratio = ImageStat.Stat(best).mean[0] / 255.0
    bbox = best.getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        if (x1 - x0) < best.width * 0.95 and (y1 - y0) < best.height * 0.95:
            best = best.crop(bbox)
    return best.resize((size, size), Image.Resampling.LANCZOS).filter(ImageFilter.MedianFilter(3)), ink_ratio


def has_faction_box(crop: Image.Image) -> tuple[bool, float]:
    gray = ImageOps.grayscale(crop)
    width, height = gray.size
    bright = gray.point(lambda p: 255 if p > 175 else 0)
    bright_ratio = ImageStat.Stat(bright).mean[0] / 255.0
    center = gray.crop((round(width * 0.18), round(height * 0.18), round(width * 0.82), round(height * 0.82)))
    center_bright = center.point(lambda p: 255 if p > 155 else 0)
    center_ratio = ImageStat.Stat(center_bright).mean[0] / 255.0
    score = (bright_ratio + center_ratio) / 2
    return bright_ratio > 0.10 and center_ratio > 0.08, round(score, 4)


def difference_score(a: Image.Image, b: Image.Image) -> float:
    diff = ImageChops.difference(a, b)
    return ImageStat.Stat(diff).mean[0] / 255.0


def load_templates() -> dict[str, Image.Image]:
    templates = {}
    for path in ALLY_DIR.glob("*.png"):
        stem = path.stem.upper()
        faction = FACTION_BY_FILE.get(stem)
        if faction:
            templates[faction] = symbol_mask(Image.open(path))
    return templates


def empty_detection(slot: str) -> dict[str, object]:
    blank = Image.new("RGB", (96, 96), "#f0f0f0")
    return {
        "slot": slot,
        "faction": "",
        "faction_zh": "",
        "faction_en": "",
        "score": "",
        "second": "",
        "second_score": "",
        "ink_ratio": 0,
        "box_score": 0,
        "confidence": "none",
        "crop": blank,
        "mask": blank.convert("L"),
    }


def detect_crop(
    tile: dict[str, str],
    slot: str,
    crop: Image.Image,
    templates: dict[str, Image.Image],
    force: bool = False,
) -> dict[str, object]:
    box_present, box_score = has_faction_box(crop)
    mask, ink_ratio = tile_mask(crop)
    allowed = FACTIONS_BY_CYCLE.get(tile["cycle"], set(templates))
    candidates = {key: value for key, value in templates.items() if key in allowed}
    scores = sorted(
        ((faction, difference_score(mask, tmpl)) for faction, tmpl in candidates.items()),
        key=lambda item: item[1],
    )
    best, best_score = scores[0]
    second, second_score = scores[1]
    has_marker = force or (box_present and ink_ratio > 0.025 and best_score < 0.50)
    confidence = "none"
    if has_marker:
        if force and not box_present:
            confidence = "forced"
        else:
            confidence = "high" if best_score < 0.30 and second_score - best_score > 0.04 else (
                "medium" if best_score < 0.38 and second_score - best_score > 0.02 else "low"
            )
    labels = FACTION_LABELS.get(best, {"zh": "", "en": ""})
    return {
        "slot": slot,
        "faction": best if has_marker else "",
        "faction_zh": labels["zh"] if has_marker else "",
        "faction_en": labels["en"] if has_marker else "",
        "score": round(best_score, 4),
        "second": second,
        "second_score": round(second_score, 4),
        "ink_ratio": round(ink_ratio, 4),
        "box_score": box_score,
        "confidence": confidence,
        "crop": crop,
        "mask": mask,
    }


def detect() -> list[dict[str, object]]:
    templates = load_templates()
    rows = []
    for tile in load_map_tiles():
        detections = [
            detect_crop(tile, "right_inner", crop_fixed_slot(Path(tile["front"]), "right_inner"), templates, force=False),
            detect_crop(tile, "right_outer", crop_fixed_slot(Path(tile["front"]), "right_outer"), templates, force=True),
        ]
        seen_factions: dict[str, dict[str, object]] = {}
        for item in detections:
            faction = str(item["faction"])
            if not faction:
                continue
            previous = seen_factions.get(faction)
            if previous and float(previous["score"]) <= float(item["score"]):
                item["duplicate_suppressed"] = True
                item["faction"] = ""
                item["faction_zh"] = ""
                item["faction_en"] = ""
                item["confidence"] = "none"
            elif previous:
                previous["duplicate_suppressed"] = True
                previous["faction"] = ""
                previous["faction_zh"] = ""
                previous["faction_en"] = ""
                previous["confidence"] = "none"
                seen_factions[faction] = item
            else:
                item["duplicate_suppressed"] = False
                seen_factions[faction] = item
        for item in detections:
            item.setdefault("duplicate_suppressed", False)
        factions = [item["faction"] for item in detections if item["faction"]]
        labels_zh = [item["faction_zh"] for item in detections if item["faction_zh"]]
        labels_en = [item["faction_en"] for item in detections if item["faction_en"]]
        confidence_order = {"none": 0, "forced": 1, "low": 2, "medium": 3, "high": 4}
        overall = min(
            (item["confidence"] for item in detections if item["faction"]),
            key=lambda item: confidence_order[item],
            default="none",
        )
        row = {
            **tile,
            "factions": ",".join(factions),
            "faction_labels_zh": "、".join(labels_zh),
            "faction_labels_en": ", ".join(labels_en),
            "marker_count": len(factions),
            "confidence": overall,
            "detections": detections,
        }
        for item in detections:
            prefix = item["slot"]
            for key in ["faction", "faction_zh", "faction_en", "score", "second", "second_score", "ink_ratio", "box_score", "confidence", "duplicate_suppressed"]:
                row[f"{prefix}_{key}"] = item[key]
        rows.append(row)
    return rows


def write_outputs(rows: list[dict[str, object]]) -> None:
    serializable = []
    for row in rows:
        item = {key: value for key, value in row.items() if key != "detections"}
        serializable.append(item)
    OUT_JSON.write_text(json.dumps(serializable, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(serializable[0].keys()))
        writer.writeheader()
        writer.writerows(serializable)


def write_sheet(rows: list[dict[str, object]]) -> None:
    cols = 4
    cell_w, cell_h = 270, 230
    sheet_rows = (len(rows) + cols - 1) // cols
    image = Image.new("RGB", (cols * cell_w, sheet_rows * cell_h), "#f7f8f5")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT, 21)
    small = ImageFont.truetype(FONT, 18)
    colors = {"high": "#18734b", "medium": "#8a6700", "low": "#a33b2b", "forced": "#6f4a8e"}
    for index, row in enumerate(rows):
        x = (index % cols) * cell_w
        y = (index // cols) * cell_h
        detections = row["detections"]
        left = detections[0]
        right = detections[1]
        left_crop = left["crop"].resize((82, 82), Image.Resampling.LANCZOS)
        right_crop = right["crop"].resize((82, 82), Image.Resampling.LANCZOS)
        draw.rounded_rectangle((x + 8, y + 8, x + cell_w - 8, y + cell_h - 8), radius=12, fill="#ffffff", outline="#dce4e5")
        image.paste(left_crop, (x + 18, y + 18))
        image.paste(right_crop, (x + 112, y + 18))
        draw.text((x + 18, y + 137), f"{row['cycle']}:{row['tile_id']}", font=font, fill="#263238")
        faction_text = str(row["factions"] or "none")
        draw.text((x + 18, y + 166), faction_text, font=font, fill=colors.get(str(row["confidence"]), "#555555"))
        draw.text((x + 18, y + 195), f"{row['confidence']} I:{left['confidence']} O:{right['confidence']}", font=small, fill="#607078")
    image.save(OUT_SHEET)


def main() -> int:
    rows = detect()
    write_outputs(rows)
    write_sheet(rows)
    print(OUT_CSV)
    print(OUT_JSON)
    print(OUT_SHEET)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
