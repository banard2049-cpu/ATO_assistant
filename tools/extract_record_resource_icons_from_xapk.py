"""Extract original Unity cargo sprites into the record sheet's existing slots.

Usage: python tools/extract_record_resource_icons_from_xapk.py app.xapk --apply
Requires UnityPy and Pillow. Images/reports/backups stay in local ignored paths.
Only known archive entries and existing resource keys are used as destinations;
no APK code is executed. Without --apply, prepare extraction and a mapping report.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

import UnityPy
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ALIASES = {
    'calcifiedKnuckle': 'cargo_calcified_knuckle_bone',
    'core': 'cargo_cores',
    'daedalusMakina': 'cargo_deadalus_makina',
    'echoes': 'cargo_echoes_of_recollection',
    # The supplied app retains this older English asset name; the glyph was
    # checked against the existing Oxidized Ambrosia image, not inferred by name.
    'oxidizedAmbrosia': 'cargo_black_flame_ambrosia',
    'priests': 'cargo_priest',
    'sisyphusTears': 'cargo_sisyphus_tear',
    'supersolidRelief': 'cargo_supersolid_relief_mass',
    'trireme': 'cargo_trimere',
    'warTrireme': 'cargo_war_trimere',
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalized(name: str) -> str:
    return re.sub('[^a-z]', '', name.lower().removeprefix('cargo_'))


def write_json(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def black_fitted_icon(image, preserve_white=True):
    """Fit visible ink to a shared 226px extent without stretching the glyph."""
    alpha = image.getchannel('A')
    bounds = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if not bounds:
        raise ValueError('Empty icon')
    # Retain a pixel of the antialiased fringe around the measured glyph.
    left, top, right, bottom = bounds
    crop = (max(0, left-1), max(0, top-1), min(image.width, right+1), min(image.height, bottom+1))
    glyph = alpha.crop(crop)
    scale = 226 / max(glyph.size)
    size = tuple(max(1, round(side * scale)) for side in glyph.size)
    glyph = glyph.resize(size, Image.Resampling.LANCZOS)
    output_alpha = Image.new('L', (250, 250))
    output_alpha.paste(glyph, ((250-size[0])//2, (250-size[1])//2))
    output = Image.new('RGBA', (250, 250), (0, 0, 0, 0))
    # Some cargo art has opaque white eyes/engravings inside the silhouette.
    # Normalize its dark ink, but retain those details instead of filling them.
    # The core is the exception: its entire foreground is white in the APK.
    if preserve_white:
        white = image.convert('L').point(lambda value: max(0, min(255, round((value-100)*255/130))))
        white = white.crop(crop).resize(size, Image.Resampling.LANCZOS)
        output.paste(Image.merge('RGB', (white, white, white)), ((250-size[0])//2, (250-size[1])//2))
    output.putalpha(output_alpha)
    return output, list(crop)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('xapk', type=Path)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--report-dir', type=Path)
    parser.add_argument('--cache-version', help='Defaults to a version derived from the source APK hash')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.cache_version is not None and not re.fullmatch(r'[A-Za-z0-9._-]+', args.cache_version):
        parser.error('--cache-version must contain only letters, digits, dots, underscores or hyphens')
    root = args.root.resolve()
    report = (args.report_dir or root/'output/reports/apk-record-icons').resolve()
    report.mkdir(parents=True, exist_ok=True)
    source_dir, extracted = report/'unity-source', report/'mapped'
    source_dir.mkdir(exist_ok=True)
    extracted.mkdir(exist_ok=True)
    index = root/'record/index.html'
    original_html = index.read_bytes()
    block = original_html.decode('utf8').split('    const resourceImageMap = {', 1)[1].split('\n    };', 1)[0]
    keys = re.findall(r'^      (\w+):', block, re.M)
    if len(keys) != len(set(keys)) or not keys:
        raise ValueError('Invalid record resource map')
    with zipfile.ZipFile(args.xapk) as outer:
        bases = [name for name in outer.namelist() if name.rsplit('/', 1)[-1] == 'com.itustudio.atoscribe.apk']
        if len(bases) != 1:
            raise ValueError('Expected one official app base APK')
        apk_data = outer.read(bases[0])
        apk_hash = digest(apk_data)
        if args.cache_version is None:
            args.cache_version = 'apk-' + apk_hash[:12] + '-black-white-fit3'
        with zipfile.ZipFile(io.BytesIO(apk_data)) as apk:
            for name in ['data.unity3d', 'resources.resource']:
                data = apk.read('assets/bin/Data/'+name)
                target = source_dir/name
                if not target.is_file() or digest(target.read_bytes()) != digest(data):
                    target.write_bytes(data)
    del apk_data
    env = UnityPy.load(str(source_dir))
    sprites, textures = {}, {}
    for obj in env.objects:
        if obj.type.name not in ['Sprite', 'Texture2D'] or obj.assets_file.name != 'sharedassets1.assets':
            continue
        data = obj.read()
        if data.m_Name.startswith('cargo_'):
            catalog = sprites if obj.type.name == 'Sprite' else textures
            if data.m_Name in catalog:
                raise ValueError('Ambiguous source sprite: '+data.m_Name)
            catalog[data.m_Name] = (obj, data)
    candidates = {}
    for name in sprites:
        candidates.setdefault(normalized(name), []).append(name)
    rows, pending = [], []
    for key in keys:
        if key == 'rare':
            # Keep the established generic glyph, always deriving from its
            # immutable backup so reruns cannot progressively resample it.
            local = report/'before/record/assets/resource-icons/rare.png'
            if not local.is_file():
                local = root/'record/assets/resource-icons/rare.png'
            original = Image.open(local).convert('RGBA')
            image, bounds = black_fitted_icon(original)
            path = extracted/'rare.png'
            image.save(path)
            rows.append({'key': key, 'source': 'existing Glossary glyph; no APK equivalent',
                         'size': list(image.size), 'sourceCrop': bounds,
                         'transform': 'black ink, retained white details; proportional fit to 226px; centered on 250px canvas',
                         'sourceAlphaSha256': digest(original.getchannel('A').tobytes()),
                         'outputSha256': digest(path.read_bytes()),
                         'target': 'record/assets/resource-icons/rare.png', 'applied': False})
            continue
        names = [ALIASES[key]] if key in ALIASES else candidates.get(normalized(key), [])
        if len(names) != 1 or names[0] not in sprites:
            raise ValueError(f'No unambiguous sprite for {key}: {names}')
        name = names[0]
        obj, sprite = sprites[name]
        texture_obj, texture = textures[name]
        # Sprite.image crops to Unity's tight rendering rectangle. Decode the
        # original named texture to retain its full 250px transparent canvas.
        image = texture.image.convert('RGBA')
        if image.size != (int(sprite.m_Rect.width), int(sprite.m_Rect.height)):
            raise ValueError('Expected a standalone sprite texture: '+name)
        alpha = image.getchannel('A')
        if not alpha.getbbox() or alpha.getextrema()[0] != 0:
            raise ValueError(f'Expected a nonempty transparent sprite: {name}')
        alpha_hash = digest(alpha.tobytes())
        image, bounds = black_fitted_icon(image, preserve_white=key != 'core')
        transform = 'black ink, retained white details; proportional fit to 226px; centered on 250px canvas'
        path = extracted/(key+'.png')
        image.save(path)
        reloaded = Image.open(path).convert('RGBA')
        if reloaded.size != (250, 250) or not reloaded.getchannel('A').getbbox():
            raise ValueError('Invalid normalized black icon: '+key)
        row = {'key': key, 'sprite': name, 'assetFile': obj.assets_file.name,
               'pathId': obj.path_id, 'texturePathId': texture_obj.path_id,
               'size': list(image.size), 'transform': transform, 'sourceCrop': bounds,
               'sourceAlphaSha256': alpha_hash, 'outputSha256': digest(path.read_bytes()),
               'target': f'record/assets/resource-icons/{key}.png', 'applied': False}
        rows.append(row)
    # Validate every image/mapping before replacing any destination.
    if len(rows) + len(pending) != len(keys):
        raise ValueError('Incomplete record resource coverage')
    changed_html = original_html
    for row in rows:
        key = row['key']
        pattern = rb'("\./assets/resource-icons/' + key.encode() + rb'\.png)(?:\?[^"\r\n]*)?("),'
        changed_html, count = re.subn(pattern, lambda m: m[1] + b'?v=' + args.cache_version.encode('ascii') + m[2] + b',', changed_html)
        if count != 1:
            raise ValueError('Unexpected resource URL count: '+key)
        # This legacy HTML has mixed LF/CRLF lines. Keep Git's modified map
        # lines LF-terminated without rewriting the rest of the document.
        changed_html = re.sub(rb'(^[ \t]*' + key.encode() + rb': "[^\r\n]+",)\r$',
                              lambda m: m[1], changed_html, flags=re.M)
    if args.apply:
        backup = report/'before'
        backup.mkdir(exist_ok=True)
        for row in rows:
            incoming = (extracted/(row['key']+'.png')).read_bytes()
            paths = [root/row['target']]
            mirror = root/'official-assets'/row['target']
            # Keep existing explicit official overrides from restoring old icons.
            if mirror.is_file():
                paths.append(mirror)
            row['writtenPaths'] = []
            for target in paths:
                relative = target.relative_to(root)
                old = target.read_bytes() if target.is_file() else None
                if old != incoming:
                    old_path = backup/relative
                    if old is not None and not old_path.exists():
                        old_path.parent.mkdir(parents=True, exist_ok=True)
                        old_path.write_bytes(old)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(incoming)
                row['writtenPaths'].append(relative.as_posix())
                if digest(target.read_bytes()) != row['outputSha256']:
                    raise ValueError('Installed icon verification failed: '+str(target))
            row['applied'] = True
        old_index = backup/'record/index.html'
        if not old_index.exists():
            old_index.parent.mkdir(parents=True, exist_ok=True)
            old_index.write_bytes(original_html)
        index.write_bytes(changed_html)
    manifest = {'sourceXapk': str(args.xapk.resolve()), 'sourceApkSha256': apk_hash,
                'sourceApkEntry': bases[0], 'totalRecordIcons': len(keys), 'mapped': len(rows),
                'applied': args.apply, 'cacheVersion': args.cache_version,
                'preserved': pending, 'icons': rows}
    write_json(report/'replacement-manifest.json', manifest)
    print(json.dumps({'recordIcons': len(keys), 'mapped': len(rows), 'preserved': pending,
                      'applied': args.apply, 'report': str(report)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
