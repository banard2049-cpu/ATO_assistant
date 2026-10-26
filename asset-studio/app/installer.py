from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Callable

from .official_resources import LIBRARY, collect
from .bgm_resources import collect_library as collect_bgm_library
from .card_previews import canonical_board_path, is_preview_source, preview_for
from .cryptic_resources import collect_library as collect_cryptic_library
from .icon_resources import collect_library as collect_icon_library
from .mixed_media_resources import allowed_target as is_mixed_media_target
from .mixed_media_resources import collect_library as collect_mixed_media_library
from .map_resources import collect_library as collect_map_library, covered_targets as covered_map_targets
from .map_resources import alternate_overlay_target
from .db import Database
from .storage import ensure_preview, sha256_file, write_compatible_image
from .story_extras import (
    ENTITY_INDEX_JSON_TARGET,
    ENTITY_INDEX_JS_TARGET,
    entity_index_javascript,
    find_entity_index,
)
from .stories import storybook_payload
from .storybook_format import format_storybook


STORY_PREFIX = "window.STORYBOOK_DATA = "
STORY_TARGET = "story/data/storybook-data.js"
DIRECT_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
# 素材只允许落回项目里这些目录和文件类型：清单（fixed_catalog）里出现的组合全部在内，
# 其它后缀（.js/.php 等）一律拒绝——否则一个共享资料包就能往原项目写任意文件。
INSTALL_TREES = frozenset({"aibp", "assets", "hero", "map", "record", "ss", "story", "technology"})
INSTALL_IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})
INSTALL_AUDIO_SUFFIXES = frozenset({".mp3", ".ogg"})
INSTALL_AUDIO_PREFIX = "assets/bgm/"
# 主控台界面图标：同样由使用者自备，随资料包的 iconFiles 段分发（见 icon_resources.py）。
INSTALL_ICON_SUFFIXES = frozenset({".svg"})
INSTALL_ICON_PREFIX = "assets/icons/"
# 密语字形（巴别语／塞壬语）：同样由使用者自备，随资料包的 crypticFiles 段分发
# （见 cryptic_resources.py）。它落在 story/ 树里，所以额外收窄到固定前缀。
INSTALL_CRYPTIC_SUFFIXES = frozenset({".png"})
INSTALL_CRYPTIC_PREFIX = "story/assets/cryptic/glyphs/"
# 二进制素材：运行时脚本按固定路径取用的封装数据（不是图片也不是音频）。只允许落在
# 这个前缀下，且必须与 tools/build_fan_pack.py 的同名规则保持一致。
INSTALL_DATA_SUFFIXES = frozenset({".bin"})
INSTALL_DATA_PREFIX = "aibp/ps/other/"
# 混合媒体（私有映射表 + 书籍裁图）：同样由使用者自备，随资料包的 mixedMediaFiles 段分发
# （见 mixed_media_resources.py）。映射表是 .js，裁图是 images/c[1-5]/ 下的 PNG/SVG；
# 没有单独的前缀常量，路径白名单直接复用收集器里的那条正则，别处不另写一套规则。
# Windows 保留设备名：同名文件在 Windows 上无法按预期路径创建。
WINDOWS_DEVICE_NAMES = frozenset(
    {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}
)
_DRIVE_PREFIX = re.compile(r"^[A-Za-z]:")
# Windows 上非法的文件名字符（':' 还能被解释成 NTFS 备用数据流）
_WINDOWS_INVALID_CHARS = re.compile(r'[<>:"|?*\x00-\x1f]')


