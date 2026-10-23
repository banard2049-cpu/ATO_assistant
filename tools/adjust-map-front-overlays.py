"""Tone the registered C1-C3 workshop overlays from immutable extracted pixels.

Contrast is applied about RGB 128, followed by brightness. Alpha and transparent
pixel bytes are preserved; repeated invocations do not accumulate adjustments.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
HD = ROOT/'map/images/hd1024'
OUTPUT = ROOT/'output/reports/map-workshop-fronts-20261023'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def adjust(image, brightness=.90, contrast=1.10):
    if image.mode != 'RGBA' or not 0 < brightness <= 2 or not 0 < contrast <= 2:
        raise ValueError('Expected RGBA image and brightness/contrast in (0, 2]')
    pixels = np.array(image)
    lookup = np.clip(np.floor(np.clip((np.arange(256)-128)*contrast+128,0,255)*brightness+.5),0,255).astype(np.uint8)
    visible = pixels[:,:,3]>0
    pixels[visible,:3] = lookup[pixels[visible,:3]]
    return Image.fromarray(pixels)


def run(output=OUTPUT, brightness=.90, contrast=1.10, apply=False):
    report_path = output/'tone-adjustment.json'
    previous = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {}
    installed = json.loads((output/'installation.json').read_text(encoding='utf-8'))
    assert installed['installedFaces']==270
    label = f'b{round(brightness*100)}-c{round(contrast*100)}'
    version = '20261023-workshop-fronts1-'+label
    stage = output/('tone-'+label)
    stage.mkdir(exist_ok=True)
    prior_hashes = {row['key']:row['afterSha256'] for row in previous.get('files',[])}
    before_hashes = {p.relative_to(HD).as_posix():sha(p) for p in HD.rglob('*.png')}
    rows=[]
    for row in installed['files']:
        key=row['key'];name=key+'.png'
        original=output/'completed'/name
        target=HD/'overlay'/name
        assert sha(original)==row['afterSha256'],key
        assert sha(target) in (row['afterSha256'],prior_hashes.get(key)),f'Installed mask changed: {key}'
        source=Image.open(original).convert('RGBA')
        image=adjust(source,brightness,contrast)
        before,after=np.asarray(source),np.asarray(image)
        assert np.array_equal(before[:,:,3],after[:,:,3]),key
        assert np.array_equal(before[before[:,:,3]==0],after[before[:,:,3]==0]),key
        image.save(stage/name,compress_level=9)
        rows.append(dict(key=key,sourceSha256=row['afterSha256'],beforeSha256=sha(target),afterSha256=sha(stage/name)))
    backup=None
    if apply:
        backup=ROOT/'output/backups'/('map-fronts-before-tone-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
        backup.mkdir(parents=True,exist_ok=False)
        registry_path=ROOT/'map/tile-artwork-data.js'
        shutil.copy2(registry_path,backup/registry_path.name)
        for row in rows:
            name=row['key']+'.png';target=HD/'overlay'/name
            assert sha(target)==row['beforeSha256'],name
            shutil.copy2(target,backup/name)
            assert sha(backup/name)==row['beforeSha256'],name
        for row in rows:
            name=row['key']+'.png';target=HD/'overlay'/name
            pending=target.with_suffix('.png.pending')
            shutil.copyfile(stage/name,pending)
            assert sha(pending)==row['afterSha256']
            os.replace(pending,target)
        prefix='window.ATO_MAP_ARTWORK_DATA = '
        registry=json.loads(registry_path.read_text(encoding='utf-8').removeprefix(prefix).strip().removesuffix(';'))
        registry['overlayVersions']=dict(registry.get('overlayVersions',{}),**{c:version for c in ['c1','c2','c3']})
        registry_path.write_text(prefix+json.dumps(registry,ensure_ascii=False,indent=2)+';\n',encoding='utf-8',newline='\n')
    changed={'overlay/'+r['key']+'.png' for r in rows} if apply else set()
    assert all(sha(HD/p)==h for p,h in before_hashes.items() if p not in changed)
    report=dict(applied=apply,brightness=brightness,contrast=contrast,contrastPivot=128,
                operationOrder=['contrast','brightness'],version=version,stage=str(stage),
                alphaPixelExact=True,transparentPixelsUnchanged=True,filesChanged=len(rows) if apply else 0,
                backup=str(backup) if backup else None,otherPngsUnchanged=len(before_hashes)-len(changed),files=rows)
    destination=report_path if apply else output/'tone-preview.json'
    destination.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--brightness',type=float,default=.90)
    parser.add_argument('--contrast',type=float,default=1.10)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    run(brightness=args.brightness,contrast=args.contrast,apply=args.apply)
