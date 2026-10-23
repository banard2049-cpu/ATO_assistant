"""Compact the local private mapping in place, keeping an audit backup outside runtime resources."""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "asset-studio"))
from app.mixed_media_resources import MAPPING_TARGET, add_to_archive, compact_mapping


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / MAPPING_TARGET)
    parser.add_argument("--output", type=Path, help="Write a separate runtime copy; otherwise replace input after backing up")
    parser.add_argument("--pack-output", type=Path, help="Also create a mapping-only incremental .atopack for an existing resource installation")
    options = parser.parse_args()
    source = options.input.resolve()
    raw = source.read_bytes()
    compact = compact_mapping(raw)
    output = options.output.resolve() if options.output else source
    if output == source and compact != raw:
        backup = ROOT / "tmp" / ("mixed-media-mapping-audit-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f") + ".js")
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(raw)
        print(f"Audit backup: {backup}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(compact)
    print(f"Runtime mapping: {len(raw):,} -> {len(compact):,} bytes ({(1 - len(compact) / len(raw)) * 100:.1f}% smaller)")
    print(output)
    if options.pack_output:
        pack = options.pack_output.resolve()
        pack.parent.mkdir(parents=True, exist_ok=True)
        manifest = {"format": "ato-asset-pack", "version": 3, "items": [], "assets": []}
        with zipfile.ZipFile(pack, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            add_to_archive(archive, manifest, None, fallback_files=lambda _seen: [(MAPPING_TARGET, output)])
            import json
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
        print(f"Mapping update package: {pack} ({pack.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
