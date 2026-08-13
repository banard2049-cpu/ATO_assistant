from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path, PurePosixPath

from .db import Database
from .storage import sha256_file, write_compatible_image
from .stories import storybook_payload


STORY_PREFIX = "window.STORYBOOK_DATA = "
DIRECT_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def package_original_can_install_directly(row: dict, relative: str) -> bool:
    if row.get("source") != "package":
        return False
    source_suffix = Path(row.get("original_name") or row["original_path"]).suffix.lower()
    target_suffix = PurePosixPath(relative).suffix.lower()
    normalize = lambda suffix: ".jpg" if suffix == ".jpeg" else suffix
    return source_suffix in DIRECT_IMAGE_SUFFIXES and target_suffix in DIRECT_IMAGE_SUFFIXES


def merged_storybook_javascript(db: Database, target: Path | None = None) -> bytes:
    incoming = storybook_payload(db, reviewed_only=True, omit_empty=True)
    existing = {"books": []}
    existing_valid = True
    if target and target.is_file():
        text = target.read_text(encoding="utf-8-sig")
        match = re.match(r"\s*window\.STORYBOOK_DATA\s*=\s*(.*);\s*$", text, re.S)
        if match:
            try:
                existing = json.loads(match.group(1))
            except json.JSONDecodeError:
                existing_valid = False
        elif target.stat().st_size:
            existing_valid = False
    if not existing_valid:
        raise ValueError("原项目故事索引格式无法识别；为防止丢失内容，已停止安装")
    incoming_ids = {book.get("id") for book in incoming.get("books", [])}
    books = [book for book in existing.get("books", []) if book.get("id") not in incoming_ids]
    books.extend(incoming.get("books", []))
    payload = {**existing, **incoming, "books": books}
    return f"{STORY_PREFIX}{json.dumps(payload, ensure_ascii=False, separators=(',', ':'))};\n".encode("utf-8")


def validate_target(root: Path) -> Path:
    root = root.expanduser().resolve()
    if not root.is_dir() or not (root / "index.html").is_file():
        raise ValueError("所选目录不是有效的 ATO_assistant 根目录")
    expected = sum(int((root / child).exists()) for child in ("aibp", "map", "story", "technology"))
    if expected < 3:
        raise ValueError("ATO_assistant 目录结构不完整")
    return root


def safe_target(root: Path, relative: str) -> Path:
    root = root.expanduser().resolve()
    pure = PurePosixPath(relative)
    if pure.is_absolute() or ".." in pure.parts:
        raise ValueError(f"不安全的目标路径：{relative}")
    target = (root / Path(*pure.parts)).resolve()
    if root != target and root not in target.parents:
        raise ValueError(f"目标路径越界：{relative}")
    return target


def install_plan(db: Database, library: Path, root: Path) -> dict:
    root = validate_target(root)
    rows = db.all("""
      SELECT a.*,c.name,c.faces_json FROM asset_revisions a JOIN catalog_items c ON c.id=a.item_id
      WHERE a.is_current=1 ORDER BY c.cycle,c.module,c.sort_order,a.face
    """)
    files = []
    summary = {"add": 0, "same": 0, "replace": 0}
    for row in rows:
        relative = json.loads(row["faces_json"]).get(row["face"])
        if not relative:
            continue
        destination = safe_target(root, relative)
        direct_copy = package_original_can_install_directly(row, relative)
        source_rel = row["original_path"] if row["source"] == "package" else row["preview_path"]
        source = library / source_rel
        if destination.exists():
            if direct_copy:
                status = "same" if sha256_file(destination) == row["sha256"] else "replace"
            else:
                with tempfile.TemporaryDirectory() as temp_dir:
                    rendered = Path(temp_dir) / destination.name
                    write_compatible_image(source, rendered)
                    status = "same" if sha256_file(destination) == sha256_file(rendered) else "replace"
        else:
            status = "add"
        summary[status] += 1
        files.append({"item_id": row["item_id"], "name": row["name"], "face": row["face"], "source": source_rel, "target": relative, "status": status, "direct_copy": direct_copy})
    story_count = db.one("SELECT COUNT(*) AS n FROM story_segments WHERE reviewed=1")["n"]
    if story_count:
        relative = "story/data/storybook-data.js"
        destination = safe_target(root, relative)
        payload = merged_storybook_javascript(db, destination)
        status = "add" if not destination.exists() else ("same" if destination.read_bytes() == payload else "replace")
        summary[status] += 1
        files.append({"item_id": "stories", "name": "故事索引", "face": "data", "source": "generated", "target": relative, "status": status})
    return {"root": str(root), "summary": summary, "files": files}


def apply_install(db: Database, library: Path, root: Path, replacements: list[str]) -> dict:
    plan = install_plan(db, library, root)
    root = Path(plan["root"])
    allowed_replace = set(replacements)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_root = library / "backups" / stamp
    installed = skipped = 0
    completed: list[tuple[Path, Path | None]] = []
    try:
        for entry in plan["files"]:
            if entry["status"] == "same":
                skipped += 1
                continue
            if entry["status"] == "replace" and entry["target"] not in allowed_replace:
                skipped += 1
                continue
            target = safe_target(root, entry["target"])
            target.parent.mkdir(parents=True, exist_ok=True)
            backup = None
            if target.exists():
                backup = safe_target(backup_root, entry["target"])
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup)
            temporary = target.with_name(f".{target.stem}.ato-studio.tmp{target.suffix}")
            if entry["source"] == "generated":
                temporary.write_bytes(merged_storybook_javascript(db, target))
            elif entry.get("direct_copy"):
                shutil.copy2(library / entry["source"], temporary)
            else:
                write_compatible_image(library / entry["source"], temporary)
            os.replace(temporary, target)
            completed.append((target, backup))
            installed += 1
    except Exception:
        for target, backup in reversed(completed):
            if backup and backup.exists():
                shutil.copy2(backup, target)
            elif target.exists():
                target.unlink()
        raise
    return {"installed": installed, "skipped": skipped, "backup": str(backup_root) if installed else ""}
