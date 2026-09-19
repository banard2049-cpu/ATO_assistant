"""本地官中图片覆盖资源。

``official-assets/`` 是 ATO_assistant 根目录下的本地私有目录。目录里的图片不
需要复制到项目资源树：导出资料包时，只要能和清单目标路径对应，就优先使用这里
的文件；没有对应文件时继续使用素材库或原始 APK/项目文件。

扩展名与清单不一致也算数：官方图可能是 ``.jpg`` 导出，而清单目标写的是
``.png``（反之亦然），所以匹配时把后缀去掉比较，只要求「唯一命中」。

索引带缓存：导出一个资料包会把每个素材都过一遍 :func:`find`（4000+ 次），每次重扫
1300+ 张官方图并重建四个索引实测要 400 ms 以上，等于几十分钟纯开销。缓存让同一批
调用只建一次索引；``SCAN_CACHE_SECONDS`` 之后自动失效，长驻的素材库服务在用户往
``official-assets/`` 里补图后最多几秒就能看到新文件（也可以显式 :func:`clear_cache`）。
"""
from __future__ import annotations

import time
from collections import defaultdict
from pathlib import Path, PurePosixPath


DIRECTORY = "official-assets"
IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})
SCAN_CACHE_SECONDS = 2.0

# base 目录 -> (建索引时刻, 索引)。索引是四张表：精确相对路径、去后缀相对路径、
# 精确文件名、去后缀文件名（后两张表可能对应多个文件，靠调用侧要求唯一命中）。
_index_cache: dict[str, tuple[float, dict[str, object]]] = {}


def clear_cache() -> None:
    """丢掉索引缓存；测试与「刚放进新图就要用」的场景可以显式调用。"""
    _index_cache.clear()


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


def _without_suffix(value: str) -> str:
    """Drop the last suffix from a POSIX-style path (``a/b/CARD.jpg`` -> ``a/b/CARD``)."""
    path = PurePosixPath(value)
    return str(path.with_name(path.name[: -len(path.suffix)] if path.suffix else path.name))


def _unique(candidates: list[Path]) -> Path | None:
    return candidates[0] if len(candidates) == 1 else None


def _build_index(base: Path) -> dict[str, object]:
    all_files = _files(base)
    by_relative: dict[str, Path] = {}
    by_relative_stem: dict[str, list[Path]] = defaultdict(list)
    by_name: dict[str, list[Path]] = defaultdict(list)
    by_name_stem: dict[str, list[Path]] = defaultdict(list)
    for path in all_files:
        relative = path.relative_to(base).as_posix().casefold()
        by_relative.setdefault(relative, path)
        by_relative_stem[_without_suffix(relative)].append(path)
        by_name[path.name.casefold()].append(path)
        by_name_stem[_without_suffix(path.name.casefold())].append(path)
    return {
        "relative": by_relative,
        "relative_stem": by_relative_stem,
        "name": by_name,
        "name_stem": by_name_stem,
    }


def _index(base: Path) -> dict[str, object]:
    """Return the (cached) lookup index for one official-assets directory."""
    key = str(base)
    now = time.monotonic()
    cached = _index_cache.get(key)
    if cached is not None and now - cached[0] < SCAN_CACHE_SECONDS:
        return cached[1]
    built = _build_index(base)
    _index_cache[key] = (now, built)
    return built


def find(root: Path | None, target: str) -> Path | None:
    """Find the official image corresponding to a project-relative target.

    The preferred layout mirrors the target exactly (``official-assets/aibp/ps/...``).
    For the compact layout used by the repository's existing local assets, any
    unique trailing directory path is also accepted (``official-assets/HEKATON/...``
    matches ``aibp/ps/HEKATON/...``). A bare filename is used only when unique,
    so unrelated cards can never silently replace one another.

    扩展名不参与匹配：清单目标写 ``.png`` 而官方图是 ``.jpg``（或反过来）时，
    按去掉后缀的路径再找一次，同样要求唯一命中。写入资料包的成员名仍按清单目标，
    所以包内路径不会因为官方图的扩展名而改变。
    """
    parts = _safe_target(target)
    base = directory(root)
    if not parts or base is None or not base.is_dir():
        return None

    index = _index(base)
    by_relative = index["relative"]
    by_relative_stem = index["relative_stem"]
    by_name = index["name"]
    by_name_stem = index["name_stem"]

    # Exact path first, then increasingly compact trailing paths. Require at
    # least a directory plus filename for suffix matching to avoid broad hits.
    for start in range(0, len(parts) - 1):
        candidate = "/".join(parts[start:]).casefold()
        path = by_relative.get(candidate)
        if path is not None:
            return path

    # 同样的路径，但忽略扩展名（唯一的那个才算，避免跨卡错配）。
    for start in range(0, len(parts) - 1):
        candidate = _without_suffix("/".join(parts[start:]).casefold())
        path = _unique(by_relative_stem.get(candidate, []))
        if path is not None:
            return path

    filename = parts[-1].casefold()
    match = _unique(by_name.get(filename, []))
    if match is not None:
        return match
    return _unique(by_name_stem.get(_without_suffix(filename), []))


def resolve(root: Path | None, target: str, fallback: Path) -> tuple[Path, bool]:
    """Return ``(source, overridden)`` while preserving the normal fallback."""
    override = find(root, target)
    return (override, True) if override is not None else (fallback, False)
