"""Exact map bases and masks, distributed once in the optional mapFiles section.

Legacy physical-card catalog IDs and targets remain valid. A complete set of
layers replaces those retired scans when exporting; older packs still install
their scans and the map renderer falls back to them.
"""
from __future__ import annotations

import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path

LIBRARY = Path('sources/map-layers')
MAX_FILES = 2048
MAX_FILE_BYTES = 8 * 1024 * 1024
PROJECT = Path(__file__).resolve().parents[2]
_TARGET = re.compile(
    r'map/images/(?:hd1024/(?:base|overlay)/c[1-5]-tile-[A-Za-z0-9-]+\.png'
    r'|card-backs/(?:c[1-4]-base\.png|numbers/c[1-4]-tile-[A-Za-z0-9-]+\.png))'
)


def allowed_target(target: str) -> bool:
    return isinstance(target, str) and bool(_TARGET.fullmatch(target))


def _data(root: Path, filename: str, variable: str) -> dict:
    path = root / 'map' / filename
    text = path.read_text(encoding='utf-8-sig')
    match = re.fullmatch(r'\s*window\.' + variable + r'\s*=\s*(.*);\s*', text, re.S)
    if not match:
        raise ValueError(f'地图图层索引格式无效：{path}')
    return json.loads(match[1])


@lru_cache(maxsize=8)
def layer_index(root: Path = PROJECT) -> dict[str, tuple[str, ...]]:
    """Map a legacy filename stem to every image required to render that face."""
    artwork_path = root / 'map/tile-artwork-data.js'
    back_path = root / 'map/tile-back-data.js'
    if not artwork_path.is_file() and not back_path.is_file():
        return {}
    result = {}
    if artwork_path.is_file():
        data = _data(root, 'tile-artwork-data.js', 'ATO_MAP_ARTWORK_DATA')
        if data.get('maskLayout') != 'combined' or data.get('prefix') != './images/hd1024':
            raise ValueError('不支持的地图蒙版布局')
        for stem in data['files']:
            result[stem] = tuple(f'map/images/hd1024/{kind}/{stem}.png' for kind in ('base', 'overlay'))
    if back_path.is_file():
        data = _data(root, 'tile-back-data.js', 'ATO_MAP_BACK_DATA')
        for stem, back in data['backs'].items():
            paths = [data['bases'][back['cycle']], *(piece['src'] for piece in back['pieces'])]
            if any(not path.startswith('./images/') for path in paths):
                raise ValueError('地图卡背索引含无效路径')
            result[stem] = tuple('map/' + path.removeprefix('./') for path in paths)
    if any(not allowed_target(target) for paths in result.values() for target in paths):
        raise ValueError('地图图层索引含不支持的目标路径')
    return result


def expected_targets(root: Path = PROJECT) -> set[str]:
    # Keep accepting the original independent textures from older packs.
    return {target for paths in layer_index(root).values() for target in paths} | {
        f'map/images/card-backs/c{cycle}-base.png' for cycle in (1, 2, 3, 4)
    }


def covered_targets(files: list[tuple[str, Path]], targets, root: Path = PROJECT) -> set[str]:
    have = {target for target, _ in files}
    index = layer_index(root)
    return {target for target in targets
            if Path(target).parent.as_posix() == 'map/images'
            and (layers := index.get(Path(target).stem)) and set(layers) <= have}


def collect_library(library: Path) -> list[tuple[str, Path]]:
    root = Path(library) / LIBRARY
    return [(target, root / target) for target in sorted(expected_targets()) if (root / target).is_file()]


def collect(root: Path | None, fallback_library: Path | None = None, targets=None) -> list[tuple[str, Path]]:
    """Use registered dependencies only; never pull archives or composite copies in."""
    targets = tuple(targets) if targets is not None else None
    index_root = Path(root) if root is not None and (Path(root)/'map/tile-artwork-data.js').is_file() else PROJECT
    index = layer_index(index_root)
    needed = {target for paths in index.values() for target in paths} if targets is None else {
        target for old in targets if Path(old).parent.as_posix() == 'map/images'
        for target in index.get(Path(old).stem, ())
    }
    # C5's unrevealed face reuses the registered C3 texture plus its own cropped mask.
    # Include the texture when exporting a C5-only pack, too. Older packs
    # without it remain valid and use the map's numbered fallback.
    needs_c5_cover = targets is None or any(re.fullmatch(r'c5-tile-\d{3}-(?:front|back)', Path(old).stem)
                                           for old in targets)
    cover_base = 'map/images/card-backs/c3-base.png'
    if (index_root / 'map/tile-back-data.js').is_file():
        cover_base = 'map/' + _data(index_root, 'tile-back-data.js', 'ATO_MAP_BACK_DATA')['bases']['c3'].removeprefix('./')
    if not allowed_target(cover_base):
        raise ValueError('地图卡背底图路径无效')
    if needs_c5_cover:
        needed.add(cover_base)
    fallback = dict(collect_library(fallback_library)) if fallback_library else {}
    found = {}
    for target in sorted(needed):
        path = Path(root)/target if root is not None else None
        if path is None or not path.is_file():
            path = fallback.get(target)
        if path is not None and path.is_file():
            if path.stat().st_size > MAX_FILE_BYTES:
                raise ValueError(f'地图图层超过 8MB：{target}')
            found[target] = path
    complete = set()
    if needs_c5_cover and cover_base in found:
        complete.add(cover_base)
    for paths in index.values():
        group = set(paths)
        if not group <= needed:
            continue
        specific = {p for p in group if not re.fullmatch(r'map/images/card-backs/c[1-4]-base\.png', p)}
        # A library may contain only one cycle. Missing whole faces can still
        # use legacy scans; a face with any specific layer must be complete.
        if not specific & found.keys():
            continue
        if missing := group - found.keys():
            raise ValueError(f'地图图层不完整，缺少 {len(missing)} 个文件：{sorted(missing)[0]}')
        complete.update(group)
    return sorted((target, found[target]) for target in complete)


