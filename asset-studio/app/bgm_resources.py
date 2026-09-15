"""主控台背景音乐（BGM）：随 .atopack 分发的音频文件。

程序包（便携版 / Docker / APK）都不带音频：根目录 assets/bgm/ 里只有播放器代码，
音频由使用者自备。这里让素材库把 assets/bgm/ 下的音频原样写进 .atopack 的 bgmFiles 段，
导入后再由「分享与安装」落回 assets/bgm/；Android 端 AtopackStore 按同一段解包到
web 根目录的 assets/bgm/，因此主控台不用额外配置就能播放。

bgmFiles 是附加字段（不改变资料包版本号），老版本读取方会直接忽略它。
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

BGM_DIR = "assets/bgm"
LIBRARY = Path("sources/bgm")
AUDIO_SUFFIXES = (".mp3", ".ogg")
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_FILES = 128

_TARGET = re.compile(r"assets/bgm/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:mp3|ogg)")
_MIME = {".mp3": "audio/mpeg", ".ogg": "audio/ogg"}


def allowed_target(target: str) -> bool:
    return bool(_TARGET.fullmatch(str(target or "")))


def mime_for(target: str) -> str:
    return _MIME.get(Path(str(target)).suffix.lower(), "application/octet-stream")


def _collect(folder: Path) -> list[tuple[str, Path]]:
    """挑出目录里符合命名规范的音频；其它文件（含播放器代码）一律忽略。

    名字不合规的文件不会让整包导出失败——它们本来就播不出来（主控台按
    manifest.js 里的固定文件名找音频），所以这里只跳过，不报错。
    """
    if not folder.is_dir():
        return []
    files: list[tuple[str, Path]] = []
    for path in sorted(folder.iterdir(), key=lambda item: item.name.lower()):
        if path.is_dir() or path.suffix.lower() not in AUDIO_SUFFIXES:
            continue
        target = f"{BGM_DIR}/{path.name}"
        if not allowed_target(target):
            continue
        if path.stat().st_size > MAX_FILE_BYTES:
            raise ValueError(f"BGM 文件过大（上限 {MAX_FILE_BYTES // (1024 * 1024)}MB）：{path.name}")
        files.append((target, path))
        if len(files) > MAX_FILES:
            raise ValueError(f"BGM 文件数量超过 {MAX_FILES} 个上限")
    return files


def collect(root: Path | None) -> list[tuple[str, Path]]:
    """根目录 assets/bgm/ 下的音频，按文件名排序。"""
    return _collect(Path(root) / BGM_DIR) if root is not None else []


def collect_library(library: Path) -> list[tuple[str, Path]]:
    """素材库中已导入的 BGM，安装时从素材库复制回根目录。"""
    return _collect(Path(library) / LIBRARY / BGM_DIR)


def add_to_archive(
    archive, manifest: dict, root: Path | None, fallback_library: Path | None = None,
) -> int:
    """把 BGM 写进资料包；根目录没有音频时退回素材库里的副本。"""
    files = collect(root)
    if not files and fallback_library is not None:
        files = collect_library(fallback_library)
    if not files:
        manifest.pop("bgmFiles", None)
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
    manifest["bgmFiles"] = entries
    return len(entries)


def checked_bytes(archive, item: dict) -> bytes:
    target = str(item.get("target") or "")
    if not allowed_target(target) or item.get("member") != target:
        raise ValueError(f"不支持的背景音乐路径：{target}")
    try:
        info = archive.getinfo(target)
    except KeyError as exc:
        raise ValueError(f"资料包中缺少背景音乐：{target}") from exc
    if info.file_size > MAX_FILE_BYTES:
        raise ValueError(f"背景音乐文件过大：{target}")
    raw = archive.read(target)
    if hashlib.sha256(raw).hexdigest() != item.get("sha256"):
        raise ValueError(f"背景音乐校验失败：{target}")
    return raw


def import_resources(archive, manifest: dict, library: Path, replace: bool) -> int:
    """把资料包里的 BGM 存进素材库（等待「分享与安装」落回根目录）。"""
    imported = 0
    for item in manifest.get("bgmFiles", []) or []:
        raw = checked_bytes(archive, item)
        target = Path(library) / LIBRARY / str(item["target"])
        if target.exists() and not replace:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        imported += 1
    return imported
