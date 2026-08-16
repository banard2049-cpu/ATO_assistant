#!/usr/bin/env python3
"""Rebuild a complete .atopack from a prior full pack and project overlays."""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from app.fixed_catalog import fixed_catalog_payload  # noqa: E402
from app.packages import PACKAGE_VERSION  # noqa: E402


CHUNK = 4 * 1024 * 1024


def copy_stream(source, destination, digest) -> None:
    while chunk := source.read(CHUNK):
        digest.update(chunk)
        destination.write(chunk)


def update_full_pack(base_pack: Path, destination: Path, overlay_root: Path) -> dict:
    if base_pack == destination:
        raise ValueError("输出资料包不能覆盖输入资料包")
    if destination.exists():
        raise FileExistsError(f"输出资料包已存在：{destination}")

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
    overlay_count = 0
    reused_count = 0
    try:
        with zipfile.ZipFile(base_pack) as source_zip:
            source_manifest = json.loads(source_zip.read("manifest.json").decode("utf-8"))
            if source_manifest.get("format") != "ato-asset-pack":
                raise ValueError("输入文件不是有效的 ATO 素材包")
            if int(source_manifest.get("version", 0)) > PACKAGE_VERSION:
                raise ValueError("输入素材包版本高于当前工具支持的版本")

            old_assets = {
                (asset["itemId"], asset["face"]): asset
                for asset in source_manifest.get("assets", [])
            }
            with zipfile.ZipFile(
                partial, "w", compression=zipfile.ZIP_STORED, allowZip64=True
            ) as output_zip:
                for index, (item, face, target) in enumerate(faces, 1):
                    suffix = PurePosixPath(target).suffix.lower()
                    member = f"assets/full/{index:05d}{suffix}"
                    overlay = overlay_root / Path(*PurePosixPath(target).parts)
                    old_asset = old_assets.get((item["id"], face))
                    digest = hashlib.sha256()

                    if overlay.is_file():
                        source = overlay.open("rb")
                        overlay_count += 1
                    elif old_asset:
                        source = source_zip.open(old_asset["member"])
                        reused_count += 1
                    else:
                        raise ValueError(
                            f"新增资源缺少本地文件，旧包也无可复用内容：{target}"
                        )

                    with source, output_zip.open(member, "w", force_zip64=True) as output:
                        copy_stream(source, output, digest)
                    sha256 = digest.hexdigest()
                    if not overlay.is_file() and old_asset and sha256 != old_asset["sha256"]:
                        raise ValueError(f"旧包资源哈希不匹配：{old_asset['member']}")
                    assets.append({
                        "itemId": item["id"],
                        "face": face,
                        "sha256": sha256,
                        "member": member,
                        "mimeType": mimetypes.guess_type(target)[0] or "application/octet-stream",
                        "originalName": PurePosixPath(target).name,
                    })
                    if index == 1 or index % 100 == 0 or index == len(faces):
                        print(f"图片 {index}/{len(faces)}", flush=True)

                for story_file in source_manifest.get("storyFiles", []):
                    member = story_file.get("member")
                    if member:
                        with source_zip.open(member) as source, output_zip.open(
                            member, "w", force_zip64=True
                        ) as output:
                            digest = hashlib.sha256()
                            copy_stream(source, output, digest)
                        if digest.hexdigest() != story_file.get("sha256"):
                            raise ValueError(f"故事附加文件哈希不匹配：{member}")

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
                    "stories": source_manifest.get("stories", {"books": []}),
                    "storyFiles": source_manifest.get("storyFiles", []),
                    "progress": source_manifest.get("progress", {}),
                    "retiredItems": source_manifest.get("retiredItems", []),
                    "build": {
                        **source_manifest.get("build", {}),
                        "kind": "full-resource-pack",
                        "updatedFrom": base_pack.name,
                        "correctedProjectOverlay": True,
                    },
                }
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
        "overlay_assets": overlay_count,
        "reused_assets": reused_count,
        "bytes": destination.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_pack", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--overlay-root", type=Path, required=True)
    args = parser.parse_args()
    result = update_full_pack(
        args.base_pack.expanduser().resolve(),
        args.destination.expanduser().resolve(),
        args.overlay_root.expanduser().resolve(),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