def safe_relative(relative: str, label: str = "目标路径") -> str:
    """校验并返回项目相对路径（只用 POSIX 分隔符，且已是规范形式）。

    拒绝绝对路径、``\\``、盘符（``C:``）、UNC、``..``、Windows 设备名、
    结尾的点/空格，以及任何规范化后与输入不同的写法——因为这些写法在
    不同系统上会被解析成别的文件。
    """
    def reject(reason: str):
        raise ValueError(f"不安全的{label}：{relative!r}（{reason}）")

    if not isinstance(relative, str) or not relative:
        reject("路径为空")
    if relative != relative.strip():
        reject("首尾有空白")
    if "\\" in relative:
        reject("包含反斜杠")
    if _DRIVE_PREFIX.match(relative):
        reject("包含盘符")
    pure = PurePosixPath(relative)
    if pure.is_absolute():
        reject("是绝对路径")
    if ".." in pure.parts:
        reject("包含上级目录")
    if str(pure) != relative:
        reject("不是规范形式")
    for part in pure.parts:
        if part.endswith((".", " ")):
            reject("路径以点或空格结尾")
        if _WINDOWS_INVALID_CHARS.search(part):
            reject("包含 Windows 非法字符")
        if part.split(".")[0].lower() in WINDOWS_DEVICE_NAMES:
            reject("是 Windows 保留设备名")
    return relative


def installable_relative(relative: str) -> str:
    """在 :func:`safe_relative` 之上限定安装目标只能是清单声明的素材树/类型。"""
    relative = safe_relative(relative, "素材目标路径")
    relative = canonical_board_path(relative)
    pure = PurePosixPath(relative)
    suffix = pure.suffix.lower()
    if is_mixed_media_target(relative):
        # 混合媒体（mixedMediaFiles 段）：映射表是 story/assets/mixed-media/mapping.js，
        # 裁图是 images/c[1-5]/ 下的 PNG/SVG；别的 .js 目标照旧一律拒绝。
        # 这条规则必须排在界面图标之前：裁图里有 .svg，否则会被当成 assets/icons/ 的图标拒收。
        return relative
    if suffix in INSTALL_AUDIO_SUFFIXES:
        if not relative.startswith(INSTALL_AUDIO_PREFIX):
            raise ValueError(f"音频素材只能安装到 {INSTALL_AUDIO_PREFIX}：{relative}")
        return relative
    if suffix in INSTALL_ICON_SUFFIXES:
        if not relative.startswith(INSTALL_ICON_PREFIX):
            raise ValueError(f"界面图标只能安装到 {INSTALL_ICON_PREFIX}：{relative}")
        return relative
    if suffix in INSTALL_CRYPTIC_SUFFIXES and relative.startswith(INSTALL_CRYPTIC_PREFIX):
        # 密语字形（crypticFiles 段）落回工程目录；story/ 下别的 PNG 目标仍按通用图片规则处理
        # （内置清单里本来就有 story/assets/OO/*.png 这类条目，这里不能收窄）。
        return relative
    if suffix in INSTALL_DATA_SUFFIXES:
        if not relative.startswith(INSTALL_DATA_PREFIX):
            raise ValueError(f"二进制素材只能安装到 {INSTALL_DATA_PREFIX}：{relative}")
        return relative
    if suffix not in INSTALL_IMAGE_SUFFIXES:
        raise ValueError(
            f"不支持的素材类型（只允许图片、{INSTALL_AUDIO_PREFIX} 音频、"
            f"{INSTALL_ICON_PREFIX} 图标和 {INSTALL_DATA_PREFIX} 下的二进制素材）：{relative}"
        )
    if pure.parts[0] not in INSTALL_TREES:
        raise ValueError(f"素材目标目录不在允许范围内：{relative}")
    return relative


def package_original_can_install_directly(row: dict, relative: str) -> bool:
    from .fixed_catalog import SHARED_BACK_MIGRATION_SOURCES

    source = row.get("source")
    if source != "package" and not (
        source in SHARED_BACK_MIGRATION_SOURCES and row.get("transform_json") in (None, "", "{}")
    ):
        return False
    source_suffix = Path(row.get("original_name") or row["original_path"]).suffix.lower()
    target_suffix = PurePosixPath(relative).suffix.lower()
    if target_suffix in INSTALL_DATA_SUFFIXES and relative.startswith(INSTALL_DATA_PREFIX):
        return source_suffix == target_suffix
    normalize = lambda suffix: ".jpg" if suffix == ".jpeg" else suffix
    return source_suffix in DIRECT_IMAGE_SUFFIXES and target_suffix in DIRECT_IMAGE_SUFFIXES


