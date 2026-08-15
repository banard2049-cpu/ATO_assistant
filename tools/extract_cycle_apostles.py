import json
import re
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SAVE_PATH = ROOT / "Workshop" / "(Don)Aeon Trespass Odyssey.json"
IMAGE_ROOT = ROOT / "Images"
OUTPUT_ROOT = ROOT / "aibp" / "ps"

APOSTLES = {
    "Hekaton": "HEKATON",
    "Labyrinthauros": "LABYRINTHAUROS",
    "Hermesian Pursuer": "HERMESIAN_PURSUER",
    "Alpha Temenos": "ALPHA_TEMENOS",
    "Hypertime Oracle": "HYPERTIME_ORACLE",
    "Icarian Harpy": "ICARIAN_HARPY",
    "Sun Descendant": "SUN_DESCENDANT",
}

LEVELS = {"0": "O", "1": "I", "2": "II", "3": "III"}


def asset_file(url):
    key = re.sub(r"[^a-zA-Z0-9]", "", url)
    matches = list(IMAGE_ROOT.glob(f"{key}.*"))
    if not matches:
        raise FileNotFoundError(f"Missing local image for {url}")
    return matches[0]


def walk(value, ancestors=()):
    if isinstance(value, dict):
        yield value, ancestors
        label = value.get("Nickname") or value.get("GMNotes") or value.get("Name")
        next_ancestors = ancestors + ((label,) if label else ())
        for key in ("ObjectStates", "ContainedObjects"):
            for child in value.get(key, []):
                yield from walk(child, next_ancestors)
        for child in value.get("States", {}).values():
            yield from walk(child, next_ancestors)


def custom_deck(card):
    decks = card.get("CustomDeck") or {}
    if not decks:
        return None, None
    deck_key = next(iter(decks))
    return int(deck_key), decks[deck_key]


def crop_card(card, destination):
    deck_key, deck = custom_deck(card)
    if deck is None or "CardID" not in card:
        return False
    slot = int(card["CardID"]) - deck_key * 100
    width_count = int(deck["NumWidth"])
    height_count = int(deck["NumHeight"])
    source = asset_file(deck["FaceURL"])
    with Image.open(source) as image:
        left = round(image.width * (slot % width_count) / width_count)
        right = round(image.width * ((slot % width_count) + 1) / width_count)
        top = round(image.height * (slot // width_count) / height_count)
        bottom = round(image.height * ((slot // width_count) + 1) / height_count)
        cropped = image.crop((left, top, right, bottom)).convert("RGB")
        destination.parent.mkdir(parents=True, exist_ok=True)
        cropped.save(destination, quality=95)
    return True


def card_name(code, card, ancestors, counters):
    notes = card.get("GMNotes", "")
    nickname = card.get("Nickname", "")
    if notes in ("Routine", "Signature"):
        return f"{code}_{notes.upper()}_X_001.jpg"
    group_label = next(
        (label for label in reversed(ancestors) if re.fullmatch(r"(AI|BP)[0-3]", label)),
        notes,
    )
    match = re.fullmatch(r"(AI|BP)([0-3])", group_label)
    if match:
        card_type, level_number = match.groups()
        level = LEVELS[level_number]
        key = (card_type, level)
        counters[key] = counters.get(key, 0) + 1
        return f"{code}_{card_type}_{level}_{counters[key]:03}.jpg"
    if notes == "TraitAttack":
        key = ("TR", "X")
        counters[key] = counters.get(key, 0) + 1
        return f"{code}_TR_X_{counters[key]:03}.jpg"
    if notes == "Trait":
        level = "VI" if code == "ALPHA_TEMENOS" and nickname == "Song of Hopelessness" else "I"
        key = ("TR", level)
        counters[key] = counters.get(key, 0) + 1
        return f"{code}_TR_{level}_{counters[key]:03}.jpg"
    if nickname == "Flare":
        key = ("FL", "X")
        counters[key] = counters.get(key, 0) + 1
        return f"{code}_FL_X_{counters[key]:03}.jpg"
    if nickname == "Gaze of Temenos":
        return f"{code}_TP_X_001.jpg"
    if notes in ("Status",) or nickname == "In Medias Res":
        key = ("AI", "X")
        counters[key] = counters.get(key, 0) + 1
        return f"{code}_AI_X_{counters[key]:03}.jpg"
    return None


def extract_apostle(all_objects, display_name, code):
    objects = [
        (obj, ancestors)
        for obj, ancestors in all_objects
        if "Primordials" in ancestors and display_name in ancestors
    ]
    output = OUTPUT_ROOT / code
    output.mkdir(parents=True, exist_ok=True)

    sheet = next((obj for obj, _ in objects if obj.get("GMNotes") == "Sheet"), None)
    if sheet:
        image_url = sheet.get("CustomImage", {}).get("ImageURL")
        if image_url:
            shutil.copyfile(asset_file(image_url), output / f"{code}.jpg")

    counters = {}
    written = []
    seen_guids = set()

    for obj, _ in objects:
        match = re.fullmatch(r"(AI|BP)([1-3])", obj.get("GMNotes", ""))
        if not match or not obj.get("DeckIDs") or not obj.get("CustomDeck"):
            continue
        card_type, level_number = match.groups()
        level = LEVELS[level_number]
        for index, card_id in enumerate(obj["DeckIDs"], start=1):
            synthetic_card = {"CardID": card_id, "CustomDeck": obj["CustomDeck"]}
            filename = f"{code}_{card_type}_{level}_{index:03}.jpg"
            if crop_card(synthetic_card, output / filename):
                written.append(filename)

    for obj, _ in objects:
        if obj.get("Nickname") != "Flare" or not obj.get("DeckIDs") or not obj.get("CustomDeck"):
            continue
        for index, card_id in enumerate(obj["DeckIDs"], start=1):
            synthetic_card = {"CardID": card_id, "CustomDeck": obj["CustomDeck"]}
            filename = f"{code}_FL_X_{index:03}.jpg"
            if crop_card(synthetic_card, output / filename):
                written.append(filename)

    for obj, ancestors in objects:
        if obj.get("Name") not in ("Card", "CardCustom"):
            continue
        if any(re.fullmatch(r"(AI|BP)[1-3]", label) for label in ancestors):
            continue
        guid = obj.get("GUID")
        if guid and guid in seen_guids:
            continue
        filename = card_name(code, obj, ancestors, counters)
        if filename and crop_card(obj, output / filename):
            written.append(filename)
            if guid:
                seen_guids.add(guid)

    print(f"{code}: panel={bool(sheet)}, cards={len(written)}")


def main():
    data = json.loads(SAVE_PATH.read_text(encoding="utf-8"))
    all_objects = list(walk(data))
    for display_name, code in APOSTLES.items():
        extract_apostle(all_objects, display_name, code)


if __name__ == "__main__":
    main()
