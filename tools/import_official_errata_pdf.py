"""Install reviewed Chinese errata artwork into the private official overrides.

Requires PyMuPDF and Pillow. Only the fingerprinted, 12-page print PDF is
supported: its placed-PDF clipping paths define the card faces, not the larger
embedded images (which include bleed and printer marks). The input is data;
none of the prose in the PDF is executed or treated as workflow instructions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

import fitz
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = "db75485dc18b33e1d5f9466595377df60ac13db1554eac6750394f1f35697e83"
STAMP = "errata-20261031"
CLIP = re.compile(
    r"/PlacedPDF\s+/MC\d+\s+BDC\s+(?:Q\s+)?q\s+"
    r"([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re\s+W n"
)

# (printed ID, PDF page, placed-card index, project target, native raster xref)
# None means the face has vector text/graphics and must be composed at 600 DPI.
CARDS = [
    ("AR0406", 2, 0, "aibp/ps/HEKATON/HEKATON_AI_III_001.jpg", 1548),
    ("AR0522", 2, 1, "aibp/ps/ALPHA_TEMENOS/ALPHA_TEMENOS_AI_I_001.jpg", 1549),
    ("AB0077", 2, 2, "assets/exploration-cards/c1/6402.png", None),
    ("AR0523", 2, 3, "aibp/ps/ALPHA_TEMENOS/ALPHA_TEMENOS_AI_I_002.jpg", 1556),
    ("AA0039-back", 2, 4, "technology/images/split_cards/203ac2f702120c09_back.png", None),
    ("AB0093", 2, 5, "assets/exploration-cards/c1/6418.png", None),
    ("BR1111", 5, 0, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_I_001.jpg", 1604),
    ("BR1112", 5, 1, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_I_002.jpg", 1605),
    ("BR1114", 5, 2, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_I_004.jpg", 1606),
    ("BR1115", 5, 3, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_I_005.jpg", 1607),
    ("BR1117", 5, 4, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_II_004.jpg", 1608),
    ("BR1118", 5, 5, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_II_005.jpg", 1609),
    ("BR1123", 5, 6, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_III_001.jpg", 1610),
    ("BR1122", 5, 7, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_II_003.jpg", 1611),
    ("BR1120", 5, 8, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_II_001.jpg", 1612),
    ("BR1129", 6, 0, "aibp/ps/THE_BURDEN/THE_BURDEN_SIGNATURE_X_001.jpg", 48),
    ("BR1128", 6, 1, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_III_006.jpg", 49),
    ("BR1126", 6, 2, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_III_004.jpg", 50),
    ("BR1124", 6, 3, "aibp/ps/THE_BURDEN/THE_BURDEN_AI_III_002.jpg", 51),
    ("BA1029", 6, 4, "technology/images/split_cards/58f32fd5535b0a60_face.png", None),
    ("BR1089", 6, 5, "aibp/ps/THE_NIETZSCJEAN/THE_NIETZSCJEAN_SIGNATURE_X_001.jpg", 55),
    ("BE0629", 7, 0, "assets/story-doom-cards/c2-doom-14500-ill-fate-marshaling-front.jpg", None),
    # Caption typo BA0708; the actual printed card ID is BP0708.
    ("BP0708", 8, 0, "record/assets/godforms-nymphs/010_Nymph_Blade_Nymph.jpg", None),
    ("CR1350", 10, 0, "aibp/ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_II_006.jpg", 93),
]

# The alternate equipment sheet is deliberately opt-in. Three numbered copies
# are not standalone catalog entries, but their existing overrides also need
# to follow the selected version of the seven physical cards.
EARLY_GEAR_INDICES = [0, 1, 4, 6, 8, 10, 12]


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def trim_boxes(doc: fitz.Document, page_number: int) -> list[fitz.Rect]:
    page = doc[page_number - 1]
    content = b"\n".join(doc.xref_stream(x) for x in page.get_contents()).decode("latin1")
    boxes = []
    for match in CLIP.finditer(content):
        x, y, w, h = map(float, match.groups())
        boxes.append(fitz.Rect(x, page.rect.height - y - h, x + w, page.rect.height - y))
    if page_number == 7:
        # The first clip covers only an illustration layer. The full composite
        # clip also includes the text panel above that layer in page coordinates.
        boxes = [fitz.Rect(102.047, page.rect.height - 164.409 - 576.851,
                           493.228, page.rect.height - 164.409)]
    return boxes


def extract(doc: fitz.Document, page_number: int, index: int,
            xref: int | None = None) -> tuple[Image.Image, dict]:
    page = doc[page_number - 1]
    clip = trim_boxes(doc, page_number)[index]
    metadata = {"page": page_number, "placed_index": index, "trim_points": list(clip)}
    if xref is not None:
        rects = page.get_image_rects(xref)
        if len(rects) != 1 or not rects[0].contains(clip):
            raise ValueError(f"Unexpected image geometry for page {page_number}, xref {xref}")
        pix = fitz.Pixmap(doc, xref)
        if pix.colorspace.n != 3:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        rect = rects[0]
        bounds = [round((clip.x0 - rect.x0) / rect.width * im.width),
                  round((clip.y0 - rect.y0) / rect.height * im.height),
                  round((clip.x1 - rect.x0) / rect.width * im.width),
                  round((clip.y1 - rect.y0) / rect.height * im.height)]
        im = im.crop(bounds)
        metadata.update(method="native-raster-crop", xref=xref,
                        native_size=[pix.width, pix.height], pixel_crop=bounds)
    else:
        pix = page.get_pixmap(dpi=600, clip=clip, alpha=False)
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        metadata.update(method="composite-render", dpi=600)
    if page_number in (7, 11):
        im = im.transpose(Image.Transpose.ROTATE_90)
        metadata["rotation_ccw"] = 90
    metadata["size"] = list(im.size)
    return im, metadata


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() in (".jpg", ".jpeg"):
        im.save(path, quality=98, subsampling=0, optimize=True)
    else:
        im.save(path, format="PNG", optimize=True)
    with Image.open(path) as check:
        check.load()
        if check.size != im.size:
            raise ValueError(f"Output dimensions changed: {path}")


def contact_sheet(rows: list[dict], root: Path, path: Path, key: str) -> None:
    cells = []
    for row in rows:
        with Image.open(root / row[key]) as source:
            thumb = source.convert("RGB")
        thumb.thumbnail((250, 355))
        cell = Image.new("RGB", (270, 390), "#dddddd")
        cell.paste(thumb, ((270 - thumb.width) // 2, 25))
        ImageDraw.Draw(cell).text((8, 5), row["id"], fill="black")
        cells.append(cell)
    columns = 6
    sheet = Image.new("RGB", (270 * columns, 390 * ((len(cells) + columns - 1) // columns)), "white")
    for index, cell in enumerate(cells):
        sheet.paste(cell, ((index % columns) * 270, (index // columns) * 390))
    sheet.save(path, quality=94)


def early_gear(pdf: Path, root: Path, output: Path, apply: bool) -> None:
    """Explicitly select all seven early equipment faces, with separate backups."""
    from app.official_assets import clear_cache, find

    rows = []
    with fitz.open(pdf) as doc:
        if len(doc) != 12:
            raise ValueError("Expected twelve PDF pages")
        for number, index in zip(range(1539, 1546), EARLY_GEAR_INDICES):
            target = f"technology/images/gear_cards/cj{number}.jpg"
            existing = root / "official-assets" / "gear_cards" / f"cj{number}.jpg"
            if not existing.is_file() or find(root, target) != existing:
                raise ValueError(f"Unexpected equipment override: {target}")
            im, metadata = extract(doc, 12, index)
            relative = existing.relative_to(root).as_posix()
            staged = output / "early-gear-replacements" / relative
            save(im, staged)
            with Image.open(existing) as previous:
                old_size = list(previous.size)
            rows.append(dict(id=f"CJ{number}", target=target, override=relative,
                             staged=staged.relative_to(output).as_posix(),
                             before_sha256=sha256(existing), after_sha256=sha256(staged),
                             before_size=old_size, **metadata))

    backup = root / "official-assets" / "_backups" / f"{STAMP}-early-gear"
    backup_manifest = backup / "manifest.json"
    baseline = {}
    if backup_manifest.exists():
        baseline = {row["id"]: row for row in json.loads(backup_manifest.read_text("utf-8"))["replacements"]}
    for row in rows:
        saved = backup / "originals" / row["override"]
        row["backup"] = saved.relative_to(root).as_posix()
        if saved.exists():
            original = baseline.get(row["id"])
            if not original or sha256(saved) != original["before_sha256"]:
                raise ValueError(f"Original equipment backup mismatch: {saved}")
            if row["before_sha256"] not in (original["before_sha256"], row["after_sha256"]):
                raise ValueError(f"Equipment modified since the original backup: {row['id']}")
            row["before_sha256"] = original["before_sha256"]
            row["before_size"] = original["before_size"]

    report = dict(source=str(pdf.resolve()), source_sha256=SOURCE_SHA256,
                  selection="early-equipment-rules", applied=False, replacements=rows,
                  back_faces="retained as references; equipment catalog has front faces only")
    report_path = output / "early-gear-manifest.json"
    contact_sheet(rows, output, output / "early-gear-after-contact.jpg", "staged")
    if apply:
        # Preserve the complete balanced set before changing the active set.
        for row in rows:
            saved = root / row["backup"]
            if not saved.exists():
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(root / row["override"], saved)
            if sha256(saved) != row["before_sha256"]:
                raise ValueError(f"Equipment backup verification failed: {saved}")
        if not backup_manifest.exists():
            backup_manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        contact_sheet(rows, root, output / "early-gear-before-contact.jpg", "backup")
        for row in rows:
            current = root / row["override"]
            pending = current.with_name(current.name + ".errata.tmp")
            shutil.copy2(output / row["staged"], pending)
            os.replace(pending, current)
        clear_cache()
        for row in rows:
            if find(root, row["target"]) != root / row["override"]:
                raise ValueError(f"Equipment override resolution failed: {row['id']}")
            if sha256(root / row["override"]) != row["after_sha256"]:
                raise ValueError(f"Installed equipment hash mismatch: {row['id']}")
        report["applied"] = True
        report["backup_directory"] = str(backup)
        combined_path = output / "manifest.json"
        if combined_path.exists():
            combined = json.loads(combined_path.read_text("utf-8"))
            combined["early_gear_selection"] = dict(applied=True, count=7, manifest=report_path.name)
            combined_path.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(dict(applied=report["applied"], early_gear_replacements=len(rows),
                          manifest=str(report_path)), ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--ato-root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=ROOT / "output" / STAMP)
    parser.add_argument("--apply", action="store_true", help="Install after staging and immutable backup")
    parser.add_argument("--early-gear", action="store_true",
                        help="Process only the seven optional early equipment versions")
    args = parser.parse_args()
    root = args.ato_root.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if sha256(args.pdf) != SOURCE_SHA256:
        raise ValueError("Unreviewed PDF revision: fingerprint does not match")
    sys.path.insert(0, str(ROOT / "asset-studio"))
    from app.fixed_catalog import fixed_catalog_payload
    from app.official_assets import clear_cache, find

    if args.early_gear:
        early_gear(args.pdf, root, output, args.apply)
        return

    targets = {target for item in fixed_catalog_payload()["items"] for target in item["faces"].values()}
    rows = []
    references = []
    with fitz.open(args.pdf) as doc:
        if len(doc) != 12:
            raise ValueError("Expected twelve PDF pages")
        for printed_id, page, index, target, xref in CARDS:
            if target not in targets:
                raise ValueError(f"Target not registered: {target}")
            existing = find(root, target)
            if existing is None:
                raise ValueError(f"Expected existing official override: {target}")
            relative = existing.relative_to(root).as_posix()
            im, metadata = extract(doc, page, index, xref)
            stage = output / "replacements" / relative
            save(im, stage)
            with Image.open(existing) as previous:
                old_size = list(previous.size)
            rows.append(dict(id=printed_id, target=target, override=relative,
                             staged=stage.relative_to(output).as_posix(),
                             before_sha256=sha256(existing), after_sha256=sha256(stage),
                             before_size=old_size, **metadata))
        # These complete cards currently have no corresponding catalog face.
        # In particular, CK1279 must never replace the Returner portrait.
        for printed_id, page in [("AG0143", 3), ("CK1279", 11)]:
            im, metadata = extract(doc, page, 0)
            dest = output / "unmapped-reference" / f"{printed_id}.png"
            save(im, dest)
            references.append(dict(id=printed_id, file=dest.relative_to(output).as_posix(),
                                   reason="no-existing-complete-card-target", **metadata))
        # The seven early equipment versions are alternatives, not corrections.
        # Keep all fourteen faces out of official-assets so they cannot become
        # active through the exporter's unique-filename fallback.
        gear_indices = [(0, 2), (1, 3), (4, 5), (6, 7), (8, 9), (10, 11), (12, 13)]
        for number, indices in zip(range(1539, 1546), gear_indices):
            for face, index in zip(("front", "back"), indices):
                im, metadata = extract(doc, 12, index)
                dest = output / "optional-early-gear" / f"CJ{number}-{face}.png"
                save(im, dest)
                references.append(dict(id=f"CJ{number}-{face}", file=dest.relative_to(output).as_posix(),
                                       reason="optional-early-rules-version", **metadata))

    report = dict(source=str(args.pdf.resolve()), source_sha256=SOURCE_SHA256,
                  applied=False, replacements=rows, references=references)
    report_path = output / "manifest.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    contact_sheet(rows, output, output / "after-contact.jpg", "staged")
    if args.apply:
        backup = root / "official-assets" / "_backups" / STAMP
        backup.mkdir(parents=True, exist_ok=True)
        # Back up the entire batch before modifying any active image.
        for row in rows:
            current = root / row["override"]
            saved = backup / "originals" / row["override"]
            saved.parent.mkdir(parents=True, exist_ok=True)
            if saved.exists():
                if sha256(saved) not in (row["before_sha256"], row["after_sha256"]):
                    # A rerun after installation must retain the original backup.
                    if sha256(current) != row["after_sha256"]:
                        raise ValueError(f"Backup conflict: {saved}")
            else:
                shutil.copy2(current, saved)
            row["backup"] = saved.relative_to(root).as_posix()
        backup_manifest = backup / "manifest.json"
        if not backup_manifest.exists():
            backup_manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        contact_sheet(rows, root, output / "before-contact.jpg", "backup")
        for row in rows:
            current = root / row["override"]
            pending = current.with_name(current.name + ".errata.tmp")
            shutil.copy2(output / row["staged"], pending)
            os.replace(pending, current)
        clear_cache()
        for row in rows:
            current = root / row["override"]
            if find(root, row["target"]) != current or sha256(current) != row["after_sha256"]:
                raise ValueError(f"Installed override verification failed: {row['target']}")
        report["applied"] = True
        report["backup_directory"] = str(backup)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(dict(applied=report["applied"], replacements=len(rows),
                          reference_faces=len(references), manifest=str(report_path)), ensure_ascii=False))


if __name__ == "__main__":
    main()
