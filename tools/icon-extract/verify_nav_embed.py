#!/usr/bin/env python3
"""Verify the dashboard navigation icons are embedded correctly."""
from __future__ import annotations

import re
import sys
from pathlib import Path

from lxml import html as LH

# the console on this machine defaults to GBK; keep the report readable
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "index.html"
CSS = ROOT / "api" / "dashboard.css"

EXPECTED = {
    "./record/index.html": "argo",
    "./hero/index.html": "argonauts",
    "./aibp/index.html": "evolution",
    "./technology/index.html": "technology",
    "./map/index.html": "map",
    "./story/index.html": "story",
}

# text the nav link must show, when it differs from the glyph name
EXPECTED_LABEL = {
    "./record/index.html": "阿尔戈号",
    "./hero/index.html": "英雄",
    "./aibp/index.html": "始徒",
}

doc = LH.fromstring(INDEX.read_text(encoding="utf-8"))
links = doc.xpath('//nav[contains(@class,"record-links")]/a[contains(@class,"record-card-link")]')
print(f"nav links found: {len(links)}")
ok = True
for a in links:
    href = a.get("href")
    svgs = a.xpath('./svg[contains(@class,"nav-icon")]')
    text = (a.text_content() or "").strip()
    label = re.sub(r"\s+", "", a.text_content() or "")
    # the svg must come before the label text node
    first_child = a[0] if len(a) else None
    svg_first = first_child is not None and first_child.tag.endswith("svg")
    d = svgs[0].xpath('.//path/@d')[0] if svgs else ""
    # lxml.html lowercases attribute names, so read the box case-insensitively
    vb = next((v for k, v in svgs[0].items() if k.lower() == "viewbox"), "") if svgs else ""
    exp_vb = None
    if href in EXPECTED:
        exp = ROOT / "tools" / "icon-extract" / "svg" / f"{EXPECTED[href]}.svg"
        exp_vb = re.search(r'viewBox="([^"]+)"', exp.read_text(encoding="utf-8")).group(1)

    status = "OK " if (len(svgs) == 1 and svg_first and d) else "BAD"
    if status == "BAD":
        ok = False
    if exp_vb is not None and vb != exp_vb:
        ok = False
        status = "BAD"
    want = EXPECTED_LABEL.get(href)
    if want is not None and label != want:
        ok = False
        status = "BAD"
    # the inline size must match the equal-area rule the generator uses
    style = (svgs[0].get("style") or "") if svgs else ""
    m = re.search(r"--nav-icon-w:(\d+)px;--nav-icon-h:(\d+)px", style)
    if not m:
        ok = False
        status = "BAD"
        size_txt = "missing --nav-icon-w/h"
    else:
        w, h = (float(v) for v in exp_vb.split()[2:])
        s = min(16.0 / ((w * h) ** 0.5), 16.0 * 1.25 / max(w, h))
        want_wh = (max(1, round(w * s)), max(1, round(h * s)))
        got_wh = (int(m.group(1)), int(m.group(2)))
        size_txt = f"{got_wh[0]}x{got_wh[1]}"
        if got_wh != want_wh:
            ok = False
            status = "BAD"
            size_txt += f" (want {want_wh[0]}x{want_wh[1]})"
    print(f"  {status} {href:28s} icon={len(svgs)} svg_first={svg_first} "
          f"d={len(d):>5}B size={size_txt:>16s} text={label!r}")

print(f"labels match expected set: {set(a.get('href') for a in links) == set(EXPECTED)}")
print(f"no stray <svg> outside links: "
      f"{len(doc.xpath('//svg[contains(@class,\"nav-icon\")]')) == len(links)}")

css = CSS.read_text(encoding="utf-8")
for token in [".app .record-card-link > .nav-icon",
              "width: var(--nav-icon-w, 16px)",
              "height: var(--nav-icon-h, 16px)",
              "margin-right: 6px",
              ".app .record-links .record-card-link > .nav-icon",
              "calc(var(--nav-icon-w, 16px) * 0.875)"]:
    hit = token in css
    ok &= hit
    print(f"  css {'OK ' if hit else 'BAD'} {token}")
print(f"  css rule copies: main={css.count('.record-card-link > .nav-icon')} "
      f"(expect 2: base + narrow)")

ver = re.search(r'dashboard\.css\?v=([^"]+)', INDEX.read_text(encoding="utf-8"))
print(f"dashboard.css cache-bust: v={ver.group(1) if ver else 'MISSING'}")
print("\nALL CHECKS PASSED" if ok else "\nCHECKS FAILED")
