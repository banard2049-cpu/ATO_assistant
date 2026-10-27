"""Detect real route-compartment frame lines from original map overlays.

Only source pixel geometry is examined. Repeated badge widths are a search
prior; every accepted internal split is refined by the vertical rim profile.
The native 37 reviewed labels supply content hints, never missing artwork.
"""
from __future__ import annotations

from pathlib import Path
import json
import numpy as np
from scipy.ndimage import gaussian_filter1d, label, find_objects
from scipy.signal import find_peaks

ROOT=Path(__file__).resolve().parents[1]
REVIEW=ROOT/'output/map-link-vector-review-20261025'
OUT=ROOT/'output/map-link-vector-install-20261025'


def box(points):
    return [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]


def _runs(values):
    values=[int(value) for value in values]
    if not values:return []
    result=[];run=[values[0]]
    for value in values[1:]:
        if value==run[-1]+1:run.append(value)
        else:result.append(run);run=[value]
    result.append(run)
    return result


def _disc(mask,side,min_score=.86):
    h,w=mask.shape
    if w<90:return None
    if h>90:
        # Two source components contain a faint alpha bridge from an arrow
        # above the badge. Fit the circular lobe within the lower body rather
        # than treating that arrow as part of a very tall circle.
        best=None
        for size in range(62,min(82,h,w)+1):
            x0=0 if side=='left' else w-size
            yy,xx=np.indices((size,size))
            circle=(xx-(size-1)/2)**2+(yy-(size-1)/2)**2 < (size/2-1.5)**2
            for y0 in range(max(0,h-size-5),h-size+1):
                part=mask[y0:y0+size,x0:x0+size]
                score=float((part&circle).sum()/max(1,(part|circle).sum()))
                if best is None or score>best['alphaCircleIoU']:
                    best={'side':side,'bbox':[x0,y0,x0+size,y0+size],'alphaCircleIoU':score}
        return best if best and best['alphaCircleIoU']>.89 else None
    size=min(h,w)
    part=mask[:,:size] if side=='left' else mask[:,-size:]
    yy,xx=np.indices(part.shape)
    circle=(xx-(size-1)/2)**2+((yy-(h-1)/2)*size/h)**2 < (size/2-1.5)**2
    score=float((part&circle).sum()/max(1,(part|circle).sum()))
    if score<min_score:return None
    if side=='left':return {'side':side,'bbox':[0,0,size,h],'alphaCircleIoU':score}
    return {'side':side,'bbox':[w-size,0,w,h],'alphaCircleIoU':score}


def _profile(rgb,body,cycle):
    t,b=body;h,w=rgb.shape[:2];ys=np.arange(max(t+7,0),min(b-7,h))
    if len(ys)<20:ys=np.arange(max(t+3,0),min(b-3,h))
    lum=rgb@np.array([.299,.587,.114]);mat=[]
    for slope in (-.075,-.04,0,.04,.075):
        xs=np.clip(np.arange(w)[None,:]+np.rint((ys[:,None]-(t+b)/2)*slope).astype(int),0,w-1)
        mat.append(np.percentile(lum[ys[:,None],xs],75 if cycle=='c4' else 25,axis=0))
    field=-np.min(mat,axis=0)if cycle=='c4'else np.max(mat,axis=0)
    score=field-gaussian_filter1d(field,4)
    peaks,_=find_peaks(score,prominence=12,distance=3)
    peaks=[int(p)for p in peaks if score[p]>18]
    candidates=[]
    # A real shared frame is the centre stroke in a three-line sequence. Use
    # sliding triples so an unrelated glyph stroke cannot merge two frames.
    for a,m,z in zip(peaks,peaks[1:],peaks[2:]):
        if 3<=m-a<=8 and 3<=z-m<=8 and abs((m-a)-(z-m))<=3:
            group=[a,m,z]
            candidates.append({'x':float(m),'strength':float(np.mean(score[group])),'peaks':group,'method':'three-rim-lines'})
    for a,z in zip(peaks,peaks[1:]):
        if 3<=z-a<=8 and not any(a in c['peaks'] and z in c['peaks'] for c in candidates):
            candidates.append({'x':float((a+z)/2),'strength':float(np.mean(score[[a,z]]))*.55,'peaks':[a,z],'method':'paired-rim-lines'})
    return score,candidates,peaks


def _body(mask,left,right):
    view=mask[:,left:right];widths=view.sum(1)
    threshold=max(20,float(np.percentile(widths,80))*.8)
    runs=[run for run in _runs(np.flatnonzero(widths>=threshold))if len(run)>=30]
    if not runs:return 0,mask.shape[0]
    best=max(runs,key=len)
    return best[0],best[-1]+1