def entry_identity(entry: dict) -> tuple[str, str]:
    """Chapter key plus entry id, matching how a package identifies a segment."""
    return str(entry.get("chapterKey") or "main"), str(entry.get("id") or "")


def merged_book_entries(
    existing: list, incoming: list,
) -> tuple[list[dict], list[tuple[str, str]], list[tuple[str, str]]]:
    """Replace matching entries in place and keep entries the payload omits."""
    merged = [dict(entry) for entry in (existing or []) if isinstance(entry, dict)]
    positions: dict[tuple[str, str], list[int]] = {}
    anchor: dict[str, int] = {}
    for position, entry in enumerate(merged):
        identity = entry_identity(entry)
        positions.setdefault(identity, []).append(position)
        anchor[identity[0]] = position
    used: dict[tuple[str, str], int] = {}
    updated: list[tuple[str, str]] = []
    additions: list[tuple[dict, tuple[str, str]]] = []
    for entry in (incoming or []):
        if not isinstance(entry, dict):
            continue
        identity = entry_identity(entry)
        matched = positions.get(identity, [])
        index = used.get(identity, 0)
        if index < len(matched):
            used[identity] = index + 1
            merged[matched[index]] = dict(entry)
            updated.append(identity)
        else:
            additions.append((dict(entry), identity))
    added: list[tuple[str, str]] = []
    for entry, identity in additions:
        position = anchor.get(identity[0])
        if position is None:
            merged.append(entry)
            anchor[identity[0]] = len(merged) - 1
        else:
            merged.insert(position + 1, entry)
            for key, value in anchor.items():
                if value > position:
                    anchor[key] = value + 1
            anchor[identity[0]] = position + 1
        added.append(identity)
    return merged, updated, added


def merged_chapters(existing: list, incoming: list) -> list[dict]:
    chapters: dict[str, dict] = {}
    for chapter in [*(existing or []), *(incoming or [])]:
        if isinstance(chapter, dict):
            chapters[str(chapter.get("key") or "")] = chapter
    return list(chapters.values())


def book_removable_entries(existing: list, incoming: list) -> list[tuple[str, str]]:
    """Identities the payload omits; replacing the book would delete them."""
    remaining: dict[tuple[str, str], int] = {}
    for entry in (existing or []):
        if isinstance(entry, dict):
            identity = entry_identity(entry)
            remaining[identity] = remaining.get(identity, 0) + 1
    for entry in (incoming or []):
        if isinstance(entry, dict):
            identity = entry_identity(entry)
            if remaining.get(identity):
                remaining[identity] -= 1
    dropped: list[tuple[str, str]] = []
    for entry in (existing or []):
        if not isinstance(entry, dict):
            continue
        identity = entry_identity(entry)
        if remaining.get(identity):
            remaining[identity] -= 1
            dropped.append(identity)
    return dropped


