"""Rebuild the UI SVGs from named APK textures without running APK code.

python tools/icon-extract/rebuild_ui_icons_from_apk.py --unity-dir extracted --apply
python tools/icon-extract/rebuild_ui_icons_from_apk.py --source-dir report/sources --apply

Requires Pillow, numpy, contourpy, PyMuPDF and (for Unity exports) UnityPy.
Source images, comparisons, provenance and backups remain in the ignored report
directory. Glossary and oxygen have no matching artwork in this APK and retain
their current files; they are never replaced with a merely similar symbol.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET

import contourpy
import fitz
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
NAV = {
    'adventures': 'nav_adventure', 'argo': 'nav_argo',
    'argonauts': 'nav_argonauts', 'campaign-notes': 'nav_notes',
    'cargo-hold': 'nav_cargo', 'choice-matrix': 'nav_matrix',
    'diplomacy': 'nav_diplomacy', 'evolution': 'nav_evolution',
    'godforms-summons': 'nav_godforms', 'map': 'nav_map',
    # The established Story button uses the voice-over/text play symbol.
    'story': 'nav_vo', 'technology': 'nav_technology', 'timeline': 'nav_timeline',
}
ARGO = {
    'argo-fate': 'Argo_Fate', 'argo-knowledge': 'Argo_Knowledge',
    'babelian-debt': 'Argo_Debt', 'captives': 'Argo_Captives',
    'crew': 'Argo_Crew', 'defectors': 'Argo_Defectors',
    'frozen-time': 'Argo_FrozenTime', 'hull': 'Argo_Hull',
    'humanity': 'Argo_Humanity', 'loop-length': 'Argo_LoopLength',
    'paradox': 'Argo_Paradox', 'paranoia': 'Argo_Paranoia',
    'refugees': 'Argo_Refugees', 'strangers': 'Argo_Strangers', 'titans': 'Argo_Titans',
}
SOURCES = {**{key: ('sharedassets1.assets', name) for key, name in NAV.items()},
           **{key: ('resources.assets', name) for key, name in ARGO.items()}}
PRESERVED = {'glossary': 'No matching question-mark/book artwork in the APK',
             'oxygen': 'User-supplied artwork; no matching texture or atlas glyph in the APK'}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def backup(root, report, target):
    path = report / 'before' / target.relative_to(root)
    if target.is_file() and not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(target.read_bytes())
    return path if path.exists() else target


def render(svg, width, height, color='#000000'):
    with fitz.open(stream=svg.replace('currentColor', color).encode(), filetype='svg') as doc:
        page = doc[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(width / page.rect.width, height / page.rect.height), alpha=True)
        alpha = Image.frombytes('RGBA', (pix.width, pix.height), pix.samples).getchannel('A')
    art = Image.new('RGBA', alpha.size, color)
    art.putalpha(alpha)
    return art.crop((0, 0, width, height))


def fitted_svg(svg, size, color='#000000'):
    node = ET.fromstring(svg)
    _, _, w, h = map(float, node.attrib['viewBox'].split())
    scale = size / max(w, h)
    return render(svg, max(1, round(w * scale)), max(1, round(h * scale)), color)


def silhouette(image):
    art = Image.new('RGBA', image.size, 'black')
    art.putalpha(image.getchannel('A'))
    return art


def trace(image, name):
    alpha = image.getchannel('A')
    bounds = alpha.point(lambda a: 255 if a >= 128 else 0).getbbox()
    if bounds is None:
        raise ValueError('Empty source: ' + name)
    l, t, r, b = bounds
    crop = (max(0, l - 2), max(0, t - 2), min(image.width, r + 2), min(image.height, b + 2))
    field = np.asarray(alpha.crop(crop)).astype(float)
    h, w = field.shape
    generator = contourpy.contour_generator(
        x=np.arange(w + 2) - .5, y=np.arange(h + 2) - .5,
        z=np.pad(field, 1), line_type='Separate', corner_mask=False,
    )
    loops = generator.lines(127.5)
    if not loops or not all(np.allclose(loop[0], loop[-1]) for loop in loops):
        raise ValueError('Unclosed contours: ' + name)

    def fmt(value):
        return f'{value:.4f}'.rstrip('0').rstrip('.') or '0'

    data = ' '.join('M' + ','.join(map(fmt, loop[0]))
                    + ''.join('L' + ','.join(map(fmt, point)) for point in loop[1:-1]) + 'Z'
                    for loop in loops)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
           f'width="{w}" height="{h}" role="img" aria-label="{name}">\n'
           f'  <path fill="currentColor" fill-rule="evenodd" d="{data}"/>\n</svg>\n')
    actual = np.asarray(render(svg, w, h).getchannel('A')) >= 128
    expected = field >= 127.5
    iou = float((actual & expected).sum() / (actual | expected).sum())
    if iou < .98:
        raise ValueError(f'Low source/render overlap for {name}: {iou}')
    return svg, {'width': w, 'height': h, 'source_crop': list(crop),
                 'contours': len(loops), 'mask_iou': iou}


def export_sources(unity_dir, source_dir):
    import UnityPy
    required = set(SOURCES.values())
    records = []
    found = set()
    env = UnityPy.load(str(unity_dir))
    for obj in env.objects:
        if obj.type.name != 'Texture2D':
            continue
        data = obj.read()
        key = (obj.assets_file.name, data.m_Name)
        if key not in required:
            continue
        if key in found:
            raise ValueError('Ambiguous texture: ' + str(key))
        found.add(key)
        target = source_dir / key[0] / (key[1] + '.png')
        target.parent.mkdir(parents=True, exist_ok=True)
        image = data.image.convert('RGBA')
        image.save(target)
        records.append({'file': key[0], 'name': key[1], 'pathId': obj.path_id,
                        'source_size': list(image.size), 'decoded_pixels_sha256': digest(image.tobytes())})
    if found != required:
        raise ValueError('Missing APK textures: ' + str(required - found))
    write_json(source_dir / 'source-index.json', records)


def make_comparisons(rows, root, report):
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
    except OSError:
        font = ImageFont.load_default()
    for offset in range(0, len(rows), 12):
        group = rows[offset:offset + 12]
        sheet = Image.new('RGB', (1080, 46 + math.ceil(len(group) / 3) * 220), '#f6f0eb')
        draw = ImageDraw.Draw(sheet)
        draw.text((18, 12), 'UI icons: previous / APK source / rebuilt SVG', font=font, fill='#5f341b')
        for i, row in enumerate(group):
            x, y = (i % 3) * 360, 46 + (i // 3) * 220
            draw.text((x + 12, y + 6), row['name'], font=font, fill='#5f341b')
            previous = (report / 'before/assets/icons' / (row['name'] + '.svg')).read_text(encoding='utf-8')
            source = silhouette(Image.open(row['source_path']).convert('RGBA').crop(row['source_crop']))
            source.thumbnail((98, 110), Image.Resampling.LANCZOS)
            new = (report / 'mapped' / (row['name'] + '.svg')).read_text(encoding='utf-8')
            for j, art in enumerate((fitted_svg(previous, 110), source, fitted_svg(new, 110))):
                sheet.paste(art, (x + j * 118 + (118 - art.width) // 2, y + 35 + (110 - art.height) // 2), art)
            for j, size in enumerate((16, 24, 32)):
                art = fitted_svg(new, size, '#7f4b26')
                sheet.paste(art, (x + 18 + j * 80, y + 161), art)
            # All paths also remain visible as white icons on a dark theme.
            draw.rectangle((x + 274, y + 155, x + 344, y + 205), fill='#25221f')
            art = fitted_svg(new, 32, '#ffffff')
            sheet.paste(art, (x + 293, y + 164), art)
        sheet.save(report / f'comparison-{offset // 12 + 1}.png')
    names = sorted([*SOURCES, *PRESERVED])
    sheet = Image.new('RGB', (1000, math.ceil(len(names) / 6) * 156 + 45), '#f6f0eb')
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 10), 'APK rebuilt UI icons | * original retained (no matching APK artwork)', font=font, fill='#5f341b')
    for i, name in enumerate(names):
        path = report / 'mapped' / (name + '.svg') if name in SOURCES else root / 'assets/icons' / (name + '.svg')
        art = fitted_svg(path.read_text(encoding='utf-8'), 100)
        x, y = (i % 6) * 166, 45 + (i // 6) * 156
        sheet.paste(art, (x + (166 - art.width) // 2, y + 5), art)
        draw.text((x + 5, y + 115), name + (' *' if name in PRESERVED else ''), font=font, fill='#5f341b')
    sheet.save(report / 'rebuilt-overview.png')


def update_ui_references(rows, root, report):
    """Change only icon URLs and runtime glyph dimensions; retain other bytes."""
    version = 'apk-ui-' + digest(''.join(row['svg_sha256'] for row in rows).encode())[:12]
    version_bytes = version.encode('ascii')
    names = b'|'.join(re.escape(row['name'].encode()) for row in rows)
    pattern = rb'(url\((?:\.\.?/)*assets/icons/(?:' + names + rb')\.svg)(?:\?[^)]*)?(\))'
    changed_files = []
    for relative in ('index.html', 'record/index.html'):
        path = root / relative
        original = path.read_bytes()
        changed = re.sub(pattern, lambda m: m[1] + b'?v=' + version_bytes + m[2], original)
        if relative == 'record/index.html':
            changed, count = re.subn(rb'(<script src="\./item-icons\.js)(?:\?[^"\r\n]*)?("[^>]*>)',
                                    lambda m: m[1] + b'?v=' + version_bytes + m[2], changed)
            if count != 1:
                raise ValueError('Expected one record item-icons.js reference')
        if changed != original:
            backup(root, report, path)
            path.write_bytes(changed)
            changed_files.append(relative)
    path = root / 'record/item-icons.js'
    original = path.read_bytes()
    line = b'window.RECORD_ICON_VERSION = "' + version_bytes + b'";'
    if b'window.RECORD_ICON_VERSION =' in original:
        changed = re.sub(rb'window\.RECORD_ICON_VERSION = "[^"\r\n]*";', lambda m: line, original)
    else:
        ending = b'\r\n' if b'\r\n' in original else b'\n'
        changed, count = re.subn(rb'(window\.RECORD_ICON_BASE = "[^"\r\n]*";)',
                                lambda m: m[1] + ending + line, original)
        if count != 1:
            raise ValueError('Expected the record icon base declaration')
    for row in rows:
        name = row['name'].encode()
        spec = rb'(\{ name: "' + re.escape(name) + rb'", w: )\d+(, h: )\d+'
        changed = re.sub(spec, lambda m: m[1] + str(row['width']).encode() + m[2]
                         + str(row['height']).encode(), changed)
    old_url = b'url(${window.RECORD_ICON_BASE}${name}.svg)'
    new_url = b'url(${window.RECORD_ICON_BASE}${name}.svg?v=${window.RECORD_ICON_VERSION})'
    changed = changed.replace(old_url, new_url)
    if new_url not in changed:
        raise ValueError('Expected the runtime record icon URL')
    if changed != original:
        backup(root, report, path)
        path.write_bytes(changed)
        changed_files.append('record/item-icons.js')
    return {'cache_version': version, 'updated_files': changed_files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--unity-dir', type=Path)
    source.add_argument('--source-dir', type=Path)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--report-dir', type=Path, default=ROOT / 'output/reports/ui-icons-apk-20261019')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    root, report = args.root.resolve(), args.report_dir.resolve()
    # Reject a damaged source page before backing it up or changing any assets.
    # Read bytes for edits below so the HTML's existing line endings survive.
    if args.apply:
        for relative in ('index.html', 'record/index.html', 'record/item-icons.js'):
            try:
                (root / relative).read_bytes().decode('utf-8')
            except UnicodeDecodeError as exc:
                raise ValueError(f'{relative} is not valid UTF-8; repair it before applying icons') from exc
    report.mkdir(parents=True, exist_ok=True)
    source_dir = args.source_dir.resolve() if args.source_dir else report / 'sources'
    source_dir.mkdir(parents=True, exist_ok=True)
    if args.unity_dir:
        export_sources(args.unity_dir.resolve(), source_dir)
    index = source_dir / 'source-index.json'
    provenance = json.loads(index.read_text(encoding='utf-8')) if index.exists() else []
    mapped = report / 'mapped'
    mapped.mkdir(exist_ok=True)
    manifest_path = root / 'assets/icons/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if {entry['name'] for entry in manifest['icons']} != set(SOURCES) | set(PRESERVED):
        raise ValueError('Review new or missing icons before rebuilding')
    rows = []
    for name, (asset_file, texture_name) in sorted(SOURCES.items()):
        path = source_dir / asset_file / (texture_name + '.png')
        image = Image.open(path).convert('RGBA')
        svg, stats = trace(image, name)
        dest = mapped / (name + '.svg')
        dest.write_text(svg, encoding='utf-8', newline='\n')
        target = root / 'assets/icons' / dest.name
        previous = backup(root, report, target)
        source_record = next((r for r in provenance if r['file'] == asset_file and r['name'] == texture_name), {})
        if source_record.get('decoded_pixels_sha256') not in (None, digest(image.tobytes())):
            raise ValueError('Source pixels differ from the export index: ' + name)
        row = {'name': name, 'asset_file': asset_file, 'texture_name': texture_name,
               'path_id': source_record.get('pathId'), 'source_path': str(path),
               'source_size': list(image.size), 'decoded_pixels_sha256': digest(image.tobytes()),
               'previous_sha256': digest(previous.read_bytes()), 'svg_sha256': digest(dest.read_bytes()), **stats}
        for size in (16, 24, 32, 64):
            if not fitted_svg(svg, size).getchannel('A').getbbox():
                raise ValueError(f'Empty {size}px render: {name}')
        rows.append(row)
    make_comparisons(rows, root, report)
    if args.apply:
        backup(root, report, manifest_path)
        for row in rows:
            name = row['name']
            target = root / 'assets/icons' / (name + '.svg')
            target.write_bytes((mapped / target.name).read_bytes())
            entry = next(e for e in manifest['icons'] if e['name'] == name)
            entry.update({key: row[key] for key in ('width', 'height', 'source_size', 'source_crop', 'decoded_pixels_sha256')})
            entry.update(source=f"APK {row['asset_file']} / Texture2D / {row['texture_name']}",
                         conversion='Alpha 127.5 isocontours; evenodd; currentColor; no spline smoothing', updated='2026-10-19')
        manifest.update(note='UI glyphs loaded with CSS masks; 28 rebuilt from named APK textures; 2 original glyphs retained.',
                        generated_from=['APK named Texture2D alpha contours', 'original glossary and oxygen artwork'],
                        preserved=PRESERVED)
        write_json(manifest_path, manifest)
        integration = update_ui_references(rows, root, report)
    else:
        integration = {}
    summary = {'applied': args.apply, 'rebuilt': len(rows), 'preserved': PRESERVED,
               'minimum_mask_iou': min(row['mask_iou'] for row in rows), 'icons': rows, **integration}
    write_json(report / 'verification.json', summary)
    print(json.dumps({key: value for key, value in summary.items() if key != 'icons'}))


if __name__ == '__main__':
    main()
