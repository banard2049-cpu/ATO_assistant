from __future__ import annotations

import hashlib
import json
import re
import zipfile
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import PurePosixPath
from typing import Any, Iterable

from .db import Database


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
WEB_PREFIX = "assets/web/"
DERIVED_MARKERS = ("-duplicate", "-partial", "contact", "_contact")
AIBP_CYCLES = {
    "HEKATON": "c1", "LABYRINTHAUROS": "c1", "HERMESIAN_PURSUER": "c1", "ALPHA_TEMENOS": "c1",
    "CHIMERA_METASTASIOS": "c2", "CYCLONUS": "c2", "THE_BURDEN": "c2+c3", "THE_NIETZSCJEAN": "c2",
    "HYPERTIME_ORACLE": "c3", "ICARIAN_HARPY": "c3", "SUN_DESCENDANT": "c3",
    "MIDASCORE": "c4", "DEMIDJINN": "c4", "THE_BABELIAN_LUNACY": "c4", "DAHAKA": "c4",
    "DRAGON_OF_PHOBOS": "c5", "MEDUKETOS": "c5", "UR_FLEECE": "c5", "TITAN_X": "c5",
}
GEAR_CYCLES = {"A": "c1", "B": "c2", "C": "c3", "D": "c4", "E": "c5"}


@dataclass(frozen=True)
class CatalogItem:
    id: str
    cycle: str
    module: str
    subgroup: str
    name: str
    number: str
    sort_order: int
    faces: dict[str, str]
    capture_required: bool = True


def slug(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return text or hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]


def natural_key(value: str) -> list[Any]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def make_id(cycle: str, module: str, subgroup: str, number: str, name: str) -> str:
    return ":".join(map(slug, (cycle, module, subgroup, number or name)))


def parse_js_assignment(raw: bytes, variable: str) -> dict:
    text = raw.decode("utf-8-sig")
    match = re.match(rf"\s*{re.escape(variable)}\s*=\s*(.*);\s*$", text, re.S)
    if not match:
        raise ValueError(f"无法解析 {variable}")
    return json.loads(match.group(1))


def aibp_type(stem: str) -> str:
    for marker, label in (
        ("_AI_", "AI"), ("_BP_", "BP"), ("_TR_", "Trait"),
        ("_ROUTINE_", "Routine"), ("_SIGNATURE_", "Signature"),
    ):
        if marker in stem:
            return label
    return "Special"


def base_face_path(path: str) -> tuple[str, str]:
    stem = str(PurePosixPath(path).with_suffix(""))
    ext = PurePosixPath(path).suffix
    if stem.lower().endswith("_back"):
        return stem[:-5] + ext, "back"
    if stem.lower().endswith("-back"):
        return stem[:-5] + ext, "back"
    if stem.lower().endswith("_face"):
        return stem[:-5] + ext, "front"
    if stem.lower().endswith("-front"):
        return stem[:-6] + ext, "front"
    return path, "front"


def ordered_faces(faces: dict[str, str]) -> dict[str, str]:
    return {face: faces[face] for face in ("front", "back") if face in faces}


