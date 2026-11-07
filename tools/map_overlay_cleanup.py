"""Drop the legacy raster from completed, fully vectorised map overlays.

A production overlay keeps an embedded copy of the original PNG only while some
pixels still come from that scan.  Once every face is complete the marker stage
uses a full-canvas ``remaining-markers`` cut, which hides the image completely.
This module removes that image, its mask and the now-unused ``<defs>`` wrapper
while leaving every vector group byte-for-byte untouched.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

NS = 'http://www.w3.org/2000/svg'
FULL_TILE = 'M0 0H1024V1024H0Z'


def _compact_path(value: str | None) -> str:
    return re.sub(r'\s+', '', value or '')


def hidden_raster_is_fully_masked(text: str) -> bool:
    """Return True only when the old scan is hidden by a full-canvas cut."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return False
    mask = next((node for node in root.iter(f'{{{NS}}}mask') if node.get('id') == 'keep'), None)
    if mask is None:
        return False
    cut = next((node for node in mask if node.get('data-remove') == 'remaining-markers'), None)
    if cut is None or _compact_path(cut.get('d')) != _compact_path(FULL_TILE):
        return False
    group = next((node for node in root if node.get('mask') == 'url(#keep)'), None)
    if group is None:
        return False
    # The group may contain only the archived overlay image.  Marker
    # components elsewhere in the SVG keep their legitimate embedded sprites.
    return all(child.tag == f'{{{NS}}}image' for child in group)


def strip_hidden_raster(text: str) -> tuple[str, int]:
    """Remove the fully masked legacy image and its wrapper.

    Returns ``(cleaned_text, removed_bytes)``.  Text is returned unchanged when
    the overlay still needs the raster (preview/incomplete faces).
    """
    if not hidden_raster_is_fully_masked(text):
        return text, 0
    root = ET.fromstring(text)
    defs = root.find(f'{{{NS}}}defs')
    if defs is None or len(defs) != 1 or defs[0].tag != f'{{{NS}}}mask':
        return text, 0
    if defs[0].get('id') != 'keep':
        return text, 0
    before = len(text.encode('utf-8'))
    cleaned, defs_count = re.subn(r'<defs>.*?</defs>', '', text, count=1, flags=re.S)
    cleaned, group_count = re.subn(r'<g mask="url\(#keep\)">.*?</g>', '', cleaned, count=1, flags=re.S)
    if defs_count != 1 or group_count != 1:
        raise ValueError('无法定位旧地图底图包装层')
    if 'url(#keep)' in cleaned:
        raise ValueError('清理后仍存在 #keep 引用')
    return cleaned, before - len(cleaned.encode('utf-8'))
