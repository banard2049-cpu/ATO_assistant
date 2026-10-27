"""Three fixed analytic land-layer candidates; never modify runtime SVGs."""
from pathlib import Path
from copy import deepcopy
import json,hashlib
import xml.etree.ElementTree as ET
from map_link_templates import placed_glyph
from verify_map_land_trial_bounds import bounds

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/land-layer-trials'
NS='http://www.w3.org/2000/svg'
CASES={'A':(1.0,1.5,1.5),'B':(1.5,1.5,1.5),'C':(2.0,1.0,1.5)}
def load(p):return json.loads(p.read_text(encoding='utf8'))
def component(name):
    gap_height,foot_height,bottom_foot_height=CASES[name]
    grey='#b3a59f';parts=['<path data-land-axis="true" fill="#000000" d="M20 0H25V46H20Z"/>']
    for ident,l,r,top,seam,inset in(('top',6,39.5,3,9,1),('middle',3,43,16,23,1),('bottom',0,45,30,38,1.5)):
        foot=seam+gap_height;bottom=foot+(bottom_foot_height if ident=='bottom'else foot_height)
        parts.append(f'<path data-land-band="{ident}" data-land-layer="face" fill="#000000" d="M{l+.5:g} {top:g}H{r-.5:g}L{r:g} {seam:g}H{l:g}Z"/>')
        parts.append(f'<path data-land-band="{ident}" data-land-layer="recess" data-ink-role="recess" fill="{grey}" d="M{l:g} {seam:g}H{r:g}V{foot:g}H{l:g}Z"/>')
        parts.append(f'<path data-land-band="{ident}" data-land-layer="ledge" fill="#000000" d="M{l+inset:g} {foot:g}H{r-inset:g}L{r-inset-.5:g} {bottom:g}H{l+inset+.5:g}Z"/>')
    return f'<svg xmlns="{NS}" viewBox="0 0 45 46"><g data-land-bands="3" data-land-layers="face-recess-foot" data-trial="{name}" data-recess-height="{gap_height:g}" data-foot-height="{foot_height:g}">'+''.join(parts)+'</g></svg>'
def main():
    OUT.mkdir(exist_ok=True);rows=load(ROOT/'output/c2-special-route-audit/land-route-scalar-anatomy.json')['records']
    keys=['c2-tile-007-front','c2-tile-021-front','c2-tile-055-front'];rows=[next(r for r in rows if r['key']==key)for key in keys]
    for name in CASES:
        (OUT/f'land-{name}.svg').write_text(component(name),encoding='utf8')
        for row in rows:
            root=ET.parse(ROOT/'map/images/hd1024/overlay'/f'{row["key"]}-corners.svg').getroot();root.set('data-preview-only','true')
            for parent in root.iter():
                for i,child in enumerate(list(parent)):
                    if child.get('data-glyph')!='land_route':continue
                    l,t,r,b=bounds(child);cx,cy=(l+r)/2,(t+b)/2
                    graphic=placed_glyph(OUT/f'land-{name}.svg',(cx-23,cy-23,cx+23,cy+23),'#e6e6e6','#653b34','data-glyph="land_route"')
                    parent.remove(child);parent.insert(i,ET.fromstring(graphic))
            ET.ElementTree(root).write(OUT/f'{row["key"]}-{name}.svg',encoding='unicode')
    report={'status':'trial-only-not-installed','body':'#e6e6e6','recess':'#b3a59f','candidates':CASES,'rows':rows}
    (OUT/'inputs.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'status':report['status'],'candidates':list(CASES),'faces':len(rows)}))
if __name__=='__main__':main()
