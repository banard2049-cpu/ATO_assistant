import html
import json
import re
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WORKSHOP_JSON = Path(r"D:\files\My Games\Tabletop Simulator\Mods\Workshop\(Don)Aeon Trespass Odyssey.json")
TTS_IMAGES = Path(r"D:\files\My Games\Tabletop Simulator\Mods\Images")
GEAR_DATA_PATH = ROOT / "technology" / "ato_gear_production.json"
OUTPUT_DIR = ROOT / "technology" / "images" / "gear_card_audit"
JSON_OUT = ROOT / "technology" / "gear_card_audit.json"
HTML_OUT = ROOT / "technology" / "gear_card_audit.html"


def english_name(full_name):
    return re.sub(r"[\u3400-\u9fff].*", "", full_name).strip()


def normalize_title(value):
    value = value.casefold()
    value = value.replace("’", "'")
    value = re.sub(r"\bprotype\b", "prototype", value)
    value = re.sub(r"\s+", " ", value).strip()
    parts = [part.strip() for part in value.split("/") if part.strip()]
    normalized_parts = []
    for part in parts:
        part = re.sub(r"\([^)]*\)", "", part)
        part = re.sub(r"[^a-z0-9]+", "", part)
        if part:
            normalized_parts.append(part)
    return "/".join(sorted(normalized_parts))


def cache_path_for_url(url):
    stem = re.sub(r"[^A-Za-z0-9]", "", url or "")
    for ext in (".png", ".jpg", ".jpeg"):
        path = TTS_IMAGES / f"{stem}{ext}"
        if path.exists():
            return path
    return None


