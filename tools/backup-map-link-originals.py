"""Create immutable official-assets backups before map-link vector installation.

Copies all 511 byte-identical source overlays into the requested official
material directory and snapshots all current corner SVGs plus their registry.
Existing different content is rejected; this tool never changes runtime files.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import argparse

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / 'output/map-link-vector-review-20261025/inventory.json'
OFFICIAL = ROOT / 'official-assets'
SNAPSHOT = OFFICIAL / '_backups/map-links-20261025'
ORIGINALS = SNAPSHOT / 'originals/map/images/hd1024/overlay'
REPORT = ROOT / 'output/map-link-vector-install-20261025/backup-check.json'


def sha(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def copy_verified(source: Path, target: Path, expected: str) -> bool:
    if sha(source) != expected:
        raise ValueError(f'Source changed before backup: {relative(source)}')
    if target.exists():
        if not target.is_file() or sha(target) != expected:
            raise ValueError(f'Existing backup differs; refusing overwrite: {relative(target)}')
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    with source.open('rb') as original, target.open('xb') as backup:
        shutil.copyfileobj(original, backup, length=1024 * 1024)
    if sha(target) != expected:
        raise ValueError(f'Backup hash mismatch: {relative(target)}')
    return True


def relocate_originals() -> None:
    """Move only our hash-proven original PNGs into inactive backup storage."""
    manifest_path = SNAPSHOT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    inventory = {row['key']: row for row in json.loads(INVENTORY.read_text(encoding='utf-8'))['faces']}
    originals = [row for row in manifest['files'] if row['kind'] == 'original-raster-overlay']
    if len(originals) != 511:
        raise ValueError('Expected exactly 511 audited raster backup records')
    moves = []
    for record in originals:
        key, digest = record['key'], record['sha256']
        if key not in inventory or digest != inventory[key]['sourceSha256']:
            raise ValueError(f'Backup is not an audited original: {key}')
        previous = OFFICIAL / 'map/images/hd1024/overlay' / f'{key}.png'
        target = ORIGINALS / f'{key}.png'
        if record['backup'] not in (relative(previous), relative(target)):
            raise ValueError(f'Unexpected backup owner path: {record["backup"]}')
        # Validate all absolute source/destination paths before any move.
        if not previous.resolve().is_relative_to(OFFICIAL.resolve()):
            raise ValueError(f'Move source escaped official-assets: {previous}')
        if not target.resolve().is_relative_to(SNAPSHOT.resolve()):
            raise ValueError(f'Move target escaped snapshot directory: {target}')
        if previous.exists():
            if sha(previous) != digest or previous.stat().st_size != record['bytes']:
                raise ValueError(f'Existing source is not our unchanged backup: {relative(previous)}')
            if target.exists():
                raise ValueError(f'Both old and new backups exist; refusing to replace: {key}')
            moves.append((previous, target, digest))
        elif not target.is_file() or sha(target) != digest:
            raise ValueError(f'Neither verified old nor new backup exists: {key}')
    old_manifest = SNAPSHOT / 'manifest-before-originals-relocation.json'
    if not old_manifest.exists():
        with old_manifest.open('xb') as stream:
            stream.write(manifest_path.read_bytes())
    for previous, target, digest in moves:
        target.parent.mkdir(parents=True, exist_ok=True)
        previous.rename(target)
        if sha(target) != digest:
            raise ValueError(f'Moved backup checksum mismatch: {relative(target)}')
    for record in originals:
        record['backup'] = relative(ORIGINALS / f'{record["key"]}.png')
    for record in manifest['files']:
        path = ROOT / record['backup']
        if not path.is_file() or sha(path) != record['sha256'] or path.stat().st_size != record['bytes']:
            raise ValueError(f'Backup verification failed: {record["backup"]}')
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = {'status': 'passed', 'runtimeFilesModified': 0,
              'originalRasterOverlays': 511, 'preInstallVectorOverlays': 511,
              'registrySnapshots': 1, 'verifiedBackupFiles': len(manifest['files']),
              'newBackupFiles': 0, 'movedOriginalFiles': len(moves), 'allCopiesSha256Equal': True,
              'manifest': relative(manifest_path), 'officialRasterDirectory': relative(ORIGINALS),
              'snapshotDirectory': relative(SNAPSHOT), 'backupDirectoryExcludedFromOverrides': True,
              'backupBytes': sum(record['bytes'] for record in manifest['files'])}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False), flush=True)


def main() -> None:
    inventory = json.loads(INVENTORY.read_text(encoding='utf-8'))
    faces = inventory['faces']
    keys = [row['key'] for row in faces]
    if len(keys) != len(set(keys)) or len(keys) != 511:
        raise ValueError('Expected exactly 511 unique source faces')
    if sum('-alt-' in key for key in keys) != 7:
        raise ValueError('Missing seven C1 alternate source fronts')
    jobs = []
    for row in sorted(faces, key=lambda row: row['key']):
        key = row['key']
        source = ROOT / row['source']
        target = ORIGINALS / f'{key}.png'
        jobs.append((source, target, row['sourceSha256'], 'original-raster-overlay', key))
        current = ROOT / 'map/images/hd1024/overlay' / f'{key}-corners.svg'
        previous = SNAPSHOT / 'map/images/hd1024/overlay' / current.name
        jobs.append((current, previous, sha(current), 'pre-install-vector-overlay', key))
    registry = ROOT / 'map/tile-artwork-data.js'
    jobs.append((registry, SNAPSHOT / 'map/tile-artwork-data.js', sha(registry), 'pre-install-registry', None))
    # Preflight every source and any existing target before creating anything.
    for source, target, digest, kind, key in jobs:
        if not target.resolve().is_relative_to(OFFICIAL.resolve()):
            raise ValueError(f'Backup target escaped official-assets: {target}')
        if sha(source) != digest:
            raise ValueError(f'Source checksum differs from audited inventory: {relative(source)}')
        if target.exists() and (not target.is_file() or sha(target) != digest):
            raise ValueError(f'Existing backup differs; refusing overwrite: {relative(target)}')
    records = []
    created = 0
    for source, target, digest, kind, key in jobs:
        created += copy_verified(source, target, digest)
        records.append({'key': key, 'kind': kind, 'source': relative(source),
                        'backup': relative(target), 'sha256': digest,
                        'bytes': target.stat().st_size})
        if len(records) % 200 == 0:
            print(f'Backed up {len(records)}/{len(jobs)} files', flush=True)
    # Recheck runtime and source files after all copies. No runtime mutations.
    for source, target, digest, kind, key in jobs:
        if sha(source) != digest or sha(target) != digest:
            raise ValueError(f'Post-copy protection failure: {relative(source)}')
    manifest = {'version': '20261025-map-links-before-install',
                'purpose': 'Immutable originals and pre-install state; no runtime assets modified.',
                'originalRasterOverlays': 511, 'preInstallVectorOverlays': 511,
                'registrySnapshots': 1, 'files': records}
    manifest_path = SNAPSHOT / 'manifest.json'
    raw = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    if manifest_path.exists():
        if manifest_path.read_text(encoding='utf-8') != raw:
            raise ValueError('Existing snapshot manifest differs; refusing overwrite')
    else:
        manifest_path.write_text(raw, encoding='utf-8')
    report = {'status': 'passed', 'runtimeFilesModified': 0,
              'originalRasterOverlays': 511, 'preInstallVectorOverlays': 511,
              'registrySnapshots': 1, 'verifiedBackupFiles': len(records),
              'newBackupFiles': created, 'allCopiesSha256Equal': True,
              'manifest': relative(manifest_path),
              'officialRasterDirectory': relative(ORIGINALS),
              'snapshotDirectory': relative(SNAPSHOT),
              'backupBytes': sum(record['bytes'] for record in records)}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--relocate-originals', action='store_true',
                        help='Migrate only this task\'s verified original PNGs into inactive _backups storage')
    args = parser.parse_args()
    relocate_originals() if args.relocate_originals else main()
