"""Snapshot the installed link/corner set before remaining-marker replacement."""
from pathlib import Path
import argparse,hashlib,json,re,shutil

ROOT=Path(__file__).resolve().parents[1]
BACKUP=ROOT/'official-assets/_backups/map-markers-20261026'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--name',default=BACKUP.name)
    name=parser.parse_args().name;assert re.fullmatch(r'map-markers-[a-z0-9-]+',name),name
    destination=BACKUP.parent/name
    assert destination.resolve().parent==BACKUP.parent.resolve()
    manifest=destination/'manifest.json'
    if manifest.exists():
        report=json.loads(manifest.read_text(encoding='utf8'))
        for row in report['files']:assert sha(ROOT/row['backup'])==row['sha256'],row['backup']
        print(json.dumps({'status':'existing-backup-verified','files':len(report['files'])}));return
    inventory=json.loads((ROOT/'tools/map-marker-vector-source/inventory.json').read_text(encoding='utf8'))
    sources=[ROOT/'map/images/hd1024/overlay'/f'{r["key"]}-corners.svg'for r in inventory['faces']]
    sources.append(ROOT/'map/tile-artwork-data.js');assert len(sources)==512
    files=[]
    for source in sources:
        relative=source.relative_to(ROOT);target=destination/relative
        assert target.resolve().is_relative_to(destination.resolve())
        assert source.is_file(),source
        target.parent.mkdir(parents=True,exist_ok=True)
        assert not target.exists(),target
        shutil.copyfile(source,target);assert sha(target)==sha(source),target
        files.append({'source':relative.as_posix(),'backup':target.relative_to(ROOT).as_posix(),'sha256':sha(target),'bytes':target.stat().st_size})
    report={'version':'20261026-before-marker-composition','faces':511,
            'purpose':'User-requested official-assets backup before replacing the complete remaining marker set.',
            'originalRasters':'official-assets/_backups/map-links-20261025/manifest.json','files':files}
    manifest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (destination/'README.md').write_text('本目录保存本次标记修订前的 511 张完整 SVG 和素材注册表。原始 PNG 保存在相邻 map-links-20261025/originals 目录；所有备份均由 manifest.json 校验。\n',encoding='utf8')
    print(json.dumps({'status':'backed-up','files':len(files),'bytes':sum(r['bytes']for r in files)}))

if __name__=='__main__':main()
