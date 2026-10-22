"""Measure thin scan lines on fan exploration/AIBP cards without editing images.

The generated display-only trims are gated by original dimensions and 36 exact
interior pixel samples. Official artwork (including shared fan/official images)
must not match a generated entry. Requires Pillow and NumPy.
"""
from __future__ import annotations

import argparse
import hashlib
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

# This scan has a gray halo behind its thin black cut line. The automatic
# detector deliberately stops at the black line to preserve printed artwork.
# Keep the reviewed measurement tied to the exact source bytes so replacing
# the card (especially with official artwork) cannot inherit this deeper trim.
REVIEWED_SCANS = {
    "aibp/ps/DEMIDJINN/DEMIDJINN.jpg": {
        "size": (6417, 4402),
        "sha256": "4afa1c0ddb70ef8b6b4977dfdb0a5b7d9294b067df44891a8a7e69a5bba1836f",
        "trim": (14, 4, 5, 4),
        # Observed through the runtime's 36-point canvas sampler. This JPEG
        # decodes differently in the browser and Pillow; retain both exact
        # fingerprints instead of relaxing the global channel tolerance.
        "browserSamples": [
            100, 108, 95, 82, 88, 88, 211, 214, 229, 60, 56, 45, 124, 115, 106, 179, 169, 159,
            91, 103, 93, 46, 36, 60, 146, 122, 120, 92, 91, 86, 244, 232, 242, 186, 177, 168,
            109, 85, 37, 42, 59, 66, 116, 112, 111, 148, 149, 118, 132, 128, 119, 174, 163, 159,
            96, 94, 82, 144, 141, 132, 151, 151, 115, 203, 185, 173, 104, 45, 49, 157, 144, 135,
            181, 175, 175, 184, 173, 155, 200, 186, 173, 156, 133, 162, 191, 185, 151, 189, 188, 170,
            187, 180, 172, 207, 191, 178, 211, 197, 184, 201, 188, 180, 128, 123, 117, 133, 133, 109,
        ],
    },
    "aibp/ps/DEMIDJINN/DEMIDJINN.jpg.preview.jpg": {
        "size": (1600, 1098),
        "sha256": "2787232339ec74de51d083ef9b1c6ebc05258eee217b9031ffc074da03b77d50",
        "browserSamples": [
            119, 119, 107, 37, 42, 48, 232, 232, 240, 169, 160, 151, 126, 127, 122, 190, 180, 168,
            110, 112, 109, 66, 58, 55, 107, 110, 99, 70, 69, 74, 149, 150, 152, 191, 181, 171,
            135, 127, 88, 43, 46, 51, 103, 104, 98, 186, 177, 160, 180, 152, 141, 152, 146, 130,
            132, 133, 125, 153, 128, 121, 148, 145, 130, 189, 180, 165, 126, 92, 83, 153, 151, 139,
            178, 168, 158, 180, 172, 161, 202, 190, 176, 124, 125, 127, 189, 180, 165, 185, 178, 159,
            191, 181, 171, 198, 186, 174, 206, 194, 180, 185, 180, 161, 163, 156, 138, 155, 148, 130,
        ],
    },
}


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
    # A white scanner margin outside a dark card face has the opposite polarity
    # to a black cut line. Require a continuous dark face after the margin, so
    # pale card stock, title lettering and printed light panels are retained.
    if (gray[0] > 180).mean() >= .2:
        dark = gray < 120
        first = dark.argmax(axis=0)
        end = int(np.ceil(np.quantile(first, .99)))
        if (0 < end < depth and dark.any(axis=0).mean() >= .995
                and all((gray[row] < 140).mean() >= .97 for row in range(end, end + 4))
                and ((gray[0] - gray[end + 2]) > 70).mean() >= .2):
            return end + 1
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


def reviewed_scan(path: Path, target: str, image: Image.Image) -> dict | None:
    reviewed = REVIEWED_SCANS.get(target)
    if (reviewed and image.size == reviewed["size"]
            and hashlib.sha256(path.read_bytes()).hexdigest() == reviewed["sha256"]):
        return reviewed
    return None


def measured_trims(path: Path, target: str, image: Image.Image) -> list[int]:
    reviewed = reviewed_scan(path, target, image)
    trim = list(reviewed["trim"]) if reviewed and "trim" in reviewed else detect_trims(image)
    if target.startswith('assets/exploration-cards/'):
        trim[0] = max(trim[0], exploration_header_halo(image))
    return trim


def exploration_header_halo(image: Image.Image) -> int:
    """Measure the shallow gray scanner fringe above a black exploration title.

    Only the first four rows qualify, with a broad, consistent brightness drop.
    A light face or isolated title glyphs cannot meet this transition test.
    """
    w, h = image.size
    if min(w, h) < 250:
        return 0
    gray = np.asarray(image.crop((round(w * .08), 0, round(w * .92), 8))).mean(axis=2)
    medians = np.median(gray, axis=1)
    if not (35 < medians[0] < 150 and medians[3:7].min() < medians[0] * .55):
        return 0
    for row in range(1, 5):
        if (medians[row] < medians[0] * .55
                and ((gray[0] - gray[row]) > 12).mean() >= .7):
            return row + 1
    return 0


def fingerprint_variants(path: Path, target: str, image: Image.Image, trim: list) -> list[dict]:
    variants = [{"size": list(image.size), "samples": samples(image), "trim": trim}]
    # These titles can begin immediately below the measured halo. Do not add
    # the ordinary extra screen pixel (several source pixels in a thumbnail).
    if target.startswith('assets/exploration-cards/') and exploration_header_halo(image):
        variants[0]['guards'] = {'top': 0}
    reviewed = reviewed_scan(path, target, image)
    if reviewed and "browserSamples" in reviewed:
        variants.append({"size": list(image.size), "samples": reviewed["browserSamples"], "trim": trim})
    return variants


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
            variant = {"size": list(image.size), "samples": fingerprint, "trim": same_size[nearest]["trim"]}
            if 'guards' in same_size[nearest]:
                variant['guards'] = same_size[nearest]['guards']
            variants.append(variant)
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
        trim = measured_trims(path, target, image)
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
        data["images"][target] = fingerprint_variants(path, target, image, trim)
        report["trimmed"].append({"path": target, "size": list(image.size), "trim": trim})
        preview = path.with_name(path.name + ".preview.jpg")
        if preview.is_file() and not preview.is_symlink() and preview.stat().st_mtime_ns >= path.stat().st_mtime_ns:
            small = open_rgb(preview)
            scale = [small.height / image.height, small.width / image.width] * 2
            small_trim = [round(value * factor, 5) for value, factor in zip(trim, scale)]
            data["images"][target + ".preview.jpg"] = fingerprint_variants(
                preview, target + ".preview.jpg", small, small_trim)
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
