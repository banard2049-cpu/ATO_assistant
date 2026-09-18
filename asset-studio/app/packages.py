from __future__ import annotations

import hashlib
import json
import re
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from .bgm_resources import add_to_archive as add_bgm_to_archive
from .bgm_resources import collect_library as collect_bgm_library
from .bgm_resources import checked_bytes as bgm_checked_bytes
from .bgm_resources import import_resources as import_bgm_resources
from .official_assets import resolve as resolve_official_asset
from .official_resources import LIBRARY, collect, add_to_archive, checked_bytes, import_resources
from .db import Database
from .installer import installable_relative, safe_relative
from .storage import sha256_file, store_image, write_compatible_image
from .story_extras import (
    ENTITY_INDEX_KIND,
    ENTITY_INDEX_LIBRARY_PATH,
    ENTITY_INDEX_MAX_BYTES,
    ENTITY_INDEX_MEMBER,
    ENTITY_INDEX_JSON_TARGET,
    ENTITY_INDEX_JS_TARGET,
    entity_index_javascript,
    entity_index_manifest_entry,
    find_entity_index,
    parse_entity_index,
    store_entity_index,
)
from .stories import storybook_javascript, storybook_payload


PACKAGE_VERSION = 3

# 资料包是外部输入，必须有上限：成员数量、单个成员大小、解压总大小与图片条目数。
# 参照代码里已有的上限（BGM 32MB、官方资料 128MB、批量 ZIP 8GB/5000）。
MAX_PACKAGE_MEMBERS = 20000
MAX_PACKAGE_MEMBER_BYTES = 128 * 1024 * 1024
MAX_PACKAGE_TOTAL_BYTES = 8 * 1024 * 1024 * 1024
MAX_PACKAGE_ASSETS = 5000
_SHA256 = re.compile(r"[a-f0-9]{64}")


def _complete_item_ids(db: Database) -> set[str]:
    """Ids of catalog items whose required faces all have a current revision.

    ``faces_json`` is a JSON object of face name to project path, so its keys are
    the faces the catalog requires.  ``json_array_length`` returns 0 for objects
    and cannot be used to compare against the number of captured faces.
    """
    captured: dict[str, set[str]] = {}
    for row in db.all("SELECT item_id,face FROM asset_revisions WHERE is_current=1"):
        captured.setdefault(row["item_id"], set()).add(row["face"])
    complete = set()
    for item in db.all("SELECT id,faces_json FROM catalog_items"):
        try:
            faces = json.loads(item["faces_json"] or "{}")
        except (TypeError, json.JSONDecodeError):
            # 读不出面清单的条目不能当作「已完整」，否则导出会漏掉它
            continue
        if not isinstance(faces, dict):
            continue
        required = set(faces)
        if required <= captured.get(item["id"], set()):
            complete.add(item["id"])
    return complete


def safe_member(name: str) -> PurePosixPath:
    """Validate a package member path with the same rules as install targets."""
    try:
        relative = safe_relative(str(name), "资料包路径")
    except ValueError as exc:
        raise ValueError(f"资料包含有不安全路径：{name}（{exc}）") from exc
    return PurePosixPath(relative)


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
    complete_ids = _complete_item_ids(db) if filters.get("complete_only") else None
    if complete_ids is not None:
        rows = [row for row in rows if row["item_id"] in complete_ids]
    items = db.all("SELECT * FROM catalog_items ORDER BY cycle,module,sort_order")
    items = [item for item in items if (not cycles or item["cycle"] in cycles) and (not modules or item["module"] in modules)]
    if complete_ids is not None:
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
        "format": "ato-asset-pack", "version": 2,
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
        official_assets = 0
        total = max(len(rows), 1)
        for index, row in enumerate(rows, 1):
            # Keep the catalog's original project-relative path and filename
            # inside the .atopack.  This makes the archive directly usable as
            # a resource tree (and avoids losing meaningful names to hashes),
            # while the manifest hash still provides content identity and
            # integrity checking during import.
            target = json.loads(row["faces_json"]).get(row["face"])
            if not target:
                raise ValueError(f"清单中缺少资源路径：{row['item_id']} / {row['face']}")
            member = str(safe_member(str(target)))
            source, overridden = resolve_official_asset(
                ato_root, target, library / row["original_path"]
            )
            if overridden:
                official_assets += 1
            source_hash = sha256_file(source)
            previous_hash = written_members.get(member)
            if previous_hash is not None and previous_hash != source_hash:
                raise ValueError(f"清单资源路径冲突：{member}")
            if previous_hash is None:
                archive.write(source, member)
                written_members[member] = source_hash
            manifest["assets"].append({
                "itemId": row["item_id"], "face": row["face"], "sha256": source_hash,
                "member": member, "mimeType": row["mime_type"], "originalName": row["original_name"],
            })
            if progress:
                progress(index, total, f"正在写入第 {index}/{len(rows)} 个图片")
        if entity_index:
            archive.writestr(ENTITY_INDEX_MEMBER, entity_index.json_bytes)
        if filters.get("include_stories", True):
            official_root = ato_root if collect(ato_root) else library / LIBRARY
            add_to_archive(archive, manifest, official_root)
        if filters.get("include_bgm", True):
            add_bgm_to_archive(archive, manifest, ato_root, fallback_library=library)
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return {
        "path": str(destination),
        "assets": len(rows),
        "official_assets": official_assets,
        "entity_index": bool(entity_index),
        "bgm_files": len(manifest.get("bgmFiles", [])),
        "bytes": destination.stat().st_size,
    }


