#!/usr/bin/env python3
"""Render exploration automation report CSV into phone-friendly PNG images."""

from __future__ import annotations

import csv
import textwrap
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "tools" / "exploration-effect-automation-report.csv"
OUT_DIR = ROOT / "tools" / "report-images"
FONT_REGULAR = "C:/Windows/Fonts/NotoSansSC-Regular.ttf"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"


STATUS_LABELS = {
    "full-auto": "整张卡可全自动",
    "base-auto": "基础效果可自动，附加效果需确认",
    "semi": "半自动候选",
    "manual": "需要人工/规则补充",
    "review": "当前规则未覆盖",
    "bad-ocr": "OCR 太少/失败",
}


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def wrap_text(text: str, width: int) -> list[str]:
    text = " ".join(str(text).replace("\n", " / ").split())
    if not text:
        return [""]
    lines: list[str] = []
    for part in text.split(" / "):
        chunks = textwrap.wrap(part, width=width, break_long_words=False, replace_whitespace=False)
        lines.extend(chunks or [""])
    return lines


def draw_wrapped(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fnt: ImageFont.FreeTypeFont, fill: str, width: int, line_gap: int = 8) -> int:
    x, y = xy
    line_height = fnt.size + line_gap
    for line in wrap_text(text, width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += line_height
    return y


def make_canvas(height: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (1080, max(1600, height)), "#f7f8f5")
    return image, ImageDraw.Draw(image)


def card_height(row: dict[str, str], text_width: int) -> int:
    title_lines = len(wrap_text(f"{row['key']}  {row['name']}", 34))
    reason_lines = len(wrap_text(row["reason"], 36))
    ocr_lines = min(8, len(wrap_text(row["ocr_full"], text_width)))
    return 44 + title_lines * 42 + reason_lines * 34 + ocr_lines * 30 + 42


def draw_header(draw: ImageDraw.ImageDraw, title: str, subtitle: str = "") -> int:
    title_font = font(FONT_BOLD, 48)
    sub_font = font(FONT_REGULAR, 27)
    draw.text((54, 48), title, font=title_font, fill="#1e2a2f")
    y = 115
    if subtitle:
        y = draw_wrapped(draw, (56, y), subtitle, sub_font, "#607078", 42, 9) + 18
    draw.line((54, y, 1026, y), fill="#d8dedf", width=2)
    return y + 26


def draw_stat_page(rows: list[dict[str, str]]) -> Image.Image:
    image, draw = make_canvas(1700)
    y = draw_header(draw, "探索卡效果自动化评估", "基于 125 张探索卡 OCR。移除/连抽标签不在本次评估范围内。")
    counts = Counter(row["status"] for row in rows)
    cycle_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        cycle_counts[row["cycle"]][row["status"]] += 1

    big = font(FONT_BOLD, 40)
    regular = font(FONT_REGULAR, 30)
    small = font(FONT_REGULAR, 25)
    colors = {
        "full-auto": "#18734b",
        "base-auto": "#0d6274",
        "semi": "#70518f",
        "manual": "#a33b2b",
        "review": "#8a6700",
        "bad-ocr": "#555",
    }
    draw.text((56, y), "总览", font=big, fill="#1e2a2f")
    y += 62
    for status in ["full-auto", "base-auto", "semi", "manual", "review", "bad-ocr"]:
        label = STATUS_LABELS[status]
        draw.rounded_rectangle((56, y, 1024, y + 72), radius=18, fill="#ffffff", outline="#dde4e5", width=2)
        draw.text((82, y + 18), label, font=regular, fill="#263238")
        draw.text((900, y + 13), str(counts[status]), font=big, fill=colors[status])
        y += 88
    y += 22
    draw.text((56, y), "按 Cycle 统计", font=big, fill="#1e2a2f")
    y += 62
    for cycle in ["c1", "c2", "c3"]:
        draw.rounded_rectangle((56, y, 1024, y + 146), radius=18, fill="#ffffff", outline="#dde4e5", width=2)
        draw.text((82, y + 20), cycle.upper(), font=big, fill="#263238")
        summary = "  ".join(f"{STATUS_LABELS[s].split('，')[0]} {cycle_counts[cycle][s]}" for s in ["full-auto", "base-auto", "manual", "review"])
        draw_wrapped(draw, (82, y + 80), summary, small, "#607078", 46, 8)
        y += 166
    y += 18
    draw.text((56, y), "建议", font=big, fill="#1e2a2f")
    y += 62
    advice = "先做“基础资源收益自动化”：抽到卡后自动准备资源变更，并把 instead、chosen Argonaut、as a group、lose Titan、剧情/战斗等附加效果以确认面板展示。"
    draw_wrapped(draw, (60, y), advice, regular, "#263238", 35, 10)
    return image.crop((0, 0, 1080, y + 190))


def draw_rows_page(title: str, rows: list[dict[str, str]], filename_hint: str, limit: int | None = None) -> Image.Image:
    selected = rows if limit is None else rows[:limit]
    text_width = 45
    height = 180 + sum(card_height(row, text_width) + 20 for row in selected)
    image, draw = make_canvas(height)
    y = draw_header(draw, title, f"共 {len(rows)} 项" + (f"，本图展示前 {len(selected)} 项" if limit and len(rows) > limit else ""))
    key_font = font(FONT_BOLD, 31)
    meta_font = font(FONT_REGULAR, 25)
    ocr_font = font(FONT_REGULAR, 23)
    for row in selected:
        h = card_height(row, text_width)
        draw.rounded_rectangle((44, y, 1036, y + h), radius=18, fill="#ffffff", outline="#dde4e5", width=2)
        cy = y + 22
        cy = draw_wrapped(draw, (70, cy), f"{row['key']}  {row['name']}", key_font, "#1e2a2f", 34, 8)
        cy += 4
        cy = draw_wrapped(draw, (70, cy), row["reason"], meta_font, "#0d6274", 38, 8)
        if row["resources"]:
            cy = draw_wrapped(draw, (70, cy), f"资源：{row['resources']}", meta_font, "#607078", 38, 8)
        cy += 4
        summary = "OCR：" + row["ocr_full"]
        for idx, line in enumerate(wrap_text(summary, text_width)[:8]):
            draw.text((70, cy), line, font=ocr_font, fill="#37474f")
            cy += 31
        y += h + 20
    return image.crop((0, 0, 1080, y + 30))


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8-sig")))

    pages = [
        ("01-overview.png", draw_stat_page(rows)),
        ("02-full-auto.png", draw_rows_page("整张卡可全自动候选", [r for r in rows if r["status"] == "full-auto"], "full")),
        ("03-base-auto-1.png", draw_rows_page("基础效果可自动候选 1", [r for r in rows if r["status"] == "base-auto"], "base", 36)),
        ("04-manual-review.png", draw_rows_page("人工/复核优先清单", [r for r in rows if r["status"] in {"manual", "review", "semi"}], "manual", 45)),
    ]
    for name, image in pages:
        image.save(OUT_DIR / name)
        print(OUT_DIR / name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
