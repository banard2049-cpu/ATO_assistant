"""Extract all 15 record diplomacy faction icons from the supplied Unity XAPK.

Usage: python tools/extract_record_ally_icons_from_xapk.py app.xapk --apply
Requires UnityPy/Pillow. Only images are decoded; APK code is never executed.
"""
import argparse
import io
import json
import re
import zipfile
from pathlib import Path

import UnityPy
from PIL import Image, ImageDraw

from extract_record_resource_icons_from_xapk import ROOT, black_fitted_icon, digest

FACTIONS = {
    'ARISTOTELIANS': 'aristotelians', 'CLOUDTHIEVES': 'cthieves',
    'CYCLADEANPROTECTORATE': 'protectorate', 'CYCLOPES': 'cyclopes',
    'DELPHIANS': 'delphians', 'FOLLOWERSOFARETE': 'followers',
    'HELOTS': 'helots', 'HORNSWORN': 'hornsworn', 'LABYRINTHIANS': 'labyrinthians',
    'MINOANS': 'minoans', 'OUTCASTVANGUARD': 'vanguard', 'SUNHEIRS': 'sunheirs',
    'SYMMACHY': 'symmachy', 'TWILIGHTWATCH': 'twilight', 'WASTERS': 'wasters',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('xapk', type=Path)
    parser.add_argument('--report-dir', type=Path, default=ROOT/'output/reports/apk-record-ally-icons')
    parser.add_argument('--unity-dir', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    report = args.report_dir.resolve()
    report.mkdir(parents=True, exist_ok=True)
    source = (args.unity_dir or report/'unity-source').resolve()
    source.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.xapk) as outer:
        entries = [name for name in outer.namelist() if name.rsplit('/', 1)[-1] == 'com.itustudio.atoscribe.apk']
        if len(entries) != 1:
            raise ValueError('Expected exactly one official base APK')
        apk_data = outer.read(entries[0])
        apk_hash = digest(apk_data)
        with zipfile.ZipFile(io.BytesIO(apk_data)) as apk:
            for name in ('data.unity3d', 'resources.resource'):
                raw = apk.read('assets/bin/Data/'+name)
                target = source/name
                if not target.is_file() or digest(target.read_bytes()) != digest(raw):
                    target.write_bytes(raw)
    del apk_data
    env = UnityPy.load(str(source))
    textures = {}
    for obj in env.objects:
        if obj.type.name == 'Texture2D' and obj.assets_file.name == 'resources.assets':
            texture = obj.read()
            if texture.m_Name.startswith('faction_'):
                if texture.m_Name in textures:
                    raise ValueError('Ambiguous faction texture: '+texture.m_Name)
                textures[texture.m_Name] = (obj, texture)
    index = ROOT/'record/index.html'
    html = index.read_bytes()
    block = html.decode('utf8').split('const diplomacyFactionIcons = {', 1)[1].split('};', 1)[0]
    assert set(re.findall(r': "([A-Z]+)"', block)) == set(FACTIONS)
    mapped = report/'mapped'
    mapped.mkdir(exist_ok=True)
    rows = []
    sheet = Image.new('RGB', (1200, 5*170+40), '#faf7ee')
    draw = ImageDraw.Draw(sheet)
    draw.text((15, 10), 'Ally factions: previous | APK original | normalized black (all 15)', fill='black')
    for i, (key, suffix) in enumerate(FACTIONS.items()):
        obj, texture = textures['faction_'+suffix]
        original = texture.image.convert('RGBA')
        image, bounds = black_fitted_icon(original)
        target = ROOT/f'record/assets/ally/{key}.png'
        backup = report/'before'/target.relative_to(ROOT)
        previous = Image.open(backup if backup.exists() else target).convert('RGBA')
        for j, art in enumerate((previous, original, image)):
            art = art.copy()
            art.thumbnail((100, 100), Image.Resampling.LANCZOS)
            x, y = (i%3)*400+j*125+15, (i//3)*170+50
            sheet.paste(art, (x+(100-art.width)//2, y+(100-art.height)//2), art)
        draw.text(((i%3)*400+15, (i//3)*170+155), key, fill='black')
        exported = mapped/(key+'.png')
        image.save(exported)
        alpha = image.getchannel('A')
        bbox = alpha.point(lambda a: 255 if a>8 else 0).getbbox()
        assert image.size == (250, 250) and alpha.getextrema()[0] == 0
        assert bbox and 220 <= max(bbox[2]-bbox[0], bbox[3]-bbox[1]) <= 228
        assert abs((bbox[0]+bbox[2])/2-125) <= 2 and abs((bbox[1]+bbox[3])/2-125) <= 2
        assert any(p[:3] == (0, 0, 0) and p[3] == 255 for p in image.getdata())
        rows.append({'key': key, 'texture': texture.m_Name, 'assetFile': obj.assets_file.name,
                     'pathId': obj.path_id, 'sourceSize': list(original.size), 'sourceCrop': bounds,
                     'outputSize': list(image.size), 'outputSha256': digest(exported.read_bytes()),
                     'transform': 'black ink with retained white details; proportional 226px fit on 250px canvas',
                     'target': target.relative_to(ROOT).as_posix()})
    version = 'apk-'+apk_hash[:12]+'-ally-black-fit1'
    changed = html.replace(b'`./assets/ally/${fileName}.png`',
                           b'`./assets/ally/${fileName}.png?v='+version.encode()+b'`')
    if changed == html and version.encode() not in html:
        raise ValueError('Expected known ally URL template')
    # Preserve the legacy document's mixed line endings outside the edited line.
    changed = re.sub(rb'(^[^\r\n]*assets/ally/[^\r\n]*)\r$', lambda m: m[1], changed, flags=re.M)
    if args.apply:
        for row in rows:
            target = ROOT/row['target']
            mirrors = [target]
            mirror = ROOT/'official-assets'/row['target']
            if mirror.exists():
                mirrors.append(mirror)
            for destination in mirrors:
                backup = report/'before'/destination.relative_to(ROOT)
                if destination.is_file() and not backup.exists():
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    backup.write_bytes(destination.read_bytes())
                destination.write_bytes((mapped/(row['key']+'.png')).read_bytes())
                assert digest(destination.read_bytes()) == row['outputSha256']
        backup = report/'before/record/index.html'
        if not backup.exists():
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_bytes(html)
        index.write_bytes(changed)
    sheet.save(report/'ally-comparison.png')
    manifest = {'sourceXapk': str(args.xapk.resolve()), 'sourceApkSha256': apk_hash,
                'applied': args.apply, 'cacheVersion': version, 'verified': len(rows), 'icons': rows}
    (report/'replacement-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf8')
    print(json.dumps({'verified': len(rows), 'applied': args.apply, 'report': str(report)}))


if __name__ == '__main__':
    main()
