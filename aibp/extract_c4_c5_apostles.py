import argparse
import hashlib
import io
import json
import shutil
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SAVE = Path(r"D:\files\My Games\Tabletop Simulator\Mods\Workshop\3458296558.json")
DEFAULT_PANEL_ROOT = Path(
    r"D:\files\Tencent Files\2628451455\FileRecv\45图"
    r"\B11 C4~C5始徒面板贴条V1.01"
)
DEFAULT_CARD_ROOT = Path(
    r"D:\files\Tencent Files\2628451455\FileRecv\45图"
    r"\B12 C4~C5战斗卡牌+回忆卡（无特别创伤卡）贴条V1.12补了恐惧款待"
)
DEFAULT_OUTPUT = ROOT / "aibp" / "ps"
DEFAULT_CACHE = ROOT / "tmp" / "c45-aibp-assets"
DEFAULT_REPORT = ROOT / "tmp" / "c45-aibp-import-report.json"

LEVELS = ("I", "II", "III")
PANEL_PAGE_BY_CODE = {
    "MIDASCORE": (0, 0),
    "DEMIDJINN": (1, 0),
    "THE_BABELIAN_LUNACY": (2, -90),
    "DAHAKA": (3, 0),
    "DRAGON_OF_PHOBOS": (4, 0),
    "MEDUKETOS": (5, 0),
    "UR_FLEECE": (6, -90),
    "TITAN_X": (7, 0),
}

# The first six entries are the regular AI/BP decks. Values are TTS custom
# deck keys; Dragon of Phobos stores all three BP levels on one 6x3 sheet.
STANDARD_DECK_KEYS = {
    "MIDASCORE": {"AI": (92, 93, 94), "BP": (95, 96, 97)},
    "DEMIDJINN": {"AI": (92, 93, 94), "BP": (95, 96, 97)},
    "THE_BABELIAN_LUNACY": {"AI": (100, 101, 102), "BP": (103, 104, 105)},
    "DAHAKA": {"AI": (92, 93, 94), "BP": ()},
    "DRAGON_OF_PHOBOS": {"AI": (103, 104, 105), "BP": (107, 107, 107)},
    "MEDUKETOS": {"AI": (103, 104, 105), "BP": (106, 107, 108)},
    "UR_FLEECE": {"AI": (103, 104, 105), "BP": (106, 107, 108)},
    "TITAN_X": {"AI": (103, 104, 105), "BP": (106, 107, 108)},
}

CYCLES = {
    "CYCLE IV Gardens Of Infinity Growth": {
        "Midascore": "MIDASCORE",
        "Demidjinn": "DEMIDJINN",
        "The Babelian Lunacy": "THE_BABELIAN_LUNACY",
        "Dahaka": "DAHAKA",
    },
    "Cycle V Truthsayer": {
        "Dragon of Phobos": "DRAGON_OF_PHOBOS",
        "Meduketos": "MEDUKETOS",
        "Ur-Fleece": "UR_FLEECE",
        "Titan X": "TITAN_X",
    },
}

EXTRA_CARD_FILES = {
    "MIDASCORE": {
        9800: "MIDASCORE_STATUS_X_001.jpg",
        9801: "MIDASCORE_ROUTINE_X_001.jpg",
        9802: "MIDASCORE_SIGNATURE_X_001.jpg",
    },
    "DEMIDJINN": {
        9800: "DEMIDJINN_TR_O_001.jpg",
        9801: "DEMIDJINN_ROUTINE_X_001.jpg",
        9802: "DEMIDJINN_SIGNATURE_X_001.jpg",
        9803: "DEMIDJINN_TR_IV_001.jpg",
    },
    "THE_BABELIAN_LUNACY": {
        10600: "THE_BABELIAN_LUNACY_ROUTINE_X_001.jpg",
        10601: "THE_BABELIAN_LUNACY_SIGNATURE_X_001.jpg",
    },
    "DAHAKA": {
        9700: "DAHAKA_TR_O_001.jpg",
        9600: None,
    },
    "DRAGON_OF_PHOBOS": {
        10600: "DRAGON_OF_PHOBOS_ROUTINE_X_001.jpg",
        10601: "DRAGON_OF_PHOBOS_SIGNATURE_X_001.jpg",
    },
    "MEDUKETOS": {
        10900: "MEDUKETOS_ROUTINE_X_001.jpg",
        10901: "MEDUKETOS_SIGNATURE_X_001.jpg",
    },
    "UR_FLEECE": {
        10300: None,
        10900: "UR_FLEECE_ROUTINE_X_001.jpg",
        10901: "UR_FLEECE_SIGNATURE_X_001.jpg",
        10903: "UR_FLEECE_AI_O_001.jpg",
    },
    "TITAN_X": {
        11000: "TITAN_X_ROUTINE_X_001.jpg",
        11001: "TITAN_X_SIGNATURE_X_001.jpg",
        11003: "TITAN_X_AI_O_001.jpg",
    },
}