def _check_package_limits(archive: zipfile.ZipFile) -> None:
    """外部资料包的大小/数量上限，全部在复制任何成员之前检查。"""
    infos = archive.infolist()
    if len(infos) > MAX_PACKAGE_MEMBERS:
        raise ValueError(f"资料包成员过多（上限 {MAX_PACKAGE_MEMBERS} 个）")
    total_bytes = 0
    for info in infos:
        if info.file_size > MAX_PACKAGE_MEMBER_BYTES:
            raise ValueError(f"资料包成员过大（上限 {MAX_PACKAGE_MEMBER_BYTES // (1024 * 1024)}MB）：{info.filename}")
        total_bytes += info.file_size
    if total_bytes > MAX_PACKAGE_TOTAL_BYTES:
        raise ValueError(f"资料包解压后超过 {MAX_PACKAGE_TOTAL_BYTES // (1024 ** 3)}GB")


def _validate_manifest_items(manifest: dict) -> set[tuple[str, str]]:
    """校验清单条目与面路径，返回声明的 (itemId, face) 集合。"""
    items = manifest.get("items", [])
    if not isinstance(items, list):
        raise ValueError("资料包清单格式无效")
    declared: set[tuple[str, str]] = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("资料包清单格式无效")
        item_id = str(item.get("id") or "")
        if not item_id:
            raise ValueError("资料包清单中有条目缺少 id")
        faces = item.get("faces") or {}
        if not isinstance(faces, dict):
            raise ValueError(f"资料包清单中的面定义无效：{item_id}")
        for face, target in faces.items():
            # 面路径就是安装目标：必须与 installer.safe_target 一样严格，
            # 并且只能是清单允许的素材树/类型。
            installable_relative(str(target))
            declared.add((item_id, str(face)))
    if len(manifest.get("assets", [])) > MAX_PACKAGE_ASSETS:
        raise ValueError(f"资料包图片条目过多（上限 {MAX_PACKAGE_ASSETS} 个）")
    return declared


