"""混合媒体素材（私有映射表 + 书籍裁图）：随 .atopack 分发的混排图文件。

程序包（便携版 / Docker / APK）都不带这批素材：``story/assets/mixed-media/mapping.js``
是使用者的私有映射表，``images/c1..c5/`` 里是从原书裁下来的图（PNG/SVG），两者都在
``.gitignore`` 里（``/story/assets/mixed-media/mapping.js`` 与
``/story/assets/mixed-media/images/``），按仓库的版权约定只留在本地。这里让素材库把它们
将运行时必需的映射及原始图片写进 .atopack 的 ``mixedMediaFiles`` 段，导入后由「分享与安装」落回同目录；
Android 端 AtopackStore 按同一段解包到 web 根目录的 ``story/assets/mixed-media/``，
因此故事书按 ``./assets/mixed-media/images/c1/<名称>.png``（相对 ``story/index.html``）
取混排图时不用额外配置。

``mixedMediaFiles`` 与 ``bgmFiles`` / ``iconFiles`` / ``crypticFiles`` 一样是附加字段
（不改变资料包版本号），老版本读取方会直接忽略它。图片目标与渲染器
``story/assets/mixed-media/renderer.js`` 里的 ``pathOK`` 逐字一致：只认 ``images/c[1-5]/``
下小写名、不含点、``.png`` / ``.svg`` 结尾的图；同目录的 ``renderer.js`` / ``styles.css``
是随源码发布的程序代码，一个都不收。
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

MIXED_MEDIA_DIR = "story/assets/mixed-media"
MAPPING_TARGET = "story/assets/mixed-media/mapping.js"
IMAGES_DIR = "story/assets/mixed-media/images"
LIBRARY = Path("sources/mixed-media")
# 图片后缀白名单只在这里收敛一次：下面那条目标正则由它拼出来，别处不要另写一份。
IMAGE_SUFFIXES = (".png", ".svg")
# 映射表实测约 12MB：留一倍余量，32MB 足够拦住误放的整本数据。
MAX_MAPPING_BYTES = 32 * 1024 * 1024
# 单张裁图上限 8MB（实测最大约 5.8MB）。
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_FILES = 2048
# 一条通道里的成员总数：映射表最多一份，其余都是裁图。
MAX_FILES = MAX_IMAGE_FILES + 1

_MIME = {".png": "image/png", ".svg": "image/svg+xml", ".js": "text/javascript"}
# 与渲染器 renderer.js 的 pathOK 逐字一致（小写名、不含点、后缀小写）：
#   /^story\/assets\/mixed-media\/images\/c[1-5]\/[a-z0-9][a-z0-9_-]*\.(?:png|svg)$/
# 宽于渲染器的名字进得了包却没任何引用，等于白占体积，所以这里不放宽。
_TARGET = re.compile(
    r"story/assets/mixed-media/images/c[1-5]/[a-z0-9][a-z0-9_-]*"
    r"\.(?:" + "|".join(re.escape(suffix[1:]) for suffix in IMAGE_SUFFIXES) + r")"
)

# renderer.js 消费的字段；审计说明、覆盖统计和重复的源文/图片摘要不进入运行时 mapping。
RUNTIME_SCHEMAS = ("schema", "resourceSchema", "battleSchema", "requestedSchema", "vectorSchema")
RUNTIME_LEDGERS = ("rows", "resourceRows", "battleRows", "requestedRows", "resourceScopeExclusions", "vectorAssets")
RUNTIME_FIELDS = frozenset("""
book key variant kind path anchor position replaceText contextBefore contextAfter textFingerprint layout
alt resourceLabel semanticLabel retainedNameText scope vectorPath sourcePngSha256 svgSha256
anchorOccurrence anchorCount textLength retainedNameStart retainedNameEnd pdfPage printedPage start end width height
textAlreadyNamesResource textAlreadyNamesMedia
""".split())
_ASSIGNMENT = re.compile(r"\s*(?:(?:/\*.*?\*/|//[^\r\n]*)\s*)*window\.ATO_MIXED_MEDIA_MAP\s*=\s*", re.S)


def compact_mapping(raw: bytes) -> bytes:
    """保留现有 schema 和锚点语义，只移除渲染器从不读取的资料及空白。"""
    try:
        text = raw.decode("utf-8-sig")
        assignment = _ASSIGNMENT.match(text)
        if assignment is None:
            raise ValueError("mapping 缺少约定的数据赋值")
        data, end = json.JSONDecoder().raw_decode(text, assignment.end())
        if text[end:].strip() not in ("", ";"):
            raise ValueError("mapping 含有额外脚本")
        if not isinstance(data, dict) or type(data.get("schema")) not in (int, float) or data["schema"] != 1:
            raise ValueError("不支持的 mapping schema")
        result = {name: data[name] for name in RUNTIME_SCHEMAS if name in data}
        for name in RUNTIME_LEDGERS:
            if name in data:
                result[name] = [{key: value for key, value in row.items() if key in RUNTIME_FIELDS}
                                if isinstance(row, dict) else row for row in data[name]] if isinstance(data[name], list) else data[name]
        return ("window.ATO_MIXED_MEDIA_MAP=" + json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + ";\n").encode("utf-8")
    except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"无法精简混排 mapping：{exc}") from exc


def allowed_target(target: str) -> bool:
    text = str(target or "")
    return text == MAPPING_TARGET or bool(_TARGET.fullmatch(text))


def mime_for(target: str) -> str:
    return _MIME.get(Path(str(target)).suffix.lower(), "application/octet-stream")


def _limit_for(target: str) -> int:
    """映射表与裁图各有上限：映射表是整份表格，裁图是单张图。"""
    return MAX_MAPPING_BYTES if str(target) == MAPPING_TARGET else MAX_IMAGE_BYTES


def _check_size(target: str, size: int) -> None:
    limit = _limit_for(target)
    if size > limit:
        raise ValueError(f"混合媒体文件过大（上限 {limit // (1024 * 1024)}MB）：{target}")


def _collect(root: Path) -> list[tuple[str, Path]]:
    """挑出映射表与 images/c[1-5]/ 下符合命名规范的裁图；其它文件一律忽略。

    渲染器 ``renderer.js`` 与 ``styles.css`` 是程序代码（随源码发布），名字不合规的图
    本来就取不到（页面按映射表里的固定路径取图），所以这里只跳过，不报错。
    """
    root = Path(root)
    files: list[tuple[str, Path]] = []
    mapping = root / MAPPING_TARGET
    if mapping.is_file():
        _check_size(MAPPING_TARGET, mapping.stat().st_size)
        files.append((MAPPING_TARGET, mapping))
    folder = root / IMAGES_DIR
    if not folder.is_dir():
        return files
    images = 0
    for cycle in sorted(folder.iterdir(), key=lambda item: item.name.lower()):
        if not cycle.is_dir():
            continue
        for path in sorted(cycle.iterdir(), key=lambda item: item.name.lower()):
            if path.is_dir() or path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            # 后缀大小写以白名单为准（".PNG" 会被 allowed_target 挡下），这里只做粗筛。
            target = f"{IMAGES_DIR}/{cycle.name}/{path.name}"
            if not allowed_target(target):
                continue
            _check_size(target, path.stat().st_size)
            files.append((target, path))
            images += 1
            if images > MAX_IMAGE_FILES:
                raise ValueError(f"混合媒体图片数量超过 {MAX_IMAGE_FILES} 个上限")
    return files


def collect(root: Path | None) -> list[tuple[str, Path]]:
    """工程目录 story/assets/mixed-media/ 下的映射表与裁图：映射表在前，裁图按名称排序。"""
    return _collect(Path(root)) if root is not None else []


def collect_library(library: Path) -> list[tuple[str, Path]]:
    """素材库中已导入的映射表与裁图，安装时从素材库复制回工程目录。"""
    return _collect(Path(library) / LIBRARY)


def add_to_archive(
    archive, manifest: dict, root: Path | None, fallback_library: Path | None = None,
    fallback_archive=None, fallback_prefix: str = "", fallback_files=None,
) -> int:
    """把映射表与裁图写进资料包；没有本地副本时可从素材库或旧 APK 读取。"""
    files = collect(root)
    if not files and fallback_library is not None:
        files = collect_library(fallback_library)
    if fallback_files is not None:
        files += fallback_files({target for target, _ in files})
    archive_targets = []
    if not files and fallback_archive is not None:
        archive_targets = sorted({
            name[len(fallback_prefix):] for name in fallback_archive.namelist()
            if name.startswith(fallback_prefix) and allowed_target(name[len(fallback_prefix):])
        })
    if not files and not archive_targets:
        manifest.pop("mixedMediaFiles", None)
        return 0
    entries = []
    images = 0
    for target, path in [*files, *((target, None) for target in archive_targets)]:
        if path is None:
            member = fallback_prefix + target
            if fallback_archive.getinfo(member).file_size > _limit_for(target):
                raise ValueError(f"混合媒体文件过大：{target}")
            raw = fallback_archive.read(member)
        else:
            raw = path.read_bytes()
        if target == MAPPING_TARGET:
            raw = compact_mapping(raw)
        else:
            images += 1
            if images > MAX_IMAGE_FILES:
                raise ValueError(f"混合媒体图片数量超过 {MAX_IMAGE_FILES} 个上限")
        archive.writestr(target, raw)
        entries.append({
            "target": target,
            "member": target,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "mimeType": mime_for(target),
        })
    manifest["mixedMediaFiles"] = entries
    return len(entries)


def checked_bytes(archive, item: dict) -> bytes:
    target = str(item.get("target") or "")
    if not allowed_target(target) or item.get("member") != target:
        raise ValueError(f"不支持的混合媒体路径：{target}")
    try:
        info = archive.getinfo(target)
    except KeyError as exc:
        raise ValueError(f"资料包中缺少混合媒体文件：{target}") from exc
    if info.file_size > _limit_for(target):
        raise ValueError(f"混合媒体文件过大：{target}")
    raw = archive.read(target)
    if "bytes" in item and (not isinstance(item["bytes"], int) or isinstance(item["bytes"], bool)
                            or item["bytes"] != len(raw)):
        raise ValueError(f"混合媒体文件大小不符：{target}")
    if hashlib.sha256(raw).hexdigest() != item.get("sha256"):
        raise ValueError(f"混合媒体校验失败：{target}")
    return raw


def import_resources(archive, manifest: dict, library: Path, replace: bool) -> int:
    """把资料包里的映射表与裁图存进素材库（等待「分享与安装」落回工程目录）。"""
    imported = 0
    for item in manifest.get("mixedMediaFiles", []) or []:
        raw = checked_bytes(archive, item)
        target = Path(library) / LIBRARY / str(item["target"])
        if target.exists() and not replace:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        imported += 1
    return imported