# B12 pages use a stable three-column, three-row card grid. These mappings
# cover the apostle-specific cards; generic cursed traits and memories are
# intentionally left out of the AIBP folders.
HD_TRAIT_CARDS = (
    ("MIDASCORE", "II", 1, 0, 1, 1),
    ("MIDASCORE", "I", 1, 0, 1, 2),
    ("DEMIDJINN", "I", 1, 0, 2, 0),
    ("THE_BABELIAN_LUNACY", "II", 1, 0, 2, 1),
    ("THE_BABELIAN_LUNACY", "VIII", 1, 0, 2, 2),
    ("THE_BABELIAN_LUNACY", "IX", 1, 1, 0, 0),
    ("DRAGON_OF_PHOBOS", "I", 1, 1, 1, 0),
    ("DRAGON_OF_PHOBOS", "I", 2, 1, 1, 1),
    ("DRAGON_OF_PHOBOS", "I", 3, 1, 1, 2),
    ("DRAGON_OF_PHOBOS", "IV", 1, 1, 2, 0),
    ("MEDUKETOS", "I", 1, 1, 2, 1),
    ("MEDUKETOS", "I", 2, 1, 2, 2),
    ("MEDUKETOS", "I", 3, 2, 0, 0),
    ("MEDUKETOS", "I", 4, 2, 1, 0),
    ("UR_FLEECE", "I", 1, 2, 0, 2),
    ("UR_FLEECE", "I", 2, 2, 1, 2),
    ("TITAN_X", "I", 1, 2, 1, 1),
)

HD_SPECIAL_CARDS = (
    ("TITAN_X", "TITAN_X_BP_I_001.jpg", 3, 1, 2),
    ("TITAN_X", "TITAN_X_BP_II_004.jpg", 3, 1, 1),
    ("TITAN_X", "TITAN_X_FEINT_X_001.jpg", 3, 1, 0),
    ("TITAN_X", "TITAN_X_FEINT_X_002.jpg", 4, 1, 2),
    ("TITAN_X", "TITAN_X_FEINT_X_003.jpg", 4, 1, 1),
    ("TITAN_X", "TITAN_X_FEINT_X_004.jpg", 4, 1, 0),
    ("TITAN_X", "TITAN_X_FEINT_X_005.jpg", 3, 0, 2),
    ("TITAN_X", "TITAN_X_FEINT_X_006.jpg", 3, 0, 1),
    ("TITAN_X", "TITAN_X_FEINT_X_007.jpg", 3, 0, 0),
    ("TITAN_X", "TITAN_X_FEINT_X_008.jpg", 4, 0, 1),
    ("TITAN_X", "TITAN_X_FEINT_X_009.jpg", 4, 0, 0),
    ("TITAN_X", "TITAN_X_FEINT_X_010.jpg", 4, 0, 2),
)

B12_GRID_X = (123, 868, 1612, 2357)
B12_GRID_Y = (194, 1234, 2273, 3313)
B12_REFERENCE_SIZE = (2480, 3508)
TITAN_FEINT_DECK_KEY = 109
TITAN_X_OVERSTEP_KEYS = {("I", 1), ("II", 4)}

# The localized condition sheet contains thirteen general conditions. Fearful
# Hospitality is the fourteenth C4-C5 status and is extracted separately as a
# double-sided Dahaka card.
HD_CONDITION_PAGE_INDEX = 5
HD_CONDITION_X = (270, 755, 1239, 1724, 2209)
HD_CONDITION_Y = (333, 1078, 1823, 2568, 3313)
HD_CONDITIONS = (
    ("COVETOUS", "强欲 / Covetous", 0, 0),
    ("ENRICHED", "满足 / Enriched", 0, 1),
    ("LANDER", "登陆者 / Lander", 0, 2),
    ("TERROR", "恐怖 / Terror", 0, 3),
    ("GREED_CRAZED", "贪婪 / Greed-Crazed", 1, 0),
    ("ENLIGHTENED", "开悟 / Enlightened", 1, 1),
    ("RESOLVE", "决意 / Resolve", 1, 2),
    ("HOLY_TERROR", "大恐怖 / Holy Terror", 1, 3),
    ("WISHKEEN", "愿望热情 / Wishkeen", 2, 0),
    ("FLOAT_UP", "浮空（上）/ Float (Up)", 2, 1),
    ("BRAVERY", "英勇 / Bravery", 2, 2),
    ("WISHAGOG", "愿望狂热 / Wishagog", 3, 0),
    ("FLOAT_DOWN", "浮空（下）/ Float (Down)", 3, 1),
)