def detect_panel(rgba,labels,panel,cycle,known=None):
    l,t,r,b=panel['bbox'];crop=rgba[t:b,l:r];mask=labels[t:b,l:r]==panel['componentLabel'];h,w=mask.shape
    circles=[];left=0;right=w
    for side in ('left','right'):
        # Two upper C2 plates have a faint scan bridge into the lock rim.
        # Its right circular lobe scores .836/.845 against a clean disc;
        # the directional chevrons use the stricter threshold elsewhere.
        disc=_disc(mask,side,.82 if cycle=='c2'and panel['direction']=='up'and side=='right'else .86)
        if disc:
            # A circular limit applies to only this disconnected/attached mark;
            # do not let it inflate the rectangular route grid's cell count.
            circles.append(disc)
            if side=='left':left=disc['bbox'][2]
            else:right=disc['bbox'][0]
    bt,bb=_body(mask,left,right);body_h=bb-bt
    body_w=right-left
    if h>95:
        # Ignore the opaque scan-background bridge in the two arrow-attached
        # components. The real body's first horizontal pale frame is distinct
        # from that bridge and from the separate arrow.
        lum=crop[:,:,:3].astype(float)@np.array([.299,.587,.114])
        field_l=left+8;field_r=min(right-8,left+88)
        levels=np.percentile(lum[:,field_l:field_r],25,axis=1)
        rows=[y for y in range(max(0,bb-82),max(0,bb-52))if levels[y]>190]
        if rows:bt=rows[0];body_h=bb-bt
    ym=int(round((bt+bb-1)/2));yt=min(bb-1,bt+3)
    yb=max(bt,bb-4)
    def edge_at(y):
        xs=np.flatnonzero(mask[y,left:right])
        return (int(xs.min()),int(xs.max())+1)if len(xs) else (0,body_w)
    top_l,top_r=edge_at(yt);mid_l,mid_r=edge_at(ym);bot_l,bot_r=edge_at(yb)
    left_point=min(top_l,bot_l)-mid_l>8
    right_point=mid_r-max(top_r,bot_r)>8
    shape='left-chevron'if left_point else'right-chevron'if right_point else'rect'
    # Source directional badges sometimes have anti-aliased sloping heads whose
    # alpha bbox makes the top row too wide; true points still narrow both ends.
    if panel['direction']=='left'and not right_point and body_w>130 and min(top_l,bot_l)>5:left_point=True;shape='left-chevron'
    if panel['direction']=='right'and not left_point and body_w>130 and body_w-max(top_r,bot_r)>5:right_point=True;shape='right-chevron'
    nominal_number=body_h*(1.58 if left_point or right_point else 1.43)
    nominal_icon=body_h*.93
    if body_w<120 or panel['direction']=='local':
        count=max(1,round(body_w/max(1,nominal_icon)))
        number_index=None
        expected_widths=[body_w/count]*count
    else:
        count=max(1,min(7,round((body_w-nominal_number)/nominal_icon)+1))
        number_index=count-1 if right_point else 0
        expected_widths=[nominal_icon]*count;expected_widths[number_index]=nominal_number
        total=sum(expected_widths);expected_widths=[v*body_w/total for v in expected_widths]
    if known:
        count=len(known['cells'])
        if panel['id']=='left-1'and known['key']=='c2-tile-019-front':
            # This source circle is connected to its panel by a faint edge.
            right=237;body_w=237;circles=[{'side':'right','bbox':[240,0,310,h],'alphaCircleIoU':.9}]
        number_index=next((i for i,c in enumerate(known['cells'])if c['kind']=='number'),None)
        expected_widths=[nominal_icon]*count
        if number_index is not None:expected_widths[number_index]=nominal_number
        total=sum(expected_widths);expected_widths=[v*body_w/total for v in expected_widths]
    score,candidates,peaks=_profile(crop[:,:,:3].astype(float),(bt,bb),cycle)
    expected=np.cumsum(expected_widths)[:-1]+left
    splits=[];review=[];evidence=[]
    if cycle!='c4':
        # Contents sometimes share one wider dark compartment (for example a
        # chain and an eye in C2). Widths alone must never invent a divider.
        # Keep the strongest compatible actual three-line frame sequences.
        valid=[c for c in candidates if c['method']=='three-rim-lines'
               and c['strength']>=25 and left+40<c['x']<right-40]
        selected=[]
        for candidate in sorted(valid,key=lambda c:c['strength'],reverse=True):
            if all(abs(candidate['x']-other['x'])>=40 for other in selected):selected.append(candidate)
        selected.sort(key=lambda c:c['x'])
        splits=[c['x'] for c in selected];evidence=selected
        count=len(splits)+1
        number_index=count-1 if right_point else 0
        if panel['direction']=='local':number_index=None
    else:
        # Black C4 strokes bordering the dark field can merge with that field
        # in the scanned source. The repeated measured cell widths constrain
        # the search; a single dark source stroke refines a missing triple.
        lum=crop[:,:,:3].astype(float)@np.array([.299,.587,.114])
        level=np.percentile(lum[max(0,bt+10):max(bt+11,bb-10)],75,axis=0)
        for guess in expected:
            valid=[c for c in candidates if c['method']=='three-rim-lines' and left+30<c['x']<right-30
                   and abs(c['x']-guess)<=9 and(not splits or c['x']-splits[-1]>=40)]
            if valid:
                chosen=max(valid,key=lambda c:c['strength']-abs(c['x']-guess)*3)
                splits.append(chosen['x']);evidence.append({**chosen,'expectedX':float(guess)})
            else:
                valid_peaks=[x for x in peaks if abs(x-guess)<=8 and left+30<x<right-30]
                local=min(valid_peaks,key=lambda x:level[x]+abs(x-guess)*2) if valid_peaks else int(round(guess))
                splits.append(float(local));evidence.append({'x':float(local),'expectedX':float(guess),
                    'method':'source-dark-stroke','strength':float(score[local])})
                if not valid_peaks:review.append('weak-divider-frame')
    boundaries=[float(left),*splits,float(right)]
    split_lines=[{'xTop':l+x,'xBottom':l+x,'yTop':t+bt,'yBottom':t+bb}for x in splits]
    # The sole double-destination C3 badge has a deliberately diagonal shared
    # rim. Fit a straight source ridge; do not rectangularize that boundary.
    if cycle=='c3'and panel['direction']=='special'and body_w>300:
        lum=crop[:,:,:3].astype(float)@np.array([.299,.587,.114])
        ys=np.arange(bt+10,bb-10);yc=(bt+bb)/2
        for index,x in enumerate(splits):
            if index!=1:continue
            best=None
            for slope in np.arange(-.4,.401,.01):
                for center in np.arange(x-3,x+3.01,.25):
                    xx=np.rint(center+(ys-yc)*slope).astype(int)
                    if xx.min()<3 or xx.max()>=w-3:continue
                    contrast=float(np.mean(lum[ys,xx])-(np.mean(lum[ys,xx-3])+np.mean(lum[ys,xx+3]))/2)
                    if best is None or contrast>best[0]:best=(contrast,center,slope)
            if best:
                strength,center,slope=best
                split_lines[index]={'xTop':float(l+center+(bt-yc)*slope),'xBottom':float(l+center+(bb-yc)*slope),
                    'yTop':t+bt,'yBottom':t+bb,'sourceSlope':float(slope),'fitContrast':strength}
    embedded_arrows=[]
    if h>95 and bt>25:
        rgb=crop[:bt-4,:,:3].astype(float);lum=rgb@np.array([.299,.587,.114])
        rim=(lum>195)&mask[:bt-4]
        yy,xx=np.where(rim)
        point_count=len(xx)
        if cycle=='c5':
            parts,num=label(rim);choices=[]
            for ident,slices in enumerate(find_objects(parts),1):
                if slices is None:continue
                sy,sx=slices;size=int((parts[slices]==ident).sum())
                if 30<=sx.stop-sx.start<=100 and 15<=sy.stop-sy.start<=45 and abs((sx.start+sx.stop)/2-w/2)<20:
                    choices.append((size,sx,sy))
            if choices:
                size,sx,sy=max(choices,key=lambda item:item[0]);point_count=size
                xx=np.array([sx.start-1,sx.stop]);yy=np.array([sy.start-1,sy.stop])
        if cycle=='c2':
            red=(rgb[:,:,0]>140)&(rgb[:,:,0]>rgb[:,:,1]*1.5)&(rgb[:,:,0]>rgb[:,:,2]*1.5)&mask[:bt-4]
            ry,rx=np.where(red)
            if len(rx)>50:
                point_count=len(rx)
                xx=np.array([int(rx.min())-2,int(rx.max())+2]);yy=np.array([int(ry.min())-2,int(ry.max())+2])
        if point_count>25:
            ab=[l+int(xx.min()),t+int(yy.min()),l+int(xx.max())+1,t+int(yy.max())+1]
            if ab[2]-ab[0]>25 and ab[3]-ab[1]>12:
                embedded_arrows.append({'id':panel['id']+'-embedded-arrow','panelId':panel['id'],'direction':'up','bbox':ab,
                    'sourceComponentLabel':panel['componentLabel'],'method':'source-pale-rim-above-body'})
    cells=[]
    for index,(x0,x1)in enumerate(zip(boundaries,boundaries[1:])):
        cell_l=l+x0;cell_r=l+x1;cell_t=t+bt;cell_b=t+bb
        left_top=split_lines[index-1]['xTop']if index else cell_l
        left_bottom=split_lines[index-1]['xBottom']if index else cell_l
        right_top=split_lines[index]['xTop']if index<len(split_lines)else cell_r
        right_bottom=split_lines[index]['xBottom']if index<len(split_lines)else cell_r
        # Roofed faction cells protrude above the body's top baseline.
        col0=max(0,int(x0+8));col1=min(w,int(x1-8));roof_t=bt
        if col1>col0:
            ys=np.flatnonzero(mask[:,col0:col1].sum(1)>=2)
            if len(ys)and bt-int(ys.min())>7:roof_t=int(ys.min())
        if embedded_arrows:
            roof_t=bt
            if cycle=='c5'and index!=number_index:
                mid=int(round((x0+x1)/2));half=8
                roof_lum=crop[:bt,max(0,mid-half):min(w,mid+half),:3].astype(float)@np.array([.299,.587,.114])
                rows=np.flatnonzero((roof_lum>195).sum(1)>=2)
                if len(rows)and bt-int(rows.min())>7:roof_t=int(rows.min())
        cell_shape='rect'
        outer=[(left_top,cell_t),(right_top,cell_t),(right_bottom,cell_b),(left_bottom,cell_b)]
        if index==0 and left_point:
            head=min(22,(cell_b-cell_t)*.3)
            outer=[(cell_l+head,cell_t),(cell_r,cell_t),(cell_r,cell_b),(cell_l+head,cell_b),(cell_l,(cell_t+cell_b)/2)]
            cell_shape='left-chevron'
        elif index==count-1 and right_point:
            head=min(22,(cell_b-cell_t)*.3)
            outer=[(cell_l,cell_t),(cell_r-head,cell_t),(cell_r,(cell_t+cell_b)/2),(cell_r-head,cell_b),(cell_l,cell_b)]
            cell_shape='right-chevron'
        elif roof_t<bt:
            outer=[(cell_l,cell_t),((cell_l+cell_r)/2,t+roof_t),(cell_r,cell_t),(cell_r,cell_b),(cell_l,cell_b)]
            cell_shape='roofed'
        # The source inner rim is about 6px inward; contents exclude another
        # 3px, so frame outlines cannot be mistaken for glyph ink.
        ix0=max(left_top,left_bottom)+(22 if cell_shape=='left-chevron'else 8)
        ix1=min(right_top,right_bottom)-(22 if cell_shape=='right-chevron'else 8)
        iy0=cell_t+8 if cell_shape!='roofed'else t+roof_t+8
        iy1=cell_b-8
        hint='number'if index==number_index or(cycle=='c3'and panel['direction']=='special'and body_w>300 and index==2)else'unknown'
        expected_value=None
        if known and index<len(known['cells']):
            hint=known['cells'][index]['kind'];expected_value=known['cells'][index]['value']
        cells.append({'index':index,'bbox':[min(left_top,left_bottom),t+roof_t,max(right_top,right_bottom),cell_b],
                      'outer':[list(point)for point in outer],
                      'inner':[[cell_l+6,cell_t+6],[cell_r-6,cell_t+6],[cell_r-6,cell_b-6],[cell_l+6,cell_b-6]],
                      'inkBBox':[ix0,iy0,ix1,iy1],'shape':cell_shape,'kindHint':hint,'expected':expected_value})
    for disc in circles:
        dl,dt,dr,db=disc['bbox'];bbox=[l+dl,t+dt,l+dr,t+db]
        cells.append({'index':len(cells),'bbox':bbox,'outer':[],'inner':[],
                      'inkBBox':[bbox[0]+12,bbox[1]+12,bbox[2]-12,bbox[3]-12],
                      'shape':'circle','kindHint':'restricted','expected':None,'detectedCircleIoU':disc['alphaCircleIoU']})
    all_points=[point for cell in cells if cell['shape']!='circle'for point in cell['outer']]
    outline_box=box(all_points)
    # Envelope lets the painter construct a single outer rim network.
    return {'id':panel['id'],'direction':panel['direction'],'bbox':panel['bbox'],
            'componentLabel':panel['componentLabel'],'bodyBox':[l+left,t+bt,l+right,t+bb],
            'outline':[[outline_box[0],outline_box[1]],[outline_box[2],outline_box[1]],[outline_box[2],outline_box[3]],[outline_box[0],outline_box[3]]],
            'shape':shape,'cells':cells,'splitXs':[l+x for x in splits],'splitLines':split_lines,'lineEvidence':evidence,
            'embeddedArrows':embedded_arrows,
            'reviewReasons':sorted(set(review)),'attachedExtras':panel.get('attachedExtras',[]),
            'nativeAudited':bool(known)}