def inspect_package(
    db: Database, package: Path, verify_hashes: bool = False,
    progress: Progress | None = None, library: Path | None = None,
) -> dict:
    if library is None:
        library = Path(db.path).parent
    with zipfile.ZipFile(package) as archive:
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        if manifest.get("format") != "ato-asset-pack" or int(manifest.get("version", 0)) > PACKAGE_VERSION:
            raise ValueError("不支持的资料包版本")
        _check_package_limits(archive)
        # 先校验清单本身（面路径、条目引用、哈希格式），任何写入之前就失败。
        declared_faces = _validate_manifest_items(manifest)
        names = set(archive.namelist())
        existing = {(r["item_id"], r["face"]): r for r in db.all("SELECT * FROM asset_revisions WHERE is_current=1")}
        summary = {"add": 0, "same": 0, "replace": 0, "missing": 0}
        assets = []
        manifest_assets = manifest.get("assets", [])
        total = max(len(manifest_assets), 1)
        for index, asset in enumerate(manifest_assets, 1):
            member = str(safe_member(asset["member"]))
            digest_value = str(asset.get("sha256") or "")
            if not _SHA256.fullmatch(digest_value):
                raise ValueError(f"资料包中的哈希格式无效：{member}")
            identity = (str(asset.get("itemId") or ""), str(asset.get("face") or ""))
            if identity not in declared_faces:
                raise ValueError(f"资料包资源没有对应的清单条目：{identity[0]} / {identity[1]}")
            if member not in names:
                status = "missing"
            else:
                if verify_hashes:
                    digest = hashlib.sha256()
                    with archive.open(member) as source:
                        for chunk in iter(lambda: source.read(1024 * 1024), b""):
                            digest.update(chunk)
                    if digest.hexdigest() != digest_value:
                        raise ValueError(f"资料包文件校验失败：{member}")
                current = existing.get(identity)
                status = "add" if not current else ("same" if current["sha256"] == digest_value else "replace")
            summary[status] += 1
            assets.append({**asset, "member": member, "status": status})
            if progress:
                progress(index, total, f"正在校验第 {index}/{len(manifest_assets)} 个图片")
        local_books = {row["id"] for row in db.all("SELECT id FROM story_books")}
        incoming_books = {str(book.get("id")) for book in manifest.get("stories", {}).get("books", []) if book.get("id")}
        story_summary = {"add": len(incoming_books - local_books), "replace": len(incoming_books & local_books)}
        for resource in manifest.get("resourceFiles", []):
            checked_bytes(archive, resource)
        bgm_files = manifest.get("bgmFiles", []) or []
        for resource in bgm_files:
            bgm_checked_bytes(archive, resource)
        entity_summary = _inspect_story_files(archive, manifest, names, verify_hashes, library)
        if int(manifest.get("version", 0)) >= 2 and incoming_books and not entity_summary["included"]:
            raise ValueError("新版资料包含有故事，但没有人物小传索引")
    return {
        "summary": summary,
        "assets": assets,
        "stories": story_summary,
        "entity_index": entity_summary,
        "official_resources": len(manifest.get("resourceFiles", [])),
        "bgm_files": len(bgm_files),
        "manifest": manifest,
    }


def _inspect_story_files(
    archive: zipfile.ZipFile, manifest: dict, names: set[str], verify_hashes: bool,
    library: Path | None = None,
) -> dict:
    local_path = (library / ENTITY_INDEX_LIBRARY_PATH) if library is not None else None
    local_exists = bool(local_path is not None and local_path.is_file())
    local = None
    if local_exists:
        try:
            local = find_entity_index(library)
        except ValueError:
            # 本地索引损坏时按冲突处理：替换会先备份，保留则原样不动
            local = None
    included = False
    entity_count = 0
    status = ""
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
        if local_exists and local is not None:
            # 人物小传索引也遵守保留/替换策略，因此预览里要像图片和故事书一样报告冲突
            incoming = parse_entity_index(archive.read(member), PurePosixPath(member))
            status = "same" if incoming.json_bytes == local.json_bytes else "replace"
        elif local_exists:
            status = "replace"
    summary = {"included": included, "entity_count": entity_count}
    if local_exists:
        summary["status"] = status
        if local is not None:
            summary["local_entity_count"] = local.entity_count
    return summary


def _snapshot_catalog(db: Database, item_ids: set[str]) -> dict[str, dict | None]:
    """记住这些条目的当前状态，导入中途失败时原样放回。"""
    snapshot: dict[str, dict | None] = {}
    for item_id in item_ids:
        snapshot[item_id] = db.one("SELECT * FROM catalog_items WHERE id=?", (item_id,))
    return snapshot


def _restore_catalog(db: Database, snapshot: dict[str, dict | None]) -> None:
    with db.connect() as conn:
        for item_id, row in snapshot.items():
            if row is None:
                conn.execute("DELETE FROM catalog_items WHERE id=?", (item_id,))
                continue
            conn.execute(
                """INSERT INTO catalog_items(id,cycle,module,subgroup,name,number,sort_order,faces_json,capture_required,source_version)
                VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET cycle=excluded.cycle,module=excluded.module,
                subgroup=excluded.subgroup,name=excluded.name,number=excluded.number,sort_order=excluded.sort_order,
                faces_json=excluded.faces_json,capture_required=excluded.capture_required,source_version=excluded.source_version""",
                (row["id"], row["cycle"], row["module"], row["subgroup"], row["name"], row["number"],
                 row["sort_order"], row["faces_json"], row["capture_required"], row["source_version"]),
            )


