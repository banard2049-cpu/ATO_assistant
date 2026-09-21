#!/usr/bin/env python3
"""民间版 .atopack 打包器：以 ATO_assistant 工程目录为真源，一条命令出包。

这个文件同时是两个打包脚本共用的**引擎**（写入、校验、原子改名只有一份实现）：

* ``build_fan_pack.py``（本文件）—— 民间版：故事正文用工程里的民间版
  ``story/data/storybook-data.js``；
* ``build_official_pack.py`` —— 官方版：官中图优先替换、故事书 js 只留官方正文、
  官方原书图一起打包（见 ``--story-source official``）。

和提交里的打包程序的关系
------------------------
口径照 ``asset-studio/app/packages.py`` 的 ``export_package``（素材库导出、出
``ATO-Assistant-Resources-*.atopack`` 的那条路径），但**素材真源是工程目录**：

* 图片按清单目标路径直接读 ``--ato-root`` 里的图（``aibp/``、``map/``、``story/``、
  ``technology/`` …）。工程目录才是修正过的真源——实测素材库里缺 6 张
  （5 个循环图标 + C1 探索卡 8201），另有 59 张是旧版本；工程目录 4279 张全在。
* 故事正文读 ``story/data/storybook-data.js``（7 本 / 4552 段），人物小传读
  ``story/data/entity-index.json``。
* 官方故事书正文数据 ``story/data/storybook-official-data.js`` 默认打进包（格式版本随之
  升到 3）；官方版原书截图默认不打，要打加 ``--include-official-scans``。
* 官方路径、扫描图后缀、BGM 命名、人物小传解析全部复用提交里的模块
  （``app.official_resources`` / ``app.bgm_resources`` / ``app.story_extras``），
  不在新工具里重写一套规则。

只在这件事上比原路径强
----------------------
原来的导出直接往最终文件写 ZIP：中途被打断（关掉工具、进程被杀、磁盘写满、下载被掐）
留下的就是一个没有中央目录的半成品——文件头是 ``PK\\x03\\x04``，却谁都打不开。
本工具先写 ``<输出>.partial``，**写完、关好、刷盘、校验通过之后**才原子改名成
``.atopack``；任何失败都不会在最终路径上留下文件。

用法
----
::

    python build_fan_pack.py --ato-root D:\\desktop\\ATO_assistant \\
        --output export\\ATO-Assistant-Resources-2026-09-19.atopack

常用加料::

    --dry-run                     只统计不写盘（先看体积、条目数、缺哪些面）
    --library D:\\delete          工程里缺图时，用素材库的同一条目兜底
    --official-assets             图片优先用 official-assets/ 官中覆盖图（默认不读）
    --include-official-scans      官方版资料包：连原书扫描图一起打进包
    --no-official-story           不带官方故事书正文数据（格式版本回到 2）
    --no-story-data               不带故事正文与人物小传
    --no-bgm                      不带主控台背景音乐
    --cycle c2 / --module AIBP    只打某些循环 / 模块
    --complete-only               只打正反面都齐了的条目
    --verify full                 改名之前把包内每个成员重新哈希一遍（慢，最稳）
    --json                        机器可读摘要（进度仍走 stderr）
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
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

# 复用的提交模块（都是标准库依赖，不需要素材库的 venv）。
from app.bgm_resources import allowed_target as is_bgm_target  # noqa: E402
from app.bgm_resources import collect as collect_bgm_files  # noqa: E402
from app.bgm_resources import mime_for as bgm_mime  # noqa: E402
from app.fixed_catalog import fixed_catalog_payload  # noqa: E402
from app.official_assets import clear_cache as clear_official_cache  # noqa: E402
from app.official_assets import resolve as resolve_official_asset  # noqa: E402
from app.official_resources import DATA as OFFICIAL_STORY_DATA  # noqa: E402
from app.official_resources import collect as collect_official  # noqa: E402
from app.story_extras import (  # noqa: E402
    ENTITY_INDEX_JSON_TARGET,
    ENTITY_INDEX_JS_TARGET,
    ENTITY_INDEX_MEMBER,
    entity_index_javascript,
    entity_index_manifest_entry,
    find_entity_index,
)

if __package__:  # 作为包导入（build_official_pack 走这条路）
    from .image_shrink import (
        ShrinkStats,
        is_image_member,
        load_keep_patterns,
        matches_any,
        shrink_image,
    )
else:  # 直接当脚本跑：tools/ 在 sys.path 上
    from image_shrink import (
        ShrinkStats,
        is_image_member,
        load_keep_patterns,
        matches_any,
        shrink_image,
    )

TOOL_NAME = "build_fan_pack"
TOOL_VERSION = "2.1.0"

# 图片重编码（--image-quality）允许的质量范围；不传就是完全不重编，保持历史口径。
IMAGE_QUALITY_MIN = 40
IMAGE_QUALITY_MAX = 95

PACKAGE_FORMAT = "ato-asset-pack"
# 不带官方资料时是 2；带上官方故事书正文数据（或截图）就是 3，与
# app/official_resources.add_to_archive 的规则一致。
PACKAGE_VERSION_FAN = 2
PACKAGE_VERSION_OFFICIAL = 3

CHUNK_SIZE = 4 * 1024 * 1024
SHA256_RE = re.compile(r"[a-f0-9]{64}")
STORY_DATA_MEMBER = "story/data/storybook-data.js"
STORY_DATA_RE = re.compile(r"\s*window\.STORYBOOK_DATA\s*=\s*(.*);\s*$", re.S)
OFFICIAL_DATA_PREFIX = "window.STORYBOOK_OFFICIAL_DATA = "

# 读取方（asset-studio 的 inspect_package / Android AtopackStore）会检查的上限。
MAX_MEMBERS = 20000
MAX_MEMBER_BYTES = 128 * 1024 * 1024
MAX_TOTAL_BYTES = 8 * 1024 * 1024 * 1024
MAX_ASSETS = 5000

# 素材安装目标规则（与 app/installer.py 的 INSTALL_TREES / installable_relative 一致；
# installer 本身会拖进 docx/pypdf 那套重依赖，所以这里只搬规则，不搬模块）。
INSTALL_TREES = frozenset({"aibp", "assets", "hero", "map", "record", "ss", "story", "technology"})
INSTALL_IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})
INSTALL_AUDIO_SUFFIXES = frozenset({".mp3", ".ogg"})
INSTALL_AUDIO_PREFIX = "assets/bgm/"
WINDOWS_DEVICE_NAMES = frozenset(
    {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}
)
_DRIVE_PREFIX = re.compile(r"^[A-Za-z]:")
_WINDOWS_INVALID_CHARS = re.compile(r'[<>:"|?*\x00-\x1f]')


class PackError(RuntimeError):
    """打包过程中断；最终输出路径上不会留下任何文件。"""


# --------------------------------------------------------------------------------------
# 输出
# --------------------------------------------------------------------------------------


def format_duration(seconds: float) -> str:
    seconds = int(max(seconds, 0))
    if seconds < 60:
        return f"{seconds} 秒"
    minutes, seconds = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes} 分 {seconds} 秒"
    hours, minutes = divmod(minutes, 60)
    return f"{hours} 小时 {minutes} 分"


def human_bytes(size: int) -> str:
    if size >= 1024 ** 3:
        return f"{size / 1024 ** 3:.2f} GiB"
    if size >= 1024 ** 2:
        return f"{size / 1024 ** 2:.1f} MiB"
    return f"{size / 1024:.1f} KiB"


class Reporter:
    """进度与说明一律走 stderr，stdout 留给 --json 的摘要。"""

    def __init__(self, quiet: bool = False) -> None:
        self.quiet = quiet
        self._dirty = False

    def _clear(self) -> None:
        if self._dirty:
            print(file=sys.stderr, flush=True)
            self._dirty = False

    def say(self, message: str) -> None:
        self._clear()
        if not self.quiet:
            print(message, file=sys.stderr, flush=True)

    def warn(self, message: str) -> None:
        self._clear()
        print(f"警告：{message}", file=sys.stderr, flush=True)

    def progress(self, done: int, total: int, written: int, started: float) -> None:
        if self.quiet:
            return
        elapsed = max(time.monotonic() - started, 0.001)
        rate = written / elapsed
        remaining = (total - done) * (elapsed / max(done, 1))
        print(
            f"\r  成员 {done}/{total} · 已写 {written / 1024 ** 2:,.0f} MiB · "
            f"{rate / 1024 ** 2:,.1f} MiB/s · 预计剩余 {format_duration(remaining)}   ",
            end="",
            file=sys.stderr,
            flush=True,
        )
        self._dirty = True

    def progress_done(self) -> None:
        self._clear()


# --------------------------------------------------------------------------------------
# 路径安全（与 app/installer.py 同规则：包本身就是外部输入，不能有模糊写法）
# --------------------------------------------------------------------------------------


def safe_relative(relative: str, label: str = "目标路径") -> str:
    def reject(reason: str):
        raise PackError(f"不安全的{label}：{relative!r}（{reason}）")

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


def installable_target(relative: str) -> str:
    """清单目标必须和安装目标一样严格，否则读取方会整包拒收。"""
    relative = safe_relative(relative, "素材目标路径")
    pure = PurePosixPath(relative)
    suffix = pure.suffix.lower()
    if suffix in INSTALL_AUDIO_SUFFIXES:
        if not relative.startswith(INSTALL_AUDIO_PREFIX):
            raise PackError(f"音频素材只能放在 {INSTALL_AUDIO_PREFIX}：{relative}")
        return relative
    if suffix not in INSTALL_IMAGE_SUFFIXES:
        raise PackError(f"不支持的素材类型（只允许图片和 assets/bgm/ 音频）：{relative}")
    if pure.parts[0] not in INSTALL_TREES:
        raise PackError(f"素材目标目录不在允许范围内：{relative}")
    return relative


# --------------------------------------------------------------------------------------
# 清单（来自提交里的固定清单）与素材来源
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class ItemRow:
    id: str
    cycle: str
    module: str
    subgroup: str
    name: str
    number: str
    sort_order: int
    capture_required: int
    faces: dict[str, str]


@dataclass(frozen=True)
class PlannedAsset:
    item_id: str
    face: str
    member: str
    source: Path
    size: int
    origin: str
    expected_sha256: str | None = None


@dataclass
class PlanStats:
    from_project: int = 0
    from_overlay: int = 0
    from_library: int = 0
    missing: list[str] = field(default_factory=list)
    orphan_faces: int = 0
    unsafe_targets: int = 0
    broken_items: int = 0
    faces_without_asset: int = 0


def load_catalog(cycles: set[str], modules: set[str], reporter: Reporter) -> tuple[list[ItemRow], dict]:
    """提交里的固定清单（app/fixed_catalog.py），不再依赖素材库里的 catalog_items。"""
    try:
        payload = fixed_catalog_payload()
    except Exception as error:  # noqa: BLE001
        raise PackError(f"读不到固定清单：{error}") from error
    stats = PlanStats()
    items: list[ItemRow] = []
    for raw in payload.get("items", []):
        cycle, module = str(raw.get("cycle") or ""), str(raw.get("module") or "")
        if cycles and cycle not in cycles:
            continue
        if modules and module not in modules:
            continue
        faces = raw.get("faces") or {}
        if not isinstance(faces, dict) or not faces:
            stats.broken_items += 1
            reporter.warn(f"清单条目没有可用的面定义，已跳过：{raw.get('id')}")
            continue
        items.append(
            ItemRow(
                id=str(raw["id"]),
                cycle=cycle,
                module=module,
                subgroup=str(raw.get("subgroup") or ""),
                name=str(raw.get("name") or ""),
                number=str(raw.get("number") or ""),
                sort_order=int(raw.get("sort_order") or 0),
                capture_required=int(raw.get("capture_required", 1)),
                faces={str(face): str(target) for face, target in faces.items()},
            )
        )
    if not items:
        raise PackError("筛选之后没有任何条目；检查 --cycle / --module")
    return items, payload.get("source") or {}


class LibraryReader:
    """可选兜底：工程目录里缺图时，从素材库取同一条目的当前版本。"""

    def __init__(self, path: Path) -> None:
        import sqlite3

        path = path.expanduser().resolve()
        database = path if path.is_file() else path / "library.sqlite3"
        if not database.is_file():
            raise PackError(f"素材库里找不到数据库：{database}")
        self.root = database.parent
        uri = database.as_uri()
        connection = None
        errors: list[str] = []
        wal = Path(str(database) + "-wal")
        try:
            wal_pending = wal.is_file() and wal.stat().st_size > 0
        except OSError:
            wal_pending = False
        attempts = [("只读", f"{uri}?mode=ro")]
        if not wal_pending:
            attempts.append(("只读（immutable）", f"{uri}?mode=ro&immutable=1"))
        attempts.append(("普通连接", str(database)))
        for label, target in attempts:
            candidate = None
            try:
                candidate = (
                    sqlite3.connect(target, uri=True) if target.startswith("file:") else sqlite3.connect(target)
                )
                candidate.execute("SELECT 1 FROM asset_revisions LIMIT 1").fetchall()
            except sqlite3.Error as error:
                errors.append(f"{label}：{error}")
                if candidate is not None:
                    candidate.close()
                continue
            connection = candidate
            break
        if connection is None:
            raise PackError(f"打不开素材库数据库：{database}（" + "；".join(errors) + "）")
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("PRAGMA query_only=ON")
        except sqlite3.Error:
            pass
        self._connection = connection
        self._revisions = {
            (row["item_id"], row["face"]): (row["original_path"], row["sha256"])
            for row in connection.execute(
                "SELECT item_id,face,original_path,sha256 FROM asset_revisions WHERE is_current=1"
            )
        }

    def close(self) -> None:
        self._connection.close()

    def lookup(self, item_id: str, face: str) -> tuple[Path, str] | None:
        entry = self._revisions.get((item_id, face))
        if not entry:
            return None
        path = self.root / entry[0]
        if not path.is_file():
            return None
        return path, entry[1]


def plan_assets(
    items: list[ItemRow],
    *,
    ato_root: Path,
    library: LibraryReader | None,
    official_assets: bool,
    skip_missing: bool,
    reporter: Reporter,
) -> tuple[list[PlannedAsset], PlanStats]:
    """每个面按「官中覆盖图（可选）→ 工程目录 → 素材库兜底」定来源。"""
    stats = PlanStats()
    planned: list[PlannedAsset] = []
    if official_assets:
        clear_official_cache()
    for item in items:
        for face, target in item.faces.items():
            if is_bgm_target(target):
                # 音频走 bgmFiles 段，和素材库导出（BGM 目标不进 assets）一致。
                continue
            try:
                member = installable_target(target)
            except PackError as error:
                stats.unsafe_targets += 1
                reporter.warn(f"{error}（条目 {item.id} / {face}）")
                continue
            project_file = ato_root / Path(*PurePosixPath(member).parts)
            source: Path | None = None
            origin = ""
            expected: str | None = None
            if official_assets:
                candidate, overridden = resolve_official_asset(ato_root, member, project_file)
                if overridden and Path(candidate).is_file():
                    source, origin = Path(candidate), "official-assets"
            if source is None and project_file.is_file():
                source, origin = project_file, "project"
            if source is None and library is not None:
                fallback = library.lookup(item.id, face)
                if fallback is not None:
                    source, origin, expected = fallback[0], "library", fallback[1]
            if source is None:
                stats.missing.append(f"{item.id} / {face} → {member}")
                continue
            planned.append(
                PlannedAsset(
                    item_id=item.id,
                    face=face,
                    member=member,
                    source=source,
                    size=source.stat().st_size,
                    origin=origin,
                    expected_sha256=expected,
                )
            )
            if origin == "project":
                stats.from_project += 1
            elif origin == "official-assets":
                stats.from_overlay += 1
            else:
                stats.from_library += 1

    stats.faces_without_asset = len(stats.missing)
    if stats.missing and not skip_missing:
        head = "\n  ".join(stats.missing[:10])
        more = f"\n  …… 还有 {len(stats.missing) - 10} 个" if len(stats.missing) > 10 else ""
        hint = "" if library is not None else "；如果这些图在素材库里，加 --library 让它们兜底"
        raise PackError(
            f"{len(stats.missing)} 个面在工程目录里找不到文件，先补齐（加 --skip-missing 可跳过）{hint}："
            f"\n  {head}{more}"
        )
    if stats.missing:
        reporter.warn(f"{len(stats.missing)} 个面没有素材，按 --skip-missing 跳过")

    seen: dict[str, PlannedAsset] = {}
    for asset in planned:
        previous = seen.setdefault(asset.member, asset)
        if previous is asset:
            continue
        if previous.source != asset.source:
            raise PackError(
                f"清单资源路径冲突：{asset.member}"
                f"（{previous.item_id}/{previous.face} 与 {asset.item_id}/{asset.face} 指向了不同文件）"
            )
    return planned, stats


def read_project_story(ato_root: Path) -> tuple[dict, bytes] | None:
    """工程目录里的民间正文（story/data/storybook-data.js）。"""
    path = ato_root / STORY_DATA_MEMBER
    if not path.is_file():
        return None
    raw = path.read_text(encoding="utf-8-sig")
    match = STORY_DATA_RE.match(raw)
    if not match:
        raise PackError(f"故事数据格式无法识别：{path}")
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as error:
        raise PackError(f"故事数据 JSON 无效：{path}（{error}）") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("books"), list):
        raise PackError(f"故事数据没有 books 段：{path}")
    return payload, path.read_bytes()


def load_official_payload(ato_root: Path) -> dict:
    """读工程里的官方故事书正文数据（story/data/storybook-official-data.js）。"""
    path = ato_root / OFFICIAL_STORY_DATA
    if not path.is_file():
        raise PackError(f"工程目录里没有官方故事书正文数据：{path}")
    text = path.read_text(encoding="utf-8-sig")
    if not text.startswith(OFFICIAL_DATA_PREFIX):
        raise PackError(f"官方故事书数据格式无法识别：{path}")
    try:
        payload = json.loads(text[len(OFFICIAL_DATA_PREFIX):].strip().removesuffix(";"))
    except json.JSONDecodeError as error:
        raise PackError(f"官方故事书数据 JSON 无效：{path}（{error}）") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("books"), list):
        raise PackError(f"官方故事书数据没有 books 段：{path}")
    return payload


def build_official_story(ato_root: Path, reporter: Reporter) -> tuple[dict, bytes, dict]:
    """官方版故事书 js：只保留官方正文。

    官方数据（``storybook-official-data.js``）是一层平行文本：条目按 ``book.id`` +
    ``entry.key`` 与民间骨架一一对应，字段是 ``officialTitle`` / ``officialText`` /
    ``officialScan``。所以这里用**民间骨架的元数据**（章节、order、links、encounter）
    配**官方正文**，生成故事页要的 ``window.STORYBOOK_DATA``：

    * 只保留有官方正文的条目（没有官方正文的条目在官方版里就是不存在的）；
    * 官方数据里多出来的条目（``*-official-*``）也收进来，章节按同前缀的邻居推断，
      ``order`` 接在该章最后（与 story/assets/app.js 插入条目时的算法一致）；
    * 民间正文一个字都不进包。
    """
    official = load_official_payload(ato_root)
    skeleton_payload: dict | None = None
    try:
        skeleton = read_project_story(ato_root)
        skeleton_payload = skeleton[0] if skeleton else None
    except PackError as error:
        reporter.warn(f"民间骨架读不出来，官方版只能按官方数据结构生成：{error}")
    skeleton_books = {
        str(book.get("id")): book for book in (skeleton_payload or {}).get("books", [])
    }

    books: list[dict] = []
    stats = {"books": 0, "entries": 0, "dropped": 0, "added": 0}
    for obook in official.get("books", []):
        book_id = str(obook.get("id") or "")
        if not book_id:
            continue
        sbook = skeleton_books.get(book_id) or {}
        chapters = [dict(chapter) for chapter in (sbook.get("chapters") or [])]
        if not chapters:
            chapters = [{"key": "main", "title": sbook.get("title") or book_id}]
        skeleton_entries = {
            str(entry.get("key") or entry.get("id")): entry
            for entry in (sbook.get("entries") or [])
        }
        # 同前缀（形如 c1-7-）的邻居章节，用来安置官方独有的条目。
        prefix_chapter: dict[str, str] = {}
        for key, entry in skeleton_entries.items():
            parts = key.split("-")
            if len(parts) >= 2:
                prefix_chapter.setdefault(f"{parts[0]}-{parts[1]}-", str(entry.get("chapterKey") or ""))

        entries: list[dict] = []
        for oentry in obook.get("entries", []):
            text = oentry.get("officialText")
            if not isinstance(text, str) or not text.strip():
                stats["dropped"] += 1
                continue
            key = str(oentry.get("key") or "")
            sentry = skeleton_entries.get(key) or skeleton_entries.get(str(oentry.get("id") or ""))
            if sentry is not None:
                entry = {**sentry}
                stats["entries"] += 1
            else:
                parts = key.split("-")
                chapter_key = prefix_chapter.get(
                    f"{parts[0]}-{parts[1]}-" if len(parts) >= 2 else "", ""
                ) or str(chapters[0]["key"])
                chapter_title = next(
                    (str(c.get("title") or "") for c in chapters if str(c.get("key")) == chapter_key),
                    str(chapters[0].get("title") or ""),
                )
                order = 0.0
                for other in entries:
                    if other.get("chapterKey") == chapter_key:
                        order = max(order, float(other.get("order") or 0))
                entry = {
                    "key": key,
                    "id": str(oentry.get("id") or key),
                    "chapterKey": chapter_key,
                    "chapter": chapter_title,
                    "section": chapter_title,
                    "order": order + 0.5,
                    "entryType": "official",
                }
                stats["added"] += 1
                stats["entries"] += 1
            entry["key"] = key or entry.get("key")
            entry["id"] = str(oentry.get("id") or entry.get("id") or key)
            # 正文与标题一律用官方版；民间正文不出现在官方版资料包里。
            entry["text"] = text
            if oentry.get("officialTitle"):
                entry["title"] = str(oentry["officialTitle"])
            entries.append(entry)

        entries.sort(key=lambda item: float(item.get("order") or 0))
        books.append(
            {
                "id": book_id,
                "title": str(sbook.get("title") or book_id),
                "entryCount": len(entries),
                "chapters": chapters,
                "entries": entries,
            }
        )
        stats["books"] += 1

    payload = {"generatedAt": "ATO Asset Studio 官方版", "books": books}
    javascript = (
        "window.STORYBOOK_DATA = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    ).encode("utf-8")
    return payload, javascript, stats


# --------------------------------------------------------------------------------------
# 写包
# --------------------------------------------------------------------------------------


@dataclass
class WriteOutcome:
    manifest: dict
    bgm_count: int
    extra_members: list[str]
    resources_written: int
    hash_mismatch_count: int
    hash_mismatches: list[str]
    # 重编码之后包内成员的真实大小（只有被换掉的成员在里面）；verify_partial 用它，
    # 免得拿计划里的原始大小去比包内实际大小。
    sizes: dict[str, int] = field(default_factory=dict)
    shrink: ShrinkStats | None = None


def build_manifest(
    *,
    catalog_source: dict,
    items: list[ItemRow],
    written: list[tuple[PlannedAsset, str]],
    stories: dict,
    story_files: list[dict],
    progress: dict,
    resource_files: list[dict],
    bgm_files: list[dict],
    ato_root: Path,
    official_scans: bool,
) -> dict:
    manifest = {
        "format": PACKAGE_FORMAT,
        # 带官方资料（正文数据或截图）就是 3，与 add_to_archive 的规则一致。
        "version": PACKAGE_VERSION_OFFICIAL if resource_files else PACKAGE_VERSION_FAN,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "catalogSource": catalog_source,
        "items": [
            {
                "id": item.id,
                "cycle": item.cycle,
                "module": item.module,
                "subgroup": item.subgroup,
                "name": item.name,
                "number": item.number,
                "sort_order": item.sort_order,
                "capture_required": item.capture_required,
                "source_version": str(catalog_source.get("catalog_version") or ""),
                "faces": item.faces,
            }
            for item in items
        ],
        "assets": [
            {
                "itemId": asset.item_id,
                "face": asset.face,
                "sha256": digest,
                "member": asset.member,
                "mimeType": mimetypes.guess_type(asset.member)[0] or "application/octet-stream",
                "originalName": PurePosixPath(asset.member).name,
            }
            for asset, digest in written
        ],
        "stories": stories,
        "storyFiles": story_files,
        "progress": progress,
        "resourceFiles": resource_files,
        "build": {
            "kind": "fan-resource-pack",
            "edition": "fan",
            "tool": TOOL_NAME,
            "toolVersion": TOOL_VERSION,
            "atoRoot": ato_root.name,
            "officialScans": bool(official_scans),
            "correctedProjectOverlay": True,
            "audioIncluded": bool(bgm_files),
        },
    }
    if bgm_files:
        manifest["bgmFiles"] = bgm_files
    return manifest


def write_pack(
    *,
    plan: list[PlannedAsset],
    partial: Path,
    items: list[ItemRow],
    catalog_source: dict,
    total_members: int,
    ato_root: Path,
    stories: dict,
    stories_bytes: bytes,
    entity_index,
    include_story_data: bool,
    include_story_files: bool,
    official_files: list[tuple[str, Path]],
    official_scans: bool,
    bgm_files: list[tuple[str, Path]],
    compression: int,
    reporter: Reporter,
    edition: str = "fan",
    image_quality: int | None = None,
    image_quality_keep: list[str] | None = None,
) -> WriteOutcome:
    """先写 .partial；写入时顺手算真实哈希（清单哈希必须等于真实字节）。

    ``image_quality`` 打开时，图片成员会先过一遍 :func:`image_shrink.shrink_image`：
    换掉了就写新字节（成员名不变、哈希按新字节算），没换就原样流式写入。
    ``image_quality_keep`` 里的通配命中的成员永远按原字节进包（决战板图、使徒大图这类）。
    """
    written: list[tuple[PlannedAsset, str]] = []
    digest_by_member: dict[str, str] = {}
    extra_members: list[str] = []
    mismatches: list[str] = []
    mismatch_count = 0
    started = time.monotonic()
    written_bytes = 0
    shrink_stats = ShrinkStats() if image_quality else None
    size_overrides: dict[str, int] = {}

    with zipfile.ZipFile(partial, "w", compression=compression, allowZip64=True) as archive:
        for index, asset in enumerate(plan, 1):
            digest = digest_by_member.get(asset.member)
            if digest is None:
                shrunk = None
                if image_quality and is_image_member(asset.member):
                    if matches_any(asset.member, image_quality_keep):
                        if shrink_stats is not None:
                            shrink_stats.kept_by_rule += 1
                    else:
                        raw = asset.source.read_bytes()
                        shrunk = shrink_image(
                            raw, image_quality, member=asset.member, stats=shrink_stats
                        )
                        if shrunk is not None:
                            digest = hashlib.sha256(shrunk).hexdigest()
                            archive.writestr(asset.member, shrunk)
                            written_bytes += len(shrunk)
                            size_overrides[asset.member] = len(shrunk)
                if shrunk is None:
                    digest = hashlib.sha256()
                    with asset.source.open("rb") as source, archive.open(
                        asset.member, "w", force_zip64=True
                    ) as target:
                        while chunk := source.read(CHUNK_SIZE):
                            digest.update(chunk)
                            target.write(chunk)
                    digest = digest.hexdigest()
                    written_bytes += asset.size
                digest_by_member[asset.member] = digest
            if asset.expected_sha256 and asset.expected_sha256 != digest:
                # 素材库兜底时记录对不上；工程目录是原始文件，不存在这个问题。
                mismatch_count += 1
                if len(mismatches) < 20:
                    mismatches.append(f"{asset.item_id} / {asset.face}（{asset.member}）")
            written.append((asset, digest))
            if index % 25 == 0 or index == len(plan):
                reporter.progress(index, total_members, written_bytes, started)
        reporter.progress_done()

        # 官方故事书正文数据（可选原书截图）：与素材库导出同一个 resourceFiles 段。
        resource_files: list[dict] = []
        for target, path in official_files:
            raw = path.read_bytes()
            archive.writestr(target, raw)
            resource_files.append(
                {
                    "target": target,
                    "member": target,
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "bytes": len(raw),
                }
            )

        story_files: list[dict] = []
        if entity_index is not None:
            archive.writestr(ENTITY_INDEX_MEMBER, entity_index.json_bytes)
            story_files = [entity_index_manifest_entry(entity_index)]
            if include_story_files:
                # 再按工程相对路径落一份：解压拖进项目就能直接跑。
                archive.writestr(STORY_DATA_MEMBER, stories_bytes)
                archive.writestr(ENTITY_INDEX_JSON_TARGET, entity_index.json_bytes)
                archive.writestr(ENTITY_INDEX_JS_TARGET, entity_index_javascript(entity_index))
                extra_members = [
                    STORY_DATA_MEMBER,
                    ENTITY_INDEX_JSON_TARGET,
                    ENTITY_INDEX_JS_TARGET,
                ]

        bgm_entries: list[dict] = []
        for target, path in bgm_files:
            raw = path.read_bytes()
            archive.writestr(target, raw)
            bgm_entries.append(
                {
                    "target": target,
                    "member": target,
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "bytes": len(raw),
                    "mimeType": bgm_mime(target),
                }
            )

        manifest = build_manifest(
            catalog_source=catalog_source,
            items=items,
            written=written,
            stories=stories if include_story_data else {"generatedAt": "ATO Asset Studio", "books": []},
            story_files=story_files,
            progress={"skippedFaces": [], "storyReview": []},
            resource_files=resource_files,
            bgm_files=bgm_entries,
            ato_root=ato_root,
            official_scans=official_scans,
        )
        manifest["build"]["edition"] = edition
        manifest["build"]["kind"] = "official-resource-pack" if edition == "official" else "fan-resource-pack"
        archive.writestr(
            "manifest.json", json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
        )
    return WriteOutcome(
        manifest=manifest,
        bgm_count=len(bgm_entries),
        extra_members=extra_members,
        resources_written=len(resource_files),
        hash_mismatch_count=mismatch_count,
        hash_mismatches=mismatches,
        sizes=size_overrides,
        shrink=shrink_stats,
    )


# --------------------------------------------------------------------------------------
# 校验：改名之前做，做完才允许最终路径出现
# --------------------------------------------------------------------------------------


def verify_partial(
    partial: Path,
    manifest: dict,
    plan: list[PlannedAsset],
    extra_members: list[str],
    mode: str,
    sample: int,
    reporter: Reporter,
    size_overrides: dict[str, int] | None = None,
) -> dict:
    declared_lookup: dict[str, str] = {}
    for asset in manifest.get("assets", []):
        member = str(asset.get("member") or "")
        digest = str(asset.get("sha256") or "")
        if not SHA256_RE.fullmatch(digest):
            raise PackError(f"清单里的哈希格式无效：{member}")
        declared_lookup[member] = digest

    expected_sizes = {asset.member: asset.size for asset in plan}
    if size_overrides:
        # 图片重编码过：包内大小按重编码后的字节算，不是磁盘原文件大小。
        expected_sizes.update(
            {member: size for member, size in size_overrides.items() if member in expected_sizes}
        )
    with zipfile.ZipFile(partial) as archive:
        names = archive.namelist()
        name_set = set(names)

        if manifest.get("format") != PACKAGE_FORMAT:
            raise PackError("写出来的包清单格式不对")
        if int(manifest.get("version", 0)) > PACKAGE_VERSION_OFFICIAL:
            raise PackError("写出来的包版本号不对")
        if "manifest.json" not in name_set:
            raise PackError("写出来的包缺少 manifest.json（多半是写到一半被打断了）")

        missing = [member for member in expected_sizes if member not in name_set]
        if missing:
            raise PackError(f"写出来的包缺少 {len(missing)} 个成员，首个为：{missing[0]}")
        for member, size in expected_sizes.items():
            actual = archive.getinfo(member).file_size
            if actual != size:
                raise PackError(f"成员大小不符：{member}（磁盘 {size} 字节，包内 {actual} 字节）")
        for member in extra_members:
            if member not in name_set:
                raise PackError(f"写出来的包缺少故事文件：{member}")
        for member in declared_lookup:
            if member not in name_set:
                raise PackError(f"清单声明的成员不在包里：{member}")
        # 官方资料（正文数据 / 截图）也必须真的在包里，且哈希对得上。
        for item in manifest.get("resourceFiles", []):
            target = str(item.get("target") or "")
            if target not in name_set:
                raise PackError(f"资料包缺少官方资料：{target}")
            digest = hashlib.sha256(archive.read(target)).hexdigest()
            if digest != item.get("sha256"):
                raise PackError(f"官方资料校验失败：{target}")
        for item in manifest.get("bgmFiles", []) or []:
            target = str(item.get("target") or "")
            if target not in name_set:
                raise PackError(f"资料包缺少背景音乐：{target}")

        checked = 0
        if mode != "none" and declared_lookup:
            members = list(declared_lookup)
            if mode == "full":
                targets = members
            else:
                wanted = max(sample, 1)
                step = max(len(members) // wanted, 1)
                targets = members[::step][:wanted]
            for member in targets:
                digest = hashlib.sha256()
                with archive.open(member) as source:
                    while chunk := source.read(CHUNK_SIZE):
                        digest.update(chunk)
                if digest.hexdigest() != declared_lookup[member]:
                    raise PackError(f"包内文件校验失败：{member}")
                checked += 1
            reporter.say(f"  校验：{mode} 模式比对 {checked} 个成员，全部通过")

        return {
            "mode": mode,
            "members": len(names),
            "declared_assets": len(declared_lookup),
            "hashes_checked": checked,
            "bytes": partial.stat().st_size,
        }


def commit_partial(partial: Path, output: Path, reporter: Reporter) -> None:
    """落盘 + 原子改名：最终路径上只可能出现完整、已落盘的包。"""
    try:
        # 关文件只是把数据交给系统；断电时缓存里的字节会丢，所以显式刷一次盘。
        with partial.open("rb+") as handle:
            handle.flush()
            os.fsync(handle.fileno())
    except OSError as error:
        reporter.warn(f"刷盘失败（继续改名）：{error}")
    last_error: Exception | None = None
    for attempt in range(12):
        try:
            os.replace(partial, output)
            return
        except PermissionError as error:
            # Windows Defender / 索引器会短暂占住刚关闭的 ZIP。
            last_error = error
            if attempt == 0:
                reporter.say("  输出文件被占用，正在重试改名……")
            time.sleep(2)
    raise PackError(
        f"包已经写好并校验通过，但改名到 {output} 失败：{last_error}。"
        f"完整包留在 {partial}，可以手动改名。"
    )


# --------------------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------------------


@dataclass
class BuildResult:
    output: str
    bytes: int
    members: int
    assets: int
    items: int
    declared_faces: int
    faces_without_asset: int
    from_project: int
    from_official_assets: int
    from_library: int
    duplicate_members: int
    stories_books: int
    stories_entries: int
    story_source: str
    story_entries_dropped: int = 0
    story_entries_added: int = 0
    entities: int = 0
    official_files: int = 0
    official_scans: bool = False
    package_version: int = PACKAGE_VERSION_FAN
    bgm_files: int = 0
    edition: str = "fan"
    unsafe_targets: int = 0
    broken_items: int = 0
    hash_mismatches: list[str] = field(default_factory=list)
    hash_mismatch_count: int = 0
    verification: dict = field(default_factory=dict)
    elapsed_seconds: float = 0.0
    shrink: dict | None = None


def build(
    *,
    ato_root: Path,
    output: Path,
    library_path: Path | None,
    cycles: list[str],
    modules: list[str],
    complete_only: bool,
    include_story_data: bool,
    include_bgm: bool,
    include_story_files: bool,
    official_story: bool,
    official_scans: bool,
    official_assets: bool,
    skip_missing: bool,
    force: bool,
    dry_run: bool,
    compression_name: str,
    verify_mode: str,
    verify_sample: int,
    reporter: Reporter,
    story_source: str = "project",
    edition: str = "fan",
    image_quality: int | None = None,
    image_quality_keep: list[str] | None = None,
) -> BuildResult:
    started = time.monotonic()
    ato_root = ato_root.expanduser().resolve()
    if not (ato_root / "index.html").is_file():
        raise PackError(f"这不像 ATO_assistant 根目录（没有 index.html）：{ato_root}")
    if image_quality is not None and not IMAGE_QUALITY_MIN <= image_quality <= IMAGE_QUALITY_MAX:
        raise PackError(
            f"--image-quality 要在 {IMAGE_QUALITY_MIN}–{IMAGE_QUALITY_MAX} 之间：{image_quality}"
        )

    items, catalog_source = load_catalog(set(cycles), set(modules), reporter)
    library = LibraryReader(library_path) if library_path is not None else None
    try:
        planned, stats = plan_assets(
            items,
            ato_root=ato_root,
            library=library,
            official_assets=official_assets,
            skip_missing=skip_missing,
            reporter=reporter,
        )
    finally:
        if library is not None:
            library.close()

    if complete_only:
        have = {(asset.item_id, asset.face) for asset in planned}
        # BGM 目标由 bgmFiles 段分发，不算「缺图」，不该因为没拍摄音频就把条目整条丢掉。
        keep = {
            item.id
            for item in items
            if {face for face, target in item.faces.items() if not is_bgm_target(target)}
            <= {face for item_id, face in have if item_id == item.id}
        }
        items = [item for item in items if item.id in keep]
        keep_ids = {item.id for item in items}
        planned = [asset for asset in planned if asset.item_id in keep_ids]

    if not planned:
        raise PackError("没有任何素材可以打包；检查 --cycle / --module / --complete-only 与工程目录")

    # 故事：民间版读工程里的 storybook-data.js；官方版用官方正文数据生成（见 --story-source）。
    stories: dict = {"generatedAt": "ATO Asset Studio", "books": []}
    stories_bytes = b""
    resolved_story_source = "none"
    story_stats = {"books": 0, "entries": 0, "dropped": 0, "added": 0}
    if include_story_data:
        if story_source == "official":
            stories, stories_bytes, story_stats = build_official_story(ato_root, reporter)
            resolved_story_source = OFFICIAL_STORY_DATA
            reporter.say(
                f"  官方版故事: {story_stats['books']} 本 / {story_stats['entries']} 段"
                f"（丢弃没有官方正文的 {story_stats['dropped']} 条，"
                f"补入官方独有的 {story_stats['added']} 条）"
            )
        else:
            project_story = read_project_story(ato_root)
            if project_story is None:
                raise PackError(
                    f"工程目录里没有 {STORY_DATA_MEMBER}；用 --no-story-data 明确不带故事，"
                    "或先恢复这个文件"
                )
            stories, stories_bytes = project_story
            resolved_story_source = STORY_DATA_MEMBER

    try:
        entity_index = find_entity_index(ato_root, ato_root) if stories.get("books") else None
    except ValueError as error:
        raise PackError(f"人物小传索引无法解析：{error}") from error
    if stories.get("books") and entity_index is None:
        raise PackError(
            f"故事正文要配人物小传索引，但工程目录里没有 {ENTITY_INDEX_JSON_TARGET}（或 .js）"
        )

    # 官方资料与 BGM 都复用提交里的收集器：它们的校验失败（截图缺失、文件过大、
    # 数据文件格式不对）在这里换成统一的打包错误，命令行只打一行说明，不吐栈。
    try:
        official_files = collect_official(ato_root, include_scans=official_scans) if official_story else []
        bgm = collect_bgm_files(ato_root) if include_bgm else []
    except ValueError as error:
        raise PackError(str(error)) from error

    stories_entries = sum(len(book.get("entries", [])) for book in stories.get("books", []))
    declared_faces = sum(len(item.faces) for item in items)

    total_bytes = (
        sum(asset.size for asset in planned)
        + sum(path.stat().st_size for _, path in official_files)
        + sum(path.stat().st_size for _, path in bgm)
    )
    story_member_count = 0 if entity_index is None else (4 if include_story_files else 1)
    member_count = len(planned) + len(official_files) + len(bgm) + story_member_count + 1

    if len(planned) > MAX_ASSETS:
        raise PackError(f"图片条目过多（{len(planned)}，读取方上限 {MAX_ASSETS}）")
    oversized = [asset for asset in planned if asset.size > MAX_MEMBER_BYTES]
    if oversized:
        raise PackError(
            f"{len(oversized)} 个素材超过单成员 {MAX_MEMBER_BYTES // (1024 * 1024)}MB 上限，"
            f"首个为：{oversized[0].member}"
        )
    if member_count > MAX_MEMBERS:
        raise PackError(f"成员数量过多（{member_count}，读取方上限 {MAX_MEMBERS}）")
    if total_bytes > MAX_TOTAL_BYTES:
        raise PackError(
            f"解压后总大小 {human_bytes(total_bytes)} 超过读取方 {MAX_TOTAL_BYTES // 1024 ** 3}GB 上限"
        )

    duplicate_members = len(planned) - len({asset.member for asset in planned})
    reporter.say(f"工程目录  : {ato_root}")
    reporter.say(
        f"清单/素材 : {len(items)} 个条目、{declared_faces} 个面 → {len(planned)} 张图"
        f"（工程 {stats.from_project}"
        + (f" · 官中图 {stats.from_overlay}" if stats.from_overlay else "")
        + (f" · 素材库兜底 {stats.from_library}" if stats.from_library else "")
        + "）"
    )
    reporter.say(
        f"故事      : {len(stories['books'])} 本 / {stories_entries} 段（{resolved_story_source}）；"
        f"人物小传 {entity_index.entity_count if entity_index else 0} 条"
    )
    reporter.say(
        f"官方资料  : {len(official_files)} 个文件"
        + ("（含原书扫描图）" if official_scans else "（只带官方故事书正文数据）" if official_files else "（无）")
    )
    reporter.say(f"背景音乐  : {len(bgm)} 首")
    reporter.say(f"成员/体积 : {member_count} / {human_bytes(total_bytes)}")
    if image_quality:
        reporter.say(f"图片重编码: 开（JPEG 质量 {image_quality}，不缩放；实际体积以写盘后为准）")
        if image_quality_keep:
            reporter.say(f"            名单豁免 {len(image_quality_keep)} 条通配，命中的图原样进包")
    if stats.missing:
        reporter.say(f"跳过的面  : {len(stats.missing)}（--skip-missing）")

    if dry_run:
        reporter.say("--dry-run：只统计，不写盘。")
        return BuildResult(
            output=str(output),
            bytes=total_bytes,
            members=member_count,
            assets=len(planned),
            items=len(items),
            declared_faces=declared_faces,
            faces_without_asset=stats.faces_without_asset,
            from_project=stats.from_project,
            from_official_assets=stats.from_overlay,
            from_library=stats.from_library,
            duplicate_members=duplicate_members,
            stories_books=len(stories["books"]),
            stories_entries=stories_entries,
            story_source=resolved_story_source,
            story_entries_dropped=story_stats["dropped"],
            story_entries_added=story_stats["added"],
            entities=entity_index.entity_count if entity_index else 0,
            official_files=len(official_files),
            official_scans=official_scans,
            package_version=PACKAGE_VERSION_OFFICIAL if official_files else PACKAGE_VERSION_FAN,
            bgm_files=len(bgm),
            edition=edition,
            unsafe_targets=stats.unsafe_targets,
            broken_items=stats.broken_items,
            verification={"mode": "dry-run", "members": 0, "declared_assets": 0, "hashes_checked": 0, "bytes": 0},
            elapsed_seconds=time.monotonic() - started,
        )

    output = output.expanduser().resolve()
    if output.exists() and not force:
        raise PackError(f"输出已存在：{output}（要覆盖请加 --force）")
    if output.suffix.lower() != ".atopack":
        reporter.warn(f"输出文件不是 .atopack 后缀：{output.name}")
    if output.parent == ato_root:
        raise PackError("别把资料包写进工程根目录；换个输出目录（例如 export/）")
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = Path(str(output) + ".partial")
    partial.unlink(missing_ok=True)

    compression = zipfile.ZIP_STORED if compression_name == "store" else zipfile.ZIP_DEFLATED
    try:
        reporter.say(f"开始写入 {partial.name} ……")
        outcome = write_pack(
            plan=planned,
            partial=partial,
            items=items,
            catalog_source=catalog_source,
            total_members=member_count,
            ato_root=ato_root,
            stories=stories,
            stories_bytes=stories_bytes,
            entity_index=entity_index,
            include_story_data=include_story_data,
            include_story_files=include_story_files,
            official_files=official_files,
            official_scans=official_scans,
            bgm_files=bgm,
            compression=compression,
            reporter=reporter,
            edition=edition,
            image_quality=image_quality,
            image_quality_keep=image_quality_keep,
        )
        reporter.say("校验 .partial（改名之前）……")
        verification = verify_partial(
            partial,
            outcome.manifest,
            planned,
            outcome.extra_members,
            verify_mode,
            verify_sample,
            reporter,
            size_overrides=outcome.sizes,
        )
    except BaseException:
        reporter.warn(f"打包失败：未完成的包留在 {partial}，最终路径 {output} 上没有生成任何文件")
        raise

    if outcome.hash_mismatch_count:
        reporter.warn(
            f"素材库兜底的 {outcome.hash_mismatch_count} 个哈希与磁盘文件不符（清单按真实字节写入）："
        )
        for entry in outcome.hash_mismatches:
            reporter.warn(f"  {entry}")
    if outcome.shrink is not None:
        reporter.say(f"  {outcome.shrink.describe()}")

    commit_partial(partial, output, reporter)
    return BuildResult(
        output=str(output),
        bytes=output.stat().st_size,
        members=verification["members"],
        assets=len(planned),
        items=len(items),
        declared_faces=declared_faces,
        faces_without_asset=stats.faces_without_asset,
        from_project=stats.from_project,
        from_official_assets=stats.from_overlay,
        from_library=stats.from_library,
        duplicate_members=duplicate_members,
        stories_books=len(stories["books"]),
        stories_entries=stories_entries,
        story_source=resolved_story_source,
        story_entries_dropped=story_stats["dropped"],
        story_entries_added=story_stats["added"],
        entities=entity_index.entity_count if entity_index else 0,
        official_files=outcome.resources_written,
        official_scans=official_scans,
        package_version=int(outcome.manifest["version"]),
        bgm_files=outcome.bgm_count,
        edition=edition,
        unsafe_targets=stats.unsafe_targets,
        broken_items=stats.broken_items,
        hash_mismatches=outcome.hash_mismatches,
        hash_mismatch_count=outcome.hash_mismatch_count,
        verification=verification,
        elapsed_seconds=time.monotonic() - started,
        shrink=outcome.shrink.as_dict() if outcome.shrink else None,
    )


def report(result: BuildResult, reporter: Reporter) -> None:
    edition = "官方版" if result.edition == "official" else "民间版"
    done = result.verification.get("mode") != "dry-run"
    reporter.say("")
    reporter.say(f"{edition}资料包已生成" if done else "统计完成（--dry-run）")
    reporter.say(f"  输出      : {result.output}")
    reporter.say(f"  大小      : {human_bytes(result.bytes)}（{result.bytes:,} 字节）")
    reporter.say(
        f"  格式版本  : {result.package_version}"
        f"（{'带官方资料' if result.package_version >= 3 else '民间版，不含官方资料'}）"
    )
    reporter.say(f"  条目/图片 : {result.items} / {result.assets}")
    origins = [f"工程目录 {result.from_project}"]
    if result.from_official_assets:
        origins.append(f"官中覆盖图 {result.from_official_assets}")
    if result.from_library:
        origins.append(f"素材库兜底 {result.from_library}")
    reporter.say(f"  图片来源  : {' · '.join(origins)}")
    if result.faces_without_asset:
        reporter.say(f"  跳过的面  : {result.faces_without_asset}")
    reporter.say(
        f"  故事      : {result.stories_books} 本 / {result.stories_entries} 段"
        f"（{result.story_source}）；人物小传 {result.entities} 条"
    )
    if result.story_entries_dropped or result.story_entries_added:
        reporter.say(
            f"  官方正文  : 丢弃无官方正文 {result.story_entries_dropped} 条，"
            f"补入官方独有 {result.story_entries_added} 条"
        )
    reporter.say(
        f"  官方资料  : {result.official_files} 个文件"
        + ("（含原书扫描图）" if result.official_scans else "")
    )
    reporter.say(f"  背景音乐  : {result.bgm_files} 首")
    if result.shrink:
        reporter.say(
            f"  图片瘦身  : 重编 {result.shrink['converted']} 张，"
            f"{human_bytes(result.shrink['before'])} → {human_bytes(result.shrink['after'])}"
            f"（省 {human_bytes(result.shrink['saved'])}）"
        )
    reporter.say(
        f"  成员/校验 : {result.members} / "
        f"{result.verification.get('mode')}（比对 {result.verification.get('hashes_checked', 0)} 个哈希）"
    )
    reporter.say(f"  耗时      : {format_duration(result.elapsed_seconds)}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog=TOOL_NAME,
        description="从 ATO_assistant 工程目录打一个民间版 .atopack（原子写入 + 改名之前校验）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例：\n"
            "  python build_fan_pack.py --ato-root D:\\\\desktop\\\\ATO_assistant "
            "--output export\\\\ATO-Assistant-Resources-2026-09-19.atopack\n"
            "  python build_fan_pack.py --ato-root . --output out.atopack --dry-run\n"
        ),
    )
    parser.add_argument("--ato-root", type=Path, required=True, help="ATO_assistant 根目录（素材、故事、BGM 的真源）")
    parser.add_argument("--output", type=Path, required=True, help="输出的 .atopack 路径")
    parser.add_argument("--library", type=Path, help="可选兜底：工程目录里缺图时用素材库的同一条目")
    parser.add_argument("--cycle", action="append", default=[], help="只打这些循环，可重复或逗号分隔")
    parser.add_argument("--module", action="append", default=[], help="只打这些模块，可重复或逗号分隔")
    parser.add_argument("--complete-only", action="store_true", help="只打正反面都齐了的条目")
    parser.add_argument("--no-story-data", action="store_true", help="不带故事正文与人物小传")
    parser.add_argument("--no-bgm", action="store_true", help="不带主控台背景音乐")
    parser.add_argument("--no-story-files", action="store_true", help="不在包里额外落 story/data/*.js（默认落）")
    parser.add_argument("--no-official-story", action="store_true", help="不带官方故事书正文数据（格式版本回到 2）")
    parser.add_argument("--include-official-scans", action="store_true", help="官方版资料包：连官方原书扫描图一起打进包")
    parser.add_argument("--official-assets", action="store_true", help="图片优先用官中覆盖图 official-assets/")
    parser.add_argument("--skip-missing", action="store_true", help="找不到文件的面跳过而不是中断")
    parser.add_argument("--force", action="store_true", help="允许覆盖已存在的输出")
    parser.add_argument("--dry-run", action="store_true", help="只统计不写盘")
    parser.add_argument(
        "--compress", choices=("store", "deflate"), default="store",
        help="store 最快（图片本来就压过了）；deflate 体积略小",
    )
    parser.add_argument(
        "--verify", choices=("none", "sample", "full"), default="sample",
        help="改名之前的包内校验强度（默认抽样）",
    )
    parser.add_argument("--verify-sample", type=int, default=32, help="抽样校验的成员数量（默认 32）")
    parser.add_argument(
        "--image-quality", type=int, default=None,
        help=(
            "打包时把图片重新编码到这个 JPEG 质量（40–95，常用 85）来缩小体积；"
            "不传就完全不重编。成员名不变，收益不够的图保持原样"
        ),
    )
    parser.add_argument(
        "--image-quality-keep", action="append", default=[],
        help="重编码豁免通配（可重复/逗号分隔），命中的图原样进包，例如 ss/battle-board.jpg",
    )
    parser.add_argument(
        "--image-quality-keep-file", type=Path,
        help="豁免名单文件：一行一条通配，`#` 开头是注释",
    )
    parser.add_argument("--json", action="store_true", help="stdout 输出机器可读摘要")
    parser.add_argument("--quiet", action="store_true", help="不打印进度")
    parser.add_argument("--version", action="version", version=f"{TOOL_NAME} {TOOL_VERSION}")
    return parser.parse_args(argv)


def as_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    out: list[str] = []
    for entry in value:
        for part in str(entry).split(","):
            part = part.strip()
            if part:
                out.append(part)
    return out


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    reporter = Reporter(quiet=args.quiet)
    try:
        result = build(
            ato_root=args.ato_root,
            output=args.output,
            library_path=args.library,
            cycles=as_list(args.cycle),
            modules=as_list(args.module),
            complete_only=args.complete_only,
            include_story_data=not args.no_story_data,
            include_bgm=not args.no_bgm,
            include_story_files=not args.no_story_files,
            official_story=not args.no_official_story,
            official_scans=args.include_official_scans,
            official_assets=args.official_assets,
            skip_missing=args.skip_missing,
            force=args.force,
            dry_run=args.dry_run,
            compression_name=args.compress,
            verify_mode=args.verify,
            verify_sample=args.verify_sample,
            reporter=reporter,
            image_quality=args.image_quality,
            image_quality_keep=as_list(args.image_quality_keep)
            + load_keep_patterns(args.image_quality_keep_file),
        )
    except PackError as error:
        print(f"打包失败：{error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("已中断：最终路径上没有生成任何文件", file=sys.stderr)
        return 130

    if args.json:
        print(json.dumps(result.__dict__, ensure_ascii=False, indent=2))
    else:
        report(result, reporter)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
