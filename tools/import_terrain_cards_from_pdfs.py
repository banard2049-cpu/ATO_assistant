"""Extract the localized terrain cards from the C1-C5 print PDFs."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


PAGE_CARDS = {
    "b4": {
        11: [
            "city", "labyrinth", "minos-manos-unit",
            "column", "giant-shell", "maze-outcrop",
            "ambrosia-pool", "abandoned-temple", "argo-hull",
        ],
        12: [
            "ruined-city", "maze-fissure", "hyperborean-ruins",
            "spartan-river-works", "ambrosia-trail", "fortified-city",
            "krypteia-outpost", "termophylaed-city", "damaged-krypteia-outpost",
        ],
        13: [
            "graveyard-of-the-frail", "ambrosia-elephant", "cyclops-trap",
            "cliff", "black-iceberg", "black-lake",
            "timefront", "time-frozen-city", "spot-of-nothingness",
        ],
        14: ["giant-black-iceberg", "floating-rocks", "black-glacier"],
    },
    "b12": {
        10: [
            "staircase-entrance", "arcology", "ambrosia-cloud",
            "wishstorm", "windblighted-fleet", "irem-tower",
            "irem-city", "petrified-vent", "inkblot",
        ],
        11: [
            "ruined-arcology", "black-abyss", "trireme-graveyard",
            "school-of-creatures", "lightwall", "trench",
        ],
    },
}

# The PDFs contain 300 DPI A4 scans with three 6.3 x 8.8 cm cards per row.
# These bounds omit the one-pixel print guide lines around the card faces.
X_BOUNDS = ((124, 867), (868, 1612), (1613, 2356))
Y_BOUNDS = ((195, 1234), (1235, 2273), (2274, 3312))
SOURCE_SIZE = (2480, 3508)
OUTPUT_SIZE = (750, 1050)


def extract_cards(pdf_path: Path, pages: dict[int, list[str]], output_dir: Path) -> list[Path]:
    reader = PdfReader(pdf_path)
    written: list[Path] = []

    for page_number, card_names in pages.items():
        page = reader.pages[page_number - 1]
        if len(page.images) != 1:
            raise ValueError(f"{pdf_path.name} page {page_number}: expected one page image")

        source = page.images[0].image.convert("RGB")
        if source.size != SOURCE_SIZE:
            raise ValueError(
                f"{pdf_path.name} page {page_number}: expected {SOURCE_SIZE}, got {source.size}"
            )

        for index, card_name in enumerate(card_names):
            row, column = divmod(index, 3)
            left, right = X_BOUNDS[column]
            top, bottom = Y_BOUNDS[row]
            card = source.crop((left, top, right, bottom)).resize(
                OUTPUT_SIZE, Image.Resampling.LANCZOS
            )
            destination = output_dir / f"{card_name}.jpg"
            temporary = destination.with_suffix(".jpg.tmp")
            card.save(temporary, format="JPEG", quality=94, subsampling=0, optimize=True)
            os.replace(temporary, destination)
            written.append(destination)

    return written


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--b4", type=Path, required=True, help="C1-C3 battle card PDF")
    parser.add_argument("--b12", type=Path, required=True, help="C4-C5 battle/memory card PDF")
    parser.add_argument("--output", type=Path, default=Path("ss/terrain-cards"))
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    written = []
    written.extend(extract_cards(args.b4, PAGE_CARDS["b4"], args.output))
    written.extend(extract_cards(args.b12, PAGE_CARDS["b12"], args.output))

    expected = {f"{name}.jpg" for pages in PAGE_CARDS.values() for names in pages.values() for name in names}
    actual = {path.name for path in written}
    if len(written) != 45 or actual != expected:
        raise RuntimeError(f"terrain card mapping mismatch: wrote {len(written)} cards")
    print(f"Wrote {len(written)} localized terrain cards to {args.output}")


if __name__ == "__main__":
    main()
