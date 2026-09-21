"""Measure the real cost of one image re-encode, using the packer's own code.

The packer's --image-quality path (the "q85" in the output filename) calls
image_shrink.shrink_image() for every image member. That function does much more
than a resize: full decode, alpha extraction, optional 256-colour quantisation,
PNG encode at compress_level=9, a *second* decode to verify the alpha bytes, and
for opaque images a JPEG encode with optimize=True + progressive=True. This
script times that exact code path on real assets so the packing rate can be
explained with numbers instead of guesses.

Run with the asset-studio venv python (Pillow lives there):
    .venv/Scripts/python.exe bench-shrink.py --ato-root D:\\desktop\\ATO_assistant
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from image_shrink import ShrinkStats, shrink_image  # noqa: E402

REPORT = TOOLS.parent.parent / "tools" / "guide-capture" / "bench-shrink-report.json"


def pick_samples(ato_root: Path, limit: int) -> list[Path]:
    """Largest images on disk, where decode/encode cost dominates."""
    candidates: list[Path] = []
    for pattern in ("official-assets/**/*", "story/data/ato-storybook-key-scans/**/*",
                    "aibp/**/*", "technology/**/*", "hero/**/*"):
        for path in ato_root.glob(pattern):
            if path.is_file() and path.suffix.casefold() in {".png", ".jpg", ".jpeg", ".webp"}:
                candidates.append(path)
    candidates.sort(key=lambda p: p.stat().st_size, reverse=True)
    # spread across size classes instead of only the top few
    step = max(1, len(candidates) // max(limit, 1))
    return candidates[::step][:limit]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ato-root", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--quality", type=int, default=85)
    parser.add_argument("--repeat", type=int, default=2)
    args = parser.parse_args()

    samples = pick_samples(args.ato_root, args.limit)
    if not samples:
        print("no sample images found", file=sys.stderr)
        return 1

    rows = []
    for path in samples:
        data = path.read_bytes()
        times = []
        kept = None
        for _ in range(args.repeat):
            stats = ShrinkStats()
            start = time.perf_counter()
            payload = shrink_image(data, args.quality, member=path.name, stats=stats)
            times.append(time.perf_counter() - start)
            kept = payload
        best = min(times)
        out_bytes = len(kept) if kept is not None else len(data)
        rows.append({
            "file": str(path),
            "rel": str(path.relative_to(args.ato_root)).replace("\\", "/"),
            "in_bytes": len(data),
            "out_bytes": out_bytes,
            "reencoded": kept is not None,
            "seconds": round(best, 4),
            "mb_per_s": round(len(data) / best / 1_000_000, 2) if best else None,
        })

    total_seconds = sum(r["seconds"] for r in rows)
    total_in = sum(r["in_bytes"] for r in rows)
    report = {
        "quality": args.quality,
        "samples": rows,
        "summary": {
            "count": len(rows),
            "median_seconds": round(statistics.median(r["seconds"] for r in rows), 4),
            "mean_seconds": round(statistics.mean(r["seconds"] for r in rows), 4),
            "aggregate_mb_per_s": round(total_in / total_seconds / 1_000_000, 2) if total_seconds else None,
            "reencoded_share": round(sum(1 for r in rows if r["reencoded"]) / len(rows), 2),
        },
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {REPORT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