class CatalogBuilder:
    def __init__(self, apk_path: str):
        self.apk_path = apk_path

    def build(self) -> tuple[list[CatalogItem], dict[str, Any]]:
        items: list[CatalogItem] = []
        with zipfile.ZipFile(self.apk_path) as archive:
            names = [info.filename for info in archive.infolist() if not info.is_dir()]
            web_images = [
                name[len(WEB_PREFIX):] for name in names
                if name.startswith(WEB_PREFIX) and PurePosixPath(name).suffix.lower() in IMAGE_EXTENSIONS
            ]
            items.extend(self._exploration(web_images))
            items.extend(self._story_doom(web_images))
            items.extend(self._maps(web_images))
            items.extend(self._aibp(web_images))
            items.extend(self._gear(archive, web_images))
            items.extend(self._technology(archive))
            items.extend(self._simple_groups(web_images))
            story = parse_js_assignment(
                archive.read(f"{WEB_PREFIX}story/data/storybook-data.js"), "window.STORYBOOK_DATA"
            )
            story_skeleton = [
                {
                    "id": book.get("id"), "title": book.get("title"),
                    "chapters": [{"key": c.get("key"), "title": c.get("title")} for c in book.get("chapters", [])],
                }
                for book in story.get("books", [])
            ]
        unique = {item.id: item for item in items}
        sorted_items = sorted(
            unique.values(), key=lambda x: (natural_key(x.cycle), x.module, x.subgroup, x.sort_order, natural_key(x.name))
        )
        source = {
            "apk": PurePosixPath(self.apk_path).name,
            "source_files": len(names),
            "source_images": len(web_images),
            "catalog_items": len(sorted_items),
            "aibp_enemies": len({i.subgroup.split(" / ")[0] for i in sorted_items if i.module == "AIBP"}),
            "stories": story_skeleton,
        }
        return sorted_items, source

    def _exploration(self, paths: Iterable[str]) -> list[CatalogItem]:
        result = []
        for order, path in enumerate(sorted((p for p in paths if p.startswith("assets/exploration-cards/")), key=natural_key)):
            parts = path.split("/")
            cycle, number = parts[2], PurePosixPath(path).stem
            result.append(CatalogItem(make_id(cycle, "exploration", "cards", number, number), cycle, "探索卡", "探索卡", number, number, order, {"front": path}))
        return result

    def _story_doom(self, paths: Iterable[str]) -> list[CatalogItem]:
        groups: dict[str, dict[str, str]] = {}
        for path in paths:
            if not path.startswith("assets/story-doom-cards/") or any(m in path.lower() for m in DERIVED_MARKERS):
                continue
            base, face = base_face_path(path)
            groups.setdefault(base, {})[face] = path
        result = []
        pattern = re.compile(r"assets/story-doom-cards/(c\d)-(story|doom)-([^-]+)-(.+)", re.I)
        for order, (base, faces) in enumerate(sorted(groups.items(), key=lambda pair: natural_key(pair[0]))):
            match = pattern.match(str(PurePosixPath(base).with_suffix("")))
            if not match:
                continue
            cycle, kind, number, raw_name = match.groups()
            name = raw_name.replace("-", " ").title()
            subgroup = "故事卡" if kind.lower() == "story" else "灾厄卡"
            result.append(CatalogItem(make_id(cycle, "story-doom", subgroup, number, name), cycle, "故事/灾厄卡", subgroup, name, number, order, ordered_faces(faces)))
        return result

    def _maps(self, paths: Iterable[str]) -> list[CatalogItem]:
        groups: dict[str, dict[str, str]] = {}
        for path in paths:
            if not path.startswith("map/images/"):
                continue
            base, face = base_face_path(path)
            groups.setdefault(base, {})[face] = path
        result = []
        pattern = re.compile(r"map/images/(c\d)-tile-(.+)", re.I)
        for order, (base, faces) in enumerate(sorted(groups.items(), key=lambda pair: natural_key(pair[0]))):
            match = pattern.match(str(PurePosixPath(base).with_suffix("")))
            if not match:
                continue
            cycle, number = match.groups()
            result.append(CatalogItem(make_id(cycle, "map", "tiles", number, number), cycle, "地图板块", "地图板块", f"板块 {number}", number, order, ordered_faces(faces)))
        return result

    def _aibp(self, paths: Iterable[str]) -> list[CatalogItem]:
        relevant = [p for p in paths if p.startswith("aibp/ps/") and "/other/" not in p]
        groups: dict[str, dict[str, str]] = {}
        for path in relevant:
            base, face = base_face_path(path)
            groups.setdefault(base, {})[face] = path
        result = []
        for order, (base, faces) in enumerate(sorted(groups.items(), key=lambda pair: natural_key(pair[0]))):
            parts = base.split("/")
            if len(parts) < 4:
                continue
            enemy = parts[2]
            stem = PurePosixPath(base).stem
            if stem == enemy:
                continue
            cycle = AIBP_CYCLES.get(enemy, "other")
            kind = aibp_type(stem)
            subgroup = f"{enemy} / {kind}"
            result.append(CatalogItem(make_id(cycle, "aibp", subgroup, stem, stem), cycle, "AIBP", subgroup, stem.replace("_", " "), stem, order, ordered_faces(faces)))
        return result

    def _gear(self, archive: zipfile.ZipFile, paths: Iterable[str]) -> list[CatalogItem]:
        data = json.loads(archive.read(f"{WEB_PREFIX}technology/gear_card_images.json").decode("utf-8-sig"))
        cards = data.get("cards", {})
        result = []
        for order, (number, entry) in enumerate(sorted(cards.items(), key=lambda pair: natural_key(pair[0]))):
            path = f"technology/{entry['src'].lstrip('/')}"
            if path not in paths:
                continue
            cycle = GEAR_CYCLES.get(number[:1].upper(), "other")
            name = entry.get("title") or number
            result.append(CatalogItem(make_id(cycle, "gear", "cards", number, name), cycle, "装备卡", "装备卡", name, number, order, {"front": path}))
        return result

    def _technology(self, archive: zipfile.ZipFile) -> list[CatalogItem]:
        data = json.loads(archive.read(f"{WEB_PREFIX}technology/tech_card_dictionary.min.json").decode("utf-8-sig"))
        result = []
        for order, card in enumerate(data.get("cards", [])):
            image = card.get("image") or {}
            nodes = card.get("nodes") or []
            pages = [str(node.get("page") or "") for node in nodes]
            cycles = sorted({m.group(1) for page in pages if (m := re.search(r"cycle([1-5])", page, re.I))})
            cycle = "+".join(f"c{value}" for value in cycles) or "other"
            names = card.get("names") or {}
            name = names.get("zh") or names.get("en") or card.get("key") or f"科技卡 {order + 1}"
            number = card.get("key") or str(order + 1)
            faces = {}
            for face in ("face", "back"):
                if image.get(face):
                    faces["front" if face == "face" else "back"] = f"technology/{str(image[face]).lstrip('/')}"
            if faces:
                result.append(CatalogItem(make_id(cycle, "technology", card.get("category") or "科技卡", number, name), cycle, "科技卡", card.get("category") or "科技卡", name, number, order, faces))
        return result

    def _simple_groups(self, paths: Iterable[str]) -> list[CatalogItem]:
        rules = (
            ("aibp/ps/other/token/", "common", "通用标记", "AIBP 标记"),
            ("aibp/ps/other/resouce/", "common", "资源标记", "AIBP 资源"),
            ("aibp/ps/other/status/", "c4+c5", "状态卡", "C4/C5 状态"),
            ("map/tokens/", "common", "通用标记", "地图标记"),
            ("hero/assets/", "common", "英雄/盟友", "英雄"),
            ("record/assets/ally/", "common", "英雄/盟友", "盟友"),
            ("record/assets/godforms-nymphs/", "common", "英雄/盟友", "神形/宁芙"),
            ("record/assets/resource-icons/", "common", "资源标记", "记录表资源"),
        )
        result = []
        for order, path in enumerate(sorted(paths, key=natural_key)):
            matched = next((rule for rule in rules if path.startswith(rule[0])), None)
            if not matched or "/nymph_tokens/" in path and matched[3] != "神形/宁芙":
                continue
            _, cycle, module, subgroup = matched
            stem = PurePosixPath(path).stem
            if module == "英雄/盟友" and path.startswith("hero/assets/") and not PurePosixPath(path).name.startswith("argonaut_"):
                continue
            result.append(CatalogItem(make_id(cycle, module, subgroup, stem, stem), cycle, module, subgroup, stem.replace("_", " "), stem, order, {"front": path}))
        return result


