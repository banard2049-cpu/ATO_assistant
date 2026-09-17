"""Check the Android import allowlist, optionally inside a built APK.

Run: python tools/test_android_resource_catalog.py [path/to/app.apk]
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

from export_android import asset_studio_catalog

ROOT = Path(__file__).resolve().parents[1]


def check_catalog(catalog: dict) -> None:
    assert catalog["format"] == "ato-android-resource-catalog"
    targets = {}
    for item in catalog["items"]:
        for face, target in item["faces"].items():
            key = (item["id"], face)
            assert key not in targets, f"Duplicate Android catalog entry: {key}"
            targets[key] = target

    source = (ROOT / "index.html").read_text(encoding="utf-8")
    block = re.search(r"const hiddenExplorationCards = \{([\s\S]*?)\n    \};", source)
    assert block, "Hidden exploration catalog not found; update this coverage check."
    cycles = re.findall(r"(c\d+):\s*\[([^\]]*)\]", block[1])
    assert {cycle for cycle, _ in cycles} == {"c1", "c2", "c3", "c4", "c5"}
    checked = 0
    for cycle, cards in cycles:
        for card_id in re.findall(r'id:\s*"([^\"]+)"', cards):
            key = (f"{cycle}:exploration:cards:{card_id}", "front")
            expected = f"assets/exploration-cards/{cycle}/{card_id}.png"
            assert targets.get(key) == expected, f"Android import catalog missing/mismatched: {key}"
            checked += 1
    assert checked, "No hidden exploration entries checked."
    print(f"Android resource catalog passed: {len(targets)} mappings, {checked} hidden exploration entries.")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with zipfile.ZipFile(sys.argv[1]) as apk:
            check_catalog(json.loads(apk.read("assets/atopack-catalog.json")))
    else:
        check_catalog(asset_studio_catalog())
