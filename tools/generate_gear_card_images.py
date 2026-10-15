import json
import re
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WORKSHOP_JSON = Path(r"D:\files\My Games\Tabletop Simulator\Mods\Workshop\(Don)Aeon Trespass Odyssey.json")
TTS_IMAGES = Path(r"D:\files\My Games\Tabletop Simulator\Mods\Images")
GEAR_DATA_PATH = ROOT / "technology" / "ato_gear_production.json"
OUTPUT_DIR = ROOT / "technology" / "images" / "gear_cards"
MANIFEST_PATH = ROOT / "technology" / "gear_card_images.json"


# These C2/C3 secret sheets put the numbered spoiler cover on FaceURL.
# Their playable gear faces use the same grid positions on BackURL. Other
# secret sheets (including C1) already have the playable side on FaceURL.
SECRET_GEAR_COVER_SHEETS = frozenset({
    "0108AC862A7C0C3D5939C0AD9EE0399E70DF6F1F",
    "5B7BB5989D143164EC958EB6C5C8DAC585996370",
})


def gear_face_url(deck, card_id):
    face_url = deck.get("FaceURL", "")
    # Four double-sided C2 cards have playable faces on both sheets. Keep
    # their original first side instead of switching to the alternate gear.
    if ("0108ac862a7c0c3d5939c0ad9ee0399e70df6f1f" in face_url.casefold()
            and card_id % 100 in {14, 20, 26, 28}):
        return face_url
    if any(sheet.casefold() in face_url.casefold() for sheet in SECRET_GEAR_COVER_SHEETS):
        # Never silently export the spoiler cover when its reverse is missing.
        return deck.get("BackURL", "") if deck.get("UniqueBack") else ""
    return face_url


def english_name(full_name):
    return re.sub(r"[\u3400-\u9fff].*", "", full_name).strip()


def cache_name_for_url(url):
    stem = re.sub(r"[^A-Za-z0-9]", "", url)
    for ext in (".png", ".jpg", ".jpeg"):
        path = TTS_IMAGES / f"{stem}{ext}"
        if path.exists():
            return path
    return None


def iter_objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from iter_objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_objects(child)


def normalize_title(value):
    value = value.casefold()
    value = value.replace("’", "'")
    value = re.sub(r"\bprotype\b", "prototype", value)
    value = re.sub(r"\blabyrintian\b", "labyrinthian", value)
    # Spelling variants between gear list and TTS
    value = re.sub(r"\bconquerer\b", "conqueror", value)
    value = re.sub(r"\bkopesh\b", "khopesh", value)
    # Possessive 's drops (e.g. "Daedalus's Flight" vs "Daedalus Flight")
    value = re.sub(r"'s\b", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def title_key(value):
    value = normalize_title(value)
    parts = [part.strip() for part in value.split("/") if part.strip()]
    normalized_parts = []
    for part in parts:
        part = re.sub(r"\([^)]*\)", "", part)
        part = re.sub(r"[^a-z0-9]+", "", part)
        if part:
            normalized_parts.append(part)
    deduped = sorted(set(normalized_parts))
    return "/".join(deduped)


def loose_keys(value):
    """Return secondary keys for partial matching (single-side names of a multi-side gear)."""
    value = normalize_title(value)
    parts = [re.sub(r"\([^)]*\)", "", part).strip() for part in value.split("/") if part.strip()]
    keys = set()
    for part in parts:
        part = re.sub(r"[^a-z0-9]+", "", part)
        if part:
            keys.add(part)
    return keys


def build_gear_lookup(gear_names):
    lookup = {}
    for gear_id, name in gear_names.items():
        key = title_key(name)
        if not key:
            continue
        lookup.setdefault(key, []).append(gear_id)
    return lookup


def exact_gear_match(nickname, gear_lookup):
    matches = gear_lookup.get(title_key(nickname), [])
    if len(matches) == 1:
        return matches[0]
    return None


def card_position(card_id, deck_id, width, height):
    index = card_id - (deck_id * 100)
    if index < 0 or index >= width * height:
        return None
    return index % width, index // width


def crop_card(face_path, out_path, col, row, columns, rows):
    with Image.open(face_path) as image:
        card_w = image.width // columns
        card_h = image.height // rows
        left = col * card_w
        upper = row * card_h
        right = image.width if col == columns - 1 else left + card_w
        lower = image.height if row == rows - 1 else upper + card_h
        card = image.crop((left, upper, right, lower)).convert("RGB")
        card.save(out_path, optimize=True)


def main():
    with GEAR_DATA_PATH.open("r", encoding="utf-8") as file:
        gear_data = json.load(file)
    gear_names = {gear_id: english_name(name) for gear_id, name in gear_data["gearCards"].items()}
    gear_lookup = build_gear_lookup(gear_names)

    with WORKSHOP_JSON.open("r", encoding="utf-8-sig") as file:
        workshop_data = json.load(file)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    cards = {}
    missing_images = []
    duplicate_names = []

    for obj in iter_objects(workshop_data):
        nickname = obj.get("Nickname")
        card_id = obj.get("CardID")
        custom_deck = obj.get("CustomDeck")
        if not nickname or not isinstance(card_id, int) or not isinstance(custom_deck, dict):
            continue

        gear_id = exact_gear_match(nickname, gear_lookup)
        if not gear_id or gear_id in manifest:
            if gear_id in manifest:
                duplicate_names.append(gear_id)
            continue

        deck_id = card_id // 100
        deck = custom_deck.get(str(deck_id))
        if not isinstance(deck, dict):
            continue
        face_url = gear_face_url(deck, card_id)
        face_path = cache_name_for_url(face_url)
        if not face_path:
            missing_images.append((gear_id, nickname, face_url))
            continue

        columns = int(deck.get("NumWidth") or 1)
        rows = int(deck.get("NumHeight") or 1)
        position = card_position(card_id, deck_id, columns, rows)
        if not position:
            continue

        # Keep stable targets for asset packs and installed Android catalogs.
        out_name = f"{gear_id.lower()}.jpg"
        out_path = OUTPUT_DIR / out_name
        crop_card(face_path, out_path, position[0], position[1], columns, rows)
        src = f"images/gear_cards/{out_name}"
        manifest[gear_id] = src
        cards[gear_id] = {
            "src": src,
            "title": nickname.strip(),
        }

    with MANIFEST_PATH.open("w", encoding="utf-8") as file:
        json.dump(
            {
                "version": 1,
                "source": str(WORKSHOP_JSON),
                "count": len(manifest),
                "images": dict(sorted(manifest.items())),
                "cards": dict(sorted(cards.items())),
            },
            file,
            ensure_ascii=False,
            indent=2,
        )
        file.write("\n")

    print(f"Generated {len(manifest)} gear card images")
    print(f"Missing cached deck images: {len(missing_images)}")
    if missing_images:
        for gear_id, nickname, url in missing_images[:20]:
            print(f"missing {gear_id} {nickname}: {url}")


if __name__ == "__main__":
    main()