def compare_catalog(db: Database, items: list[CatalogItem], source: dict[str, Any]) -> dict[str, Any]:
    current = {row["id"]: row for row in db.all("SELECT * FROM catalog_items")}
    incoming = {item.id: item for item in items}
    added = [asdict(incoming[key]) for key in incoming.keys() - current.keys()]
    removed = [{"id": key, "name": current[key]["name"], "cycle": current[key]["cycle"], "module": current[key]["module"]} for key in current.keys() - incoming.keys()]
    changed = []
    for key in incoming.keys() & current.keys():
        before = current[key]
        after = incoming[key]
        if (before["name"], before["cycle"], before["module"], before["subgroup"], before["faces_json"]) != (
            after.name, after.cycle, after.module, after.subgroup, json.dumps(after.faces, ensure_ascii=False, sort_keys=True)
        ):
            changed.append({"id": key, "before": {k: before[k] for k in ("name", "cycle", "module", "subgroup")}, "after": asdict(after)})
    return {"source": source, "summary": {"added": len(added), "removed": len(removed), "changed": len(changed), "unchanged": len(incoming) - len(added) - len(changed)}, "added": added, "removed": removed, "changed": changed}


def apply_catalog(db: Database, items: list[CatalogItem], source: dict[str, Any]) -> dict[str, int]:
    source_version = str(source.get("apk") or "")
    incoming_ids = {item.id for item in items}
    with db.connect() as conn:
        for item in items:
            conn.execute(
                """INSERT INTO catalog_items
                (id,cycle,module,subgroup,name,number,sort_order,faces_json,capture_required,source_version)
                VALUES(?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET cycle=excluded.cycle,module=excluded.module,
                subgroup=excluded.subgroup,name=excluded.name,number=excluded.number,
                sort_order=excluded.sort_order,faces_json=excluded.faces_json,
                capture_required=excluded.capture_required,source_version=excluded.source_version""",
                (item.id, item.cycle, item.module, item.subgroup, item.name, item.number, item.sort_order,
                 json.dumps(item.faces, ensure_ascii=False, sort_keys=True), int(item.capture_required), source_version),
            )
        if incoming_ids:
            placeholders = ",".join("?" for _ in incoming_ids)
            conn.execute(
                f"DELETE FROM catalog_items WHERE id NOT IN ({placeholders}) AND id NOT IN (SELECT DISTINCT item_id FROM asset_revisions)",
                tuple(incoming_ids),
            )
    db.set_meta("catalog_source", source)
    return {"items": len(items), "aibp_enemies": int(source.get("aibp_enemies") or 0), "stories": len(source.get("stories") or [])}


