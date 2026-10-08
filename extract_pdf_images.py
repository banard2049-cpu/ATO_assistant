# -*- coding: utf-8 -*-
"""Export every embedded raster image from a PDF into a folder.

Usage: python extract_pdf_images.py <pdf> <outdir>
"""
import hashlib
import os
import sys

import fitz  # PyMuPDF

PDF = sys.argv[1]
OUT = sys.argv[2]

os.makedirs(OUT, exist_ok=True)
doc = fitz.open(PDF)
report = []
seen = {}          # xref -> filename
hash_seen = {}     # content hash -> filename

for pno in range(doc.page_count):
    page = doc[pno]
    images = page.get_images(full=True)
    for idx, info in enumerate(images, start=1):
        xref = info[0]
        smask = info[1]
        w, h = info[2], info[3]
        cs = info[5]
        if xref in seen:
            report.append((pno + 1, idx, xref, w, h, "-", "-", "reused:" + seen[xref]))
            continue
        try:
            data = doc.extract_image(xref)
        except Exception as exc:  # noqa: BLE001
            report.append((pno + 1, idx, xref, w, h, "-", "-", "FAILED: %s" % exc))
            continue
        raw = data["image"]
        ext = data.get("ext", "png")
        digest = hashlib.md5(raw).hexdigest()
        if smask:
            pass  # soft mask kept as its own image below / reported
        fname = "p%03d_img%02d_x%d.%s" % (pno + 1, idx, xref, ext)
        dup = hash_seen.get(digest)
        if dup:
            fname = fname  # still write; note duplicate in report
        with open(os.path.join(OUT, fname), "wb") as fh:
            fh.write(raw)
        seen[xref] = fname
        hash_seen.setdefault(digest, fname)
        report.append(
            (pno + 1, idx, xref, data.get("width", w), data.get("height", h),
             ext, "%.1f KB" % (len(raw) / 1024.0),
             "dup-of:" + dup if dup else "ok")
        )

with open(os.path.join(OUT, "_manifest.txt"), "w", encoding="utf-8") as fh:
    fh.write("pdf: %s\npages: %d\nfiles: %d\n\n" % (PDF, doc.page_count, len(seen)))
    fh.write("page\tidx\txref\twidth\theight\text\tsize\tnote\n")
    for row in report:
        fh.write("\t".join(str(c) for c in row) + "\n")

print("pages:", doc.page_count)
print("unique images written:", len(seen))
print("outdir:", OUT)
for row in report:
    print(row)
