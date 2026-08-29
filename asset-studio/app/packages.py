from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from .db import Database
from .storage import store_image, write_compatible_image
from .story_extras import (
    ENTITY_INDEX_KIND,
    ENTITY_INDEX_MAX_BYTES,
    ENTITY_INDEX_MEMBER,
    ENTITY_INDEX_JSON_TARGET,
    ENTITY_INDEX_JS_TARGET,
    entity_index_javascript,
    entity_index_manifest_entry,
    find_entity_index,
    store_entity_index,
)
from .stories import storybook_javascript, storybook_payload


PACKAGE_VERSION = 2


def safe_member(name: str) -> PurePosixPath:
    member = PurePosixPath(name)
    if member.is_absolute() or ".." in member.parts:
        raise ValueError(f"资料包含有不安全路径：{name}")
    return member


Progress = Callable[[int, int, str], None]


def export_package(
    db: Database, library: Path, destination: Path, filters: dict | None = None,
    progress: Progress | None = None, ato_root: Path | None = None,
) -> dict:
    filters = filters or {}
    cycles = set(filters.get("cycles") or [])
    modules = set(filters.get("modules") or [])
    rows = db.all("""
      SELECT a.*,c.cycle,c.module,c.subgroup,c.name,c.number,c.faces_json
      FROM asset_revisions a JOIN catalog_items c ON c.id=a.item_id
      WHERE a.is_current=1 ORDER BY c.cycle,c.module,c.sort_order,a.face
    """)
    rows = [row for row in rows if (not cycles or row["cycle"] in cycles) and (not modules or row["module"] in modules)]
    if filters.get("complete_only"):
        complete_ids = {
            row["id"] for row in db.all("""
              SELECT c.id FROM catalog_items c
              LEFT JOIN asset_revisions a ON a.item_id=c.id AND a.is_current=1
              GROUP BY c.id HAVING COUNT(DISTINCT a.face) >= json_array_length(c.faces_json)
            """)
        }
        rows = [row for row in rows if row["item_id"] in complete_ids]
    items = db.all("SELECT * FROM catalog_items ORDER BY cycle,module,sort_order")
    items = [item for item in items if (not cycles or item["cycle"] in cycles) and (not modules or item["module"] in modules)]
    if filters.get("complete_only"):
        items = [item for item in items if item["id"] in complete_ids]
    selected_ids = {item["id"] for item in items}
    rows = [row for row in rows if row["item_id"] in selected_ids]
    skipped_faces = [row for row in db.all("SELECT item_id,face,updated_at FROM skipped_faces") if row["item_id"] in selected_ids]
    story_review = db.all("SELECT book_id,entry_number,chapter_key,reviewed FROM story_segments")
    stories = storybook_payload(
        db, reviewed_only=True, book_ids=cycles or None, omit_empty=True
    ) if filters.get("include_stories", True) else {"generatedAt": "ATO Asset Studio", "books": []}
    entity_index = find_entity_index(library, ato_root) if stories.get("books") else None
    if stories.get("books") and entity_index is None:
        raise ValueError("人物小传索引缺失；请先设置包含 story/data/entity-index.json 的 ATO_assistant 目录")
    manifest = {
        "format": "ato-asset-pack", "version": PACKAGE_VERSION,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "catalogSource": db.get_meta("catalog_source", {}),
        "items": [
            {**{key: value for key, value in item.items() if key != "faces_json"}, "faces": json.loads(item["faces_json"])}
            for item in items
        ],
        "assets": [],
        "stories": stories,
        "storyFiles": [entity_index_manifest_entry(entity_index)] if entity_index else [],
        "progress": {"skippedFaces": skipped_faces, "storyReview": story_review},
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        written_members: dict[str, str] = {}
        total = max(len(rows), 1)
        for index, row in enumerate(rows, 1):
            source = library / row["original_path"]
            # Keep the catalog's original project-relative path and filename
            # inside the .atopack.  This makes the archive directly usable as
            # a resource tree (and avoids losing meaningful names to hashes),
            # while the manifest hash still provides content identity and
            # integrity checking during import.
            target = json.loads(row["faces_json"]).get(row["face"])
            if not target:
                raise ValueError(f"清单中缺少资源路径：{row['item_id']} / {row['face']}")
            member = str(safe_member(str(target)))
            previous_hash = written_members.get(member)
            if previous_hash is not None and previous_hash != row["sha256"]:
                raise ValueError(f"清单资源路径冲突：{member}")
            if previous_hash is None:
                archive.write(source, member)
                written_members[member] = row["sha256"]
            manifest["assets"].append({
                "itemId": row["item_id"], "face": row["face"], "sha256": row["sha256"],
                "member": member, "mimeType": row["mime_type"], "originalName": row["original_name"],
            })
            if progress:
                progress(index, total, f"正在写入第 {index}/{len(rows)} 个图片")
        if entity_index:
            archive.writestr(ENTITY_INDEX_MEMBER, entity_index.json_bytes)
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return {
        "path": str(destination),
        "assets": len(rows),
        "entity_index": bool(entity_index),
        "bytes": destination.stat().st_size,
    }


def inspect_package(
    db: Database, package: Path, verify_hashes: bool = False,
    progress: Progress | None = None,
) -> dict:
    with zipfile.ZipFile(package) as archive:
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        if manifest.get("format") != "ato-asset-pack" or int(manifest.get("version", 0)) > PACKAGE_VERSION:
            raise ValueError("不支持的资料包版本")
        names = set(archive.namelist())
        existing = {(r["item_id"], r["face"]): r for r in db.all("SELECT * FROM asset_revisions WHERE is_current=1")}
        summary = {"add": 0, "same": 0, "replace": 0, "missing": 0}
        assets = []
        manifest_assets = manifest.get("assets", [])
        total = max(len(manifest_assets), 1)
        for index, asset in enumerate(manifest_assets, 1):
            safe_member(asset["member"])
            if asset["member"] not in names:
                status = "missing"
            else:
                if verify_hashes:
                    digest = hashlib.sha256()
                    with archive.open(asset["member"]) as source:
                        for chunk in iter(lambda: source.read(1024 * 1024), b""):
                            digest.update(chunk)
                    if digest.hexdigest() != asset["sha256"]:
                        raise ValueError(f"资料包文件校验失败：{asset['member']}")
                current = existing.get((asset["itemId"], asset["face"]))
                status = "add" if not current else ("same" if current["sha256"] == asset["sha256"] else "replace")
            summary[status] += 1
            assets.append({**asset, "status": status})
            if progress:
                progress(index, total, f"正在校验第 {index}/{len(manifest_assets)} 个图片")
        local_books = {row["id"] for row in db.all("SELECT id FROM story_books")}
        incoming_books = {str(book.get("id")) for book in manifest.get("stories", {}).get("books", []) if book.get("id")}
        story_summary = {"add": len(incoming_books - local_books), "replace": len(incoming_books & local_books)}
        entity_summary = _inspect_story_files(archive, manifest, names, verify_hashes)
        if int(manifest.get("version", 0)) >= 2 and incoming_books and not entity_summary["included"]:
            raise ValueError("新版资料包含有故事，但没有人物小传索引")
    return {
        "summary": summary,
        "assets": assets,
        "stories": story_summary,
        "entity_index": entity_summary,
        "manifest": manifest,
    }


def _inspect_story_files(
    archive: zipfile.ZipFile, manifest: dict, names: set[str], verify_hashes: bool,
) -> dict:
    included = False
    entity_count = 0
    for story_file in manifest.get("storyFiles", []):
        if story_file.get("kind") != ENTITY_INDEX_KIND:
            raise ValueError(f"不支持的故事附加文件：{story_file.get('kind')}")
        member = str(safe_member(str(story_file.get("member") or "")))
        if member != ENTITY_INDEX_MEMBER or member not in names:
            raise ValueError("资料包声明的人物小传索引缺失")
        info = archive.getinfo(member)
        if info.file_size > ENTITY_INDEX_MAX_BYTES:
            raise ValueError("资料包中的人物小传索引超过 128MB")
        if verify_hashes:
            digest = hashlib.sha256(archive.read(member)).hexdigest()
            if digest != story_file.get("sha256"):
                raise ValueError("人物小传索引校验失败")
        included = True
        entity_count = int(story_file.get("entityCount") or 0)
    return {"included": included, "entity_count": entity_count}


def import_package(
    db: Database, library: Path, package: Path, replace: bool = False,
    progress: Progress | None = None,
) -> dict:
    inspection = inspect_package(db, package)
    manifest = inspection["manifest"]
    with db.connect() as conn:
        for item in manifest.get("items", []):
            faces = item.get("faces") or {}
            conn.execute(
                """INSERT INTO catalog_items(id,cycle,module,subgroup,name,number,sort_order,faces_json,capture_required,source_version)
                VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET cycle=excluded.cycle,module=excluded.module,
                subgroup=excluded.subgroup,name=excluded.name,number=excluded.number,sort_order=excluded.sort_order,
                faces_json=excluded.faces_json""",
                (item["id"], item["cycle"], item["module"], item.get("subgroup", ""), item["name"], item.get("number", ""),
                 int(item.get("sort_order", 0)), json.dumps(faces, ensure_ascii=False, sort_keys=True), int(item.get("capture_required", 1)), item.get("source_version", "package")),
            )
        retired_ids = [str(item_id) for item_id in manifest.get("retiredItems", []) if item_id]
        if retired_ids:
            placeholders = ",".join("?" for _ in retired_ids)
            conn.execute(
                f"UPDATE catalog_items SET capture_required=0 WHERE id IN ({placeholders})",
                tuple(retired_ids),
            )
    imported = skipped = 0
    with zipfile.ZipFile(package) as archive:
        total = max(len(inspection["assets"]), 1)
        for index, asset in enumerate(inspection["assets"], 1):
            if asset["status"] in {"same", "missing"} or asset["status"] == "replace" and not replace:
                skipped += 1
                if progress:
                    progress(index, total, f"已检查 {index}/{len(inspection['assets'])} 个图片")
                continue
            member = safe_member(asset["member"])
            suffix = PurePosixPath(member).suffix
            temp = library / "tmp" / f"package-{os.urandom(8).hex()}{suffix}"
            with archive.open(str(member)) as source, temp.open("wb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
            store_image(
                db, library, temp, asset["itemId"], asset["face"],
                asset.get("originalName", member.name), asset.get("mimeType", "image/jpeg"),
                "package", expected_sha256=asset["sha256"], defer_preview=True,
            )
            imported += 1
            if progress:
                progress(index, total, f"正在恢复第 {index}/{len(inspection['assets'])} 个图片")
        entity_index_imported = False
        for story_file in manifest.get("storyFiles", []):
            if story_file.get("kind") != ENTITY_INDEX_KIND:
                continue
            member = str(safe_member(str(story_file.get("member") or "")))
            raw = archive.read(member)
            if hashlib.sha256(raw).hexdigest() != story_file.get("sha256"):
                raise ValueError("人物小传索引校验失败")
            store_entity_index(library, raw)
            entity_index_imported = True
    imported_books = _import_stories(db, manifest.get("stories") or {}, replace)
    progress = manifest.get("progress") or {}
    with db.connect() as conn:
        for skipped_face in progress.get("skippedFaces", []):
            conn.execute(
                "INSERT INTO skipped_faces(item_id,face) VALUES(?,?) ON CONFLICT(item_id,face) DO UPDATE SET updated_at=CURRENT_TIMESTAMP",
                (skipped_face.get("item_id"), skipped_face.get("face")),
            )
        for review in progress.get("storyReview", []):
            if review.get("book_id") not in imported_books:
                continue
            conn.execute(
                "UPDATE story_segments SET reviewed=? WHERE book_id=? AND entry_number=? AND chapter_key=?",
                (int(bool(review.get("reviewed"))), review.get("book_id"), review.get("entry_number"), review.get("chapter_key")),
            )
    return {
        "imported": imported,
        "skipped": skipped,
        "stories_imported": len(imported_books),
        "entity_index_imported": entity_index_imported,
    }


def _import_stories(db: Database, payload: dict, replace: bool) -> set[str]:
    imported: set[str] = set()
    with db.connect() as conn:
        for book in payload.get("books", []):
            book_id = str(book.get("id") or "").strip()
            if not book_id:
                continue
            exists = conn.execute("SELECT 1 FROM story_books WHERE id=?", (book_id,)).fetchone()
            if exists and not replace:
                if _backfill_story_metadata(conn, book_id, book.get("entries", [])):
                    imported.add(book_id)
                continue
            conn.execute(
                "INSERT INTO story_books(id,title,source_name,source_path,status) VALUES(?,?,?,'','review') ON CONFLICT(id) DO UPDATE SET title=excluded.title",
                (book_id, str(book.get("title") or book_id), "资料包"),
            )
            conn.execute("DELETE FROM story_segments WHERE book_id=?", (book_id,))
            for order, entry in enumerate(book.get("entries", [])):
                conn.execute(
                    """INSERT INTO story_segments(
                    book_id,chapter_key,chapter_title,entry_number,title,body,metadata_json,sort_order,reviewed
                    ) VALUES(?,?,?,?,?,?,?,?,1)""",
                    (
                        book_id, entry.get("chapterKey", "main"), entry.get("chapter", "正文"),
                        str(entry.get("id", "")), entry.get("title", ""), entry.get("text", ""),
                        json.dumps(entry, ensure_ascii=False, separators=(",", ":")), order,
                    ),
                )
            imported.add(book_id)
    return imported


def _backfill_story_metadata(conn, book_id: str, entries: list[dict]) -> bool:
    """Restore missing package metadata without replacing edited story content."""
    rows_by_identity: dict[tuple[str, str], list[dict]] = {}
    for row in conn.execute(
        """SELECT id,chapter_key,entry_number,metadata_json FROM story_segments
        WHERE book_id=? ORDER BY chapter_key,sort_order,id""",
        (book_id,),
    ).fetchall():
        item = dict(row)
        rows_by_identity.setdefault(
            (item["chapter_key"], item["entry_number"]), []
        ).append(item)

    used: dict[tuple[str, str], int] = {}
    changed = False
    for entry in entries:
        identity = (
            str(entry.get("chapterKey") or "main"),
            str(entry.get("id") or ""),
        )
        index = used.get(identity, 0)
        candidates = rows_by_identity.get(identity, [])
        if index >= len(candidates):
            continue
        used[identity] = index + 1
        row = candidates[index]
        try:
            metadata = json.loads(row.get("metadata_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            metadata = {}
        if not isinstance(metadata, dict):
            metadata = {}
        merged = dict(metadata)
        for key, value in entry.items():
            if key not in merged or merged[key] in (None, "", [], {}):
                merged[key] = value
        if merged == metadata:
            continue
        conn.execute(
            "UPDATE story_segments SET metadata_json=? WHERE id=?",
            (json.dumps(merged, ensure_ascii=False, separators=(",", ":")), row["id"]),
        )
        changed = True
    return changed


def export_compat(
    db: Database, library: Path, destination: Path, filters: dict | None = None,
    progress: Progress | None = None, ato_root: Path | None = None,
) -> dict:
    filters = filters or {}
    cycles = set(filters.get("cycles") or [])
    modules = set(filters.get("modules") or [])
    rows = db.all("""
      SELECT a.*,c.cycle,c.module,c.faces_json FROM asset_revisions a JOIN catalog_items c ON c.id=a.item_id
      WHERE a.is_current=1 ORDER BY c.sort_order
    """)
    rows = [row for row in rows if (not cycles or row["cycle"] in cycles) and (not modules or row["module"] in modules)]
    if filters.get("complete_only"):
        complete_ids = {
            row["id"] for row in db.all("""
              SELECT c.id FROM catalog_items c
              LEFT JOIN asset_revisions a ON a.item_id=c.id AND a.is_current=1
              GROUP BY c.id HAVING COUNT(DISTINCT a.face) >= json_array_length(c.faces_json)
            """)
        }
        rows = [row for row in rows if row["item_id"] in complete_ids]
    destination.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        total = max(len(rows), 1)
        for index, row in enumerate(rows, 1):
            target = json.loads(row["faces_json"]).get(row["face"])
            if not target:
                continue
            safe_member(target)
            with tempfile.TemporaryDirectory() as temp_dir:
                rendered = Path(temp_dir) / PurePosixPath(target).name
                source_path = row["original_path"] if row["source"] == "package" else row["preview_path"]
                write_compatible_image(library / source_path, rendered)
                archive.write(rendered, target)
            written += 1
            if progress:
                progress(index, total, f"正在转换第 {index}/{len(rows)} 个图片")
        reviewed = db.one("SELECT COUNT(*) AS n FROM story_segments WHERE reviewed=1")["n"]
        include_stories = bool(filters.get("include_stories", True) and reviewed)
        if include_stories:
            entity_index = find_entity_index(library, ato_root)
            if entity_index is None:
                raise ValueError("人物小传索引缺失；无法生成完整的故事兼容包")
            archive.writestr("story/data/storybook-data.js", storybook_javascript(db, book_ids=cycles or None))
            archive.writestr(ENTITY_INDEX_JSON_TARGET, entity_index.json_bytes)
            archive.writestr(ENTITY_INDEX_JS_TARGET, entity_index_javascript(entity_index))
    return {
        "path": str(destination),
        "files": written + (3 if include_stories else 0),
        "entity_index": bool(include_stories),
        "bytes": destination.stat().st_size,
    }