def _stage_member(archive: zipfile.ZipFile, member: str, temp: Path, expected: str) -> None:
    """把成员复制到临时文件，同时校验哈希，并确认它真的是可解码的图片。

    任何一步失败都发生在数据库被改动之前。
    """
    digest = hashlib.sha256()
    temp.parent.mkdir(parents=True, exist_ok=True)
    with archive.open(member) as source, temp.open("wb") as output:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != expected:
        raise ValueError(f"资料包文件校验失败：{member}")
    try:
        from PIL import Image
        with Image.open(temp) as probe:
            probe.verify()
    except Exception as exc:
        raise ValueError(f"资料包中的图片无法解码：{member}（{exc}）") from exc


def import_package(
    db: Database, library: Path, package: Path, replace: bool = False,
    progress: Progress | None = None,
) -> dict:
    # 导入必须校验成员哈希：manifest 里的 sha256 是对象身份，字节不符就会静默
    # 解析成库里另一张旧图（store_image 会把 expected_sha256 当成身份）。
    inspection = inspect_package(db, package, verify_hashes=True, library=library)
    manifest = inspection["manifest"]
    assets = inspection["assets"]
    pending = [
        asset for asset in assets
        if asset["status"] not in {"same", "missing"} and (asset["status"] != "replace" or replace)
    ]
    imported = 0
    total = max(len(assets), 1)
    # 先把所有要写入的成员复制到 library/tmp 并校验（哈希 + 可解码），此时数据库
    # 还没被改动；配合 finally 清理，失败不会留下半个包或半个清单。
    staged: list[tuple[Path, dict]] = []
    entity_index_imported = False
    entity_index_kept = False
    entity_index_backup = ""
    bgm_imported = 0
    try:
        with zipfile.ZipFile(package) as archive:
            for index, asset in enumerate(pending, 1):
                member = safe_member(asset["member"])
                suffix = Path(member.name).suffix[:16]
                temp = library / "tmp" / f"package-{uuid.uuid4().hex}{suffix}"
                staged.append((temp, asset))
                _stage_member(archive, str(member), temp, asset["sha256"])
                if progress:
                    progress(index, total, f"正在恢复第 {index}/{len(assets)} 个图片")
            # 清单写入与素材恢复放在一起：中途失败就把清单放回导入前的状态。
            snapshot = _snapshot_catalog(
                db,
                {str(item.get("id")) for item in manifest.get("items", []) if isinstance(item, dict)}
                | {str(item_id) for item_id in manifest.get("retiredItems", []) if item_id},
            )
            try:
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
                for index, (temp, asset) in enumerate(staged, 1):
                    member = PurePosixPath(asset["member"])
                    store_image(
                        db, library, temp, asset["itemId"], asset["face"],
                        asset.get("originalName", member.name), asset.get("mimeType", "image/jpeg"),
                        "package", expected_sha256=asset["sha256"], defer_preview=True,
                    )
                    imported += 1
                    if progress:
                        progress(index, total, f"正在恢复第 {index}/{len(assets)} 个图片")
                import_resources(archive, manifest, library, replace)
                bgm_imported = import_bgm_resources(archive, manifest, library, replace)
                for story_file in manifest.get("storyFiles", []):
                    if story_file.get("kind") != ENTITY_INDEX_KIND:
                        continue
                    member = str(safe_member(str(story_file.get("member") or "")))
                    raw = archive.read(member)
                    if hashlib.sha256(raw).hexdigest() != story_file.get("sha256"):
                        raise ValueError("人物小传索引校验失败")
                    if (library / ENTITY_INDEX_LIBRARY_PATH).is_file() and not replace:
                        entity_index_kept = True
                        continue
                    stored = store_entity_index(library, raw)
                    entity_index_backup = str(stored.backup) if stored.backup else ""
                    entity_index_imported = True
            except Exception:
                _restore_catalog(db, snapshot)
                raise
    finally:
        for temp, _ in staged:
            temp.unlink(missing_ok=True)
    imported_books = _import_stories(db, manifest.get("stories") or {}, replace)
    story_progress = manifest.get("progress") or {}
    with db.connect() as conn:
        for skipped_face in story_progress.get("skippedFaces", []):
            conn.execute(
                "INSERT INTO skipped_faces(item_id,face) VALUES(?,?) ON CONFLICT(item_id,face) DO UPDATE SET updated_at=CURRENT_TIMESTAMP",
                (skipped_face.get("item_id"), skipped_face.get("face")),
            )
        for review in story_progress.get("storyReview", []):
            if review.get("book_id") not in imported_books:
                continue
            conn.execute(
                "UPDATE story_segments SET reviewed=? WHERE book_id=? AND entry_number=? AND chapter_key=?",
                (int(bool(review.get("reviewed"))), review.get("book_id"), review.get("entry_number"), review.get("chapter_key")),
            )
    return {
        "imported": imported,
        "skipped": len(assets) - imported,
        "stories_imported": len(imported_books),
        "entity_index_imported": entity_index_imported,
        "entity_index_kept": entity_index_kept,
        "entity_index_backup": entity_index_backup,
        "bgm_imported": bgm_imported,
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


def _safe_render_names(target: str) -> tuple[str, PurePosixPath]:
    """把清单目标拆成 (渲染文件名, 压缩包成员路径)，两层都必须成立。

    这是导出侧的第二层防线：即使 :func:`safe_member` 被绕过或者以后被改松，渲染
    文件也不许跑出渲染临时目录、成员名也不许跑出资料包。注意
    ``PurePosixPath("..").name`` 就是 ``".."`` 而不是空串，直接拼会把渲染路径解析到
    临时目录的**父目录**，所以 `.`/`..`/空名字必须显式排除；`C:evil.png` 这类盘符
    相对写法还要靠平台路径解析再确认一次。
    """
    member = PurePosixPath(str(target).replace("\\", "/"))
    leaf = member.name
    if leaf in ("", ".", "..") or leaf != Path(leaf).name:
        raise ValueError(f"资料包含有不安全的渲染文件名：{target}")
    if member.is_absolute() or str(member) != str(target) or any(part in ("", ".", "..") for part in member.parts):
        raise ValueError(f"资料包成员名不安全：{target}")
    return leaf, member


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
        complete_ids = _complete_item_ids(db)
        rows = [row for row in rows if row["item_id"] in complete_ids]
    destination.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    official_assets = 0
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        total = max(len(rows), 1)
        for index, row in enumerate(rows, 1):
            target = json.loads(row["faces_json"]).get(row["face"])
            if not target:
                continue
            # 目标必须与安装目标一样严格：清单里被污染的路径（反斜杠 / .. 等）
            # 会让渲染文件跑到临时目录之外。
            target = str(safe_member(str(target)))
            # 第二层独立成立（第一层将来被放宽也不会漏）：PurePosixPath("..").name 仍然是
            # ".."（不是空串），Path(temp) / ".." 会解析到临时目录的上一层；带盘符的
            # "C:evil.js" 在盘符与渲染目录不一致时会把整个路径替换掉。渲染文件名和
            # 压缩包成员名都必须留在各自的容器里。
            leaf, member = _safe_render_names(target)
            with tempfile.TemporaryDirectory() as temp_dir:
                rendered = Path(temp_dir) / leaf
                # 位置层：真实 resolve() 之后仍然必须是临时目录的直接子项
                if rendered.resolve().parent != Path(temp_dir).resolve():
                    raise ValueError(f"资料包含有不安全的渲染文件名：{target}")
                source_path = row["original_path"] if row["source"] == "package" else row["preview_path"]
                source, overridden = resolve_official_asset(
                    ato_root, target, library / source_path
                )
                if overridden:
                    official_assets += 1
                write_compatible_image(source, rendered)
                archive.write(rendered, str(member))
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
        if filters.get("include_stories", True):
            official_root = ato_root if collect(ato_root) else library / LIBRARY
            for target, source in collect(official_root):
                archive.write(source, target)
                written += 1
        bgm_written = 0
        if filters.get("include_bgm", True):
            bgm_manifest: dict = {}
            bgm_written = add_bgm_to_archive(archive, bgm_manifest, ato_root, fallback_library=library)
            written += bgm_written
    return {
        "path": str(destination),
        "files": written + (3 if include_stories else 0),
        "official_assets": official_assets,
        "entity_index": bool(include_stories),
        "bgm_files": bgm_written,
        "bytes": destination.stat().st_size,
    }
