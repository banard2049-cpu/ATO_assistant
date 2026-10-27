"""Clean, reusable route-category redraw trials, built from authored curves.

No contour extractor is used. Existing scans are shown only in comparison art.
"""
from __future__ import annotations
from pathlib import Path
from copy import deepcopy
import hashlib,json,math
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'tools/map-marker-vector-source/redraw'
OUT=ROOT/'output/map-marker-vector-review-20261026'
NS='http://www.w3.org/2000/svg'

def transform(angle):
    a=math.radians(angle);c,s=math.cos(a),math.sin(a)
    return f'matrix({c:.12f} {s:.12f} {-s:.12f} {c:.12f} {50-50*c+50*s:.12f} {50-50*s-50*c:.12f})'

def repeated(path,angles):
    return ''.join(f'<path d="{path}" fill="#000000" transform="{transform(angle)}"/>'for angle in angles)

def spiral_ribbon(angle):
    """A designed Archimedean ribbon, represented by exact-endpoint cubics.

    Cubic control points follow analytic tangents at each 67.5-degree interval;
    there is no image-derived point sampling or contour fitting.
    """
    sweep=math.radians(270);a0=math.radians(angle)
    def point(s,side):
        a=a0+sweep*s;r=47-22*s+side*1.7
        return (50+r*math.cos(a),50+r*math.sin(a))
    def derivative(s,side):
        a=a0+sweep*s;r=47-22*s+side*1.7
        return (-22*math.cos(a)-r*math.sin(a)*sweep,-22*math.sin(a)+r*math.cos(a)*sweep)
    def fmt(p):return f'{p[0]:.6f} {p[1]:.6f}'
    start=point(0,1);d='M'+fmt(start)
    for side,steps in((1,[0,.25,.5,.75,1]),(-1,[1,.75,.5,.25,0])):
        if side==-1:d+='L'+fmt(point(1,-1))
        for s0,s1 in zip(steps,steps[1:]):
            delta=(s1-s0)/3;p0,p1=point(s0,side),point(s1,side);v0,v1=derivative(s0,side),derivative(s1,side)
            c0=(p0[0]+v0[0]*delta,p0[1]+v0[1]*delta);c1=(p1[0]-v1[0]*delta,p1[1]-v1[1]*delta)
            d+='C'+fmt(c0)+' '+fmt(c1)+' '+fmt(p1)
    return f'<path d="{d}Z" fill="#000000"/>'


def path(d,extra=''):
    return f'<path d="{d}" fill="#000000" {extra}/>'


def ring(cx,cy,rx,ry,width):
    return path(f'M{cx-rx:g} {cy:g}A{rx:g} {ry:g} 0 1 0 {cx+rx:g} {cy:g}A{rx:g} {ry:g} 0 1 0 {cx-rx:g} {cy:g}Z'
                f'M{cx-rx+width:g} {cy:g}A{rx-width:g} {ry-width:g} 0 1 1 {cx+rx-width:g} {cy:g}A{rx-width:g} {ry-width:g} 0 1 1 {cx-rx+width:g} {cy:g}Z',
                'fill-rule="evenodd"')


def polygons(points):
    return path('M'+'L'.join(f'{x:g} {y:g}'for x,y in points)+'Z')


