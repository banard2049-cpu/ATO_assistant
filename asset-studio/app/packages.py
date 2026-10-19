from __future__ import annotations

import hashlib
import json
import re
import tempfile
import uuid
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from .bgm_resources import add_to_archive as add_bgm_to_archive
from .bgm_resources import collect_library as collect_bgm_library
from .bgm_resources import checked_bytes as bgm_checked_bytes
from .bgm_resources import import_resources as import_bgm_resources
from .icon_resources import add_to_archive as add_icon_to_archive
from .icon_resources import checked_bytes as icon_checked_bytes
from .icon_resources import import_resources as import_icon_resources
from .cryptic_resources import add_to_archive as add_cryptic_to_archive
from .cryptic_resources import checked_bytes as cryptic_checked_bytes
from .cryptic_resources import import_resources as import_cryptic_resources
from .cryptic_resources import allowed_target as is_cryptic_target
from .cryptic_resources import MAX_FILES as MAX_CRYPTIC_FILES
from .cryptic_resources import MAX_FILE_BYTES as MAX_CRYPTIC_BYTES
from .mixed_media_resources import add_to_archive as add_mixed_media_to_archive
from .mixed_media_resources import checked_bytes as mixed_media_checked_bytes
from .mixed_media_resources import import_resources as import_mixed_media_resources
from .mixed_media_resources import MAX_FILES as MAX_MIXED_MEDIA_FILES
from .map_resources import collect as collect_map_files, covered_targets as covered_map_targets
from .map_resources import add_to_archive as add_map_to_archive, validate as validate_map_files
from .map_resources import import_resources as import_map_resources
from .official_assets import resolve as resolve_official_asset
from .official_resources import LIBRARY, collect, add_to_archive, checked_bytes, import_resources
from .db import Database
from .card_previews import add_to_archive as add_card_preview, canonical_board_path, is_preview_source
from .installer import installable_relative, package_original_can_install_directly, safe_relative
from .storage import ensure_preview, sha256_file, store_image, write_compatible_image
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


def _complete_item_ids(db: Database, covered_maps: set[str] | None = None) -> set[str]:
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
        required = {face for face, target in faces.items() if target not in (covered_maps or set())}
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


def _legacy_cryptic_files(rows: list[dict], library: Path, present: set[str]) -> list[tuple[str, Path]]:
    files = {}
    for row in rows:
        target = json.loads(row["faces_json"]).get(row["face"])
        if not is_cryptic_target(target) or target in present:
            continue
        source = (library / row["original_path"]).resolve()
        if not source.is_relative_to(library.resolve()):
            raise ValueError(f"密语字形来源不在素材库内：{target}")
        if source.stat().st_size > MAX_CRYPTIC_BYTES:
            raise ValueError(f"密语字形过大：{target}")
        digest = sha256_file(source)
        if digest != row["sha256"]:
            raise ValueError(f"密语字形校验失败：{target}")
        if target in files and digest != sha256_file(files[target]):
            raise ValueError(f"清单资源路径冲突：{target}")
        files[target] = source
    return sorted(files.items())


def _selected_map_files(db: Database, library: Path, ato_root: Path | None, cycles: set, modules: set):
    targets = [target for item in db.all('SELECT cycle,module,faces_json FROM catalog_items')
               if (not cycles or item['cycle'] in cycles) and (not modules or item['module'] in modules)
               for target in json.loads(item['faces_json']).values()]
    files = collect_map_files(ato_root, library, targets=targets)
    return files, covered_map_targets(files, targets)


