"""Extract the two C5 metal icons from the Chinese Argo record PDF."""
import argparse
from pathlib import Path

import fitz
from PIL import Image, ImageChops


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    # Coordinates use the displayed landscape page (rotation 270 in the source).
    boxes = {
        "orichalcumAlloy": (529, 402, 545, 419),
        "slaveMetal": (599, 402, 615, 419),
    }
    with fitz.open(args.pdf) as document:
        page = document[0]
        for name, box in boxes.items():
            pixmap = page.get_pixmap(matrix=fitz.Matrix(12, 12), clip=fitz.Rect(box), alpha=False)
            gray = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples).convert("L")
            alpha = ImageChops.invert(gray)
            bounds = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
            if not bounds:
                raise ValueError(f"Empty icon: {name}")
            icon = Image.new("RGBA", gray.size, (0, 0, 0, 0))
            icon.putalpha(alpha)
            icon = icon.crop(bounds)
            icon.thumbnail((88, 88), Image.Resampling.LANCZOS)
            output = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
            output.paste(icon, ((96 - icon.width) // 2, (96 - icon.height) // 2))
            for directory in ("record/assets/resource-icons", "official-assets/record/assets/resource-icons"):
                target = args.root / directory / f"{name}.png"
                target.parent.mkdir(parents=True, exist_ok=True)
                output.save(target)
            print(f"Extracted {name}: 96x96, transparent background")


if __name__ == "__main__":
    main()
