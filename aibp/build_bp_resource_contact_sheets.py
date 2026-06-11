from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
PS_ROOT = ROOT / "ps"
ICON_ROOT = PS_ROOT / "other" / "resouce"
OUTPUT_ROOT = ROOT / "_bp_resource_contact_sheets"

APOSTLES = [
    "HEKATON",
    "LABYRINTHAUROS",
    "HERMESIAN_PURSUER",
    "ALPHA_TEMENOS",
    "HYPERTIME_ORACLE",
    "ICARIAN_HARPY",
    "SUN_DESCENDANT",
]

RESOURCE_MAP = {}


def add_resources(apostle, levels):
    for level, resources in levels.items():
        for index, resource in enumerate(resources, 1):
            key = f"{apostle}_BP_{level}_{index:03d}.jpg"
            RESOURCE_MAP[key] = resource


def repeated(resource, count=6):
    return [resource.copy() for _ in range(count)]


add_resources("HEKATON", {
    "I": repeated({"RA": 1}),
    "II": [{"MC": 1}, {"MC": 1}, {"CKB": 1}, {"CKB": 1}, {"CKB": 1}, {"MC": 1}],
    "III": [
        {"MC": 1, "RA": 1}, {"CKB": 1, "RA": 1}, {"MC": 1, "RA": 1},
        {"CKB": 1, "RA": 1}, {"MC": 1, "RA": 1}, {"CKB": 1, "RA": 1},
    ],
})

add_resources("LABYRINTHAUROS", {
    "I": repeated({"RA": 1}),
    "II": [{"IM": 1}, {"FM": 1}, {"FM": 1}, {"IM": 1}, {"FM": 1}, {"IM": 1}],
    "III": [
        {"RA": 1, "FM": 1}, {"RA": 1, "FM": 1}, {"RA": 1, "FM": 1},
        {"RA": 1, "IM": 1}, {"RA": 1, "IM": 1}, {"RA": 1, "IM": 1},
    ],
})

add_resources("HERMESIAN_PURSUER", {
    "I": [{"GB": 2}, {"PW": 2}, {"GB": 2}, {"PW": 2}, {"PW": 2}, {"GB": 2}],
    "II": [
        {"PW": 4}, {"GB": 4}, {"PW": 2, "GB": 2},
        {"PW": 4}, {"PW": 2, "GB": 2}, {"GB": 4},
    ],
    "III": [
        {"PW": 4}, {"PW": 4, "GB": 2}, {"PW": 4},
        {"PW": 2, "GB": 2}, {"PW": 2, "GB": 2}, {"GB": 2, "PW": 4},
    ],
})

add_resources("ALPHA_TEMENOS", {
    "I": [{"RA": 2}, {"RA": 2}, {"RA": 2}, {"FE": 1}, {"MF": 1}, {"RA": 2}],
    "II": [
        {"MF": 1}, {"RA": 2}, {"FE": 1, "MF": 1},
        {"FE": 1, "MF": 1}, {"FE": 1}, {"RA": 2},
    ],
    "III": [
        {"FE": 1, "RA": 2}, {"FE": 1, "MF": 2}, {"MF": 1, "RA": 2},
        {"MF": 1, "RA": 2}, {"FE": 1, "RA": 2}, {"FE": 1, "RA": 2},
    ],
})

add_resources("HYPERTIME_ORACLE", {
    "I": repeated({"FA": 1}),
    "II": [{"EC": 1}, {"EC": 1}, {"CL": 1}, {"CL": 1}, {"EC": 1}, {"CL": 1}],
    "III": [
        {"EC": 1, "FA": 1}, {"CL": 1, "FA": 1}, {"CL": 1, "FA": 1},
        {"EC": 1, "FA": 1}, {"EC": 1, "FA": 1}, {"CL": 1, "FA": 1},
    ],
})

add_resources("ICARIAN_HARPY", {
    "I": repeated({"FA": 1}),
    "II": [{"RC": 1}, {"IF": 1}, {"IF": 1}, {"IF": 1}, {"RC": 1}, {"RC": 1}],
    "III": [
        {"RC": 1, "FA": 1}, {"IF": 1, "FA": 1}, {"IF": 1, "FA": 1},
        {"RC": 1, "FA": 1}, {"IF": 1, "FA": 1}, {"RC": 1, "FA": 1},
    ],
})

add_resources("SUN_DESCENDANT", {
    "I": [
        {"SM": 1}, {"WT": 2}, {"WT": 1, "SM": 1},
        {"WT": 1}, {"FA": 1, "SM": 1}, {"FA": 1, "WT": 1},
    ],
    "II": [
        {"FA": 2, "SM": 1}, {"WT": 1, "FA": 2}, {"WT": 1, "SM": 1, "FA": 1},
        {"FA": 2, "WT": 1}, {"WT": 1, "SM": 1, "FA": 1}, {"FA": 2, "SM": 1},
    ],
    "III": [
        {"WT": 2, "FA": 4}, {"WT": 2, "FA": 4}, {"SM": 2, "FA": 4},
        {"SM": 2, "FA": 4}, {"WT": 2, "FA": 4}, {"SM": 2, "FA": 4},
    ],
})


def fit(image, size):
    result = image.copy()
    result.thumbnail(size, Image.Resampling.LANCZOS)
    return result


def make_legend():
    icons = sorted(
        path for path in ICON_ROOT.glob("*.png") if path.stem != "core"
    )
    legend = Image.new("RGB", (1500, 280), "white")
    draw = ImageDraw.Draw(legend)
    for index, path in enumerate(icons):
        x = 10 + (index % 13) * 114
        y = 10 + (index // 13) * 135
        icon = fit(Image.open(path).convert("RGB"), (90, 90))
        legend.paste(icon, (x + (90 - icon.width) // 2, y))
        draw.text((x + 32, y + 94), path.stem, fill="black")
    return legend


def make_sheet(apostle):
    cards = sorted((PS_ROOT / apostle).glob(f"{apostle}_BP_*.jpg"))
    legend = make_legend()
    sheet = Image.new("RGB", (1500, 280 + 3 * 420), "#dddddd")
    sheet.paste(legend, (0, 0))
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(cards):
        row, col = divmod(index, 6)
        x = col * 250
        y = 280 + row * 420
        with Image.open(path) as card:
            banner = card.crop(
                (
                    round(card.width * 0.72),
                    round(card.height * 0.03),
                    card.width,
                    round(card.height * 0.43),
                )
            ).convert("RGB")
        banner = fit(banner, (230, 350))
        sheet.paste(banner, (x + 10, y + 58))
        label = path.stem.replace(f"{apostle}_BP_", "")
        resources = RESOURCE_MAP.get(path.name)
        mapping = (
            "MAP: " + " + ".join(f"{key} x{value}" for key, value in resources.items())
            if resources
            else "MAP: MISSING"
        )
        draw.rectangle((x, y, x + 249, y + 419), outline="#555555", width=2)
        draw.text((x + 10, y + 8), label, fill="black")
        draw.rectangle(
            (x + 6, y + 25, x + 243, y + 52),
            fill="#d8f3dc" if resources else "#ffb3b3",
            outline="#26734d" if resources else "#a00000",
            width=2,
        )
        draw.text((x + 12, y + 32), mapping, fill="#102a18" if resources else "#800000")
    OUTPUT_ROOT.mkdir(exist_ok=True)
    sheet.save(OUTPUT_ROOT / f"{apostle}.jpg", quality=95)


def main():
    for apostle in APOSTLES:
        make_sheet(apostle)
        print(apostle)


if __name__ == "__main__":
    main()