def merge_storybook_payload(existing: dict, incoming: dict, replace_books: set[str] | None = None) -> tuple[dict, dict]:
    """Merge by book/chapter/entry id; books are only replaced when asked explicitly."""
    replace_books = {str(book_id) for book_id in (replace_books or ())}
    books: list[dict] = []
    index: dict[str, int] = {}
    for book in existing.get("books", []):
        if not isinstance(book, dict):
            continue
        index.setdefault(str(book.get("id") or ""), len(books))
        books.append(book)
    report = {"updated": [], "added": [], "removed": [], "replaced_books": [], "books": []}
    for incoming_book in incoming.get("books", []):
        if not isinstance(incoming_book, dict):
            continue
        book_id = str(incoming_book.get("id") or "")
        position = index.get(book_id)
        if position is None:
            index[book_id] = len(books)
            books.append(incoming_book)
            report["added"].append(book_id)
            report["books"].append({
                "id": book_id, "title": str(incoming_book.get("title") or book_id),
                "existing": False, "entries": len(incoming_book.get("entries", [])), "removable": [],
            })
            continue
        current = books[position]
        book_info = {
            "id": book_id, "title": str(incoming_book.get("title") or current.get("title") or book_id),
            "existing": True, "entries": len(incoming_book.get("entries", [])),
        }
        if book_id in replace_books:
            # 整书替换：真正会消失的是包里没有、项目里有的那些段落，预览里只报这些
            removed = [f"{book_id}/{chapter}/{entry_id}" for chapter, entry_id in
                       book_removable_entries(current.get("entries", []), incoming_book.get("entries", []))]
            report["removed"].extend(removed)
            report["replaced_books"].append(book_id)
            report["books"].append({**book_info, "removable": removed, "replaced": True})
            books[position] = incoming_book
            continue
        entries, updated, added = merged_book_entries(current.get("entries", []), incoming_book.get("entries", []))
        books[position] = {
            **current, **incoming_book,
            "entries": entries,
            "chapters": merged_chapters(current.get("chapters", []), incoming_book.get("chapters", [])),
            "entryCount": len(entries),
        }
        report["updated"].extend(f"{book_id}/{chapter}/{entry_id}" for chapter, entry_id in updated)
        report["added"].extend(f"{book_id}/{chapter}/{entry_id}" for chapter, entry_id in added)
        # 这些段落是包内没有、项目里有的：只有整书替换才会删掉，预览里要如实标出来。
        report["books"].append({
            **book_info, "replaced": False,
            "removable": [f"{book_id}/{chapter}/{entry_id}"
                          for chapter, entry_id in book_removable_entries(
                              current.get("entries", []), incoming_book.get("entries", []))],
        })
    return {**existing, **incoming, "books": books}, report


def merged_storybook_payload(
    db: Database, target: Path | None = None, replace_books: set[str] | None = None,
) -> tuple[bytes, dict]:
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
    payload, report = merge_storybook_payload(existing, incoming, replace_books)
    return f"{STORY_PREFIX}{format_storybook(payload)};\n".encode("utf-8"), report


def merged_storybook_javascript(db: Database, target: Path | None = None, replace_books: set[str] | None = None) -> bytes:
    return merged_storybook_payload(db, target, replace_books)[0]


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
    relative = safe_relative(relative)
    pure = PurePosixPath(relative)
    target = (root / Path(*pure.parts)).resolve()
    if root != target and root not in target.parents:
        raise ValueError(f"目标路径越界：{relative}")
    return target


def _plan_key(target: str) -> str:
    """同一目标文件的比较键：大小写不敏感，并去掉结尾的点/空格。"""
    # 资料包与安装计划可跨平台搬运：Linux 上也要识别 Windows/macOS 的大小写别名。
    return os.path.normcase(target).lower().rstrip(". ")


