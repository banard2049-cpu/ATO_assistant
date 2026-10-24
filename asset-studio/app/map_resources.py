"""Exact map bases and masks, distributed once in the optional mapFiles section.

Legacy physical-card catalog IDs and targets remain valid. A complete set of
layers replaces those retired scans when exporting; older packs still install
their scans and the map renderer falls back to them.
"""
from __future__ import annotations

import hashlib
import json
import re
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

LIBRARY = Path('sources/map-layers')
MAX_FILES = 2048
MAX_FILE_BYTES = 8 * 1024 * 1024
PROJECT = Path(__file__).resolve().parents[2]
_TARGET = re.compile(
    r'map/images/(?:hd1024/(?:base|overlay)/c[1-5]-tile-[A-Za-z0-9-]+\.png'
    r'|hd1024/overlay/c[1-5]-tile-[A-Za-z0-9-]+-corners\.svg'
    r'|card-backs/(?:c[1-4]-base\.png|numbers/c[1-4]-tile-[A-Za-z0-9-]+\.png'
    r'|vectors/c[1-5]-tile-[A-Za-z0-9-]+\.svg))'
)


def allowed_target(target: str) -> bool:
    return isinstance(target, str) and bool(_TARGET.fullmatch(target))


def _data(root: Path, filename: str, variable: str) -> dict:
    path = root / 'map' / filename
    text = path.read_text(encoding='utf-8-sig')
    text = re.sub(r'^\s*/\*.*?\*/', '', text, count=1, flags=re.S)
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
        vectors = set(data.get('cornerVectorFiles', []))
        for stem in data['files']:
            overlay = f'{stem}-corners.svg' if stem in vectors else f'{stem}.png'
            result[stem] = (f'map/images/hd1024/base/{stem}.png', f'map/images/hd1024/overlay/{overlay}')
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


def legacy_index(root: Path = PROJECT) -> dict[str, tuple[str, ...]]:
    return {stem: tuple(path.replace('-corners.svg', '.png').replace('/vectors/', '/numbers/').replace('.svg', '.png')
                        for path in paths) for stem, paths in layer_index(root).items()}


def cover_index(root: Path = PROJECT) -> dict[str, tuple[str, ...]]:
    if not (root / 'map/c5-heading-data.js').is_file():
        root = PROJECT
    data = _data(root, 'c5-heading-data.js', 'ATO_C5_HEADING_DATA')
    base = 'map/' + _data(root, 'tile-back-data.js', 'ATO_MAP_BACK_DATA')['bases']['c3'].removeprefix('./')
    result = {stem: (base, 'map/' + row['cover'].removeprefix('./'))
              for stem, row in data.items() if row.get('cover')}
    if any(not allowed_target(target) for paths in result.values() for target in paths):
        raise ValueError('C5 卡背索引含不支持的路径')
    return result


def expected_targets(root: Path = PROJECT) -> set[str]:
    # Keep accepting the original independent textures from older packs.
    return {target for index in (layer_index(root), legacy_index(root), cover_index(root)) for paths in index.values() for target in paths} | {
        f'map/images/card-backs/c{cycle}-base.png' for cycle in (1, 2, 3, 4)
    }


def covered_targets(files: list[tuple[str, Path]], targets, root: Path = PROJECT) -> set[str]:
    have = {target for target, _ in files}
    index = layer_index(root)
    old_index = legacy_index(root)
    return {target for target in targets
            if Path(target).parent.as_posix() == 'map/images'
            and any(layers and set(layers) <= have for layers in
                    (index.get(Path(target).stem), old_index.get(Path(target).stem)))}


def collect_library(library: Path) -> list[tuple[str, Path]]:
    root = Path(library) / LIBRARY
    return [(target, root / target) for target in sorted(expected_targets()) if (root / target).is_file()]


def collect(root: Path | None, fallback_library: Path | None = None, targets=None) -> list[tuple[str, Path]]:
    """Use registered dependencies only; never pull archives or composite copies in."""
    targets = tuple(targets) if targets is not None else None
    index_root = Path(root) if root is not None and (Path(root)/'map/tile-artwork-data.js').is_file() else PROJECT
    index = layer_index(index_root)
    # A library restored from an older PNG pack can still be exported. Prefer
    # current vectors whenever present, without requiring archived PNGs.
    fallback = dict(collect_library(fallback_library)) if fallback_library else {}
    for stem, paths in legacy_index(index_root).items():
        if paths == index[stem]:
            continue
        def available(target):
            return (root is not None and (Path(root) / target).is_file()) or target in fallback
        current_specific = set(index[stem]) - set(paths)
        if not any(available(target) for target in current_specific) and all(available(target) for target in paths):
            index = {**index, stem: paths}
    needed = {target for paths in index.values() for target in paths} if targets is None else {
        target for old in targets if Path(old).parent.as_posix() == 'map/images'
        for target in index.get(Path(old).stem, ())
    }
    # C5's unrevealed face reuses the registered C3 texture plus its own cropped mask.
    # Include the texture when exporting a C5-only pack, too. Older packs
    # without it remain valid and use the map's numbered fallback.
    needs_c5_cover = targets is None or any(re.fullmatch(r'c5-tile-\d{3}-(?:front|back)', Path(old).stem)
                                           for old in targets)
    covers = cover_index(index_root) if needs_c5_cover else {}
    for stem, paths in covers.items():
        if targets is None or any(Path(old).stem == stem for old in targets):
            needed.update(paths)
    cover_base = 'map/images/card-backs/c3-base.png'
    if (index_root / 'map/tile-back-data.js').is_file():
        cover_base = 'map/' + _data(index_root, 'tile-back-data.js', 'ATO_MAP_BACK_DATA')['bases']['c3'].removeprefix('./')
    if not allowed_target(cover_base):
        raise ValueError('地图卡背底图路径无效')
    if needs_c5_cover:
        needed.add(cover_base)
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
    for paths in (*index.values(), *covers.values()):
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
        check_image(target, raw)
        archive.writestr(target, raw)
        entries.append({'target':target, 'member':target, 'sha256':hashlib.sha256(raw).hexdigest(),
                        'bytes':len(raw), 'mimeType':'image/svg+xml' if target.endswith('.svg') else 'image/png'})
    if entries:
        manifest['mapFiles'] = entries
        manifest.setdefault('build', {})['mapLayers'] = 'hd1024-combined-shared-backs'
    return len(entries)


def check_image(target: str, raw: bytes) -> None:
    if len(raw) > MAX_FILE_BYTES:
        raise ValueError(f'地图图层超过 8MB：{target}')
    if target.endswith('.svg'):
        try:
            if ET.fromstring(raw).tag != '{http://www.w3.org/2000/svg}svg':
                raise ValueError('缺少 SVG 根节点')
        except (ET.ParseError, ValueError) as error:
            raise ValueError(f'无效的地图 SVG 图层：{target}') from error
    elif not raw.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError(f'无效的地图 PNG 图层：{target}')


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
    check_image(target, raw)
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
    groups = []
    for index in (layer_index(), legacy_index(), cover_index()):
        for stem, paths in index.items():
            groups.append(set(paths))
            if stem.startswith(('c2-', 'c3-')) and 'map/images/card-backs/c1-base.png' in paths:
                groups.append(set(paths) - {'map/images/card-backs/c1-base.png'} |
                              {f'map/images/card-backs/{stem[:2]}-base.png'})
    for target in seen:
        if re.fullmatch(r'map/images/card-backs/c[1-4]-base\.png', target):
            continue
        if not any(target in group and group <= seen for group in groups):
            raise ValueError(f'地图图层缺少配套底图或蒙版：{target}')
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
