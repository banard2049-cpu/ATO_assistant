#!/usr/bin/env python3
"""Classify OCR'd exploration-card effects by automation feasibility."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OCR_PATH = ROOT / "tools" / "ocr-exploration-all.json"
CSV_PATH = ROOT / "tools" / "exploration-effect-automation-report.csv"
MD_PATH = ROOT / "tools" / "exploration-effect-automation-report.md"
INDEX_PATH = ROOT / "index.html"


RESOURCE_NAMES = {
    "ambrosia": "ambrosia resource",
    "armament": "armament resource",
    "black chain": "blackChain resource",
    "calcified knuckle": "calcifiedKnuckle resource",
    "chimeric tar": "chimericTar resource",
    "clothflesh": "clothflesh resource",
    "cyclopean metal": "cyclopeanMetal resource",
    "daedalus makina": "daedalusMakina resource",
    "eyes cluster": "eyesCluster resource",
    "fear essence": "fearEssence resource",
    "fleshy mantle": "fleshyMantle resource",
    "frozen ambrosia": "frozenAmbrosia resource",
    "grotesque beak": "grotesqueBeak resource",
    "hyperborean alloy": "hyperboreanAlloy resource",
    "icarian feather": "icarianFeather resource",
    "infused mechanism": "infusedMechanism resource",
    "living abyss": "livingAbyss resource",
    "maze fragment": "mazeFragment resource",
    "monument": "monument resource",
    "muscle cluster": "muscleCluster resource",
    "powdered matter": "powderedMatter resource",
    "raw ambrosia": "rawAmbrosia resource",
    "razorclaw": "razorclaw resource",
    "reliefshell fragment": "reliefshellFragment resource",
    "relief": "relief resource",
    "retractable mechanism": "retractableMechanism resource",
    "sirenshell": "sirenshell resource",
    "skin of malice": "skinOfMalice resource",
    "sunburned skull": "sunburnedSkull resource",
    "supersolid relief": "supersolidRelief resource",
    "trireme": "trireme resource",
    "violent ambrosia": "violentAmbrosia resource",
    "war machine": "warMachine resource",
    "war trireme": "warTrireme resource",
    "writhing tentacle": "writhingTentacle resource",
}

DIRECT_PATTERNS = [
    (re.compile(r"\bgain\s+(\d+)\s+([a-z][a-z \-]+?)\s+resources?\b", re.I), "gain fixed resources"),
    (re.compile(r"\bgain\s+(\d+)\s+resources?\b", re.I), "gain generic resources"),
    (re.compile(r"\bgain\s*\+?\s*(\d+)\s+(?:fate|danger|doom|crew|hull|argo knowledge)\b", re.I), "gain fixed track/stat"),
    (re.compile(r"\blose\s*-?\s*(\d+)\s+(?:fate|danger|doom|crew|hull)\b", re.I), "lose fixed track/stat"),
    (re.compile(r"\badd\s+(\d+)\s+days?\b", re.I), "add fixed timeline days"),
]

COMPLEX_PATTERNS = [
    (re.compile(r"\binstead\b|\bmay\b|\beither\b|\bor\b|\bonce\b|\buntil\b|\bplace\b", re.I), "optional/alternate effect"),
    (re.compile(r"\bgain\s*\+?\s*\d+\b(?!\s+[a-z][a-z \-]+?\s+resources?\b)|\bgain\s+\d+\s+(?:priest|rare|antediluvian|frozen time)\b", re.I), "extra conditional gain"),
    (re.compile(r"\blose\b|\blower\b|\bpermanently\b|\breturn to\b", re.I), "loss or non-resource side effect"),
]

SEMI_PATTERNS = [
    (re.compile(r"\b(random|roll|reroll|choose|search|draw|discard|remove one|one argonaut|argonaut|titan|group)\b", re.I), "choice/random/target needed"),
    (re.compile(r"\bif\b|如果|若|when\b|unless\b", re.I), "conditional effect"),
    (re.compile(r"\bresolve\b|\bread\b|see\s+\d{3,4}|special event|adventure|story|doom|secret|condition|gear|technology|mnemos|matrix", re.I), "external card/story effect"),
]


def parse_catalog() -> dict[str, dict[str, str]]:
    text = INDEX_PATH.read_text(encoding="utf-8")
    catalog: dict[str, dict[str, str]] = {}
    cycle = None
    for line in text.splitlines():
        cycle_match = re.match(r"\s*(c[123]):\s*\[", line)
        if cycle_match:
            cycle = cycle_match.group(1)
            continue
        if cycle and re.match(r"\s*const explorationCornerNumbers", line):
            break
        entry_match = re.search(r'\{\s*id:\s*"(\d+)",\s*name:\s*"([^"]+)"\s*\}', line)
        if cycle and entry_match:
            card_id, name = entry_match.groups()
            catalog[f"{cycle}:{card_id}"] = {"cycle": cycle, "card_id": card_id, "name": name}
        range_match = re.search(r"Array\.from\(\{\s*length:\s*(\d+)\s*\}.*String\((\d+)\s*\+\s*index\)", line)
        if cycle and range_match:
            count, start = map(int, range_match.groups())
            for card_id in range(start, start + count):
                catalog[f"{cycle}:{card_id}"] = {
                    "cycle": cycle,
                    "card_id": str(card_id),
                    "name": f"Cycle III 探索卡 {card_id}",
                }
    return catalog


def key_from_file(value: str) -> str:
    parts = Path(value).parts
    cycle = parts[-2]
    card_id = Path(parts[-1]).stem
    return f"{cycle}:{card_id}"


def clean_text(card: dict[str, object]) -> str:
    text = card.get("text", {})
    if not isinstance(text, dict):
        return ""
    chunks = [str(text.get("body", "")), str(text.get("footer", "")), str(text.get("full", ""))]
    return "\n".join(chunks)


def full_text(card: dict[str, object]) -> str:
    text = card.get("text", {})
    if not isinstance(text, dict):
        return ""
    return str(text.get("full", ""))


def matched_resources(text: str) -> list[str]:
    lower = text.lower()
    found = []
    for phrase, label in RESOURCE_NAMES.items():
        if phrase in lower:
            found.append(label)
    return sorted(set(found))


def classify(text: str, primary_text: str = "") -> tuple[str, str, str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    resources = matched_resources(normalized)
    direct_hits = [label for pattern, label in DIRECT_PATTERNS if pattern.search(normalized)]
    complex_hits = [label for pattern, label in COMPLEX_PATTERNS if pattern.search(normalized)]
    semi_hits = [label for pattern, label in SEMI_PATTERNS if pattern.search(normalized)]
    primary_normalized = re.sub(r"\s+", " ", primary_text or text).strip()
    resource_gain_count = len(re.findall(r"\bgain\s+\d+\s+[a-z][a-z \-]+?\s+resources?\b", primary_normalized, re.I))
    if resource_gain_count > 1:
        complex_hits.append("alternate or bonus resource line")

    if direct_hits and not complex_hits and not semi_hits:
        return "full-auto", "; ".join(direct_hits), ", ".join(resources)
    if direct_hits:
        return "base-auto", "; ".join(direct_hits + complex_hits + semi_hits), ", ".join(resources)
    if resources and not semi_hits:
        return "semi", "resource named but amount/action needs review", ", ".join(resources)
    if semi_hits:
        return "manual", "; ".join(semi_hits), ", ".join(resources)
    if len(normalized) < 18:
        return "bad-ocr", "too little effect text", ", ".join(resources)
    return "review", "effect text not matched by current rules", ", ".join(resources)


def main() -> int:
    catalog = parse_catalog()
    payload = json.loads(OCR_PATH.read_text(encoding="utf-8"))
    rows = []
    for card in payload["cards"]:
        key = key_from_file(card["file"])
        meta = catalog.get(key, {})
        text = clean_text(card)
        status, reason, resources = classify(text, full_text(card))
        rows.append({
            "key": key,
            "cycle": meta.get("cycle", key.split(":")[0]),
            "card_id": meta.get("card_id", key.split(":")[1]),
            "name": meta.get("name", ""),
            "status": status,
            "reason": reason,
            "resources": resources,
            "ocr_full": str(card.get("text", {}).get("full", "")).replace("\n", " / "),
            "ocr_body": str(card.get("text", {}).get("body", "")).replace("\n", " / "),
            "ocr_footer": str(card.get("text", {}).get("footer", "")).replace("\n", " / "),
        })

    rows.sort(key=lambda item: (item["cycle"], int(item["card_id"])))
    with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    by_status = Counter(row["status"] for row in rows)
    by_cycle = defaultdict(Counter)
    for row in rows:
        by_cycle[row["cycle"]][row["status"]] += 1

    def table_for(status: str, limit: int | None = None) -> str:
        selected = [row for row in rows if row["status"] == status]
        if limit:
            selected = selected[:limit]
        lines = ["| 卡 | 名称 | 原因 | OCR 摘要 |", "|---|---|---|---|"]
        for row in selected:
            summary = row["ocr_full"][:160].replace("|", "/")
            lines.append(f"| {row['key']} | {row['name']} | {row['reason']} | {summary} |")
        return "\n".join(lines)

    md = [
        "# 探索卡效果 OCR 自动化评估",
        "",
        f"- 总数：{len(rows)}",
        f"- 整张卡可全自动：{by_status['full-auto']}",
        f"- 基础效果可自动，附加效果需确认：{by_status['base-auto']}",
        f"- 半自动化：{by_status['semi']}",
        f"- 人工处理：{by_status['manual']}",
        f"- 需复核规则：{by_status['review']}",
        f"- OCR 太少/失败：{by_status['bad-ocr']}",
        "",
        "## 按 Cycle 统计",
        "",
        "| Cycle | full-auto | base-auto | semi | manual | review | bad-ocr |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for cycle in sorted(by_cycle):
        counts = by_cycle[cycle]
        md.append(f"| {cycle} | {counts['full-auto']} | {counts['base-auto']} | {counts['semi']} | {counts['manual']} | {counts['review']} | {counts['bad-ocr']} |")
    md.extend([
        "",
        "## 整张卡可全自动候选",
        "",
        table_for("full-auto"),
        "",
        "## 基础效果可自动候选",
        "",
        table_for("base-auto"),
        "",
        "## 半自动化候选",
        "",
        table_for("semi"),
        "",
        "## 需要人工/规则补充",
        "",
        table_for("manual", 60),
        "",
        "## 当前规则未覆盖",
        "",
        table_for("review", 80),
        "",
        "## OCR 太少",
        "",
        table_for("bad-ocr"),
        "",
    ])
    MD_PATH.write_text("\n".join(md), encoding="utf-8")
    print(MD_PATH)
    print(CSV_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