def install_plan(db: Database, library: Path, root: Path, replace_books: set[str] | None = None) -> dict:
    root = validate_target(root)
    rows = db.all("""
      SELECT a.*,c.name,c.faces_json FROM asset_revisions a JOIN catalog_items c ON c.id=a.item_id
      WHERE a.is_current=1 ORDER BY c.cycle,c.module,c.sort_order,a.face
    """)
    files: list[dict] = []
    summary = {"add": 0, "same": 0, "replace": 0}
    # 同一个目标文件（大小写、结尾点/空格等价）只能计划一次：否则后面的条目会把
    # 备份覆盖成中间态图片，回滚就把用户原文件删成别的内容。
    planned: dict[str, tuple[str, Callable[[], str], dict]] = {}
    cryptic_files = collect_cryptic_library(library)
    dedicated_cryptic_targets = {relative for relative, _ in cryptic_files}
    mixed_media_files = collect_mixed_media_library(library)
    dedicated_mixed_media_targets = {relative for relative, _ in mixed_media_files}
    map_files = collect_map_library(library)
    covered_maps = covered_map_targets(map_files, [target for row in rows for target in json.loads(row['faces_json']).values()])

    def add_file(entry: dict, digest_of: Callable[[], str]) -> bool:
        key = _plan_key(entry["target"])
        previous = planned.get(key)
        if previous is not None:
            if previous[1]() == digest_of():
                # 同一份内容重复指向一个文件：保留第一条即可。
                return False
            raise ValueError(f"安装计划中的资源路径冲突：{entry['target']} 与 {previous[0]} 指向同一个文件")
        planned[key] = (entry["target"], digest_of, entry)
        summary[entry["status"]] += 1
        files.append(entry)
        return True

    for row in rows:
        relative = json.loads(row["faces_json"]).get(row["face"])
        if not relative:
            continue
        if relative in covered_maps:
            continue
        # 旧包曾把同一字形同时写进 assets 与 crypticFiles；保留专用段的原始 PNG。
        if relative in dedicated_cryptic_targets:
            continue
        # 混合媒体素材同样只走专用段：包内重复登记时保留专用段那份原字节图。
        if relative in dedicated_mixed_media_targets:
            continue
        # 只允许清单声明的素材树/类型，避免共享资料包往原项目写任意文件。
        relative = installable_relative(relative)
        destination = safe_target(root, relative)
        if destination.exists() and not destination.is_file():
            raise ValueError(f"目标位置已存在同名文件夹，无法安装：{relative}")
        direct_copy = package_original_can_install_directly(row, relative)
        source_rel = row["original_path"] if row["source"] == "package" or direct_copy else row["preview_path"]
        source = library / source_rel
        if source_rel == row["preview_path"] and not source.is_file():
            source = ensure_preview(db, library, source_rel) or source
        if not source.is_file():
            raise ValueError(f"素材库中的图片文件已丢失：{relative}")
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
        add_file({"item_id": row["item_id"], "name": row["name"], "face": row["face"], "source": source_rel,
                  "target": relative, "status": status, "direct_copy": direct_copy},
                 lambda digest=row["sha256"]: digest)
        if direct_copy and is_preview_source(relative):
            preview = preview_for(relative, source.read_bytes())
            if preview is not None:
                preview_target = relative + ".preview.jpg"
                preview_path = safe_target(root, preview_target)
                if preview_path.exists() and not preview_path.is_file():
                    raise ValueError(f"目标位置已存在同名文件夹，无法安装：{preview_target}")
                preview_digest = hashlib.sha256(preview).hexdigest()
                preview_status = "add" if not preview_path.exists() else ("same" if sha256_file(preview_path) == preview_digest else "replace")
                add_file({"item_id": row["item_id"], "name": row["name"] + "（预览）", "face": "preview",
                          "source": source_rel, "target": preview_target, "status": preview_status,
                          "card_preview_source": relative, "original_status": status},
                         lambda digest=preview_digest: digest)
    story_count = db.one("SELECT COUNT(*) AS n FROM story_segments WHERE reviewed=1")["n"]
    if story_count:
        relative = STORY_TARGET
        destination = safe_target(root, relative)
        if destination.exists() and not destination.is_file():
            raise ValueError(f"目标位置已存在同名文件夹，无法安装：{relative}")
        payload, story_report = merged_storybook_payload(db, destination, replace_books)
        status = "add" if not destination.exists() else ("same" if destination.read_bytes() == payload else "replace")
        digest_of = lambda payload=payload: hashlib.sha256(payload).hexdigest()
        add_file({"item_id": "stories", "name": "故事索引", "face": "data", "source": "generated", "target": relative,
                  "status": status, "updated_entries": story_report["updated"], "added_entries": story_report["added"],
                  "removed_entries": story_report["removed"], "replaced_books": story_report["replaced_books"],
                  "books": story_report["books"]}, digest_of)
    entity_index = find_entity_index(library)
    if entity_index:
        entity_files = (
            (ENTITY_INDEX_JSON_TARGET, "entity-index-json", entity_index.json_bytes),
            (ENTITY_INDEX_JS_TARGET, "entity-index-js", entity_index_javascript(entity_index)),
        )
        for relative, source, payload in entity_files:
            destination = safe_target(root, relative)
            if destination.exists() and not destination.is_file():
                raise ValueError(f"目标位置已存在同名文件夹，无法安装：{relative}")
            status = "add" if not destination.exists() else ("same" if destination.read_bytes() == payload else "replace")
            add_file({
                "item_id": "entity-index",
                "name": "人物小传索引",
                "face": "data",
                "source": source,
                "target": relative,
                "status": status,
            }, lambda payload=payload: hashlib.sha256(payload).hexdigest())
    for relative, source in collect(library / LIBRARY, require_scans=False):
        destination = safe_target(root, relative)
        if destination.exists() and not destination.is_file():
            raise ValueError(f"目标位置已存在同名文件夹，无法安装：{relative}")
        status = "add" if not destination.exists() else ("same" if sha256_file(destination) == sha256_file(source) else "replace")
        add_file({"item_id": "official-story", "name": "官方故事书／截图", "face": "data",
                  "source": source.relative_to(library).as_posix(), "target": relative,
                  "status": status, "direct_copy": True},
                 lambda source=source: sha256_file(source))
    for relative, source in collect_bgm_library(library):
        destination = safe_target(root, relative)
        if destination.exists() and not destination.is_file():
            raise ValueError(f"目标位置已存在同名文件夹，无法安装：{relative}")
        status = "add" if not destination.exists() else ("same" if sha256_file(destination) == sha256_file(source) else "replace")
        add_file({"item_id": "bgm", "name": f"背景音乐：{PurePosixPath(relative).name}", "face": "audio",
                  "source": source.relative_to(library).as_posix(), "target": relative,
                  "status": status, "direct_copy": True},
                 lambda source=source: sha256_file(source))
    for relative, source in collect_icon_library(library):
        destination = safe_target(root, relative)
        if destination.exists() and not destination.is_file():
            raise ValueError(f"目标位置已存在同名文件夹，无法安装：{relative}")
        status = "add" if not destination.exists() else ("same" if sha256_file(destination) == sha256_file(source) else "replace")
        add_file({"item_id": "icons", "name": f"界面图标：{PurePosixPath(relative).name}", "face": "icon",
                  "source": source.relative_to(library).as_posix(), "target": relative,
                  "status": status, "direct_copy": True},
                 lambda source=source: sha256_file(source))
    for relative, source in cryptic_files:
        destination = safe_target(root, relative)
        if destination.exists() and not destination.is_file():
            raise ValueError(f"目标位置已存在同名文件夹，无法安装：{relative}")
        status = "add" if not destination.exists() else ("same" if sha256_file(destination) == sha256_file(source) else "replace")
        add_file({"item_id": "cryptic", "name": f"密语字形：{PurePosixPath(relative).name}", "face": "glyph",
                  "source": source.relative_to(library).as_posix(), "target": relative,
                  "status": status, "direct_copy": True},
                 lambda source=source: sha256_file(source))
    for relative, source in collect_mixed_media_library(library):
        destination = safe_target(root, relative)
        if destination.exists() and not destination.is_file():
            raise ValueError(f"目标位置已存在同名文件夹，无法安装：{relative}")
        status = "add" if not destination.exists() else ("same" if sha256_file(destination) == sha256_file(source) else "replace")
        add_file({"item_id": "mixed-media", "name": f"混合媒体：{PurePosixPath(relative).name}", "face": "media",
                  "source": source.relative_to(library).as_posix(), "target": relative,
                  "status": status, "direct_copy": True},
                 lambda source=source: sha256_file(source))
    declared_map_targets = {relative for relative, _ in map_files}
    for relative, source in map_files:
        destination = safe_target(root, relative)
        if destination.exists() and not destination.is_file():
            raise ValueError(f'地图图层目标不是文件：{relative}')
        digest = sha256_file(source)
        status = 'add' if not destination.exists() else ('same' if sha256_file(destination) == digest else 'replace')
        alternate = alternate_overlay_target(relative)
        previous = safe_target(root, alternate) if alternate and alternate not in declared_map_targets else None
        if previous is not None and previous.exists():
            if not previous.is_file():
                raise ValueError(f'地图图层目标不是文件：{alternate}')
            status = 'replace'
        add_file({'item_id':'map-layers', 'name':f'地图底图／蒙版：{PurePosixPath(relative).name}',
                  'face':'layer', 'source':source.relative_to(library).as_posix(), 'target':relative,
                  'alternate_map_overlay':alternate if previous is not None and previous.exists() else None,
                  'status':status, 'direct_copy':True}, lambda digest=digest: digest)
    return {"root": str(root), "summary": summary, "files": files}


