#!/usr/bin/env python3
"""Split the long map faction detection sheet into phone-friendly pages."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "map-tile-faction-detections.png"
OUT_DIR = ROOT / "tools" / "map-faction-pages"
HTML = OUT_DIR / "index.html"


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    image = Image.open(SOURCE).convert("RGB")
    width, height = image.size
    page_height = 2600
    paths = []
    for index, top in enumerate(range(0, height, page_height), start=1):
        page = image.crop((0, top, width, min(height, top + page_height)))
        path = OUT_DIR / f"map-faction-page-{index:02d}.png"
        page.save(path)
        paths.append(path)

    links = "\n".join(
        f'<section><h2>第 {idx} 页</h2><img src="{path.name}" alt="map faction page {idx}"></section>'
        for idx, path in enumerate(paths, start=1)
    )
    HTML.write_text(
        f"""<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>地图阵营识别拼图</title>
<style>
  body {{ margin: 0; background: #f7f8f5; color: #263238; font-family: system-ui, sans-serif; }}
  header {{ position: sticky; top: 0; background: rgba(247,248,245,.96); padding: 12px 14px; border-bottom: 1px solid #d8dedf; }}
  h1 {{ margin: 0; font-size: 20px; }}
  h2 {{ margin: 18px 12px 8px; font-size: 16px; }}
  img {{ display: block; width: 100%; height: auto; }}
</style>
<header><h1>地图阵营识别拼图</h1></header>
{links}
</html>
""",
        encoding="utf-8",
    )
    print(HTML)
    for path in paths:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
