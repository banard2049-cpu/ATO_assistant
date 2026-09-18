"""本地官中图片覆盖资源。

``official-assets/`` 是 ATO_assistant 根目录下的本地私有目录。目录里的图片不
需要复制到项目资源树：导出资料包时，只要能和清单目标路径对应，就优先使用这里
的文件；没有对应文件时继续使用素材库或原始 APK/项目文件。
"""
from __future__ import annotations

from pathlib import Path, PurePosixPath


DIRECTORY = "official-assets"
IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})


def directory(root: Path | None) -> Path | None:
    """Return the configured official-image directory for an ATO root.

    Accepting the directory itself makes the helper convenient for command-line
    tools and tests while the normal application passes the ATO_assistant root.
    """
    if root is None:
        return None
    root = Path(root)
    if root.name.casefold() == DIRECTORY.casefold():
        return root
    return root / DIRECTORY


def _safe_target(target: str) -> tuple[str, ...]:
    normalized = str(target or "").replace("\\", "/")
    path = PurePosixPath(normalized)
    if not normalized or path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        return ()
    return tuple(path.parts)


def _files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(
        (path for path in root.rglob("*") if path.is_file() and path.suffix.casefold() in IMAGE_SUFFIXES),
        key=lambda path: path.relative_to(root).as_posix().casefold(),
    )


def find(root: Path | None, target: str) -> Path | None:
    """Find the official image corresponding to a project-relative target.

    The preferred layout mirrors the target exactly (``official-assets/aibp/ps/...``).
    For the compact layout used by the repository's existing local assets, any
    unique trailing directory path is also accepted (``official-assets/HEKATON/...``
    matches ``aibp/ps/HEKATON/...``). A bare filename is used only when unique,
    so unrelated cards can never silently replace one another.
    """
    parts = _safe_target(target)
    base = directory(root)
    if not parts or base is None or not base.is_dir():
        return None

    all_files = _files(base)
    by_relative = {
        path.relative_to(base).as_posix().casefold(): path
        for path in all_files
    }
    # Exact path first, then increasingly compact trailing paths. Require at
    # least a directory plus filename for suffix matching to avoid broad hits.
    for start in range(0, len(parts) - 1):
        candidate = "/".join(parts[start:]).casefold()
        path = by_relative.get(candidate)
        if path is not None:
            return path

    filename = parts[-1].casefold()
    matches = [path for path in all_files if path.name.casefold() == filename]
    return matches[0] if len(matches) == 1 else None


def resolve(root: Path | None, target: str, fallback: Path) -> tuple[Path, bool]:
    """Return ``(source, overridden)`` while preserving the normal fallback."""
    override = find(root, target)
    return (override, True) if override is not None else (fallback, False)
