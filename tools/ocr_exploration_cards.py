#!/usr/bin/env python3
"""OCR ATO exploration card scans with local Tesseract.

The exploration cards use a fixed 470x740-ish layout. Splitting each card into
title/body/footer regions gives better text than asking OCR to read the whole
image at once, especially when icons appear in the rules box.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CARDS_DIR = ROOT / "assets" / "exploration-cards"
DEFAULT_TESSERACT_PATHS = (
    Path("C:/Program Files/Tesseract-OCR/tesseract.exe"),
    Path("C:/Program Files (x86)/Tesseract-OCR/tesseract.exe"),
)


def find_tesseract(explicit: str | None = None) -> str:
    if explicit:
      return explicit
    for candidate in DEFAULT_TESSERACT_PATHS:
        if candidate.exists():
            return str(candidate)
    return "tesseract"


def normalize_region(image: Image.Image, box: tuple[int, int, int, int], scale: int = 3) -> Image.Image:
    region = image.crop(box)
    region = region.resize((region.width * scale, region.height * scale), Image.Resampling.LANCZOS)
    region = ImageOps.grayscale(region)
    region = ImageEnhance.Contrast(region).enhance(1.7)
    return region


def card_regions(image: Image.Image) -> dict[str, tuple[int, int, int, int]]:
    width, height = image.size
    sx = width / 470
    sy = height / 740

    def box(left: int, top: int, right: int, bottom: int) -> tuple[int, int, int, int]:
        return (
            round(left * sx),
            round(top * sy),
            round(right * sx),
            round(bottom * sy),
        )

    return {
        "title": box(0, 0, 470, 145),
        "body": box(35, 145, 435, 505),
        "footer": box(0, 600, 470, 740),
        "full": box(0, 0, 470, 740),
    }


def run_tesseract(
    tesseract: str,
    image: Image.Image,
    temp_dir: Path,
    stem: str,
    lang: str,
    psm: int,
) -> str:
    temp_path = temp_dir / f"{stem}.png"
    image.save(temp_path)
    result = subprocess.run(
        [tesseract, str(temp_path), "stdout", "-l", lang, "--psm", str(psm)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"tesseract exited with {result.returncode}")
    return "\n".join(line.rstrip() for line in result.stdout.splitlines() if line.strip())


def ocr_card(path: Path, tesseract: str, lang: str) -> dict[str, object]:
    image = Image.open(path).convert("RGB")
    regions = card_regions(image)
    with tempfile.TemporaryDirectory(prefix="ato-ocr-") as tmp:
        temp_dir = Path(tmp)
        title_image = normalize_region(image, regions["title"], scale=3)
        body_image = normalize_region(image, regions["body"], scale=3)
        footer_image = normalize_region(image, regions["footer"], scale=3)
        full_image = normalize_region(image, regions["full"], scale=2)
        return {
            "file": str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path),
            "size": list(image.size),
            "text": {
                "title": run_tesseract(tesseract, title_image, temp_dir, f"{path.stem}-title", lang, 6),
                "body": run_tesseract(tesseract, body_image, temp_dir, f"{path.stem}-body", lang, 6),
                "footer": run_tesseract(tesseract, footer_image, temp_dir, f"{path.stem}-footer", lang, 6),
                "full": run_tesseract(tesseract, full_image, temp_dir, f"{path.stem}-full", lang, 6),
            },
        }


def collect_cards(args: argparse.Namespace) -> list[Path]:
    if args.images:
        return [Path(image).resolve() for image in args.images]
    cycles = args.cycle or ["c1", "c2", "c3"]
    cards: list[Path] = []
    for cycle in cycles:
        cards.extend(sorted((DEFAULT_CARDS_DIR / cycle).glob("*.png")))
    return cards


def main() -> int:
    parser = argparse.ArgumentParser(description="OCR exploration card scans with Tesseract.")
    parser.add_argument("images", nargs="*", help="Specific card image(s) to OCR.")
    parser.add_argument("--cycle", action="append", choices=["c1", "c2", "c3"], help="OCR all cards in a cycle.")
    parser.add_argument("--lang", default="chi_sim+eng", help="Tesseract language list. Default: chi_sim+eng.")
    parser.add_argument("--tesseract", help="Path to tesseract.exe.")
    parser.add_argument("--output", "-o", help="Write JSON output to this path.")
    args = parser.parse_args()

    tesseract = find_tesseract(args.tesseract)
    cards = collect_cards(args)
    if not cards:
        parser.error("No card images found.")

    results = [ocr_card(card, tesseract, args.lang) for card in cards]
    payload = {"engine": tesseract, "lang": args.lang, "cards": results}
    output = json.dumps(payload, ensure_ascii=False, indent=2)

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output + "\n", encoding="utf-8")
    else:
        sys.stdout.buffer.write((output + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
