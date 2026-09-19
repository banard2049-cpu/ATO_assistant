#!/usr/bin/env python3
"""Merge per-batch exploration card transcriptions into one effects file.

The card faces are read in batches (each batch is one JSON file with the cards it
covers).  This script folds those batches into the single input the scanner
consumes:

    <input dir>/*.json  ->  tools/exploration-card-effects.json

Each batch file looks like:

    {"cycle": "c1", "cards": [ {key, titleEn, titleZh, cardCode, cornerNumber,
                                lines: [{text, badge}], resourceGains, otherEffects,
                                resourceOnly, confidence, notes}, ... ]}

Usage:
    python tools/merge_exploration_vision.py [--input <dir>]

Defaults to tools/vision-batches (kept out of the repository; the merged result
is what gets committed).  Duplicate cards are reported, and the later batch wins
so a re-read of a batch replaces the earlier attempt.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "tools" / "vision-batches"
OUT_PATH = ROOT / "tools" / "exploration-card-effects.json"

REQUIRED_FIELDS = ("key", "titleEn", "titleZh", "lines")


def card_sort_key(key: str) -> tuple[str, int]:
    cycle, _, card_id = key.partition(":")
    return (cycle, int(card_id) if card_id.isdigit() else 0)


def load_batches(directory: Path) -> tuple[dict[str, dict], list[str]]:
    cards: dict[str, dict] = {}
    duplicates: list[str] = []
    files = sorted(path for path in directory.glob("*.json") if path.is_file())
    if not files:
        print(f"error: no batch JSON files in {directory}", file=sys.stderr)
        raise SystemExit(1)
    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            print(f"error: {path.name} is not valid JSON: {error}", file=sys.stderr)
            raise SystemExit(1)
        for card in payload.get("cards", []):
            key = str(card.get("key") or "").strip()
            if not re.match(r"^c\d+:\d+$", key):
                print(f"error: {path.name} has a card without a valid key: {key!r}", file=sys.stderr)
                raise SystemExit(1)
            missing = [field for field in REQUIRED_FIELDS if field not in card]
            if missing:
                print(f"error: {path.name} card {key} is missing {', '.join(missing)}", file=sys.stderr)
                raise SystemExit(1)
            if key in cards:
                duplicates.append(f"{key} ({path.name})")
            cards[key] = card
    return cards, duplicates


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help=f"batch directory (default: {DEFAULT_INPUT})")
    parser.add_argument("--output", type=Path, default=OUT_PATH, help=f"merged file (default: {OUT_PATH})")
    args = parser.parse_args()

    if not args.input.is_dir():
        print(f"error: {args.input} is not a directory", file=sys.stderr)
        return 1

    cards, duplicates = load_batches(args.input)
    ordered = {key: cards[key] for key in sorted(cards, key=card_sort_key)}
    payload = {
        "version": 1,
        "source": "vision transcription of assets/exploration-cards/<cycle>/<cardId>.png",
        "mergedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "cards": ordered,
    }
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    by_cycle: dict[str, int] = {}
    for key in ordered:
        cycle = key.split(":")[0]
        by_cycle[cycle] = by_cycle.get(cycle, 0) + 1
    print(f"merged {len(ordered)} cards from {args.input}")
    print(f"by cycle: {dict(sorted(by_cycle.items()))}")
    if duplicates:
        print(f"warning: {len(duplicates)} duplicate cards, the last batch won:")
        for entry in duplicates[:10]:
            print(f"  {entry}")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