def remaining_trials():
    # The bull head is already present as original faction drawing paths. Only
    # its missing pedestal/torso is newly authored for this map-only emblem.
    source=ROOT/'tools/map-back-vector-source/minoans.svg'
    root=ET.parse(source).getroot()
    root.set('x','12');root.set('y','2');root.set('width','76');root.set('height','65')
    for el in root.iter():
        if el.get('fill')not in(None,'none'):el.set('fill','#000000')
    head=ET.tostring(root,encoding='unicode')
    hourglass=path('M36 54L40 67C42 74 58 74 60 67L64 54L68 84L75 91L75 97L25 97L25 91L32 84Z')+head
    staff=path('M41 20L55 5L57 16L50 25ZM62 5L69 5L79 21L68 18ZM63 17A8 8 0 1 0 63 33A8 8 0 1 0 63 17Z'
               'M79 28L87 36L79 44L72 39L67 33L73 27Z', 'fill-rule="evenodd"')
    for i in range(5):
        x=37-i*7.8;y=39+i*10.1
        staff+=polygons([(x+12,y),(x+30,y),(x+22,y+7.1),(x+4,y+7.1)])
    fortress=path('M50 2L54 11L54 22L60 29L60 42L66 42L66 61L71 66L71 76L78 83L91 86L88 93L12 93L9 86L22 83L29 76L29 66L34 61L34 42L40 42L40 29L46 22L46 11Z'
                  'M47 58L53 58L53 88L47 88Z M37 51L40 51L40 86L37 86Z M60 51L63 51L63 86L60 86Z', 'fill-rule="evenodd"')
    lighthouse=ring(50,30,27,27,1.8)
    lighthouse+=path('M48 4L52 4L54 14L57 16L58 31L62 35L63 53L67 58L72 96L56 96L55 83L45 83L44 96L28 96L33 58L37 53L38 35L42 31L43 16L46 14Z'
                     'M47 20L53 20L53 28L47 28Z M45 37L55 37L56 44L44 44Z M42 54L58 54L59 60L41 60Z M38 69L44 69L43 76L37 76Z M56 69L62 69L63 76L57 76Z', 'fill-rule="evenodd"')
    # A single wheel/axle serves the two printed silhouettes; the wing is a
    # separate authored curved element only in the winged form.
    wheel=ring(34,70,23,23,5)+ring(34,70,6.2,6.2,6.2)
    for angle in range(0,360,45):
        a=math.radians(angle);dx,dy=math.cos(a),math.sin(a);nx,ny=-dy*1.7,dx*1.7
        wheel+=polygons([(34+dx*5+nx,70+dy*5+ny),(34+dx*20+nx,70+dy*20+ny),(34+dx*20-nx,70+dy*20-ny),(34+dx*5-nx,70+dy*5-ny)])
    wagon=path('M19 45L17 30L77 11L70 27L65 64L91 59L93 65L63 73L56 61C51 46 36 39 23 46Z')
    wheel_plain=wheel+wagon
    wing=path('M18 39C21 26 33 19 48 19C65 18 75 11 83 4C80 19 67 29 49 31C38 31 27 34 18 39Z'
              'M22 35C32 27 47 29 60 24C47 35 33 34 22 35Z','fill-rule="evenodd"')
    wheel_winged=wheel+wing+path('M45 45L65 50L74 61L90 59L92 65L70 69L60 57L48 54Z')
    oasis=path('M10 78C24 81 37 79 49 77C65 76 80 78 91 77C84 92 67 97 50 97C32 97 17 91 10 78Z')
    oasis+=path('M52 80C59 62 61 42 58 20L62 18C67 42 63 67 58 81Z M26 80C26 63 21 46 15 37L18 35C27 47 31 64 31 80Z M71 80C79 67 81 54 81 43L84 43C85 57 81 70 76 82Z')
    # Palm fronds: one small reusable, mirrored set about the canopy center.
    for cx,cy,s in((60,20,1),(17,36,.58),(83,43,.58)):
        leaf=path('M0 0C-11 -8 -24 -3 -30 7C-18 2 -8 2 0 0Z M0 0C-12 -1 -24 9 -27 18C-16 11 -8 5 0 0Z'
                  'M0 0C9 -8 22 -6 30 -3C17 -2 9 0 0 0Z M0 0C13 0 22 8 24 16C14 8 7 4 0 0Z')
        oasis+=f'<g transform="matrix({s:g} 0 0 {s:g} {cx:g} {cy:g})">{leaf}</g>'
    oasis+=path('M31 76L31 65L27 64L27 59L32 58L34 62C37 59 39 58 42 60L45 57L49 59L51 65L55 66L55 77L52 77L51 70L47 70L46 77L43 77L42 70L36 70L35 77Z')
    smoke=ring(50,81,40,12,3.2)+path('M10 82C17 99 36 100 48 99L47 94C31 94 18 91 10 82Z M90 82C83 99 64 100 52 99L53 94C69 94 82 91 90 82Z')
    smoke+=path('M36 43C39 50 36 57 40 64L45 69L44 83L56 83L55 69L60 64C64 57 61 50 64 43Z'
                'M42 51C44 48 47 48 50 51C53 54 56 54 59 51L58 55C55 59 52 57 49 54C46 51 44 54 42 55Z','fill-rule="evenodd"')
    for x in(23,32,65,74):smoke+=path(f'M{x} 77L{x+3} 77L{x+3} 87L{x} 87Z')
    smoke+=path('M20 43C6 42 4 27 15 23C8 9 22 2 31 13C35 5 43 6 49 11C56 15 63 13 69 8C82 0 94 13 85 24C96 30 93 44 82 45C75 46 71 42 65 42L37 42C30 46 25 44 20 43Z'
                'M17 25C12 31 19 36 23 31C25 28 21 26 19 29C18 25 24 22 28 27C32 34 24 40 18 36C11 32 11 28 17 25Z'
                'M65 18C60 23 66 31 72 27C78 23 74 17 69 19C74 13 82 19 78 27C74 36 63 33 61 26C59 20 61 18 65 18Z', 'fill-rule="evenodd"')
    silver=path('M47 10L72 10L77 15L77 41L86 41L86 57L91 57L91 85L80 85L80 78L84 78L84 62L79 62L79 48L70 48L70 19L47 19Z')
    silver+=path('M19 10C29 18 30 29 22 37L29 41L38 33L42 36L35 48L48 44L52 51L40 57L33 69L24 67L24 80L16 91L17 69L12 67L19 51L13 45L19 39C28 31 23 20 15 15Z')
    silver+=path('M49 29C45 36 45 43 48 49L58 49C61 43 59 34 55 29Z M43 53L55 53L55 65L66 69L71 82L64 86L60 78L48 75L38 81L27 80L22 85L18 81L26 74L38 73L45 67Z')
    silver+=path('M40 18L62 18L65 22L66 39L63 39L62 24L58 22L40 22Z M31 57L27 62L29 66L33 61Z M59 57L65 57L65 62L59 62Z')
    return [('hourglass_icon','牛头沙漏形',hourglass,'reuse original minoans faction head, authored pedestal and torso'),
            ('staff_icon','条纹杖形',staff,'authored polygons, one repeated stripe and a circular head'),
            ('spartan_stronghold','斯巴达要塞',fortress,'authored symmetric stepped tower silhouette and window counters'),
            ('daedalus_lighthouse','代达罗斯灯塔',lighthouse,'authored narrow tapered tower, repeated window bands and circular halo'),
            ('wheel_icon','无翼车轮',wheel_plain,'one authored wheel, eight shared spokes and straight wagon silhouette'),
            ('wheel_icon_winged','有翼车轮',wheel_winged,'reuse same wheel and spokes; separate authored curved wing'),
            ('oasis','绿洲',oasis,'three reused palm-canopy subcomponents, curved trunks, small quadruped and water bowl'),
            ('smoking_bowl_icon','烟雾碗',smoke,'authored oval bowl, repeated slots, pedestal and Bezier cloud curls'),
            ('silver_ruin','白银种遗迹',silver,'authored gate, branch form, central figure and repeated architectural ledges')]

