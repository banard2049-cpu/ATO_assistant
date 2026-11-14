"""Copy the Theatre textures from the user's XAPK into the local icon pack."""

import argparse
import base64
import io
from pathlib import Path
import sys
import zipfile

import UnityPy

sys.path.insert(0, str(Path(__file__).resolve().with_name('icon-extract')))
from rebuild_ui_icons_from_apk import trace


ICONS = {
    'ico_mnestis': 'normal',
    'ico_charges': 'cursed',
    'ico_victory': 'won',
    'ico_mnestis_tear': 'tear',
    'ico_mnestis_core': 'core',
    'ico_cargo_remains': 'loot',
    'ico_locked': 'secret',
    'ico_tech_titan': 'expansion',
    'ico_knockout': 'knockout',
}


def extract(source, output):
    with zipfile.ZipFile(source) as xapk:
        name, = (name for name in xapk.namelist() if Path(name).name == 'com.itustudio.atoscribe.apk')
        with zipfile.ZipFile(io.BytesIO(xapk.read(name))) as apk:
            data = apk.read('assets/bin/Data/data.unity3d')
    environment = UnityPy.load(data)
    images = {}
    navigation_icon = None
    for obj in environment.objects:
        if obj.type.name != 'Texture2D':
            continue
        texture = obj.read()
        if texture.m_Name not in ICONS:
            continue
        if texture.m_Name in images:
            raise ValueError(f'Duplicate texture {texture.m_Name}')
        image = texture.image.convert('RGBA')
        if texture.m_Name == 'ico_mnestis':
            navigation_icon, _ = trace(image, 'theatre-nav')
        image = image.crop(image.getchannel('A').getbbox())
        png = io.BytesIO()
        image.save(png, format='PNG', optimize=True)
        encoded = base64.b64encode(png.getvalue()).decode('ascii')
        width, height = image.size
        # Wrap the original pixels so the existing SVG icon pack can carry them.
        images[texture.m_Name] = (
            f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'viewBox="0 0 {width} {height}">\n'
            f'<image width="{width}" height="{height}" xlink:href="data:image/png;base64,{encoded}"/>\n</svg>\n'
        )
    if images.keys() != ICONS.keys() or navigation_icon is None:
        raise ValueError(f'Missing textures: {ICONS.keys() - images.keys()}')
    output.mkdir(parents=True, exist_ok=True)
    for name, svg in images.items():
        (output / f'theatre-{ICONS[name]}.svg').write_text(svg, encoding='utf-8', newline='\n')
    (output / 'theatre-nav.svg').write_text(navigation_icon, encoding='utf-8', newline='\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('xapk', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'assets/icons')
    args = parser.parse_args()
    extract(args.xapk, args.output)
