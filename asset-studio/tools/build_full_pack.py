#!/usr/bin/env python3
"""Developer utility: build a complete .atopack from an owned ATO APK."""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from app.fixed_catalog import fixed_catalog_payload  # noqa: E402
from app.packages import PACKAGE_VERSION, safe_member  # noqa: E402
from app.story_extras import (  # noqa: E402
    ENTITY_INDEX_JSON_TARGET,
    ENTITY_INDEX_JS_TARGET,
    ENTITY_INDEX_MEMBER,
    entity_index_manifest_entry,
    parse_entity_index,
)


CHUNK = 4 * 1024 * 1024
STORY_MEMBER = "assets/web/story/data/storybook-data.js"


def parse_story(raw: bytes) -> dict:
    text = raw.decode("utf-8-sig")
    match = re.match(r"\s*window\.STORYBOOK_DATA\s*=\s*(.*);\s*$", text, re.S)
    if not match:
        raise ValueError("APK 中的故事索引格式无法识别")
    return json.loads(match.group(1))


def normalized_member_lookup(archive: zipfile.ZipFile) -> dict[str, str]:
    """Map intended UTF-8 paths to their actual APK ZIP member names."""
    result: dict[str, str] = {}
    for actual in archive.namelist():
        result.setdefault(actual, actual)
        try:
            decoded = actual.encode("cp437").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        result.setdefault(decoded, actual)
    return result


def load_entity_index(
    archive: zipfile.ZipFile,
    source_members: dict[str, str],
    overlay_root: Path | None,
):
    for target in (ENTITY_INDEX_JSON_TARGET, ENTITY_INDEX_JS_TARGET):
        overlay = overlay_root / Path(*PurePosixPath(target).parts) if overlay_root else None
        if overlay is not None and overlay.is_file():
            return parse_entity_index(overlay.read_bytes(), overlay)
        member = f"assets/web/{target}"
        if member in source_members:
            return parse_entity_index(archive.read(source_members[member]), Path(target))
    raise ValueError("完整资料包缺少人物小传索引")


def build(apk_path: Path, destination: Path, overlay_root: Path | None = None) -> dict:
    fixed = fixed_catalog_payload()
    items = fixed["items"]
    faces = [
        (item, face, target)
        for item in items
        for face, target in item["faces"].items()
    ]
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".partial")
    partial.unlink(missing_ok=True)
    assets = []
    try:
        with zipfile.ZipFile(apk_path) as source_zip, zipfile.ZipFile(
            partial, "w", compression=zipfile.ZIP_STORED, allowZip64=True
        ) as output_zip:
            source_members = normalized_member_lookup(source_zip)
            overlay_files = {
                target: overlay_root / Path(*PurePosixPath(target).parts)
                for _, _, target in faces
                if overlay_root is not None
            }
            required = {
                f"assets/web/{target}"
                for _, _, target in faces
                if not overlay_files.get(target, Path()).is_file()
            }
            missing = sorted(required - source_members.keys())
            if missing:
                raise ValueError(f"APK 缺少 {len(missing)} 个固定清单文件，首个为：{missing[0]}")

            for index, (item, face, target) in enumerate(faces, 1):
                overlay_file = overlay_files.get(target)
                # Preserve the original project-relative resource path and
                # filename in the archive; manifest hashes remain the
                # canonical identity for deduplication and verification.
                member = str(safe_member(target))
                digest = hashlib.sha256()
                source = (
                    overlay_file.open("rb")
                    if overlay_file is not None and overlay_file.is_file()
                    else source_zip.open(source_members[f"assets/web/{target}"])
                )
                with source, output_zip.open(
                    member, "w", force_zip64=True
                ) as output:
                    while chunk := source.read(CHUNK):
                        digest.update(chunk)
                        output.write(chunk)
                assets.append({
                    "itemId": item["id"],
                    "face": face,
                    "sha256": digest.hexdigest(),
                    "member": member,
                    "mimeType": mimetypes.guess_type(target)[0] or "application/octet-stream",
                    "originalName": PurePosixPath(target).name,
                })
                if index == 1 or index % 100 == 0 or index == len(faces):
                    print(f"图片 {index}/{len(faces)}", flush=True)

            stories = parse_story(source_zip.read(STORY_MEMBER))
            entity_index = load_entity_index(source_zip, source_members, overlay_root)
            story_review = [
                {
                    "book_id": str(book.get("id") or ""),
                    "entry_number": str(entry.get("id") or ""),
                    "chapter_key": str(entry.get("chapterKey") or "main"),
                    "reviewed": 1,
                }
                for book in stories.get("books", [])
                for entry in book.get("entries", [])
            ]
            manifest_items = [
                {**item, "source_version": fixed["source"]["catalog_version"]}
                for item in items
            ]
            manifest = {
                "format": "ato-asset-pack",
                "version": PACKAGE_VERSION,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "catalogSource": fixed["source"],
                "items": manifest_items,
                "assets": assets,
                "stories": stories,
                "storyFiles": [entity_index_manifest_entry(entity_index)],
                "progress": {"skippedFaces": [], "storyReview": story_review},
                "retiredItems": [
                    "c3:aibp:hypertime-oracle-ai:hypertime-oracle-ai-iii-007"
                ],
                "build": {
                    "kind": "full-resource-pack",
                    "sourceApk": apk_path.name,
                    "correctedProjectOverlay": bool(overlay_root),
                    "audioIncluded": False,
                },
            }
            output_zip.writestr(ENTITY_INDEX_MEMBER, entity_index.json_bytes)
            output_zip.writestr(
                "manifest.json",
                json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
            )
        os.replace(partial, destination)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    return {
        "path": str(destination),
        "items": len(items),
        "assets": len(assets),
        "books": len(stories.get("books", [])),
        "stories": sum(len(book.get("entries", [])) for book in stories.get("books", [])),
        "entities": entity_index.entity_count,
        "bytes": destination.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("apk", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument(
        "--overlay-root",
        type=Path,
        help="优先读取修正版 ATO_assistant 根目录中的同路径素材",
    )
    args = parser.parse_args()
    result = build(
        args.apk.expanduser().resolve(),
        args.destination.expanduser().resolve(),
        args.overlay_root.expanduser().resolve() if args.overlay_root else None,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
