#!/usr/bin/env python3
"""Developer utility: build a complete .atopack from an owned ATO APK.

混合媒体素材（``story/assets/mixed-media/``）：APK 不打包私有素材（``tools/packaging/
package_common.py`` 按目录排除），所以这条通道优先从 ``--overlay-root``（本地工程
目录）取 ``mapping.js`` 与 ``images/c1..c5/*.png|.svg``；工程里没有时，再看 APK 里是否
留着历史副本（老包把它们放在 ``assets/web/story/assets/mixed-media/`` 下）。两边都没有
就不写 ``mixedMediaFiles`` 段，并在 stdout 明确提示——**这是已知缺口，不会静默漏**：
需要这条段的包请先用素材库导入一份带该段的 .atopack，再带 ``--overlay-root`` 重跑。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from app.bgm_resources import allowed_target as is_bgm_target  # noqa: E402
from app.cryptic_resources import allowed_target as is_cryptic_target  # noqa: E402
from app.cryptic_resources import add_to_archive as add_cryptic_to_archive  # noqa: E402
from app.mixed_media_resources import add_to_archive as add_mixed_media_to_archive  # noqa: E402
from app.official_resources import add_to_archive
from app.official_assets import resolve as resolve_official_asset  # noqa: E402
from app.fixed_catalog import fixed_catalog_payload  # noqa: E402
from app.card_previews import BOARD_SOURCE, LEGACY_BOARD_SOURCE, add_to_archive as add_card_preview, is_preview_source  # noqa: E402
from app.packages import PACKAGE_VERSION, safe_member  # noqa: E402
from app.map_resources import collect as collect_map_files, covered_targets as covered_map_targets
from app.map_resources import add_to_archive as add_map_to_archive
from app.story_extras import (  # noqa: E402
    ENTITY_INDEX_JSON_TARGET,
    ENTITY_INDEX_JS_TARGET,
    ENTITY_INDEX_MEMBER,
    entity_index_javascript,
    entity_index_manifest_entry,
    parse_entity_index,
)


CHUNK = 4 * 1024 * 1024
STORY_MEMBER = "assets/web/story/data/storybook-data.js"
STORYBOOK_DATA_MEMBER = "story/data/storybook-data.js"


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


def build(
    apk_path: Path, destination: Path, overlay_root: Path | None = None,
    include_official_scans: bool = False, include_cryptic: bool = True,
    include_mixed_media: bool = True,
) -> dict:
    fixed = fixed_catalog_payload()
    items = [{**item, "faces": {face: target for face, target in item["faces"].items()
                              if not is_cryptic_target(target)}} for item in fixed["items"]]
    items = [item for item in items if item["faces"]]
    faces = [
        (item, face, target)
        for item in items
        for face, target in item["faces"].items()
        # BGM 音频不在 APK 里（也不在完整素材包里）：它由使用者自备，
        # 通过导出资料包时的 bgmFiles 段分发，见 app/bgm_resources.py。
        if not is_bgm_target(target)
    ]
    map_files = collect_map_files(overlay_root, targets=[target for _, _, target in faces])
    covered_maps = covered_map_targets(map_files, [target for _, _, target in faces])
    faces = [(item, face, target) for item, face, target in faces if target not in covered_maps]
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".partial")
    partial.unlink(missing_ok=True)
    assets = []
    try:
        with zipfile.ZipFile(apk_path) as source_zip, zipfile.ZipFile(
            partial, "w", compression=zipfile.ZIP_STORED, allowZip64=True
        ) as output_zip:
            source_members = normalized_member_lookup(source_zip)
            # Old APKs keep the board next to the second-screen program files.
            if f"assets/web/{BOARD_SOURCE}" not in source_members and f"assets/web/{LEGACY_BOARD_SOURCE}" in source_members:
                source_members[f"assets/web/{BOARD_SOURCE}"] = source_members[f"assets/web/{LEGACY_BOARD_SOURCE}"]
            overlay_files = {}
            overlay_flags = {}
            for _, _, target in faces:
                fallback = overlay_root / Path(*PurePosixPath(target).parts) if overlay_root is not None else Path()
                if target == BOARD_SOURCE and overlay_root is not None and not fallback.is_file():
                    fallback = overlay_root / LEGACY_BOARD_SOURCE
                source, overridden = resolve_official_asset(overlay_root, target, fallback)
                overlay_files[target] = source
                overlay_flags[target] = overridden
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

            storybook_raw = source_zip.read(STORY_MEMBER)
            stories = parse_story(storybook_raw)
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
                "version": 2,
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
                    "officialAssets": sum(1 for value in overlay_flags.values() if value),
                    # 民间版资源包默认不带官方版故事书截图；只有显式要求时才打包。
                    "officialScans": include_official_scans,
                    "audioIncluded": False,
                },
            }
            output_zip.writestr(ENTITY_INDEX_MEMBER, entity_index.json_bytes)
            # Keep the project-relative story/data files in the resource pack.
            # The Android importer still regenerates them, but retaining them
            # makes the .atopack self-contained for desktop reconstruction.
            output_zip.writestr(STORYBOOK_DATA_MEMBER, storybook_raw)
            output_zip.writestr(
                "story/data/entity-index.json", entity_index.json_bytes
            )
            output_zip.writestr(
                "story/data/entity-index.js",
                entity_index_javascript(entity_index),
            )
            add_to_archive(
                output_zip, manifest, overlay_root,
                include_scans=include_official_scans,
            )
            cryptic_count = add_cryptic_to_archive(
                output_zip, manifest, overlay_root,
                fallback_archive=source_zip, fallback_prefix="assets/web/",
            ) if include_cryptic else 0
            manifest["build"]["crypticIncluded"] = bool(cryptic_count)
            # 混合媒体（私有映射表 + 书籍裁图）：与字形同一套来源顺序——先工程覆盖目录，
            # 再 APK 里的历史副本（老包把私有素材放在 assets/web/ 下）。
            mixed_media_count = add_mixed_media_to_archive(
                output_zip, manifest, overlay_root,
                fallback_archive=source_zip, fallback_prefix="assets/web/",
            ) if include_mixed_media else 0
            manifest["build"]["mixedMediaIncluded"] = bool(mixed_media_count)
            if include_mixed_media and not mixed_media_count:
                # 已知缺口：APK 一般不打包私有素材，工程覆盖目录也没有时这条段就是空的。
                print(
                    "提示：没有找到混合媒体素材（--overlay-root 与 APK 里都没有），"
                    "本包不含 mixedMediaFiles 段；需要时先用素材库导入带该段的 .atopack 再重跑。",
                    flush=True,
                )
            preview_entries = []
            for member in sorted({asset["member"] for asset in assets if is_preview_source(asset["member"])}):
                add_card_preview(output_zip, member, output_zip.read(member), preview_entries)
            manifest["cardPreviewFiles"] = preview_entries
            add_map_to_archive(output_zip, manifest, files=map_files)
            output_zip.writestr(
                "manifest.json",
                json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
            )
        last_error = None
        for attempt in range(12):
            try:
                os.replace(partial, destination)
                last_error = None
                break
            except PermissionError as error:
                last_error = error
                time.sleep(2)
        if last_error is not None:
            raise last_error
    except Exception:
        raise
    return {
        "path": str(destination),
        "items": len(items),
        "assets": len(assets),
        "books": len(stories.get("books", [])),
        "stories": sum(len(book.get("entries", [])) for book in stories.get("books", [])),
        "entities": entity_index.entity_count,
        "official_assets": sum(1 for value in overlay_flags.values() if value),
        "official_files": len(manifest.get("resourceFiles", [])),
        "cryptic_files": cryptic_count,
        "mixed_media_files": mixed_media_count,
        "map_files": len(manifest.get('mapFiles', [])),
        "bytes": destination.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("apk", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument(
        "--overlay-root",
        type=Path,
        help="优先读取 ATO_assistant 根目录中的修正版素材；其中 official-assets/ 官中图片优先级最高",
    )
    parser.add_argument(
        "--include-official-scans",
        action="store_true",
        help="构建官方版资料包：把官方版故事书截图（story/data/ato-storybook-key-scans/*，"
             "后缀 .jpg/.jpeg/.png/.webp 均可，不限大小写）一起打包。"
             "默认不打包截图，只带官方故事书正文数据。",
    )
    parser.add_argument("--no-cryptic", action="store_true", help="不带密语字形")
    parser.add_argument(
        "--no-mixed-media", action="store_true",
        help="不带混合媒体素材（story/assets/mixed-media/ 下的映射表与裁图）",
    )
    args = parser.parse_args()
    result = build(
        args.apk.expanduser().resolve(),
        args.destination.expanduser().resolve(),
        args.overlay_root.expanduser().resolve() if args.overlay_root else None,
        args.include_official_scans,
        not args.no_cryptic,
        not args.no_mixed_media,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
