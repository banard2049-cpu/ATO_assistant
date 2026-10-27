"""Local SVG path bounds for read-only analytic component previews."""
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from map_marker_templates import _transform
def bounds(node):
    pen=BoundsPen(None)
    def walk(n,parent):
        transform=parent.transform(_transform(n.get('transform')))
        if n.tag.rsplit('}',1)[-1]=='path':parse_path(n.get('d',''),TransformPen(pen,transform))
        for child in n:walk(child,transform)
    walk(node,Transform());assert pen.bounds is not None
    return pen.bounds