GLOBAL_WISH_FACE_URL = (
    "https://steamusercontent-a.akamaihd.net/ugc/"
    "13482598190652728050/8A1000C7FBC6F8E68CB6E8BDFFD08B5FC744945F/"
)
GLOBAL_WISH_BACK_URL = (
    "https://steamusercontent-a.akamaihd.net/ugc/"
    "11876582898136589643/0A26A87F6ABE788E5AB5DCA50904282A77E4FBC6/"
)

EXPECTED_STANDARD_COUNTS = {
    code: {
        "AI": {"I": 6, "II": 6, "III": 6},
        "BP": {"I": 6, "II": 6, "III": 6},
    }
    for code in STANDARD_DECK_KEYS
}
EXPECTED_STANDARD_COUNTS["DAHAKA"]["BP"] = {"I": 0, "II": 0, "III": 0}
EXPECTED_STANDARD_COUNTS["TITAN_X"]["BP"] = {"I": 6, "II": 6, "III": 6}


@dataclass(frozen=True)
class CardLocation:
    card_id: int
    deck_key: int
    slot: int
    deck: dict


def children(obj):
    return [
        *(obj.get("ObjectStates") or []),
        *(obj.get("ContainedObjects") or []),
        *(obj.get("States") or {}).values(),
    ]


def find_first(obj, predicate):
    if predicate(obj):
        return obj
    for child in children(obj):
        found = find_first(child, predicate)
        if found is not None:
            return found
    return None


def image_bytes(url, cache_root):
    cache_root.mkdir(parents=True, exist_ok=True)
    cache_path = cache_root / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()}.img"
    if not cache_path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            cache_path.write_bytes(response.read())
    return cache_path.read_bytes(), cache_path


def load_remote_image(url, cache_root):
    data, cache_path = image_bytes(url, cache_root)
    image = Image.open(io.BytesIO(data))
    image.load()
    return image, cache_path


def card_location(card):
    card_id = int(card["CardID"])
    decks = card.get("CustomDeck") or {}
    deck_key = card_id // 100
    deck = decks.get(str(deck_key)) or decks.get(deck_key)
    if deck is None:
        raise KeyError(f"Card {card_id} has no custom deck {deck_key}")
    return CardLocation(card_id, deck_key, card_id - deck_key * 100, deck)


def crop_grid(image, slot, width_count, height_count):
    column = slot % width_count
    row = slot // width_count
    if row >= height_count:
        raise ValueError(
            f"Card slot {slot} is outside a {width_count}x{height_count} sheet"
        )
    left = round(image.width * column / width_count)
    right = round(image.width * (column + 1) / width_count)
    top = round(image.height * row / height_count)
    bottom = round(image.height * (row + 1) / height_count)
    return image.crop((left, top, right, bottom))


def save_jpeg(image, destination, quality=95):
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(
        destination,
        "JPEG",
        quality=quality,
        optimize=True,
        subsampling=0,
    )


def write_card(card, destination, cache_root, rotation=0):
    location = card_location(card)
    deck = location.deck
    width_count = int(deck["NumWidth"])
    height_count = int(deck["NumHeight"])
    face, face_cache = load_remote_image(deck["FaceURL"], cache_root)
    cropped_face = crop_grid(
        face, location.slot, width_count, height_count
    )
    if rotation:
        cropped_face = cropped_face.rotate(rotation, expand=True)
    save_jpeg(cropped_face, destination)

    back, back_cache = load_remote_image(deck["BackURL"], cache_root)
    if deck.get("UniqueBack"):
        back = crop_grid(back, location.slot, width_count, height_count)
    if rotation:
        back = back.rotate(rotation, expand=True)
    save_jpeg(back, destination.with_name(f"{destination.stem}_BACK.jpg"))
    return {
        "cardId": location.card_id,
        "deckKey": location.deck_key,
        "slot": location.slot,
        "faceUrl": deck["FaceURL"],
        "backUrl": deck["BackURL"],
        "faceCache": str(face_cache),
        "backCache": str(back_cache),
        "output": str(destination),
    }


