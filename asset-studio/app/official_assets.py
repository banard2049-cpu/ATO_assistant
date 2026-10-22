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
import re
from collections import defaultdict
from pathlib import Path, PurePosixPath


DIRECTORY = "official-assets"
IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})
SCAN_CACHE_SECONDS = 2.0

# Reviewed deck artwork only: a BACK suffix by itself does not mean a fixed
# card back. Unknown decks/faces must keep their official effect artwork.
FIXED_BACK_DECKS = frozenset({
    "ALPHA_TEMENOS", "CHIMERA_METASTASIOS", "CYCLONUS", "DAHAKA",
    "DEMIDJINN", "DRAGON_OF_PHOBOS", "HEKATON", "HERMESIAN_PURSUER",
    "HYPERTIME_ORACLE", "ICARIAN_HARPY", "LABYRINTHAUROS", "MEDUKETOS",
    "MIDASCORE", "SUN_DESCENDANT", "THE_BABELIAN_LUNACY", "THE_BURDEN",
    "THE_NIETZSCJEAN", "TITAN_X", "UR_FLEECE",
})
EFFECT_ROUTINE_BACK_DECKS = frozenset({
    "ALPHA_TEMENOS", "CHIMERA_METASTASIOS", "CYCLONUS", "HEKATON",
    "HERMESIAN_PURSUER", "LABYRINTHAUROS", "UR_FLEECE",
})


def is_fixed_aibp_back(target: str) -> bool:
    """Only reviewed, decorative AIBP backs use fan resources in every edition.

    Keep effect faces, including two-sided Routines and Dragon BP backs. Shared
    Shared AI/BP backs and AI III SPECIAL_BACK artwork remain fixed backs.
    Restrict the rule to AIBP paths and known faces to protect future additions.
    """
    parts = str(target).replace("\\", "/").upper().split("/")
    if len(parts) != 4 or parts[:2] != ["AIBP", "PS"]:
        return False
    boss, filename = parts[2:]
    if boss not in FIXED_BACK_DECKS or not filename.startswith(boss + "_"):
        return False
    path = PurePosixPath(filename)
    if path.suffix.lower() not in IMAGE_SUFFIXES:
        return False
    face = re.sub(r"__DUP\d+$", "", path.stem[len(boss) + 1:])
    if re.fullmatch(r"AI_III_(?:SPECIAL_)?BACK", face):
        return True
    if re.fullmatch(r"(?:AI|BP)_(?:I|II|III)_BACK", face):
        return not (boss == "DRAGON_OF_PHOBOS" and face.startswith("BP_"))
    if re.fullmatch(r"(?:AI|BP)_(?:I|II|III)_00[1-6]_BACK", face):
        return not (boss == "DRAGON_OF_PHOBOS" and face.startswith("BP_"))
    if face == "AI_O_001_BACK":
        return boss in {"HYPERTIME_ORACLE", "THE_BURDEN", "THE_NIETZSCJEAN", "TITAN_X", "UR_FLEECE"}
    if face == "AI_X_001_BACK":
        return boss == "HYPERTIME_ORACLE"
    if face == "SIGNATURE_X_001_BACK":
        return True
    return face == "ROUTINE_X_001_BACK" and boss not in EFFECT_ROUTINE_BACK_DECKS

# base 目录 -> (建索引时刻, 索引)。索引是四张表：精确相对路径、去后缀相对路径、
# 精确文件名、去后缀文件名（后两张表可能对应多个文件，靠调用侧要求唯一命中）。
_index_cache: dict[str, tuple[float, dict[str, object]]] = {}

# 官中素材里按「扁平目录」收纳、目录名又与项目目标目录不同的那一类，必须显式声明它
# 归哪个项目目录。地形卡就是唯一的实例：``official-assets/terrain-cards/`` 收的是地形
# 卡（提示卡）官图，项目目标却是 ``ss/terrain-cards/``；只按文件名兜底时，它同样会命中
# 同名的 ``ss/terrain/<name>.jpg``（地形**板块**）——板块和提示卡同名不同物（例如
# ``abandoned-temple.jpg`` 两边都有），换错了就是拿卡面盖掉板块图。声明归属之后，
# 这类目录只对它声明的项目目录生效。
FLAT_DIRECTORY_OWNERS: dict[str, tuple[str, ...]] = {
    "terrain-cards": ("ss", "terrain-cards"),
}


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