def main():
    DEST.mkdir(parents=True,exist_ok=True);OUT.mkdir(exist_ok=True)
    wound=''
    for r in(47,33,19):
        ri=r-3.6
        wound+=(f'<path fill="#000000" fill-rule="evenodd" d="M50 {50-r:g}L{50+r:g} 50L50 {50+r:g}L{50-r:g} 50Z'
                f'M50 {50-ri:g}L{50+ri:g} 50L50 {50+ri:g}L{50-ri:g} 50Z"/>')
    # Three swept ribbons share one authored cubic contour. Their widths taper
    # towards the inner opening; the three copies differ only by a 120° matrix.
    portal=''.join(spiral_ribbon(a)for a in(0,120,240))
    # The angular printed variant has three separate hooked arms around an open
    # triangular centre, with broad folded tips and straight outer notches.
    angular=repeated('M18 21L19 32L25 28L26 20L29 28C44 14 61 12 77 18C61 17 48 23 39 32L32 39L26 37L26 44L20 43L20 49C15 40 15 30 18 21Z',(0,120,240))
    angular+=repeated('M30 48C32 39 40 30 48 29L46 34L51 37L46 42L43 38C38 40 34 45 32 50L36 52L31 54L27 49Z',(0,120,240))
    values=[('time_wound','同心菱形',wound,'three equal-width concentric diamond ribbons; exact geometric symmetry'),
            ('time_portal','圆旋涡',portal,'three identical authored Archimedean spiral ribbons; cubic analytic tangents, 120-degree rotational symmetry'),
            ('time_portal_angular','角旋涡',angular,'one authored hooked arm repeated at 0/120/240 degrees')]+remaining_trials()
    rows=[]
    for ident,label,body,method in values:
        raw=(f'<svg xmlns="{NS}" width="100" height="100" viewBox="0 0 100 100" data-template="{ident}" data-method="authored-clean-geometry-trial">'
             f'<title>{label} · 共用重绘组件试稿</title>{body}</svg>\n').encode()
        path=DEST/f'{ident}.svg';path.write_bytes(raw)
        rows.append({'id':ident,'label':label,'file':path.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(raw).hexdigest(),'method':method,
                     'sourceRole':'Original printed scan used only for visual comparison; no extracted contours.','status':'trial-needs-visual-approval',
                     'pathCount':body.count('<path'),'runtimeModified':False})
    (DEST/'manifest.json').write_text(json.dumps({'version':'20261026-clean-category-trials1','templates':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'templates':len(rows),'runtimeModified':False}))

if __name__=='__main__':main()