def add_to_archive(archive, manifest: dict, root: Path | None = None,
                   fallback_library: Path | None = None, targets=None, files=None) -> int:
    files = collect(root, fallback_library, targets) if files is None else files
    if len(files) > MAX_FILES:
        raise ValueError('地图图层数量超过限制')
    entries = []
    for target, source in files:
        if not allowed_target(target):
            raise ValueError(f'不支持的地图图层：{target}')
        raw = source.read_bytes()
        if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw) > MAX_FILE_BYTES:
            raise ValueError(f'无效的地图 PNG 图层：{target}')
        archive.writestr(target, raw)
        entries.append({'target':target, 'member':target, 'sha256':hashlib.sha256(raw).hexdigest(),
                        'bytes':len(raw), 'mimeType':'image/png'})
    if entries:
        manifest['mapFiles'] = entries
        manifest.setdefault('build', {})['mapLayers'] = 'hd1024-combined-shared-backs'
    return len(entries)


def checked_bytes(archive, entry: dict) -> bytes:
    target = entry.get('target')
    if not allowed_target(target) or entry.get('member') != target:
        raise ValueError(f'不支持的地图图层路径：{target}')
    try:
        info = archive.getinfo(target)
    except KeyError as error:
        raise ValueError(f'缺少地图图层：{target}') from error
    if info.file_size > MAX_FILE_BYTES:
        raise ValueError(f'地图图层超过 8MB：{target}')
    raw = archive.read(target)
    if not raw.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError(f'无效的地图 PNG 图层：{target}')
    if (type(entry.get('bytes')) is not int or entry['bytes'] != len(raw)
            or hashlib.sha256(raw).hexdigest() != entry.get('sha256')):
        raise ValueError(f'地图图层大小或哈希不匹配：{target}')
    return raw


def validate(archive, manifest: dict) -> list[dict]:
    entries = manifest.get('mapFiles', [])
    if not isinstance(entries, list) or len(entries) > MAX_FILES:
        raise ValueError('地图图层清单无效或数量超过限制')
    seen = set()
    supported = expected_targets()
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get('target'), str) or entry['target'] in seen:
            raise ValueError('地图图层清单含无效或重复条目')
        if entry['target'] not in supported:
            raise ValueError(f'当前地图索引不支持该图层：{entry["target"]}')
        checked_bytes(archive, entry)
        seen.add(entry['target'])
    # Partial cycle packs are allowed; each face they contain must be complete.
    for stem, paths in layer_index().items():
        specific = set(paths) - {p for p in paths if re.fullmatch(r'map/images/card-backs/c[1-4]-base\.png', p)}
        if seen & specific and not set(paths) <= seen:
            # Old C2/C3 packs used their own colored base. Accept those complete
            # groups too, but never accept a mask without either valid base.
            cycle = stem.split('-')[0]
            legacy = f'map/images/card-backs/{cycle}-base.png'
            if not (cycle in ('c2', 'c3') and specific <= seen and legacy in seen
                    and 'map/images/card-backs/c1-base.png' in paths):
                raise ValueError(f'地图图层缺少配套底图或蒙版：{paths[0]}')
    return entries


def import_resources(archive, manifest: dict, library: Path, replace: bool) -> int:
    entries = validate(archive, manifest)
    imported = 0
    for entry in entries:
        target = Path(library) / LIBRARY / entry['target']
        if target.exists() and not replace:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(checked_bytes(archive, entry))
        imported += 1
    return imported


def copy_from_archive(source, destination, source_manifest: dict, manifest: dict) -> int:
    entries = validate(source, source_manifest)
    for entry in entries:
        destination.writestr(entry['target'], checked_bytes(source, entry))
    if entries:
        manifest['mapFiles'] = entries
        manifest.setdefault('build', {})['mapLayers'] = 'hd1024-combined-shared-backs'
    return len(entries)
