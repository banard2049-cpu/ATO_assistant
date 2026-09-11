#!/usr/bin/env python3
"""从 Tabletop Simulator 存档 JSON 中提取 Custom_Token 的图标。

用法示例：
    python tools/extract_tts_token_icons.py
    python tools/extract_tts_token_icons.py --json "<存档路径>" --out token_icons --types Custom_Token Custom_Tile

默认只提取 Custom_Token；图标按名称命名，重名自动加短哈希后缀，并写出 manifest.json 便于核对。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON = Path(r'D:\files\My Games\Tabletop Simulator\Mods\Workshop\(Don)Aeon Trespass Odyssey.json')
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ATO-Assistant token extractor'

ap = argparse.ArgumentParser(description='提取 TTS 存档中 token 的图标图片')
ap.add_argument('--json', type=Path, default=DEFAULT_JSON, help=f'存档 JSON 路径，默认 {DEFAULT_JSON}')
ap.add_argument('--out', type=Path, default=ROOT / 'token_icons', help='输出目录，默认 <项目根>/token_icons')
ap.add_argument('--types', nargs='*', default=['Custom_Token'],
                help='要提取的对象类型（TTS 的 Name），默认 Custom_Token')
ap.add_argument('--parents', default='',
                help='额外的容器名正则：该容器内的对象无论类型都会被提取'
                     '（本项目里不少标记是 Custom_Tile，例如 ^(AT|Evasion|Titans|Secret content)）')
ap.add_argument('--include-back', action='store_true', help='同时提取 ImageSecondaryURL（背面）')
ap.add_argument('--exclude-tags', nargs='*', default=['Terrain'],
                help='带这些标签的对象不提取（不区分大小写），默认 Terrain 以排除地形件')
ap.add_argument('--timeout', type=float, default=60.0, help='单张下载超时秒数')
ap.add_argument('--retries', type=int, default=3, help='下载失败重试次数')
args = ap.parse_args()

EXT_BY_TYPE = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif'}
BAD_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
# 这些标签对所有 token 通用，不用于命名
GENERIC_TAGS = {'persistent', 'terrain', 'tooltip', 'token'}


def collect(save: dict, types: set[str], include_back: bool, exclude_tags: set[str],
            parent_pattern: re.Pattern[str] | None = None) -> tuple[list[dict], int]:
    """遍历 ObjectStates/ContainedObjects/ChildObjects/States，收集目标对象的图片。

    选中规则：对象类型在 types 内，或（给了 --parents 时）其所属容器名匹配正则。
    """
    found: list[dict] = []
    skipped = 0

    def walk(obj, parent: str) -> None:
        nonlocal skipped
        if not isinstance(obj, dict):
            return
        here = (obj.get('Nickname') or '').strip() or parent
        image = obj.get('CustomImage') or {}
        selected = obj.get('Name') in types
        if not selected and parent_pattern is not None:
            selected = bool(parent_pattern.search(parent))
        if selected:
            tags = [str(t) for t in (obj.get('Tags') or [])]
            if exclude_tags & {t.lower() for t in tags}:
                skipped += 1
            else:
                base = dict(name=obj.get('Name'), nickname=(obj.get('Nickname') or '').strip(),
                            context=parent if parent_pattern is not None and obj.get('Name') not in types else here,
                            guid=obj.get('GUID'), tags=tags)
                if image.get('ImageURL'):
                    found.append({**base, 'url': image['ImageURL'], 'face': 'front'})
                # 反面与正面是同一张图时不重复提取
                if (include_back and image.get('ImageSecondaryURL')
                        and image['ImageSecondaryURL'] != image.get('ImageURL')):
                    found.append({**base, 'url': image['ImageSecondaryURL'], 'face': 'back'})
        for key in ('States', 'ContainedObjects', 'ChildObjects'):
            value = obj.get(key)
            if isinstance(value, dict):
                for sub in value.values():
                    walk(sub, here)
            elif isinstance(value, list):
                for sub in value:
                    walk(sub, here)

    for top in save.get('ObjectStates', []):
        walk(top, '(table)')
    return found, skipped


def label_for(entry: dict) -> str:
    """命名优先级：昵称 -> 非通用标签 -> 所属容器名。"""
    if entry['nickname']:
        return entry['nickname']
    extra = [tag for tag in entry.get('tags') or [] if tag.lower() not in GENERIC_TAGS]
    if extra:
        return extra[0]
    return entry['context']


def is_context_derived(entry: dict) -> bool:
    """名字只能靠容器名推断时，文件名一律附来源 GUID，便于回存档核对。"""
    return not entry['nickname'] and not any(
        tag.lower() not in GENERIC_TAGS for tag in entry.get('tags') or [])


def safe_name(text: str, fallback: str) -> str:
    cleaned = BAD_CHARS.sub('_', text).strip().rstrip('.')
    return cleaned[:80] or fallback


def download(url: str, timeout: float, retries: int) -> tuple[bytes, str]:
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read(), response.headers.get('Content-Type', '')
        except Exception as error:  # noqa: BLE001 - 网络错误统一重试
            last = error
            print(f'    第 {attempt}/{retries} 次失败：{error}', flush=True)
    assert last is not None
    raise last


def main() -> int:
    if not args.json.is_file():
        print(f'找不到存档文件：{args.json}', file=sys.stderr)
        return 2
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    save = json.loads(args.json.read_text(encoding='utf-8'))
    exclude = {tag.lower() for tag in args.exclude_tags}
    pattern = re.compile(args.parents) if args.parents else None
    entries, skipped = collect(save, set(args.types), args.include_back, exclude, pattern)
    print(f'匹配对象图片：{len(entries)} 条（类型：{", ".join(args.types)}'
          + (f'；额外容器正则：{args.parents}' if pattern else '') + '）')
    if exclude:
        print(f'已按标签排除 {skipped} 个对象（标签：{", ".join(args.exclude_tags)}）')

    # 按 URL 去重：同一张图可能被多个对象引用
    unique: dict[tuple[str, str], dict] = {}
    for entry in entries:
        key = (entry['url'], entry['face'])
        if key in unique:
            unique[key]['refs'] += 1
        else:
            entry['refs'] = 1
            unique[key] = entry
    print(f'唯一图片：{len(unique)} 张')

    manifest = []
    used: set[str] = set()
    for index, ((url, face), entry) in enumerate(sorted(unique.items(), key=lambda kv: label_for(kv[1]).lower()), 1):
        label = safe_name(label_for(entry), 'unnamed_token')
        digest = hashlib.sha1(url.encode('utf-8')).hexdigest()[:8]
        stem = f'{label}_{face}' if face != 'front' else label
        if is_context_derived(entry):  # 名字来自容器名：补来源 GUID
            stem = f'{stem}_{(entry.get("guid") or digest).lower()}'
        if stem.lower() in used:  # 仍重名（同一对象多种状态等）：再加 URL 哈希
            stem = f'{stem}_{digest}'
        used.add(stem.lower())
        print(f'[{index}/{len(unique)}] {stem}', flush=True)
        data, content_type = download(url, args.timeout, args.retries)
        ext = EXT_BY_TYPE.get(content_type.split(';')[0].strip().lower(), Path(url.rstrip('/')).suffix or '.png')
        target = out / f'{stem}{ext}'
        target.write_bytes(data)
        manifest.append(dict(file=target.name, bytes=len(data), contentType=content_type, face=face,
                             object=entry['name'], nickname=entry['nickname'], context=entry['context'],
                             tags=entry.get('tags') or [], guid=entry.get('guid'), refs=entry['refs'], url=url))

    (out / 'manifest.json').write_text(
        json.dumps(dict(source=str(args.json), types=list(args.types), count=len(manifest), files=manifest),
                   ensure_ascii=False, indent=1), encoding='utf-8')
    total = sum(item['bytes'] for item in manifest)
    print(f'\n完成：{len(manifest)} 张，合计 {total / 1048576:.1f} MB -> {out}')
    print(f'清单：{out / "manifest.json"}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
