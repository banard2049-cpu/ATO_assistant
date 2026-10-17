"""Measure thin scan lines on fan exploration/AIBP cards without editing images.

The generated display-only trims are gated by original dimensions and 36 exact
interior pixel samples. Official artwork (including shared fan/official images)
must not match a generated entry. Requires Pillow and NumPy.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
import re
import sys
import zipfile

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
GRID = 6
TOLERANCE = 3
MAX_TRIM = 8
DARK_EDGE = 85
SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
CARD = re.compile(r"aibp/ps/(?:[A-Z][A-Z0-9_]+|other/trait)/[^/]+\.(?:jpg|jpeg|png|webp)$")


def samples(image: Image.Image) -> list[int]:
    width, height = image.size
    return [channel for y in range(1, GRID + 1) for x in range(1, GRID + 1)
            for channel in image.getpixel((round(x * (width - 1) / (GRID + 1)),
                                           round(y * (height - 1) / (GRID + 1))))[:3]]


def side_trim(band: np.ndarray, depth: int) -> int:
    """Require a long, thin dark line followed by a substantially lighter face.

    Test per-column transitions so slightly tilted cuts can be removed too.
    A dark header, illustration or printed footer extending inward is retained.
    """
    gray = band[..., :3].astype(np.float32) @ np.array([.299, .587, .114], dtype=np.float32)
    transitions = np.zeros((depth, gray.shape[1]), dtype=bool)
    candidates = []
    for row in range(depth):
        dark = gray[row] < DARK_EDGE
        following = np.max(gray[row + 1:row + 4], axis=0)
        transitions[row] = dark & (following - gray[row] > 45)
        # Test a single long line, never the union of unrelated title ornaments.
        if (row + 1 <= MAX_TRIM and dark.mean() >= .65 and transitions[row].mean() >= .55
                and all(part.mean() >= .5 for part in np.array_split(dark, 3))
                and min((gray[after] < DARK_EDGE).mean() for after in range(row + 1, row + 4)) < .35):
            candidates.append(row + 1)
    # Some scan lines are gray rather than black after compression. Only admit
    # these at the very outside edge, followed by a near-continuous light face;
    # broadening the threshold deeper into the card would catch printed frames.
    gray_candidates = []
    for row in range(min(3, depth)):
        following = np.max(gray[row + 1:row + 4], axis=0)
        transition = (gray[row] < 150) & (following > 170) & (following - gray[row] > 55)
        if transition.mean() >= .8 and all(part.mean() >= .7 for part in np.array_split(transition, 3)):
            gray_candidates.append(row + 1)
    if candidates or gray_candidates:
        return max(candidates + gray_candidates)
    # A slightly tilted line may cross several rows. It must still form a thin,
    # nearly straight transition across most of the edge, rather than glyphs.
    covered = transitions.any(axis=0)
    if covered.mean() < .75 or any(part.mean() < .65 for part in np.array_split(covered, 3)):
        return 0
    first = transitions.argmax(axis=0)
    x = np.arange(len(first))[covered]
    ends = first[covered].astype(float)
    line = np.polyfit(x, ends, 1)
    error = np.abs(ends - np.polyval(line, x))
    if np.median(error) > .75 or np.quantile(error, .9) > 1.5:
        return 0
    trim = int(np.ceil(np.quantile(ends + 1, .98)))
    return trim if trim < depth and trim <= MAX_TRIM else 0


def detect_trims(image: Image.Image) -> list[int]:
    width, height = image.size
    depth = max(3, min(24, int(min(width, height) * .025)))
    if min(width, height) < 250:
        return [0, 0, 0, 0]
    x0, x1 = round(width * .08), round(width * .92)
    y0, y1 = round(height * .08), round(height * .92)
    top = np.asarray(image.crop((x0, 0, x1, depth + 5)))
    bottom = np.asarray(image.crop((x0, height - depth - 5, x1, height)))[::-1]
    left = np.asarray(image.crop((0, y0, depth + 5, y1))).transpose(1, 0, 2)
    right = np.asarray(image.crop((width - depth - 5, y0, width, y1))).transpose(1, 0, 2)[::-1]
    return [side_trim(band, depth) for band in (top, right, bottom, left)]


def open_rgb(path: Path) -> Image.Image:
    with Image.open(path) as source:
        return ImageOps.exif_transpose(source).convert("RGB")


def candidate_paths(root: Path):
    for folder in (root / "assets/exploration-cards", root / "aibp/ps"):
        for path in sorted(folder.rglob("*")):
            target = path.relative_to(root).as_posix()
            if (path.is_file() and not path.is_symlink() and path.suffix.lower() in SUFFIXES
                    and ".preview." not in path.name and "_TR_O_" not in path.name
                    and (target.startswith("assets/exploration-cards/") or CARD.fullmatch(target))):
                yield path, target


def add_pack_variants(data: dict, pack: Path) -> int:
    """Recognize existing compressed fan packs without relaxing the pixel gate."""
    added = 0
    with zipfile.ZipFile(pack) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("format") != "ato-asset-pack" or manifest.get("build", {}).get("edition") != "fan":
            raise ValueError("Only explicitly identified fan packs may add image variants")
        members = {entry.get("member") for field in ("assets", "cardPreviewFiles")
                   for entry in manifest.get(field, []) if isinstance(entry, dict)}
        for target, variants in data["images"].items():
            if target not in members:
                continue
            with Image.open(io.BytesIO(archive.read(target))) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
            fingerprint = samples(image)
            same_size = [entry for entry in variants if entry["size"] == list(image.size)]
            if not same_size or any(all(abs(a - b) <= TOLERANCE for a, b in zip(entry["samples"], fingerprint))
                                    for entry in same_size):
                continue
            # The pack may have an older card revision: accept compression noise,
            # not a new layout or translation merely sharing a path and dimensions.
            differences = [np.abs(np.array(entry["samples"]) - fingerprint) for entry in same_size]
            nearest = int(np.argmin([delta.mean() for delta in differences]))
            if differences[nearest].mean() > 6 or differences[nearest].max() > 40:
                continue
            variants.append({"size": list(image.size), "samples": fingerprint, "trim": same_size[nearest]["trim"]})
            added += 1
    return added


def generate(root: Path, fan_packs=()) -> tuple[dict, dict]:
    sys.path.insert(0, str(root / "asset-studio"))
    from app import official_assets
    official_assets.SCAN_CACHE_SECONDS = 3600
    data = {"version": 1, "sampleGrid": GRID, "tolerance": TOLERANCE, "images": {}}
    report = {"scanned": 0, "protectedOfficial": [], "trimmed": []}
    for path, target in candidate_paths(root):
        image = open_rgb(path)
        report["scanned"] += 1
        trim = detect_trims(image)
        if not any(trim):
            continue
        fingerprint = samples(image)
        official = official_assets.find(root, target)
        if official:
            official_image = open_rgb(official)
            if official_image.size == image.size and all(
                    abs(a - b) <= TOLERANCE for a, b in zip(fingerprint, samples(official_image))):
                report["protectedOfficial"].append(target)
                continue
        entry = {"size": list(image.size), "samples": fingerprint, "trim": trim}
        data["images"][target] = [entry]
        report["trimmed"].append({"path": target, "size": list(image.size), "trim": trim})
        preview = path.with_name(path.name + ".preview.jpg")
        if preview.is_file() and not preview.is_symlink() and preview.stat().st_mtime_ns >= path.stat().st_mtime_ns:
            small = open_rgb(preview)
            scale = [small.height / image.height, small.width / image.width] * 2
            data["images"][target + ".preview.jpg"] = [{"size": list(small.size),
                "samples": samples(small), "trim": [round(value * factor, 5) for value, factor in zip(trim, scale)]}]
    report["packVariants"] = sum(add_pack_variants(data, Path(pack)) for pack in fan_packs)
    return data, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=ROOT / "assets/fan-card-trims-data.js")
    parser.add_argument("--report", type=Path, default=ROOT / "output/fan-card-trims-report.json")
    parser.add_argument("--fan-pack", type=Path, action="append", default=[], help="Also recognize this compressed fan .atopack")
    args = parser.parse_args()
    data, report = generate(args.root.resolve(), args.fan_pack)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("// Generated by tools/generate_fan_card_trims.py; original images are unchanged.\n"
        + "globalThis.ATO_FAN_CARD_TRIMS = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"scanned": report["scanned"], "trimmed": len(report["trimmed"]),
        "protectedOfficial": len(report["protectedOfficial"]), "variants": len(data["images"]),
        "packVariants": report["packVariants"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