def find_deck_cards(
    apostle_bag, deck_key, level_index, card_type, repeated_deck_key=False
):
    matching_groups = []
    for obj in children(apostle_bag):
        cards = [
            {
                **child,
                "CustomDeck": child.get("CustomDeck")
                or obj.get("CustomDeck")
                or {},
            }
            for child in children(obj)
            if child.get("CardID") is not None
        ]
        if not cards:
            continue
        key_counts = Counter(int(card["CardID"]) // 100 for card in cards)
        primary_key = key_counts.most_common(1)[0][0]
        if primary_key != deck_key:
            continue
        if repeated_deck_key and len(cards) == 6:
            block = min(int(card["CardID"]) % 100 for card in cards) // 6
            if block != level_index:
                continue
        matching_groups.append((primary_key, cards))

    if len(matching_groups) > 1:
        largest_size = max(len(cards) for _, cards in matching_groups)
        matching_groups = [
            group for group in matching_groups if len(group[1]) == largest_size
        ]
    if len(matching_groups) != 1:
        raise ValueError(
            f"Expected one {card_type} deck for key {deck_key}, "
            f"found {len(matching_groups)}"
        )
    primary_key, cards = matching_groups[0]
    return sorted(
        cards,
        key=lambda card: (
            int(card["CardID"]) // 100 != primary_key,
            int(card["CardID"]) % 100,
        ),
    )


def extract_standard_decks(apostle_bag, code, output_root, cache_root):
    report = []
    for card_type, deck_keys in STANDARD_DECK_KEYS[code].items():
        for level_index, deck_key in enumerate(deck_keys):
            level = LEVELS[level_index]
            sheet_level_index = (
                len(LEVELS) - 1 - level_index
                if code == "DRAGON_OF_PHOBOS" and card_type == "BP"
                else level_index
            )
            cards = find_deck_cards(
                apostle_bag,
                deck_key,
                sheet_level_index,
                card_type,
                repeated_deck_key=deck_keys.count(deck_key) > 1,
            )
            for index, card in enumerate(cards, 1):
                destination = (
                    output_root
                    / code
                    / f"{code}_{card_type}_{level}_{index:03d}.jpg"
                )
                rotation = (
                    90
                    if code == "DAHAKA" and card_type == "AI"
                    else 0
                )
                item = write_card(
                    card,
                    destination,
                    cache_root,
                    rotation=rotation,
                )
                item.update({"kind": card_type, "level": level, "index": index})
                report.append(item)
    return report


def extract_special_decks(apostle_bag, code, output_root, cache_root):
    if code != "TITAN_X":
        return []
    cards = find_deck_cards(
        apostle_bag,
        TITAN_FEINT_DECK_KEY,
        0,
        "FEINT",
    )
    report = []
    for index, card in enumerate(cards, 1):
        destination = (
            output_root
            / code
            / f"{code}_FEINT_X_{index:03d}.jpg"
        )
        item = write_card(card, destination, cache_root)
        item.update({"kind": "FEINT", "level": "X", "index": index})
        report.append(item)
    return report


def longest_consecutive_bounds(values):
    if not values:
        raise ValueError("Cannot find bounds in an empty coordinate list")
    best_start = current_start = previous = values[0]
    best_end = previous + 1
    for value in values[1:]:
        if value != previous + 1:
            if previous + 1 - current_start > best_end - best_start:
                best_start, best_end = current_start, previous + 1
            current_start = value
        previous = value
    if previous + 1 - current_start > best_end - best_start:
        best_start, best_end = current_start, previous + 1
    return best_start, best_end


def panel_content_bbox(image):
    gray = image.convert("L")
    width, height = gray.size
    dark = gray.point(lambda value: 255 if value < 225 else 0)
    column_fractions = dark.resize((width, 1), Image.Resampling.BOX)
    row_fractions = dark.resize((1, height), Image.Resampling.BOX)
    xs = [
        x
        for x, value in enumerate(column_fractions.get_flattened_data())
        if value / 255 >= 0.35
    ]
    ys = [
        y
        for y, value in enumerate(row_fractions.get_flattened_data())
        if value / 255 >= 0.35
    ]
    if not xs or not ys:
        raise ValueError("Could not detect the panel bounds")
    left, right = longest_consecutive_bounds(xs)
    top, bottom = longest_consecutive_bounds(ys)
    return left, top, right, bottom


def extract_hd_panel(code, panel_root, output_root):
    page_index, rotation = PANEL_PAGE_BY_CODE[code]
    pages = sorted(panel_root.glob("*.png"))
    if len(pages) <= page_index:
        raise FileNotFoundError(f"Missing HD panel page {page_index} for {code}")
    page = Image.open(pages[page_index]).convert("RGB")
    if rotation:
        page = page.rotate(rotation, expand=True)
    bounds = panel_content_bbox(page)
    panel = page.crop(bounds)
    destination = output_root / code / f"{code}.jpg"
    save_jpeg(panel, destination, quality=97)
    return {
        "kind": "PANEL",
        "page": str(pages[page_index]),
        "rotation": rotation,
        "bounds": bounds,
        "output": str(destination),
        "size": panel.size,
    }


def top_level_single_cards(apostle_bag):
    result = []
    for card in children(apostle_bag):
        if card.get("CardID") is None:
            continue
        location = card_location(card)
        # Deck 96 on the shared 2x4 sheet contains the eight panels. They are
        # replaced by the higher-resolution localized B11 pages.
        if (
            location.deck_key == 96
            and int(location.deck.get("NumWidth", 0)) == 2
            and int(location.deck.get("NumHeight", 0)) == 4
        ):
            continue
        result.append(card)
    return result


def load_card_images(card, cache_root):
    location = card_location(card)
    deck = location.deck
    width_count = int(deck["NumWidth"])
    height_count = int(deck["NumHeight"])
    face, face_cache = load_remote_image(deck["FaceURL"], cache_root)
    face = crop_grid(face, location.slot, width_count, height_count)
    back, back_cache = load_remote_image(deck["BackURL"], cache_root)
    if deck.get("UniqueBack"):
        back = crop_grid(back, location.slot, width_count, height_count)
    return location, face, back, face_cache, back_cache


def extract_dahaka_routine_signature(card, output_root, cache_root):
    location, face, back, face_cache, back_cache = load_card_images(
        card, cache_root
    )
    midpoint = face.width // 2
    halves = (
        ("ROUTINE", face.crop((0, 0, midpoint, face.height))),
        ("SIGNATURE", face.crop((midpoint, 0, face.width, face.height))),
    )
    report = []
    for kind, half in halves:
        card_image = half.rotate(90, expand=True)
        destination = (
            output_root / "DAHAKA" / f"DAHAKA_{kind}_X_001.jpg"
        )
        save_jpeg(card_image, destination)

        upright_back = back.rotate(90, expand=True).convert("RGB")
        fitted_back = ImageOps.contain(
            upright_back, card_image.size, Image.Resampling.LANCZOS
        )
        background = Image.new("RGB", card_image.size, upright_back.getpixel((0, 0)))
        background.paste(
            fitted_back,
            (
                (background.width - fitted_back.width) // 2,
                (background.height - fitted_back.height) // 2,
            ),
        )
        save_jpeg(
            background,
            destination.with_name(f"{destination.stem}_BACK.jpg"),
        )
        report.append(
            {
                "kind": kind,
                "cardId": location.card_id,
                "deckKey": location.deck_key,
                "slot": location.slot,
                "faceUrl": location.deck["FaceURL"],
                "backUrl": location.deck["BackURL"],
                "faceCache": str(face_cache),
                "backCache": str(back_cache),
                "output": str(destination),
                "source": "TTS combined card",
            }
        )
    return report


def extract_mapped_extras(apostle_bag, code, output_root, cache_root):
    report = []
    mappings = EXTRA_CARD_FILES[code]
    for card in sorted(
        top_level_single_cards(apostle_bag),
        key=lambda item: int(item["CardID"]),
    ):
        card_id = int(card["CardID"])
        if card_id not in mappings:
            raise ValueError(f"Unclassified {code} extra card: {card_id}")
        if code == "DAHAKA" and card_id == 9600:
            report.extend(
                extract_dahaka_routine_signature(
                    card, output_root, cache_root
                )
            )
            continue
        file_name = mappings[card_id]
        if file_name is None:
            report.append(
                {
                    "kind": "IGNORED",
                    "cardId": card_id,
                    "reason": "duplicate panel",
                }
            )
            continue
        destination = output_root / code / file_name
        item = write_card(card, destination, cache_root)
        item.update({"kind": file_name.split("_")[-3], "source": "TTS"})
        report.append(item)
        if code == "MIDASCORE" and card_id == 9800:
            for stale_name in (
                "MIDASCORE_AI_X_001.jpg",
                "MIDASCORE_AI_X_001_BACK.jpg",
            ):
                stale = output_root / code / stale_name
                if stale.exists():
                    stale.unlink()
    return report


def scaled_bounds(values, source_size, target_size):
    return tuple(round(value * target_size / source_size) for value in values)


def crop_b12_grid_card(page, row, column):
    x_edges = scaled_bounds(
        B12_GRID_X, B12_REFERENCE_SIZE[0], page.width
    )
    y_edges = scaled_bounds(
        B12_GRID_Y, B12_REFERENCE_SIZE[1], page.height
    )
    return page.crop(
        (
            x_edges[column] + 1,
            y_edges[row] + 1,
            x_edges[column + 1],
            y_edges[row + 1],
        )
    )


def extract_hd_cards(code, card_root, output_root):
    pages = sorted(card_root.glob("*.png"))
    if len(pages) < 5:
        raise FileNotFoundError("B12 must contain at least five PNG pages")
    report = []
    page_cache = {}
    for mapped_code, level, index, page_index, row, column in HD_TRAIT_CARDS:
        if mapped_code != code:
            continue
        if page_index not in page_cache:
            page_cache[page_index] = Image.open(
                pages[page_index]
            ).convert("RGB")
        page = page_cache[page_index]
        card = crop_b12_grid_card(page, row, column)
        destination = (
            output_root
            / code
            / f"{code}_TR_{level}_{index:03d}.jpg"
        )
        save_jpeg(card, destination, quality=97)
        report.append(
            {
                "kind": "TR",
                "level": level,
                "index": index,
                "page": str(pages[page_index]),
                "grid": {"row": row, "column": column},
                "output": str(destination),
                "size": card.size,
                "source": "B12 HD",
            }
        )

    for mapped_code, file_name, page_index, row, column in HD_SPECIAL_CARDS:
        if mapped_code != code:
            continue
        if page_index not in page_cache:
            page_cache[page_index] = Image.open(
                pages[page_index]
            ).convert("RGB")
        page = page_cache[page_index]
        card = crop_b12_grid_card(page, row, column)
        destination = output_root / code / file_name
        save_jpeg(card, destination, quality=97)
        report.append(
            {
                "kind": "HD_OVERRIDE",
                "page": str(pages[page_index]),
                "grid": {"row": row, "column": column},
                "output": str(destination),
                "size": card.size,
                "source": "B12 HD",
            }
        )

    if code == "DAHAKA":
        page = Image.open(pages[4]).convert("RGB")
        reference_width, reference_height = 2481, 3508
        x_edges = scaled_bounds(
            (123, 1164, 2206), reference_width, page.width
        )
        top, bottom = scaled_bounds(
            (2273, 3018), reference_height, page.height
        )
        destinations = (
            output_root / code / "DAHAKA_TR_O_001.jpg",
            output_root / code / "DAHAKA_TR_O_001_BACK.jpg",
        )
        for destination, left, right, face in (
            (destinations[0], x_edges[0], x_edges[1], "front"),
            (destinations[1], x_edges[1], x_edges[2], "back"),
        ):
            card = page.crop((left, top, right, bottom))
            save_jpeg(card, destination, quality=97)
            report.append(
                {
                    "kind": "TR",
                    "level": "O",
                    "index": 1,
                    "face": face,
                    "page": str(pages[4]),
                    "bounds": (left, top, right, bottom),
                    "output": str(destination),
                    "size": card.size,
                    "source": "B12 HD",
                }
            )
    return report


def extract_hd_conditions(card_root, output_root):
    pages = sorted(card_root.glob("*.png"))
    if len(pages) <= HD_CONDITION_PAGE_INDEX:
        raise FileNotFoundError(
            f"Missing B12 condition page {HD_CONDITION_PAGE_INDEX}"
        )
    page_path = pages[HD_CONDITION_PAGE_INDEX]
    page = Image.open(page_path).convert("RGB")
    x_edges = scaled_bounds(
        HD_CONDITION_X, B12_REFERENCE_SIZE[0], page.width
    )
    y_edges = scaled_bounds(
        HD_CONDITION_Y, B12_REFERENCE_SIZE[1], page.height
    )
    destination_root = output_root / "other" / "status"
    report = []
    for index, (key, title, row, column) in enumerate(HD_CONDITIONS, 1):
        card = page.crop(
            (
                x_edges[column] + 1,
                y_edges[row] + 1,
                x_edges[column + 1],
                y_edges[row + 1],
            )
        )
        destination = destination_root / f"C45_STATUS_{index:03d}.jpg"
        save_jpeg(card, destination, quality=97)
        report.append(
            {
                "kind": "STATUS",
                "key": key,
                "title": title,
                "page": str(page_path),
                "grid": {"row": row, "column": column},
                "output": str(destination),
                "size": card.size,
                "source": "B12 HD",
            }
        )
    return report


def extract_global_wishes(output_root, cache_root):
    face, face_cache = load_remote_image(GLOBAL_WISH_FACE_URL, cache_root)
    back, back_cache = load_remote_image(GLOBAL_WISH_BACK_URL, cache_root)
    destination_root = output_root / "DEMIDJINN"
    report = []
    for slot, level in enumerate(("I", "II", "III", "IV")):
        card = crop_grid(face, slot, 2, 2)
        destination = (
            destination_root / f"DEMIDJINN_WISH_{level}_001.jpg"
        )
        save_jpeg(card, destination, quality=97)

        fitted_back = ImageOps.fit(
            back.convert("RGB"), card.size, Image.Resampling.LANCZOS
        )
        back_destination = destination.with_name(
            f"{destination.stem}_BACK.jpg"
        )
        save_jpeg(fitted_back, back_destination, quality=97)
        report.append(
            {
                "kind": "GLOBAL_WISH",
                "level": level,
                "slot": slot,
                "faceUrl": GLOBAL_WISH_FACE_URL,
                "backUrl": GLOBAL_WISH_BACK_URL,
                "faceCache": str(face_cache),
                "backCache": str(back_cache),
                "output": str(destination),
                "size": card.size,
                "source": "TTS",
            }
        )
    return report


def make_extra_contact_sheet(code, items, report_root):
    image_items = []
    seen_outputs = set()
    for item in items:
        output = item.get("output")
        if not output or output in seen_outputs:
            continue
        seen_outputs.add(output)
        image_items.append(item)
    if not image_items:
        return None
    thumbs = []
    for item in image_items:
        path = Path(item["output"])
        image = Image.open(path).convert("RGB")
        image.thumbnail((320, 450), Image.Resampling.LANCZOS)
        thumbs.append((path.name, image.copy()))
    columns = 4
    cell_width, cell_height = 340, 500
    rows = (len(thumbs) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), "white")
    draw = ImageDraw.Draw(sheet)
    for index, (name, image) in enumerate(thumbs):
        x = (index % columns) * cell_width
        y = (index // columns) * cell_height
        sheet.paste(image, (x + (cell_width - image.width) // 2, y + 34))
        draw.text((x + 8, y + 8), name, fill="black")
    report_root.mkdir(parents=True, exist_ok=True)
    destination = report_root / f"{code}.jpg"
    sheet.save(destination, "JPEG", quality=92)
    return str(destination)


def validate_generated_assets(output_root):
    errors = []
    checked_files = 0
    for code, expected_types in EXPECTED_STANDARD_COUNTS.items():
        directory = output_root / code
        panel = directory / f"{code}.jpg"
        if not panel.exists():
            errors.append(f"{code}: missing panel")
        else:
            checked_files += 1

        for kind in ("ROUTINE", "SIGNATURE"):
            front = directory / f"{code}_{kind}_X_001.jpg"
            back = directory / f"{code}_{kind}_X_001_BACK.jpg"
            for path in (front, back):
                if not path.exists():
                    errors.append(f"{code}: missing {path.name}")
                else:
                    checked_files += 1

        for card_type, levels in expected_types.items():
            for level, expected_count in levels.items():
                fronts = [
                    path
                    for path in directory.glob(
                        f"{code}_{card_type}_{level}_*.jpg"
                    )
                    if not path.stem.endswith("_BACK")
                ]
                if code == "TITAN_X" and card_type == "BP":
                    fronts = [
                        path
                        for path in fronts
                        if (
                            level,
                            int(path.stem.rsplit("_", 1)[-1]),
                        )
                        not in TITAN_X_OVERSTEP_KEYS
                    ]
                if len(fronts) != expected_count:
                    errors.append(
                        f"{code} {card_type} {level}: "
                        f"expected {expected_count}, found {len(fronts)}"
                    )
                for front in fronts:
                    back = front.with_name(f"{front.stem}_BACK.jpg")
                    if not back.exists():
                        errors.append(f"{code}: missing {back.name}")
                    else:
                        checked_files += 2
                        if code == "DAHAKA" and card_type == "AI":
                            for path in (front, back):
                                try:
                                    with Image.open(path) as image:
                                        if image.width >= image.height:
                                            errors.append(
                                                f"DAHAKA: {path.name} "
                                                "is not counter-clockwise portrait"
                                            )
                                except OSError as error:
                                    errors.append(
                                        f"DAHAKA: invalid {path.name}: {error}"
                                    )

        stale = list(directory.glob(f"{code}_EX_*"))
        if stale:
            errors.append(
                f"{code}: stale unclassified files: "
                + ", ".join(path.name for path in stale)
            )

    titan_directory = output_root / "TITAN_X"
    for index in range(1, 11):
        front = titan_directory / f"TITAN_X_FEINT_X_{index:03d}.jpg"
        back = titan_directory / f"TITAN_X_FEINT_X_{index:03d}_BACK.jpg"
        for path in (front, back):
            if not path.exists():
                errors.append(f"TITAN_X: missing {path.name}")
            else:
                checked_files += 1

    hd_fronts = [
        output_root / code / f"{code}_TR_{level}_{index:03d}.jpg"
        for code, level, index, *_ in HD_TRAIT_CARDS
    ]
    hd_fronts.extend(
        (
            output_root / "DAHAKA" / "DAHAKA_TR_O_001.jpg",
            output_root / "DAHAKA" / "DAHAKA_TR_O_001_BACK.jpg",
        )
    )
    hd_fronts.extend(
        output_root / code / file_name
        for code, file_name, *_ in HD_SPECIAL_CARDS
    )
    for path in hd_fronts:
        if not path.exists():
            errors.append(f"missing HD card: {path.name}")
        else:
            checked_files += 1

    for index, *_ in enumerate(HD_CONDITIONS, 1):
        path = output_root / "other" / "status" / f"C45_STATUS_{index:03d}.jpg"
        if not path.exists():
            errors.append(f"missing HD condition: {path.name}")
        else:
            checked_files += 1

    for level in ("I", "II", "III", "IV"):
        front = output_root / "DEMIDJINN" / f"DEMIDJINN_WISH_{level}_001.jpg"
        back = front.with_name(f"{front.stem}_BACK.jpg")
        for path in (front, back):
            if not path.exists():
                errors.append(f"DEMIDJINN: missing {path.name}")
            else:
                checked_files += 1

    if errors:
        raise ValueError("Asset validation failed:\n- " + "\n- ".join(errors))
    return {"status": "ok", "checkedFiles": checked_files}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Extract Cycle IV-V AIBP assets from a TTS save."
    )
    parser.add_argument("--save", type=Path, default=DEFAULT_SAVE)
    parser.add_argument("--panel-root", type=Path, default=DEFAULT_PANEL_ROOT)
    parser.add_argument("--card-root", type=Path, default=DEFAULT_CARD_ROOT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove generated C4-C5 apostle directories before extraction.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    data = json.loads(args.save.read_text(encoding="utf-8"))
    result = {
        "save": str(args.save),
        "panelRoot": str(args.panel_root),
        "cardRoot": str(args.card_root),
        "apostles": {},
        "shared": {},
    }
    contact_root = args.report.parent / "c45-aibp-extra-contact-sheets"

    for cycle_name, apostles in CYCLES.items():
        cycle = next(
            (
                found
                for root in data.get("ObjectStates", [])
                if (
                    found := find_first(
                        root, lambda obj: obj.get("Nickname") == cycle_name
                    )
                )
                is not None
            ),
            None,
        )
        if cycle is None:
            raise KeyError(f"Cycle bag not found: {cycle_name}")
        primordial_bag = find_first(
            cycle,
            lambda obj: obj.get("Nickname") in {"Primordial", "Primordials"},
        )
        if primordial_bag is None:
            raise KeyError(f"Primordial bag not found in {cycle_name}")

        bags_by_name = {
            obj.get("Nickname"): obj
            for obj in children(primordial_bag)
            if obj.get("Nickname")
        }
        for display_name, code in apostles.items():
            apostle_bag = bags_by_name.get(display_name)
            if apostle_bag is None:
                raise KeyError(f"Apostle bag not found: {display_name}")
            destination = args.output / code
            if args.clean and destination.exists():
                shutil.rmtree(destination)
            panel = extract_hd_panel(code, args.panel_root, args.output)
            cards = extract_standard_decks(
                apostle_bag, code, args.output, args.cache
            )
            special_cards = extract_special_decks(
                apostle_bag, code, args.output, args.cache
            )
            extras = extract_mapped_extras(
                apostle_bag, code, args.output, args.cache
            )
            hd_cards = extract_hd_cards(code, args.card_root, args.output)
            contact_sheet = make_extra_contact_sheet(
                code, special_cards + extras + hd_cards, contact_root
            )
            result["apostles"][code] = {
                "cycle": cycle_name,
                "displayName": display_name,
                "panel": panel,
                "cards": cards,
                "specialCards": special_cards,
                "extras": extras,
                "hdCards": hd_cards,
                "extraContactSheet": contact_sheet,
            }
            print(
                f"{code}: panel=HD, regular={len(cards)}, "
                f"special={len(special_cards)}, extras={len(extras)}, "
                f"HD cards={len(hd_cards)}"
            )

    result["shared"]["conditions"] = extract_hd_conditions(
        args.card_root, args.output
    )
    result["shared"]["globalWishes"] = extract_global_wishes(
        args.output, args.cache
    )
    result["validation"] = validate_generated_assets(args.output)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Report: {args.report}")


if __name__ == "__main__":
    main()
