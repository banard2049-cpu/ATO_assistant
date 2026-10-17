"""Install a verified map export without replacing legacy images or map data."""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def install(source: Path):
    source = source.resolve()
    doc = json.loads((source / 'restoration-manifest.json').read_text(encoding='utf-8'))
    verification = json.loads((source / 'verification.json').read_text(encoding='utf-8'))
    assert verification['recomposedLayersMatchExports'] and verification['tileSize'] == 1024
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = ROOT / 'output/backups' / ('map-before-hd-' + stamp)
    original = ROOT / 'map'
    destination = original / 'images/hd1024'
    assert not destination.exists(), 'HD assets already installed; choose an explicit update workflow'
    assert not backup.exists()
    shutil.copytree(original, backup / 'map')
    hashes = {}
    for path in sorted(original.rglob('*')):
        if path.is_file():
            rel = path.relative_to(original).as_posix()
            hashes[rel] = sha(path)
            assert sha(backup / 'map' / rel) == hashes[rel], rel
    (backup / 'sha256.json').write_text(json.dumps(hashes, indent=2) + '\n', encoding='utf-8')
    print('Backup verified:', backup, len(hashes), 'files', flush=True)

    # A versioned asset directory avoids changing legacy front/back URLs.
    rows = {}
    for tile in doc['tiles']:
        key = Path(tile['sourcePath']).stem
        if key in rows:
            assert sha(source / tile['output']) == sha(source / rows[key]['output']), key
            continue
        rows[key] = tile
    copied = []
    for key, tile in sorted(rows.items()):
        for layer, field in [('base', 'base'), ('overlay', 'overlay')]:
            src = source / tile[field]
            dst = destination / layer / (key + '.png')
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            digest = sha(src)
            assert sha(dst) == digest
            copied.append({'file': dst.relative_to(original).as_posix(), 'sha256': digest})
    # Verify every pre-existing map file still has precisely the backed-up bytes.
    for rel, digest in hashes.items():
        assert sha(original / rel) == digest, rel
    registry = {'version': '20261017-hd1024-merged1', 'tileSize': 1024, 'maskLayout': 'combined',
                'prefix': './images/hd1024', 'files': sorted(rows)}
    (original / 'tile-artwork-data.js').write_text(
        'window.ATO_MAP_ARTWORK_DATA = ' + json.dumps(registry, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8', newline='\n')
    report = {'backup': str(backup), 'legacyFilesVerified': len(hashes),
              'uniqueFaces': len(rows), 'installedPngs': len(copied), 'maskLayout': 'combined', 'files': copied}
    (destination / 'installation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (backup / 'README.txt').write_text(
        '此目录是接入高清分层地图前 map/ 的完整备份。\n'
        '旧图片和 map-data.js 在接入时保持原字节；页面可直接切换旧版地图。\n'
        '需要完全回退时，关闭应用并将此处 map/ 内容复制回项目 map/；\n'
        '本次新增的 images/hd1024、tile-artwork*.js 可另行移走。\n', encoding='utf-8-sig')
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    install(parser.parse_args().source)