def export_package(
    db: Database, library: Path, destination: Path, filters: dict | None = None,
    progress: Progress | None = None, ato_root: Path | None = None,
) -> dict:
    filters = filters or {}
    cycles = set(filters.get("cycles") or [])
    modules = set(filters.get("modules") or [])
    # 官方版故事书截图默认不进包：民间版资源包不带原书扫描图。
    official_scans = bool(filters.get("official_scans", False))
    # 官方故事书正文数据（storybook-official-data.js）同样属于官方内容，默认不进包：
    # 民间版只带素材库里的民间正文与人物小传。要打官方版资料包才显式打开。
    include_official = official_scans or bool(filters.get("official_story", False))
    # official-assets/ 是本地私有的官中覆盖图，属于「不该随包分发」的一批文件：
    # 默认一律不进包，包里的图必须来自素材库自己拍下/导入的素材。需要时才显式打开。
    use_official_assets = bool(filters.get("official_assets", False))
    rows = db.all("""
      SELECT a.*,c.cycle,c.module,c.subgroup,c.name,c.number,c.faces_json
      FROM asset_revisions a JOIN catalog_items c ON c.id=a.item_id
      WHERE a.is_current=1 ORDER BY c.cycle,c.module,c.sort_order,a.face
    """)
    rows = [row for row in rows if (not cycles or row["cycle"] in cycles) and (not modules or row["module"] in modules)]
    legacy_cryptic_rows = rows
    rows = [row for row in rows if not is_cryptic_target(json.loads(row["faces_json"]).get(row["face"]))]
    map_files, covered_maps = _selected_map_files(db, library, ato_root, cycles, modules)
    rows = [row for row in rows if json.loads(row['faces_json']).get(row['face']) not in covered_maps]
    complete_ids = _complete_item_ids(db, covered_maps) if filters.get("complete_only") else None
    if complete_ids is not None:
        rows = [row for row in rows if row["item_id"] in complete_ids]
    items = db.all("SELECT * FROM catalog_items ORDER BY cycle,module,sort_order")
    # 固定清单仍登记字形，方便查找和 APK 白名单；包里的字形只走 crypticFiles。
    items = [{**item, "faces_json": json.dumps({face: target for face, target in json.loads(item["faces_json"]).items()
                                               if not is_cryptic_target(target)}, ensure_ascii=False)} for item in items]
    items = [item for item in items if json.loads(item["faces_json"])]
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
            {**{key: value for key, value in item.items() if key != "faces_json"},
             "faces": {face: canonical_board_path(target) for face, target in json.loads(item["faces_json"]).items()}}
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
        preview_entries = []
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
            target = canonical_board_path(str(target))
            member = str(safe_member(target))
            if use_official_assets:
                source, overridden = resolve_official_asset(
                    ato_root, target, library / row["original_path"]
                )
            else:
                source, overridden = library / row["original_path"], False
            if overridden:
                official_assets += 1
            preview_source = source.read_bytes() if is_preview_source(member) else None
            source_hash = hashlib.sha256(preview_source).hexdigest() if preview_source is not None else sha256_file(source)
            previous_hash = written_members.get(member)
            if previous_hash is not None and previous_hash != source_hash:
                raise ValueError(f"清单资源路径冲突：{member}")
            if previous_hash is None:
                if preview_source is None:
                    archive.write(source, member)
                else:
                    archive.writestr(member, preview_source)
                    add_card_preview(archive, member, preview_source, preview_entries)
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
            if include_official:
                official_root = ato_root if collect(ato_root, include_scans=official_scans) else library / LIBRARY
                add_to_archive(archive, manifest, official_root, include_scans=official_scans)
            else:
                # 民间版资料包：官方故事书正文数据与原书截图都不带（都属于官方内容）。
                manifest["resourceFiles"] = []
        if filters.get("include_bgm", True):
            add_bgm_to_archive(archive, manifest, ato_root, fallback_library=library)
        if filters.get("include_icons", True):
            add_icon_to_archive(archive, manifest, ato_root, fallback_library=library)
        if filters.get("include_cryptic", True):
            add_cryptic_to_archive(archive, manifest, ato_root, fallback_library=library,
                                  fallback_files=lambda present: _legacy_cryptic_files(legacy_cryptic_rows, library, present))
        if filters.get("include_mixed_media", True):
            add_mixed_media_to_archive(archive, manifest, ato_root, fallback_library=library)
        manifest["cardPreviewFiles"] = preview_entries
        add_map_to_archive(archive, manifest, files=map_files)
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return {
        "path": str(destination),
        "assets": len(rows),
        "official_assets": official_assets,
        "entity_index": bool(entity_index),
        "bgm_files": len(manifest.get("bgmFiles", [])),
        "icon_files": len(manifest.get("iconFiles", [])),
        "cryptic_files": len(manifest.get("crypticFiles", [])),
        "mixed_media_files": len(manifest.get("mixedMediaFiles", [])),
        "map_files": len(manifest.get("mapFiles", [])),
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
        from .fixed_catalog import card_back_paths, card_back_revisions

        mapped_backs = card_back_paths()
        artwork_revisions = card_back_revisions()
        mapped_back_faces: dict[tuple[str, str], str] = {}
        legacy_card_backs: set[tuple[str, str]] = set()
        legacy_ai3_backs: set[tuple[str, str]] = set()
        for item in manifest.get("items", []):
            faces = item.get("faces") or {}
            canonical_back = mapped_backs.get(faces.get("front"))
            if canonical_back is None:
                continue
            mapped_back_faces[(str(item["id"]), "back")] = canonical_back
            if faces.get("back") != canonical_back:
                identity = (str(item["id"]), "back")
                legacy_card_backs.add(identity)
                if "_AI_III_" in canonical_back:
                    legacy_ai3_backs.add(identity)
            # Older packs must not restore the retired per-card back paths.
            # Their bytes may also belong to the wrong special card, so keep
            # existing corrected backs and request missing ones separately.
            faces["back"] = canonical_back
            item["faces"] = faces
        names = set(archive.namelist())
        existing = {(r["item_id"], r["face"]): r for r in db.all("SELECT * FROM asset_revisions WHERE is_current=1")}
        # A shared back import affects peers omitted from this package too.
        # Classify their differing current artwork as a conflict before any
        # store_image call can propagate a replacement to the whole group.
        existing_shared_hashes: dict[str, set[str]] = {}
        for row in db.all("""
            SELECT a.sha256,c.faces_json FROM asset_revisions a
            JOIN catalog_items c ON c.id=a.item_id WHERE a.face='back' AND a.is_current=1
        """):
            faces = json.loads(row["faces_json"])
            target = mapped_backs.get(faces.get("front"))
            if target is not None:
                existing_shared_hashes.setdefault(target, set()).add(row["sha256"])
        summary = {"add": 0, "same": 0, "replace": 0, "missing": 0}
        assets = []
        cryptic_entries = list(manifest.get("crypticFiles", []) or [])
        dedicated_targets = {str(entry.get("target") or "") for entry in cryptic_entries if isinstance(entry, dict)}
        face_targets = {(str(item["id"]), str(face)): target
                        for item in manifest.get("items", []) for face, target in (item.get("faces") or {}).items()}
        manifest_assets = manifest.get("assets", [])
        total = max(len(manifest_assets), 1)
        legacy_card_backs_skipped = 0
        legacy_ai3_backs_skipped = 0
        outdated_card_backs_skipped = 0
        incoming_shared_hashes: dict[str, str] = {}
        for index, asset in enumerate(manifest_assets, 1):
            identity = (str(asset.get("itemId") or ""), str(asset.get("face") or ""))
            if identity in legacy_card_backs:
                legacy_card_backs_skipped += 1
                legacy_ai3_backs_skipped += int(identity in legacy_ai3_backs)
                continue
            glyph_target = face_targets.get(identity)
            if is_cryptic_target(glyph_target):
                # 兼容旧包里的重复登记：专用段优先；只有 assets 的旧字形也走逐张校验。
                if glyph_target not in dedicated_targets:
                    cryptic_entries.append({**asset, "target": glyph_target})
                    dedicated_targets.add(glyph_target)
                continue
            member = str(safe_member(asset["member"]))
            digest_value = str(asset.get("sha256") or "")
            if not _SHA256.fullmatch(digest_value):
                raise ValueError(f"资料包中的哈希格式无效：{member}")
            if identity not in declared_faces:
                raise ValueError(f"资料包资源没有对应的清单条目：{identity[0]} / {identity[1]}")
            shared_target = mapped_back_faces.get(identity)
            known_revision = artwork_revisions.get(shared_target, {})
            if digest_value == known_revision.get("fromSha256"):
                # These exact original bytes were superseded by the baked
                # colour correction, even in packs using the new filename.
                legacy_card_backs_skipped += 1
                legacy_ai3_backs_skipped += int("_AI_III_" in shared_target)
                outdated_card_backs_skipped += 1
                continue
            if shared_target is not None:
                previous_digest = incoming_shared_hashes.setdefault(shared_target, digest_value)
                if previous_digest != digest_value:
                    raise ValueError(f"资料包共享牌背内容冲突：{shared_target}")
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
                if shared_target is not None and existing_shared_hashes.get(shared_target, set()) - {digest_value}:
                    status = "replace"
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
        icon_files = manifest.get("iconFiles", []) or []
        for resource in icon_files:
            icon_checked_bytes(archive, resource)
        cryptic_files = []
        cryptic_warnings = []
        for index, resource in enumerate(cryptic_entries):
            try:
                if index >= MAX_CRYPTIC_FILES:
                    raise ValueError(f"密语字形数量超过 {MAX_CRYPTIC_FILES} 个上限")
                if not isinstance(resource, dict):
                    raise ValueError("密语字形清单条目格式无效")
                cryptic_checked_bytes(archive, resource)
            except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile, zlib.error, EOFError) as error:
                cryptic_warnings.append({"target": str(resource.get("target") or "") if isinstance(resource, dict) else "",
                                         "reason": str(error)})
                continue
            cryptic_files.append(resource)
        mixed_media_files = []
        mixed_media_warnings = []
        for index, resource in enumerate(manifest.get("mixedMediaFiles", []) or []):
            try:
                if index >= MAX_MIXED_MEDIA_FILES:
                    raise ValueError(f"混合媒体文件数量超过 {MAX_MIXED_MEDIA_FILES} 个上限")
                if not isinstance(resource, dict):
                    raise ValueError("混合媒体清单条目格式无效")
                mixed_media_checked_bytes(archive, resource)
            except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile, zlib.error, EOFError) as error:
                mixed_media_warnings.append({"target": str(resource.get("target") or "") if isinstance(resource, dict) else "",
                                             "reason": str(error)})
                continue
            mixed_media_files.append(resource)
        entity_summary = _inspect_story_files(archive, manifest, names, verify_hashes, library)
        map_files = validate_map_files(archive, manifest)
        map_summary = {'add':0, 'same':0, 'replace':0}
        for entry in map_files:
            local = library / 'sources/map-layers' / entry['target']
            status = 'add' if not local.is_file() else ('same' if sha256_file(local)==entry['sha256'] else 'replace')
            map_summary[status] += 1
        if int(manifest.get("version", 0)) >= 2 and incoming_books and not entity_summary["included"]:
            raise ValueError("新版资料包含有故事，但没有人物小传索引")
    return {
        "summary": summary,
        "assets": assets,
        "legacy_card_backs_skipped": legacy_card_backs_skipped,
        "legacy_ai3_backs_skipped": legacy_ai3_backs_skipped,
        "outdated_card_backs_skipped": outdated_card_backs_skipped,
        "stories": story_summary,
        "entity_index": entity_summary,
        "official_resources": len(manifest.get("resourceFiles", [])),
        "bgm_files": len(bgm_files),
        "icon_files": len(icon_files),
        "cryptic_files": len(cryptic_files),
        "cryptic_skipped": len(cryptic_warnings),
        "cryptic_warnings": cryptic_warnings,
        "valid_cryptic_files": cryptic_files,
        "mixed_media_files": len(mixed_media_files),
        "mixed_media_skipped": len(mixed_media_warnings),
        "mixed_media_warnings": mixed_media_warnings,
        "valid_mixed_media_files": mixed_media_files,
        "map_files": len(map_files),
        "map_summary": map_summary,
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
    """把成员复制到临时文件并校验哈希；图片须可解码，白名单二进制素材保留原字节。

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
    if member.startswith("aibp/ps/other/") and Path(member).suffix.lower() == ".bin" and installable_relative(member):
        return
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
    icon_imported = 0
    cryptic_imported = 0
    mixed_media_imported = 0
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
                map_imported = import_map_resources(archive, manifest, library, replace)
                bgm_imported = import_bgm_resources(archive, manifest, library, replace)
                icon_imported = import_icon_resources(archive, manifest, library, replace)
                cryptic_imported = import_cryptic_resources(
                    archive, {"crypticFiles": inspection["valid_cryptic_files"]}, library, replace
                )
                mixed_media_imported = import_mixed_media_resources(
                    archive, {"mixedMediaFiles": inspection["valid_mixed_media_files"]}, library, replace
                )
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
        "skipped": len(assets) - imported + inspection["legacy_card_backs_skipped"],
        "legacy_card_backs_skipped": inspection["legacy_card_backs_skipped"],
        "legacy_ai3_backs_skipped": inspection["legacy_ai3_backs_skipped"],
        "outdated_card_backs_skipped": inspection["outdated_card_backs_skipped"],
        "stories_imported": len(imported_books),
        "entity_index_imported": entity_index_imported,
        "entity_index_kept": entity_index_kept,
        "entity_index_backup": entity_index_backup,
        "bgm_imported": bgm_imported,
        "icon_imported": icon_imported,
        "cryptic_imported": cryptic_imported,
        "cryptic_skipped": inspection["cryptic_skipped"],
        "cryptic_warnings": inspection["cryptic_warnings"],
        "mixed_media_imported": mixed_media_imported,
        "map_imported": map_imported,
        "mixed_media_skipped": inspection["mixed_media_skipped"],
        "mixed_media_warnings": inspection["mixed_media_warnings"],
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
    相对写法在所有平台都显式排除，避免 Linux 导出的包在 Windows 上越界。
    """
    member = PurePosixPath(str(target).replace("\\", "/"))
    leaf = member.name
    if leaf in ("", ".", "..") or leaf != Path(leaf).name:
        raise ValueError(f"资料包含有不安全的渲染文件名：{target}")
    if member.is_absolute() or str(member) != str(target) or any(part in ("", ".", "..") or ":" in part for part in member.parts):
        raise ValueError(f"资料包成员名不安全：{target}")
    return leaf, member


def export_compat(
    db: Database, library: Path, destination: Path, filters: dict | None = None,
    progress: Progress | None = None, ato_root: Path | None = None,
) -> dict:
    filters = filters or {}
    cycles = set(filters.get("cycles") or [])
    modules = set(filters.get("modules") or [])
    # 官方版故事书截图默认不进包：民间版资源包只带官方故事书数据（官方版正文）。
    official_scans = bool(filters.get("official_scans", False))
    # 与 export_package 一致：官方资料（正文数据 + 截图）默认都不进包。
    include_official = official_scans or bool(filters.get("official_story", False))
    # 与 export_package 一致：官中覆盖图默认不进包。
    use_official_assets = bool(filters.get("official_assets", False))
    rows = db.all("""
      SELECT a.*,c.cycle,c.module,c.faces_json FROM asset_revisions a JOIN catalog_items c ON c.id=a.item_id
      WHERE a.is_current=1 ORDER BY c.sort_order
    """)
    rows = [row for row in rows if (not cycles or row["cycle"] in cycles) and (not modules or row["module"] in modules)]
    legacy_cryptic_rows = rows
    rows = [row for row in rows if not is_cryptic_target(json.loads(row["faces_json"]).get(row["face"]))]
    map_files, covered_maps = _selected_map_files(db, library, ato_root, cycles, modules)
    rows = [row for row in rows if json.loads(row['faces_json']).get(row['face']) not in covered_maps]
    if filters.get("complete_only"):
        complete_ids = _complete_item_ids(db, covered_maps)
        rows = [row for row in rows if row["item_id"] in complete_ids]
    destination.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    official_assets = 0
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        written_members: dict[str, str] = {}
        total = max(len(rows), 1)
        for index, row in enumerate(rows, 1):
            target = json.loads(row["faces_json"]).get(row["face"])
            if not target:
                continue
            # 目标必须与安装目标一样严格：清单里被污染的路径（反斜杠 / .. 等）
            # 会让渲染文件跑到临时目录之外。
            target = str(safe_member(canonical_board_path(str(target))))
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
                direct_copy = package_original_can_install_directly(row, target)
                source_path = row["original_path"] if row["source"] == "package" or direct_copy else row["preview_path"]
                if use_official_assets:
                    source, overridden = resolve_official_asset(
                        ato_root, target, library / source_path
                    )
                else:
                    source, overridden = library / source_path, False
                if not overridden and source_path == row["preview_path"] and not source.is_file():
                    source = ensure_preview(db, library, source_path) or source
                if overridden:
                    official_assets += 1
                if direct_copy and not overridden:
                    rendered.write_bytes(source.read_bytes())
                else:
                    write_compatible_image(source, rendered)
                member_name = str(member)
                digest = sha256_file(rendered)
                previous_hash = written_members.get(member_name)
                if previous_hash is not None and previous_hash != digest:
                    raise ValueError(f"清单资源路径冲突：{member_name}")
                if previous_hash is None:
                    archive.write(rendered, member_name)
                    add_card_preview(archive, member_name, rendered.read_bytes(), [])
                    written_members[member_name] = digest
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
        if filters.get("include_stories", True) and include_official:
            official_root = ato_root if collect(ato_root, include_scans=official_scans) else library / LIBRARY
            for target, source in collect(official_root, include_scans=official_scans):
                archive.write(source, target)
                written += 1
        bgm_written = 0
        if filters.get("include_bgm", True):
            bgm_manifest: dict = {}
            bgm_written = add_bgm_to_archive(archive, bgm_manifest, ato_root, fallback_library=library)
            written += bgm_written
        icon_written = 0
        if filters.get("include_icons", True):
            icon_manifest: dict = {}
            icon_written = add_icon_to_archive(archive, icon_manifest, ato_root, fallback_library=library)
            written += icon_written
        cryptic_written = 0
        if filters.get("include_cryptic", True):
            cryptic_manifest: dict = {}
            cryptic_written = add_cryptic_to_archive(archive, cryptic_manifest, ato_root, fallback_library=library,
                                                  fallback_files=lambda present: _legacy_cryptic_files(legacy_cryptic_rows, library, present))
            written += cryptic_written
        mixed_media_written = 0
        if filters.get("include_mixed_media", True):
            mixed_media_manifest: dict = {}
            mixed_media_written = add_mixed_media_to_archive(
                archive, mixed_media_manifest, ato_root, fallback_library=library
            )
            written += mixed_media_written
        map_written = add_map_to_archive(archive, {}, files=map_files)
        written += map_written
    return {
        "path": str(destination),
        "files": written + (3 if include_stories else 0),
        "official_assets": official_assets,
        "entity_index": bool(include_stories),
        "bgm_files": bgm_written,
        "icon_files": icon_written,
        "cryptic_files": cryptic_written,
        "mixed_media_files": mixed_media_written,
        "map_files": map_written,
        "bytes": destination.stat().st_size,
    }