def catalog_stats(db: Database) -> dict[str, Any]:
    from .fixed_resources import card_resource_note, card_resources

    rows = db.all("""
      SELECT c.id,c.cycle,c.module,c.subgroup,c.name,c.number,c.faces_json,c.sort_order,
      GROUP_CONCAT(CASE WHEN a.is_current=1 THEN a.face END) AS captured,
      GROUP_CONCAT(s.face) AS skipped
      FROM catalog_items c
      LEFT JOIN asset_revisions a ON a.item_id=c.id AND a.is_current=1
      LEFT JOIN skipped_faces s ON s.item_id=c.id
      WHERE c.capture_required=1
      GROUP BY c.id ORDER BY c.cycle,c.module,c.subgroup,c.sort_order
    """)
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    next_item = None
    output = []
    for row in rows:
        faces = json.loads(row.pop("faces_json"))
        captured = set(filter(None, (row.pop("captured") or "").split(",")))
        skipped = set(filter(None, (row.pop("skipped") or "").split(",")))
        missing = [face for face in faces if face not in captured]
        row.update({
            "faces": faces, "captured": sorted(captured), "skipped": sorted(skipped),
            "missing": missing, "complete": not missing,
            "resources": card_resources(row["number"]),
            "resource_note": card_resource_note(row["number"], row["subgroup"]),
        })
        output.append(row)
        if missing and next_item is None:
            next_item = {**row, "next_face": missing[0]}
        key = (row["cycle"], row["module"])
        group = groups.setdefault(key, {"cycle": key[0], "module": key[1], "items": 0, "complete": 0, "missing_front": 0, "missing_back": 0})
        group["items"] += 1
        group["complete"] += int(not missing)
        group["missing_front"] += int("front" in missing)
        group["missing_back"] += int("back" in missing)
    pending = db.all("""
      SELECT p.suggested_item_id,c.cycle,c.module
      FROM pending_files p LEFT JOIN catalog_items c ON c.id=p.suggested_item_id
      WHERE p.status='pending'
    """)
    for row in pending:
        if row["cycle"] and (row["cycle"], row["module"]) in groups:
            group = groups[(row["cycle"], row["module"])]
            group["pending_review"] = group.get("pending_review", 0) + 1
    unreviewed = db.one("SELECT COUNT(*) AS n FROM story_segments WHERE reviewed=0")["n"]
    return {
        "groups": list(groups.values()), "items": output, "next": next_item,
        "attention": {
            "pending_review": len(pending),
            "conflicts": sum(row["suggested_item_id"] is None for row in pending),
            "story_unreviewed": unreviewed,
        },
        "source": db.get_meta("catalog_source", {}),
    }