def apply_install(db: Database, library: Path, root: Path, replacements: list[str], replace_books: set[str] | None = None) -> dict:
    replace_books = {str(book_id) for book_id in (replace_books or ())}
    plan = install_plan(db, library, root, replace_books)
    root = Path(plan["root"])
    allowed_replace = set(replacements)
    if replace_books:
        # 用户显式要求整书替换：故事索引必须随之重写（其余书仍按合并结果保留）。
        allowed_replace.add(STORY_TARGET)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_root = library / "backups" / stamp
    entity_index = find_entity_index(library)
    installed = skipped = 0
    completed: list[tuple[Path, Path | None]] = []
    backed_up: set[str] = set()
    try:
        for entry in plan["files"]:
            if entry.get("card_preview_source") and entry.get("original_status") == "replace" and entry["card_preview_source"] not in allowed_replace:
                skipped += 1
                continue
            if entry["status"] == "same":
                skipped += 1
                continue
            if entry["status"] == "replace" and entry["target"] not in allowed_replace and entry.get("card_preview_source") not in allowed_replace:
                skipped += 1
                continue
            target = safe_target(root, entry["target"])
            if target.exists() and not target.is_file():
                raise ValueError(f"目标位置已存在同名文件夹，无法安装：{entry['target']}")
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                raise ValueError(f"无法创建目标目录：{entry['target']}（{exc}）") from exc
            backup = None
            key = _plan_key(entry["target"])
            if target.exists() and key not in backed_up:
                # 每个目标文件在一次安装里只备份一次，回滚才回到用户的原文件。
                backup = safe_target(backup_root, entry["target"])
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup)
                backed_up.add(key)
            # 临时文件名必须唯一：固定名字在并发安装时互相覆盖，失败时还会留在项目里。
            temporary = target.with_name(f".{target.stem}-{uuid.uuid4().hex}.ato-studio.tmp{target.suffix}")
            try:
                if entry["source"] == "generated":
                    temporary.write_bytes(merged_storybook_javascript(db, target, replace_books))
                elif entry["source"] == "entity-index-json":
                    if entity_index is None:
                        raise ValueError("素材库中的人物小传索引已丢失")
                    temporary.write_bytes(entity_index.json_bytes)
                elif entry["source"] == "entity-index-js":
                    if entity_index is None:
                        raise ValueError("素材库中的人物小传索引已丢失")
                    temporary.write_bytes(entity_index_javascript(entity_index))
                elif entry.get("card_preview_source"):
                    preview = preview_for(entry["card_preview_source"], (library / entry["source"]).read_bytes())
                    if preview is None:
                        raise ValueError("卡牌预览图无法生成")
                    temporary.write_bytes(preview)
                elif entry.get("direct_copy"):
                    shutil.copy2(library / entry["source"], temporary)
                else:
                    write_compatible_image(library / entry["source"], temporary)
                try:
                    os.replace(temporary, target)
                except OSError as exc:
                    raise ValueError(f"无法写入目标文件：{entry['target']}（{exc}）") from exc
            finally:
                temporary.unlink(missing_ok=True)
            completed.append((target, backup))
            if entry.get('alternate_map_overlay'):
                previous = safe_target(root, entry['alternate_map_overlay'])
                if previous.exists():
                    previous_backup = safe_target(backup_root, entry['alternate_map_overlay'])
                    previous_backup.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(previous, previous_backup)
                    previous.unlink()
                    completed.append((previous, previous_backup))
            installed += 1
    except Exception:
        for target, backup in reversed(completed):
            try:
                if backup and backup.exists():
                    shutil.copy2(backup, target)
                elif target.exists():
                    target.unlink()
            except OSError:
                # 回滚单个文件失败不能掩盖真正的错误
                continue
        raise
    return {"installed": installed, "skipped": skipped, "backup": str(backup_root) if installed else ""}
