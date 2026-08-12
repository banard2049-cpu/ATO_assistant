#!/usr/bin/env python3
"""Synchronize newer non-media Web files from an ATO APK into the source tree.

The operation is allowlisted, creates a durable backup, and deliberately skips
story payloads and media so copyrighted content is not copied into the source.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath


WEB_PREFIX = "assets/web/"
ALLOWED_SUFFIXES = {".html", ".js", ".css", ".json"}
EXCLUDED_PREFIXES = (
    "story/data/",
    "asset-studio/",
)
EXCLUDED_PARTS = {
    "images", "audio", "audio-packs", "battle-images", "c1-battle-images",
    "c3-battle-images", "tokens",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def allowed(relative: str) -> bool:
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts or path.suffix.lower() not in ALLOWED_SUFFIXES:
        return False
    if relative.startswith(EXCLUDED_PREFIXES) or any(part in EXCLUDED_PARTS for part in path.parts):
        return False
    # The APK contains two mojibake backup copies of this generated file.
    if path.parent.as_posix() == "map" and path.name.startswith("map-tile-tags - "):
        return False
    return True


def safe_target(root: Path, relative: str) -> Path:
    target = (root / Path(*PurePosixPath(relative).parts)).resolve()
    if root != target and root not in target.parents:
        raise ValueError(f"目标路径越界：{relative}")
    return target


def sync(apk: Path, root: Path) -> dict:
    root = root.resolve()
    if not (root / "index.html").is_file() or not (root / "asset-studio").is_dir():
        raise ValueError("目标不是当前 ATO_assistant 工作区")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = root / "asset-studio" / ".local" / "backups" / f"apk-sync-{stamp}"
    changed: list[dict] = []
    added: list[dict] = []
    unchanged: list[str] = []
    with zipfile.ZipFile(apk) as archive:
        candidates = sorted(
            (
                info for info in archive.infolist()
                if not info.is_dir()
                and info.filename.startswith(WEB_PREFIX)
                and allowed(info.filename[len(WEB_PREFIX):])
            ),
            key=lambda info: info.filename,
        )
        for info in candidates:
            relative = info.filename[len(WEB_PREFIX):]
            target = safe_target(root, relative)
            incoming = archive.read(info)
            previous = target.read_bytes() if target.is_file() else None
            if previous is None and PurePosixPath(relative).suffix.lower() == ".js":
                # Keep APK-only Android shims and generated JS out of the Web source tree.
                unchanged.append(f"SKIPPED_NEW_JS:{relative}")
                continue
            if PurePosixPath(relative).suffix.lower() == ".html":
                text = incoming.decode("utf-8-sig")
                text = re.sub(
                    r'^\s*<script src="(?:\.\./|\./)*android-local-api\.js"></script>\s*\r?\n',
                    "", text, flags=re.MULTILINE,
                )
                incoming = text.encode("utf-8")
            if previous == incoming:
                unchanged.append(relative)
                continue
            if previous is not None:
                backup_target = safe_target(backup, relative)
                backup_target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup_target)
                bucket = changed
            else:
                bucket = added
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".apk-sync-", delete=False) as temp:
                temp.write(incoming)
                temp_path = Path(temp.name)
            os.replace(temp_path, target)
            bucket.append({
                "path": relative,
                "beforeSha256": digest(previous) if previous is not None else None,
                "afterSha256": digest(incoming),
                "bytes": len(incoming),
            })
    report = {
        "sourceApk": str(apk),
        "backup": str(backup),
        "changed": changed,
        "added": added,
        "unchanged": unchanged,
        "excluded": {
            "storyPayloads": "story/data/",
            "media": sorted(EXCLUDED_PARTS),
        },
    }
    backup.mkdir(parents=True, exist_ok=True)
    (backup / "sync-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("apk", type=Path)
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    report = sync(args.apk.expanduser().resolve(), args.root.expanduser().resolve())
    print(json.dumps({
        "backup": report["backup"],
        "changed": [entry["path"] for entry in report["changed"]],
        "added": [entry["path"] for entry in report["added"]],
        "unchanged": len(report["unchanged"]),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
