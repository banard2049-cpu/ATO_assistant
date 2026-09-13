"""Official story data and scans carried verbatim in .atopack files."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

DATA = "story/data/storybook-official-data.js"
SCANS = "story/data/ato-storybook-key-scans/"
LIBRARY = Path("sources/official-resources")


def allowed_target(target: str) -> bool:
    return target == DATA or bool(re.fullmatch(re.escape(SCANS) + r"c[123]-[A-Za-z0-9_-]+\.jpg", target))


def collect(root: Path | None) -> list[tuple[str, Path]]:
    if root is None or not (root / DATA).is_file():
        return []
    import json
    text = (root / DATA).read_text(encoding="utf-8-sig")
    prefix = "window.STORYBOOK_OFFICIAL_DATA = "
    if not text.startswith(prefix):
        raise ValueError("官方故事书数据格式无法识别")
    payload = json.loads(text[len(prefix):].strip().removesuffix(";"))
    targets = {DATA}
    for book in payload["books"]:
        for entry in book["entries"]:
            src = (entry.get("officialScan") or {}).get("src")
            if src:
                target = "story/" + src.removeprefix("./")
                if not allowed_target(target) or not (root / target).is_file():
                    raise ValueError(f"官方截图缺失或路径无效：{target}")
                targets.add(target)
    return [(target, root / target) for target in sorted(targets)]


def add_to_archive(archive, manifest: dict, root: Path | None, fallback=None, fallback_manifest=None) -> None:
    files = collect(root)
    manifest["resourceFiles"] = []
    if files:
        for target, path in files:
            raw = path.read_bytes()
            archive.writestr(target, raw)
            manifest["resourceFiles"].append({"target": target, "member": target,
                "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
    elif fallback is not None:
        for item in (fallback_manifest or {}).get("resourceFiles", []):
            raw = checked_bytes(fallback, item)
            archive.writestr(item["target"], raw)
            manifest["resourceFiles"].append(item)
    if manifest["resourceFiles"]:
        manifest["version"] = max(3, manifest["version"])


def checked_bytes(archive, item: dict) -> bytes:
    target = item.get("target", "")
    if not allowed_target(target) or item.get("member") != target:
        raise ValueError(f"不支持的官方资料路径：{target}")
    if archive.getinfo(target).file_size > 128 * 1024 * 1024:
        raise ValueError(f"官方资料文件过大：{target}")
    raw = archive.read(target)
    if hashlib.sha256(raw).hexdigest() != item.get("sha256"):
        raise ValueError(f"官方资料校验失败：{target}")
    return raw


def import_resources(archive, manifest: dict, library: Path, replace: bool) -> None:
    for item in manifest.get("resourceFiles", []):
        raw = checked_bytes(archive, item)
        target = library / LIBRARY / item["target"]
        if target.exists() and not replace:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
