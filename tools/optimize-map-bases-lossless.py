"""Losslessly optimize installed map bases; verify decoded RGBA before replace."""
from __future__ import annotations
import concurrent.futures,hashlib,json,os,shutil,struct,subprocess,time
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ARCHIVE=ROOT/'export/map-assets-archive-20261017'
OUT=ROOT/'export/map-lossless-compression-20261017'

def sha(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def rgba_hash(image):return hashlib.sha256(image.convert('RGBA').tobytes()).hexdigest()

def chunks(path):
    raw=path.read_bytes();offset=8;result=[]
    assert raw[:8]==b'\x89PNG\r\n\x1a\n'
    while offset<len(raw):
        size=struct.unpack('>I',raw[offset:offset+4])[0];kind=raw[offset+4:offset+8].decode('ascii')
        result.append(kind);offset+=12+size
    return result

def main(workers=8):
    OUT.mkdir(exist_ok=True);staging=OUT/'staging';staging.mkdir(exist_ok=True)
    report_path=OUT/'compression-report.json'
    assert not report_path.exists(),'Already optimized; retain the original audit report'
    executable=shutil.which('zopflipng');assert executable,'zopflipng is required'
    source_export=ARCHIVE/'output/maps-restored-20261017-hd1024'
    doc=json.loads((source_export/'restoration-manifest.json').read_text(encoding='utf-8'))
    reference={Path(row['sourcePath']).stem:source_export/row['base'] for row in doc['tiles']}
    files=sorted((ROOT/'map/images/hd1024/base').glob('*.png'))+sorted((ROOT/'map/images/card-backs').glob('*-base.png'))
    assert len(files)==514
    records=[];started=time.monotonic()

    def optimize(path):
        original_sha=sha(path);original_bytes=path.stat().st_size
        backup=reference.get(path.stem)
        if backup is None or sha(backup)!=original_sha:
            backup=OUT/'originals'/path.relative_to(ROOT);backup.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(path,backup);assert sha(backup)==original_sha
        metadata=[name for name in chunks(path) if name not in ['IHDR','IDAT','IEND','PLTE','tRNS']]
        with Image.open(path) as image:
            assert image.size==(1024,1024)
            original_pixels=rgba_hash(image)
            opaque=image.mode=='RGBA' and image.getextrema()[3]==(255,255)
            pillow=staging/(path.stem+'-pillow.png');candidate=staging/(path.stem+'-optimized.png')
            if not metadata:
                image.convert('RGB' if opaque else image.mode).save(pillow,optimize=True,compress_level=9)
                input_file=pillow
            else:input_file=path
            command=[executable,'-y','-q']
            if metadata:command.append('--keepchunks='+','.join(sorted(set(metadata))))
            command.extend([str(input_file),str(candidate)])
            result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            assert result.returncode==0,(str(path),result.stderr.decode(errors='replace'))
            candidates=[path,candidate]+([pillow] if pillow.exists() else [])
            selected=min(candidates,key=lambda p:p.stat().st_size)
            with Image.open(selected) as check:
                assert check.size==image.size and rgba_hash(check)==original_pixels,('Pixels changed',path)
            assert set(metadata).issubset(chunks(selected)),('PNG metadata missing',path)
        assert sha(path)==original_sha,('Source changed during optimization',path)
        saved=selected.stat().st_size
        if selected!=path:
            # Atomic same-volume replacement leaves no partially written PNG.
            os.replace(selected,path)
        with Image.open(path) as check:
            assert rgba_hash(check)==original_pixels
            alpha_removed=opaque and check.mode=='RGB'
        for temp in [pillow,candidate]:
            if temp.exists():temp.unlink()
        return {'file':path.relative_to(ROOT).as_posix(),'beforeBytes':original_bytes,'afterBytes':saved,
                'savedBytes':original_bytes-saved,'beforeSha256':original_sha,'afterSha256':sha(path),
                'decodedRgbaSha256':original_pixels,'rgbaPixelsIdentical':True,'width':1024,'height':1024,
                'opaqueAlphaRemoved':alpha_removed,'metadataPreserved':metadata,
                'originalBackup':backup.relative_to(ROOT).as_posix()}

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures=[pool.submit(optimize,path) for path in files]
        for future in concurrent.futures.as_completed(futures):
            records.append(future.result())
            if len(records)%25==0 or len(records)==len(files):
                print(json.dumps({'completed':len(records),'total':len(files),'savedMiB':round(sum(r['savedBytes'] for r in records)/1048576,2),
                                  'elapsedSeconds':round(time.monotonic()-started)},ensure_ascii=False),flush=True)
    records.sort(key=lambda r:r['file'])
    before=sum(r['beforeBytes'] for r in records);after=sum(r['afterBytes'] for r in records)
    report={'images':len(records),'beforeBytes':before,'afterBytes':after,'savedBytes':before-after,
            'savedPercent':round((before-after)/before*100,2),'allDecodedRgbaPixelsIdentical':True,
            'resolutionUnchanged':'1024x1024','maskFilesNotModified':True,'files':records}
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    staging.rmdir()
    print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