def iter_objects(value, path=""):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from iter_objects(child, f"{path}/{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from iter_objects(child, f"{path}/{index}")


def crop_card(face_path, out_path, card_id, deck_id, columns, rows):
    index = card_id - deck_id * 100
    # TTS deck cards are 1-based inside the deck id block.
    index -= 1
    if index < 0 or index >= columns * rows:
        return False
    col = index % columns
    row = index // columns
    with Image.open(face_path) as image:
        card_w = image.width // columns
        card_h = image.height // rows
        left = col * card_w
        upper = row * card_h
        right = image.width if col == columns - 1 else left + card_w
        lower = image.height if row == rows - 1 else upper + card_h
        image.crop((left, upper, right, lower)).convert("RGB").save(out_path, optimize=True)
    return True


def main():
    with GEAR_DATA_PATH.open("r", encoding="utf-8") as file:
        gear_data = json.load(file)
    gear_lookup = {}
    for gear_id, full_name in gear_data["gearCards"].items():
        key = normalize_title(english_name(full_name))
        if key:
            gear_lookup.setdefault(key, []).append(
                {
                    "gearId": gear_id,
                    "productionName": full_name.strip(),
                }
            )

    with WORKSHOP_JSON.open("r", encoding="utf-8-sig") as file:
        workshop_data = json.load(file)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    gear_decks = []
    for path, obj in iter_objects(workshop_data):
        if obj.get("Name") == "Deck" and "gear" in (obj.get("Nickname") or "").casefold():
            gear_decks.append((path, obj))

    rows = []
    for deck_path, deck_obj in gear_decks:
        deck_name = (deck_obj.get("Nickname") or "").strip()
        deck_custom = deck_obj.get("CustomDeck") or {}
        for obj in deck_obj.get("ContainedObjects") or []:
            row = build_audit_row(obj, deck_name, deck_path, deck_custom, gear_lookup, len(rows) + 1)
            if row:
                rows.append(row)

    rows.sort(key=lambda row: (row["deckName"], row["cardId"], row["ttsName"].casefold(), row["guid"]))
    name_counts = {}
    for row in rows:
        name_counts[row["ttsName"]] = name_counts.get(row["ttsName"], 0) + 1
    for row in rows:
        row["sameNameCount"] = name_counts[row["ttsName"]]

    JSON_OUT.write_text(json.dumps({"source": str(WORKSHOP_JSON), "deckCount": len(gear_decks), "count": len(rows), "rows": rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    write_html(rows, gear_decks)
    print(f"Wrote {len(rows)} audit rows from {len(gear_decks)} gear decks")
    print(JSON_OUT)
    print(HTML_OUT)


def build_audit_row(obj, deck_name, deck_path, deck_custom, gear_lookup, sequence):
        nickname = (obj.get("Nickname") or "").strip()
        card_id = obj.get("CardID")
        if not nickname or not isinstance(card_id, int):
            return None

        key = normalize_title(nickname)
        matched_production_cards = gear_lookup.get(key, [])

        deck_id = card_id // 100
        deck = (obj.get("CustomDeck") or {}).get(str(deck_id)) or deck_custom.get(str(deck_id))
        if not isinstance(deck, dict):
            return None

        face_path = cache_path_for_url(deck.get("FaceURL"))
        if not face_path:
            return None

        columns = int(deck.get("NumWidth") or 1)
        rows_count = int(deck.get("NumHeight") or 1)
        object_guid = obj.get("GUID") or ""
        object_suffix = re.sub(r"[^A-Za-z0-9]+", "", object_guid)[:12] or str(sequence)
        out_name = f"{card_id}_{object_suffix}_{re.sub(r'[^A-Za-z0-9]+', '_', nickname).strip('_')[:60]}.jpg"
        out_path = OUTPUT_DIR / out_name
        if not crop_card(face_path, out_path, card_id, deck_id, columns, rows_count):
            return None

        return {
            "deckName": deck_name,
            "deckPath": deck_path,
            "ttsName": nickname,
            "cardId": card_id,
            "guid": object_guid,
            "deckId": deck_id,
            "image": f"images/gear_card_audit/{out_name}",
            "matchedProductionCards": matched_production_cards,
            "sourceImage": str(face_path),
        }


def write_html(rows, gear_decks):
    html_rows = []
    for row in rows:
        production = "<br>".join(
            f"{html.escape(item['gearId'])}: {html.escape(item['productionName'])}"
            for item in row["matchedProductionCards"]
        ) or "未匹配生产表"
        html_rows.append(
            "<tr>"
            f"<td><img src=\"{html.escape(row['image'])}\" alt=\"{html.escape(row['ttsName'])}\"></td>"
            f"<td>{html.escape(row['deckName'])}</td>"
            f"<td class=\"name\">{html.escape(row['ttsName'])}</td>"
            f"<td>{row['cardId']}</td>"
            f"<td>{html.escape(row['guid'])}</td>"
            f"<td>{row['deckId']}</td>"
            f"<td>{row['sameNameCount']}</td>"
            f"<td>{production}</td>"
            "</tr>"
        )
    HTML_OUT.write_text(
        """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>ATO 装备卡图-卡名对照</title>
<style>
body { margin: 0; font-family: Arial, "Microsoft YaHei", sans-serif; background: #f6f7f3; color: #20262b; }
main { width: min(1400px, 100%); margin: 0 auto; padding: 20px; }
h1 { font-size: 22px; margin: 0 0 8px; }
.meta { color: #66727d; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { border: 1px solid #d8dee4; padding: 8px; vertical-align: top; text-align: left; }
th { position: sticky; top: 0; background: #eef3f4; z-index: 1; }
img { width: 140px; height: auto; display: block; border-radius: 4px; }
.name { font-weight: 800; }
</style>
</head>
<body>
<main>
<h1>ATO 装备卡图-卡名对照</h1>
<div class="meta">只来自 TTS 中明确命名为 Gear 的牌堆：""" + html.escape(", ".join(deck[1].get("Nickname", "") for deck in gear_decks)) + """。逐行保留卡图 + Nickname + CardID + GUID，用于人工核对。</div>
<table>
<thead><tr><th>卡图</th><th>牌堆</th><th>TTS 卡名</th><th>CardID</th><th>GUID</th><th>Deck</th><th>同名数量</th><th>生产表匹配项</th></tr></thead>
<tbody>
"""
        + "\n".join(html_rows)
        + """
</tbody>
</table>
</main>
</body>
</html>
""",
        encoding="utf-8",
    )

if __name__ == "__main__":
    main()
