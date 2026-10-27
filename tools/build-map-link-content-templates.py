"""Prepare private recognition templates; these rasters are never SVG output."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import xml.etree.ElementTree as ET

from map_link_content import native, OUT, TEMPLATE_DIR, GLYPHS, NS, _native_faction, _library_glyph


def main():
    TEMPLATE_DIR.mkdir(parents=True,exist_ok=True)
    records=[]
    for ident in native.FACTIONS:
        body=_native_faction(ident,(4,4,92,92),'#ffffff','#000000')
        result=f'<svg xmlns="{NS}" width="96" height="96" viewBox="0 0 96 96">{body}</svg>'
        target=TEMPLATE_DIR/f'{ident}.svg';target.write_text(result,encoding='utf-8')
        records.append({'id':ident,'kind':'faction','svg':target.name,'png':target.with_suffix('.png').name,'sourceSvgSha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    for digit in '0123456789':
        body=native.numeral(digit,(7,7,89,89),'#ffffff')
        result=f'<svg xmlns="{NS}" width="96" height="96" viewBox="0 0 96 96">{body}</svg>'
        target=TEMPLATE_DIR/f'digit-{digit}.svg';target.write_text(result,encoding='utf-8')
        records.append({'id':'digit-'+digit,'kind':'digit','svg':target.name,'png':target.with_suffix('.png').name,'sourceSvgSha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    for ident in ('alpha','beta','helmet_icon','hourglass_icon','staff_icon','wheel_icon','smoking_bowl_icon','time_portal','time_portal_angular','time_wound','restricted','sea_route'):
        body=_library_glyph(ident,(4,4,92,92),'#ffffff','#000000')
        result=f'<svg xmlns="{NS}" width="96" height="96" viewBox="0 0 96 96">{body}</svg>'
        target=TEMPLATE_DIR/f'{ident}.svg';target.write_text(result,encoding='utf-8')
        records.append({'id':ident,'kind':'glyph','svg':target.name,'png':target.with_suffix('.png').name,'sourceSvgSha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    node=shutil.which('node')
    if node is None:raise RuntimeError('Node.js is required to render the private recognition templates.')
    script=r'''const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
(async()=>{const dir=process.argv[1];for(const file of fs.readdirSync(dir).filter(file=>file.endsWith('.svg'))){await sharp(path.join(dir,file)).png().toFile(path.join(dir,file.replace(/\.svg$/,'.png')))}})().catch(error=>{console.error(error);process.exitCode=1});'''
    subprocess.run([node,'-e',script,str(TEMPLATE_DIR)],check=True)
    for row in records:
        path=TEMPLATE_DIR/row['png']
        row['pngSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
        row['pngBytes']=path.stat().st_size
    (TEMPLATE_DIR/'manifest.json').write_text(json.dumps({'purpose':'Private recognition templates only; no PNG is inserted into any runtime SVG. Companion SVGs are rendered with librsvg/sharp by this generator.','templates':records},indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'templates':len(records),'location':str(TEMPLATE_DIR),'installed':False}))


if __name__=='__main__':main()
