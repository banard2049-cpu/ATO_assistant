"""主控台界面图标（SVG）：随 .atopack 分发的字形文件。

程序包（便携版 / Docker / APK）都不带这些字形：它们是从原 App 截图或 APK 原始纹理提取的界面
素材，按仓库的版权约定只留在本地，不进版本库（`.gitignore` 的 ``/assets/*`` 与
``*.svg``）。这里让素材库把 ``assets/icons/`` 下的 SVG 原样写进 .atopack 的
``iconFiles`` 段，导入后再由「分享与安装」落回 ``assets/icons/``；Android 端
AtopackStore 按同一段解包到 web 根目录的 ``assets/icons/``，因此页面按
``./assets/icons/<名称>.svg`` 取字形时不用额外配置。

``iconFiles`` 与 ``bgmFiles`` 一样是附加字段（不改变资料包版本号），老版本读取方会直接
忽略它。段内每个成员与 ``assets/icons/manifest.json`` 里的名字一一对应；那份清单不进包
（收集器只认 ``.svg``），它只记录每个字形的来源与当前引用位置。
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

ICON_DIR = "assets/icons"
LIBRARY = Path("sources/icons")
ICON_SUFFIXES = (".svg",)
MAX_FILE_BYTES = 1024 * 1024
MAX_FILES = 256

_TARGET = re.compile(r"assets/icons/[A-Za-z0-9][A-Za-z0-9._-]*\.svg")
_MIME = {".svg": "image/svg+xml"}


def allowed_target(target: str) -> bool:
    return bool(_TARGET.fullmatch(str(target or "")))


def mime_for(target: str) -> str:
    return _MIME.get(Path(str(target)).suffix.lower(), "application/octet-stream")


def _collect(folder: Path) -> list[tuple[str, Path]]:
    """挑出目录里符合命名规范的 SVG；其它文件（含 manifest.json）一律忽略。

    名字不合规的文件不会让整包导出失败——它们本来就取不到（页面按固定文件名引用
    字形），所以这里只跳过，不报错。
    """
    if not folder.is_dir():
        return []
    files: list[tuple[str, Path]] = []
    for path in sorted(folder.iterdir(), key=lambda item: item.name.lower()):
        if path.is_dir() or path.suffix.lower() not in ICON_SUFFIXES:
            continue
        target = f"{ICON_DIR}/{path.name}"
        if not allowed_target(target):
            continue
        if path.stat().st_size > MAX_FILE_BYTES:
            raise ValueError(f"图标文件过大（上限 {MAX_FILE_BYTES // 1024}KB）：{path.name}")
        files.append((target, path))
        if len(files) > MAX_FILES:
            raise ValueError(f"图标文件数量超过 {MAX_FILES} 个上限")
    return files


def collect(root: Path | None) -> list[tuple[str, Path]]:
    """根目录 assets/icons/ 下的字形，按文件名排序。"""
    return _collect(Path(root) / ICON_DIR) if root is not None else []


def collect_library(library: Path) -> list[tuple[str, Path]]:
    """素材库中已导入的图标，安装时从素材库复制回根目录。"""
    return _collect(Path(library) / LIBRARY / ICON_DIR)


def add_to_archive(
    archive, manifest: dict, root: Path | None, fallback_library: Path | None = None,
) -> int:
    """把图标写进资料包；根目录没有字形时退回素材库里的副本。"""
    files = collect(root)
    if not files and fallback_library is not None:
        files = collect_library(fallback_library)
    if not files:
        manifest.pop("iconFiles", None)
        return 0
    entries = []
    for target, path in files:
        raw = path.read_bytes()
        archive.writestr(target, raw)
        entries.append({
            "target": target,
            "member": target,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "mimeType": mime_for(target),
        })
    manifest["iconFiles"] = entries
    return len(entries)


def checked_bytes(archive, item: dict) -> bytes:
    target = str(item.get("target") or "")
    if not allowed_target(target) or item.get("member") != target:
        raise ValueError(f"不支持的图标路径：{target}")
    try:
        info = archive.getinfo(target)
    except KeyError as exc:
        raise ValueError(f"资料包中缺少图标：{target}") from exc
    if info.file_size > MAX_FILE_BYTES:
        raise ValueError(f"图标文件过大：{target}")
    raw = archive.read(target)
    if hashlib.sha256(raw).hexdigest() != item.get("sha256"):
        raise ValueError(f"图标校验失败：{target}")
    return raw


def import_resources(archive, manifest: dict, library: Path, replace: bool) -> int:
    """把资料包里的图标存进素材库（等待「分享与安装」落回根目录）。"""
    imported = 0
    for item in manifest.get("iconFiles", []) or []:
        raw = checked_bytes(archive, item)
        target = Path(library) / LIBRARY / str(item["target"])
        if target.exists() and not replace:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        imported += 1
    return imported
