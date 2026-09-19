#!/usr/bin/env python3
"""Classify exploration cards as resource cards and scan their resource effects.

Input
-----
tools/exploration-card-effects.json
    Per-card vision transcription of the card faces (title, every rules line and
    the diplomacy badge printed at the start of a line).
record/index.html
    The record sheet owns the resource catalog that the app can actually write
    to, so the per-cycle resource keys and the shared/storage keys are read from
    there instead of being duplicated here.

Output
------
assets/exploration-card-resources.js
    Runtime dataset: per card kind, parsed grants, conditions and the effects a
    human still has to resolve.
tools/exploration-card-resources-review.csv
    Review sheet with the raw evidence behind every judgement.

A "resource card" is a card whose whole rules text is gaining resources.  Cards
that also do something else are still scanned, but are marked so the app can
settle only the resource part and list the rest for manual handling.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EFFECTS_PATH = ROOT / "tools" / "exploration-card-effects.json"
RECORD_PATH = ROOT / "record" / "index.html"
OUT_JS = ROOT / "assets" / "exploration-card-resources.js"
OUT_CSV = ROOT / "tools" / "exploration-card-resources-review.csv"

# "Gain 4 Trireme resources." / "Gain 9 Trireme, 6 Monument and 3 Armament resources."
GRANT_RE = re.compile(r"\bGain\s+([^.]*?)\s+resources?\b", re.I)
AMOUNT_RE = re.compile(r"^\+?(\d+)\s+(.+)$")
REMOVAL_RE = re.compile(
    r"^(?:remove\b.*\b(?:deck|timeline battle)\b|移出|永久移出|洗回)",
    re.I,
)
CJK_RE = re.compile(r"[\u3400-\u9fff]")

# A badge is a diplomacy status.  "Friendly+" means Friendly or better and
# "Denounced-" means Denounced or worse; the plain forms are single statuses and
# only appear on the multi-branch diplomacy cards.
BADGE_CONDITIONS = {
    "allied": ("atLeast", 2),
    "friendly+": ("atLeast", 1),
    "friendly": ("only", 1),
    "neutral": ("only", 0),
    "unfriendly": ("only", -1),
    "denounced": ("only", -2),
    "denounced-": ("atMost", -2),
    "at war": ("atMost", -3),
}

BADGE_LABELS = {
    "atLeast": "{badge}（{bonus:+d} 或更好）",
    "atMost": "{badge}（{bonus:+d} 或更差）",
    "only": "{badge}（恰好 {bonus:+d}）",
}

# Resources the record sheet tracks, keyed by the English name printed on cards.
NAME_ALIASES = {
    "priest": "priests",
    "priests": "priests",
    "rare": "rare",
    "raw ambrosia": "rawAmbrosia",
    "rare resource": "rare",
    "rares": "rare",
}


def die(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


# --------------------------------------------------------------------------- #
# record sheet resource catalog
# --------------------------------------------------------------------------- #

def read_record_catalog() -> dict[str, list[tuple[str, str, str]]]:
    text = RECORD_PATH.read_text(encoding="utf-8")
    start = text.index("const cycleData = {")
    segment = text[start:start + 60000]
    cycles: dict[str, list[tuple[str, str, str]]] = {}
    headers = list(re.finditer(r"\n {6}(c\d): \{\n", segment))
    for index, header in enumerate(headers):
        cycle_id = header.group(1)
        block_end = headers[index + 1].start() if index + 1 < len(headers) else len(segment)
        block = segment[header.end():block_end]
        match = re.search(r"resources: \[(.*?)\n {8}\],", block, re.S)
        if not match:
            die(f"record/index.html: {cycle_id} has no resources list")
        cycles[cycle_id] = re.findall(
            r'\["([^"]+)", "([^"]+)", "([^"]+)"\]', match.group(1)
        )
    return cycles


def shared_resource_keys(cycles: dict[str, list[tuple[str, str, str]]]) -> set[str]:
    counts: dict[str, int] = {}
    for resources in cycles.values():
        for key, _zh, _en in resources:
            if key == "core":
                continue
            counts[key] = counts.get(key, 0) + 1
    return {key for key, count in counts.items() if count > 1}


def build_cycles(cycles: dict[str, list[tuple[str, str, str]]], shared: set[str]) -> dict:
    out = {}
    for cycle_id, resources in cycles.items():
        entries = {}
        for key, zh, en in resources:
            entries[key] = {
                "zh": zh,
                "en": en,
                "storageKey": key if key in shared else f"{cycle_id}-{key}",
                "named": key in {"rare", "priests"},
            }
        out[cycle_id] = {"resources": entries}
    return out


def normalize_name(name: str) -> str:
    cleaned = name.strip().lower()
    cleaned = cleaned.replace("’", "'")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def resolve_resource(cycle_id: str, name: str, cycles: dict) -> tuple[str | None, str, bool]:
    """Return (resource key, note, is_rare_named)."""
    lowered = normalize_name(name)
    if CJK_RE.search(name):
        return None, f"卡面资源用中文书写，未自动识别：{name}", False
    if lowered.endswith(" rare") or lowered == "rare":
        return "rare", "", True
    resources = cycles[cycle_id]["resources"]
    for key, entry in resources.items():
        if normalize_name(entry["en"]) == lowered:
            return key, "", entry["named"]
    alias = NAME_ALIASES.get(lowered)
    if alias and alias in resources:
        return alias, "", resources[alias]["named"]
    # A resource that exists in another cycle is still recorded, but the key may
    # not be on this cycle's sheet, so it is reported instead of guessed.
    return None, f"未在 {cycle_id} 记录表资源表里找到：{name}", False


# --------------------------------------------------------------------------- #
# card scanning
# --------------------------------------------------------------------------- #

def split_sentences(text: str) -> list[str]:
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text)]
    return [part for part in parts if part]


def parse_grant_sentence(sentence: str) -> list[tuple[int, str]] | None:
    match = GRANT_RE.search(sentence)
    if not match:
        return None
    body = re.sub(r"\s+and\s+", ", ", match.group(1), flags=re.I)
    parsed: list[tuple[int, str]] = []
    for piece in [part.strip() for part in body.split(",") if part.strip()]:
        amount_match = AMOUNT_RE.match(piece)
        if not amount_match:
            return None
        parsed.append((int(amount_match.group(1)), amount_match.group(2).strip()))
    return parsed or None


def badge_sentence_indexes(sentences: list[str], badge: str) -> dict[int, str]:
    """Decide which sentence a line-level badge belongs to."""
    if not badge:
        return {}
    if len(sentences) == 1:
        return {0: badge}
    granted = [i for i, s in enumerate(sentences) if parse_grant_sentence(s)]
    replacements = [i for i in granted if "instead" in sentences[i].lower()]
    if len(granted) == 1:
        return {granted[0]: badge}
    if replacements:
        return {i: badge for i in replacements}
    if granted:
        return {granted[-1]: badge}
    return {len(sentences) - 1: badge}


def scan_card(card: dict, cycles: dict) -> dict:
    cycle_id = card["key"].split(":")[0]
    grants: list[dict] = []
    manual: list[dict] = []
    unresolved: list[str] = []
    warnings: list[str] = []

    for line in card["lines"]:
        text = str(line.get("text") or "").strip()
        badge = str(line.get("badge") or "").strip()
        if not text or text.startswith("ICON(") and len(text) < 12:
            continue
        sentences = split_sentences(text)
        badge_map = badge_sentence_indexes(sentences, badge)
        badge_is_icon = badge.upper().startswith("ICON")
        for index, sentence in enumerate(sentences):
            if REMOVAL_RE.match(sentence):
                continue
            sentence_badge = badge if index in badge_map else ""
            condition = condition_from_badge(sentence_badge)
            parsed = parse_grant_sentence(sentence)
            if condition is None and sentence_badge and badge_is_icon and parsed:
                # An unreadable picture badge only blocks automation when it
                # actually gates a resource; on a purely manual line it is just
                # part of the text the player resolves by hand.
                condition = {
                    "type": "icon",
                    "badge": sentence_badge,
                    "label": f"卡面图标条件（{sentence_badge}），需要人工确认",
                }
                warnings.append(f"条件为图标，需人工确认：{sentence} [{sentence_badge}]")
            if parsed:
                if "may" in sentence.lower():
                    # "You may gain +3 X to gain +1 Y" is a player choice.
                    for amount, name in parsed:
                        key, _note, _named = resolve_resource(cycle_id, name, cycles)
                        unresolved.append(
                            (f"可选获得 {name} ×{amount}（需玩家选择）" if key is None
                             else f"可选获得 {cycles[cycle_id]['resources'][key]['zh']} ×{amount}（需玩家选择）")
                        )
                    manual.append({"text": sentence, "badge": sentence_badge, "condition": condition})
                    continue
                is_replacement = "instead" in sentence.lower()
                for amount, name in parsed:
                    key, note, named = resolve_resource(cycle_id, name, cycles)
                    grant = {
                        "resource": key,
                        "name": name,
                        "amount": amount,
                        "condition": condition,
                        "replaces": None,
                        "rareName": rare_display_name(name) if (key == "rare" and named) else "",
                    }
                    if key is None:
                        grant["unresolved"] = note or f"未识别资源：{name}"
                        unresolved.append(grant["unresolved"])
                    if is_replacement:
                        grants.append({**grant, "_replacement": True})
                    else:
                        grants.append(grant)
                continue
            stripped = re.sub(r"\s+", "", sentence)
            if len(re.findall(r"[A-Za-z]", stripped)) >= 3 or CJK_RE.search(stripped):
                manual.append({"text": sentence, "badge": sentence_badge, "condition": condition})

    # An "instead" grant replaces the unconditional grant printed just before it
    # for the same resource.
    for index, grant in enumerate(grants):
        if not grant.pop("_replacement", False):
            continue
        target = None
        for candidate in range(index - 1, -1, -1):
            if grants[candidate].get("_replacement"):
                continue
            if grants[candidate].get("condition") is None and (
                grants[candidate]["resource"] == grant["resource"]
                or grants[candidate]["resource"] is None
            ):
                target = candidate
                break
        if target is None:
            for candidate in range(index - 1, -1, -1):
                if grants[candidate].get("condition") is None:
                    target = candidate
                    break
        if target is None:
            warnings.append(f"找不到被替换的基础收益：{grant['name']} ×{grant['amount']}")
        else:
            grant["replaces"] = target

    # The record sheet only accepts named rare resources when their name is kept.
    for grant in grants:
        if grant["resource"] == "rare" and not grant["rareName"]:
            grant["unresolved"] = grant.get("unresolved") or "稀有资源未写明名称"
            if grant["unresolved"] not in unresolved:
                unresolved.append(grant["unresolved"])

    has_base = any(grant.get("condition") is None for grant in grants)
    evaluable = all(
        grant.get("condition") is None
        or grant["condition"].get("type") == "diplomacy"
        or grant.get("replaces") is None
        for grant in grants
    )
    resolved = all(grant.get("resource") for grant in grants)
    clean = [grant for grant in grants if grant.get("resource")]

    if not clean:
        kind = "none"
    elif not manual and not unresolved and not warnings and evaluable and resolved:
        kind = "resource-only"
    else:
        kind = "resource-plus"

    return {
        "key": card["key"],
        "cycleId": cycle_id,
        "cardId": card["key"].split(":")[1],
        "titleZh": card.get("titleZh") or "",
        "titleEn": card.get("titleEn") or "",
        "cardCode": card.get("cardCode") or "",
        "cornerNumber": card.get("cornerNumber") or "",
        "kind": kind,
        "autoSettle": (
            "full" if kind == "resource-only"
            else ("partial" if clean else "none")
        ),
        "diplomacyMenu": has_diplomacy_menu(clean, manual),
        "grants": clean,
        "unresolvedGrants": [g for g in grants if not g.get("resource")],
        "manual": manual,
        "unresolved": unresolved,
        "warnings": warnings,
        "confidence": card.get("confidence") or "",
        "notes": card.get("notes") or "",
    }


def has_diplomacy_menu(grants: list[dict], manual: list[dict]) -> bool:
    """True for the cards that branch on diplomacy instead of granting a base."""
    if any(grant.get("condition") is None for grant in grants):
        return False
    badges = {
        (grant.get("condition") or {}).get("badge")
        for grant in grants + manual
        if (grant.get("condition") or {}).get("mode") == "only"
    }
    badges.discard(None)
    return len(badges) >= 2


def rare_display_name(name: str) -> str:
    """'Antedeluvian Sirenshell Rare' -> 'Antedeluvian Sirenshell'."""
    return re.sub(r"\s+rare$", "", name.strip(), flags=re.I)


def condition_from_badge(badge: str) -> dict | None:
    if not badge:
        return None
    key = normalize_name(badge)
    key = re.sub(r"\s*\(.*?\)\s*", "", key).strip()
    if key not in BADGE_CONDITIONS:
        return None
    mode, bonus = BADGE_CONDITIONS[key]
    return {
        "type": "diplomacy",
        "badge": badge,
        "mode": mode,
        "bonus": bonus,
        "label": BADGE_LABELS[mode].format(badge=badge, bonus=bonus),
    }


# --------------------------------------------------------------------------- #
# output
# --------------------------------------------------------------------------- #

def serialize_card(card: dict) -> dict:
    grants = []
    for grant in card["grants"]:
        entry = {
            "resource": grant["resource"],
            "amount": grant["amount"],
            "condition": grant["condition"],
            "replaces": grant["replaces"],
        }
        if grant.get("rareName"):
            entry["rareName"] = grant["rareName"]
        grants.append(entry)
    return {
        "key": card["key"],
        "cycleId": card["cycleId"],
        "cardId": card["cardId"],
        "titleZh": card["titleZh"],
        "titleEn": card["titleEn"],
        "kind": card["kind"],
        "autoSettle": card["autoSettle"],
        "diplomacyMenu": card["diplomacyMenu"],
        "grants": grants,
        "manual": [
            {"text": item["text"], "badge": item["badge"], "condition": item["condition"]}
            for item in card["manual"]
        ],
        "unresolved": card["unresolved"],
    }


def grant_text(card: dict) -> str:
    parts = []
    for grant in card["grants"]:
        condition = grant["condition"]
        if condition:
            parts.append(f"{condition.get('label', condition.get('badge', '条件'))} → {grant['name']} ×{grant['amount']}")
        else:
            parts.append(f"{grant['name']} ×{grant['amount']}")
    for grant in card["unresolvedGrants"]:
        parts.append(f"（未识别）{grant['name']} ×{grant['amount']}")
    return "；".join(parts)


def write_js(cards: list[dict], cycles: dict) -> None:
    # One compact line per card: the file is served to every dashboard load, so
    # pretty-printing 223 cards would cost ~200 kB for nothing.  The review CSV
    # is the human-readable companion.
    compact = {"ensure_ascii": False, "separators": (",", ":")}
    lines = [
        "/* Generated by tools/scan_exploration_resource_cards.py -- do not edit by hand.",
        " * Source: tools/exploration-card-effects.json (vision transcription of the card faces)",
        " *         plus the resource catalog of record/index.html.",
        " * Rebuild with: python tools/scan_exploration_resource_cards.py",
        " */",
        "window.ATO_EXPLORATION_CARD_RESOURCES = {",
        f'  "version": 1,',
        f'  "generatedAt": {json.dumps(datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"))},',
        f'  "cycles": {json.dumps(cycles, **compact)},',
        '  "cards": {',
    ]
    entries = [
        f'    {json.dumps(card["key"])}: {json.dumps(serialize_card(card), **compact)}'
        for card in cards
    ]
    lines.append(",\n".join(entries))
    lines.append("  }")
    lines.append("};")
    OUT_JS.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_csv(cards: list[dict]) -> None:
    fields = [
        "key", "cycle", "card_id", "title_zh", "title_en", "kind", "auto_settle",
        "grants", "base", "modifiers", "manual", "unresolved", "warnings", "confidence", "notes",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for card in cards:
            base = [g for g in card["grants"] if g.get("condition") is None]
            modifiers = [g for g in card["grants"] if g.get("condition") is not None]
            writer.writerow({
                "key": card["key"],
                "cycle": card["cycleId"],
                "card_id": card["cardId"],
                "title_zh": card["titleZh"],
                "title_en": card["titleEn"],
                "kind": card["kind"],
                "auto_settle": card["autoSettle"],
                "grants": grant_text(card),
                "base": " / ".join(f"{g['name']}×{g['amount']}" for g in base),
                "modifiers": " / ".join(
                    f"[{g['condition']['badge']}]{g['name']}×{g['amount']}{'（替换）' if g['replaces'] is not None else '（追加）'}"
                    for g in modifiers
                ),
                "manual": " / ".join(
                    (f"[{item['badge']}] {item['text']}" if item.get("badge") else item["text"])
                    for item in card["manual"]
                ),
                "unresolved": " / ".join(card["unresolved"]),
                "warnings": " / ".join(card["warnings"]),
                "confidence": card["confidence"],
                "notes": card["notes"],
            })


def main() -> int:
    if not EFFECTS_PATH.is_file():
        die(f"{EFFECTS_PATH} is missing; run the vision transcription first")
    effects = json.loads(EFFECTS_PATH.read_text(encoding="utf-8"))
    catalog = read_record_catalog()
    shared = shared_resource_keys(catalog)
    cycles = build_cycles(catalog, shared)

    cards = []
    for key in sorted(effects["cards"], key=lambda value: (value.split(":")[0], int(value.split(":")[1]))):
        cards.append(scan_card(effects["cards"][key], cycles))

    write_js(cards, cycles)
    write_csv(cards)

    by_kind: dict[str, int] = {}
    by_cycle: dict[str, dict[str, int]] = {}
    for card in cards:
        by_kind[card["kind"]] = by_kind.get(card["kind"], 0) + 1
        per_cycle = by_cycle.setdefault(card["cycleId"], {})
        per_cycle[card["kind"]] = per_cycle.get(card["kind"], 0) + 1
    print(f"cards scanned: {len(cards)}")
    print(f"kinds: {by_kind}")
    for cycle_id in sorted(by_cycle):
        print(f"  {cycle_id}: {by_cycle[cycle_id]}")
    print(f"wrote {OUT_JS.relative_to(ROOT)}")
    print(f"wrote {OUT_CSV.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
