"""Keep one lossless base and combined transparent mask per installed face."""
from __future__ import annotations
import concurrent.futures
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
HD = ROOT / 'map/images/hd1024'
SOURCE = ROOT / 'output/maps-restored-20261017-hd1024'
ARCHIVE = ROOT / 'export/map-assets-archive-20261017'
if not SOURCE.exists():
    SOURCE = ARCHIVE / 'output/maps-restored-20261017-hd1024'

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def main():
    assert HD.resolve() == (ROOT.resolve() / 'map/images/hd1024')
    install_path = HD / 'installation.json'
    if not install_path.exists():
        install_path = ARCHIVE / 'map/images/hd1024/installation.json'
    install = json.loads(install_path.read_text(encoding='utf-8'))
    assert not (HD / 'overlay').exists(), 'Already compacted'
    rows = {}
    for row in json.loads((SOURCE / 'restoration-manifest.json').read_text(encoding='utf-8'))['tiles']:
        rows.setdefault(Path(row['sourcePath']).stem, row)
    assert len(rows) == 511
    removed = []
    for folder in ['composite', 'local', 'neighbors']:
        directory = (HD / folder).resolve()
        assert directory.parent == HD.resolve()
        files = sorted(directory.iterdir())
        assert {p.name for p in files} == {key + '.png' for key in rows}
        assert all(p.is_file() and p.suffix == '.png' and p.resolve().parent == directory for p in files)
        removed.extend(files)
    before_bytes = sum(p.stat().st_size for p in HD.rglob('*.png'))
    staging = HD / 'overlay.pending'
    staging.mkdir()

    def convert(item):
        key, row = item
        src = SOURCE / row['overlay']
        dst = staging / (key + '.png')
        with Image.open(src) as im:
            rgba = im.convert('RGBA')
            assert rgba.size == (1024, 1024)
            rgba.save(dst, compress_level=9)
            with Image.open(dst) as check:
                assert check.convert('RGBA').tobytes() == rgba.tobytes(), key
        assert sha(HD / 'base' / (key + '.png')) == sha(SOURCE / row['base'])
        return {'file': 'images/hd1024/overlay/' + key + '.png', 'sha256': sha(dst)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        masks = list(pool.map(convert, sorted(rows.items())))
    assert len(masks) == 511
    staging.rename(HD / 'overlay')
    # The corresponding full composites and both separate masks remain in the
    # verified export. Remove only the exact, validated installed PNG list.
    for p in removed:
        p.unlink()
    for folder in ['composite', 'local', 'neighbors']:
        (HD / folder).rmdir()
    registry = {'version': '20261017-hd1024-merged1', 'tileSize': 1024,
                'maskLayout': 'combined', 'prefix': './images/hd1024', 'files': sorted(rows)}
    (ROOT / 'map/tile-artwork-data.js').write_text(
        'window.ATO_MAP_ARTWORK_DATA = ' + json.dumps(registry, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8', newline='\n')
    base_records = [r for r in install['files'] if '/base/' in r['file']]
    report = {**install, 'installedPngs': 1022, 'maskLayout': 'combined', 'files': base_records + masks}
    (HD / 'installation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    after_bytes = sum(p.stat().st_size for p in HD.rglob('*.png'))
    summary = {'beforeBytes': before_bytes, 'afterBytes': after_bytes, 'savedBytes': before_bytes - after_bytes,
               'removedInstalledPngs': len(removed), 'combinedMasks': len(masks), 'maskPixelsUnchanged': True,
               'originalExportRetained': True, 'legacyImagesUnchanged': True}
    (HD / 'storage-optimization.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary), flush=True)

if __name__ == '__main__':
    main()