def _owner_matches(relative: tuple[str, ...], parts: tuple[str, ...]) -> bool:
    """声明了归属的官中目录，只允许命中它声明的项目目录。

    例如 ``terrain-cards`` 只归 ``ss/terrain-cards/``：命中 ``ss/terrain/``（地形板块）
    时直接拒绝，而不因为两者文件名同名就替换。
    """
    for owner in FLAT_DIRECTORY_OWNERS.get(relative[-1] if relative else "", ()):
        if len(parts) < len(owner) or parts[-len(owner):] != tuple(owner):
            return False
    return True


def _filename_hit(index: dict[str, object], parts: tuple[str, ...]) -> Path | None:
    """按文件名兜底时的唯一命中；目录归属不一致的候选不算命中。

    项目目标的父目录与官中目录通常同名（``aibp/ps/HEKATON/`` ← ``HEKATON/``），
    所以允许「官中目录名与目标某一段目录同名」。唯一要挡的就是声明了归属、却属于
    另一个项目目录的官中目录（``terrain-cards`` → 地形卡，不是地形板块）。

    精确文件名与去后缀文件名分两轮，和引入归属规则之前的判定次序保持一致。
    """
    by_path = index["by_path"]
    filename = parts[-1].casefold()
    for table, key in (("name", filename), ("name_stem", _without_suffix(filename))):
        candidates = [
            path
            for path in index[table].get(key, [])
            if not by_path.get(path) or _owner_matches(by_path[path], parts)
        ]
        match = _unique(candidates)
        if match is not None:
            return match
    return None


def _build_index(base: Path) -> dict[str, object]:
    all_files = _files(base)
    by_relative: dict[str, Path] = {}
    by_relative_stem: dict[str, list[Path]] = defaultdict(list)
    by_name: dict[str, list[Path]] = defaultdict(list)
    by_name_stem: dict[str, list[Path]] = defaultdict(list)
    by_path: dict[Path, tuple[str, ...]] = {}
    for path in all_files:
        relative = path.relative_to(base).as_posix().casefold()
        by_relative.setdefault(relative, path)
        by_relative_stem[_without_suffix(relative)].append(path)
        by_name[path.name.casefold()].append(path)
        by_name_stem[_without_suffix(path.name.casefold())].append(path)
        by_path[path] = tuple(relative.split("/")[:-1])
    return {
        "relative": by_relative,
        "relative_stem": by_relative_stem,
        "name": by_name,
        "name_stem": by_name_stem,
        "by_path": by_path,
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

    文件名兜底还要满足目录归属：官中目录名与目标的一段目录同名（``HEKATON/`` ←
    ``aibp/ps/HEKATON/``），或该目录在 :data:`FLAT_DIRECTORY_OWNERS` 里声明了归属。
    同名不同物的官中目录（``terrain-cards/`` 是地形卡，不是地形板块 ``ss/terrain/``）
    因此不会张冠李戴。
    """
    parts = _safe_target(target)
    base = directory(root)
    if not parts or is_fixed_aibp_back(target) or base is None or not base.is_dir():
        return None

    # 记录表 Boss 头像是从官方 AI 卡背提取的 512×512 派生 UI 素材，不是官方卡面。
    # official-assets/ 里没有这个目录，但 ps/<BOSS>/<BOSS>.jpg 与头像同 stem，文件名
    # 兜底会把整张使徒面板当成头像塞进资料包（.png 成员里装 2 MB JPEG），记录表就
    # 显示成一张大卡。派生素材永远用项目自己的 PNG，不接受官中覆盖。
    if tuple(part.casefold() for part in parts[:3]) == ("record", "assets", "boss-avatars"):
        return None

    index = _index(base)
    by_relative = index["relative"]
    by_relative_stem = index["relative_stem"]

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

    # 文件名兜底：同名候选里只认目录归属一致的那个（见 FLAT_DIRECTORY_OWNERS）。
    return _filename_hit(index, parts)


def resolve(root: Path | None, target: str, fallback: Path) -> tuple[Path, bool]:
    """Return ``(source, overridden)`` while preserving the normal fallback."""
    override = find(root, target)
    return (override, True) if override is not None else (fallback, False)
