from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
import zipfile
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.catalog import (
    AIBP_TOKEN_LABELS,
    ALLY_LABELS,
    HERO_PORTRAIT_LABELS,
    MAP_TOKEN_LABELS,
    RECORD_RESOURCE_LABELS,
    STATUS_CARD_LABELS,
    SUMMON_CARD_LABELS,
    CatalogBuilder,
    CatalogItem,
    apply_catalog,
    catalog_stats,
)
from app.db import Database
from app.fixed_catalog import ensure_fixed_catalog, fixed_catalog_payload
from app.fixed_resources import RESOURCE_MAP, card_resource_note, card_resources
from app.installer import apply_install, install_plan
from app.packages import export_compat, export_package, import_package, inspect_package
from app.storage import ensure_preview, store_image
from app.story_extras import find_entity_index
from app.stories import import_story, merge_next_segment, split_segment, story_segments, storybook_payload
from app.stories import extract_text
from tools.build_full_pack import build as build_full_pack


APK = Path("/Users/wawafish/Downloads/ATO-Local-0.2.11-images-no-audio.apk")


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.library = self.root / "library"
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (self.library / child).mkdir(parents=True, exist_ok=True)
        self.db = Database(self.library / "library.sqlite3")
        self.item = CatalogItem(
            id="c1:test:cards:001", cycle="c1", module="测试卡", subgroup="测试",
            name="测试卡 001", number="001", sort_order=1,
            faces={"front": "assets/test/001-front.jpg", "back": "assets/test/001-back.png"},
        )
        apply_catalog(self.db, [self.item], {"apk": "test.apk", "stories": [], "aibp_enemies": 0})

    def tearDown(self):
        self.temp.cleanup()

    def image(self, name="photo.png", color=(150, 70, 30)) -> Path:
        path = self.library / "tmp" / name
        Image.new("RGB", (320, 440), color).save(path)
        return path

    def test_store_image_progress_and_dedupe(self):
        first = store_image(self.db, self.library, self.image(), self.item.id, "front", "photo.png", "image/png")
        second = store_image(self.db, self.library, self.image("copy.png"), self.item.id, "front", "copy.png", "image/png")
        self.assertEqual(first["sha256"], second["sha256"])
        self.assertEqual(1, self.db.one("SELECT COUNT(*) n FROM asset_revisions")["n"])
        stats = catalog_stats(self.db)
        self.assertEqual(["back"], stats["items"][0]["missing"])

    def test_fixed_catalog_initializes_without_apk(self):
        empty = Database(self.root / "empty.sqlite3")
        result = ensure_fixed_catalog(empty)
        payload = fixed_catalog_payload()
        self.assertEqual(2749, result["items"])
        self.assertEqual(19, result["aibp_enemies"])
        self.assertEqual({"c1", "c1.5", "c2", "c2.5", "c3", "c4", "c5"}, {book["id"] for book in payload["source"]["stories"]})
        self.assertNotIn("apk", payload["source"])
        self.assertFalse(any("entries" in book or "text" in book for book in payload["source"]["stories"]))
        self.assertEqual([{"key": "RA", "label": "神浆原液", "count": 1}], card_resources("HEKATON_BP_I_001"))
        self.assertEqual([], card_resources("HEKATON_AI_I_001"))
        self.assertEqual(342, len(RESOURCE_MAP))
        self.assertEqual("无直接资源（特殊 BP）", card_resource_note("TITAN_X_BP_I_001", "TITAN_X / BP"))
        hero_icons = [item for item in payload["items"] if item["module"] == "英雄记录表图标"]
        self.assertEqual(14, len(hero_icons))
        self.assertEqual(
            {
                "hero/assets/ico_katharsis_bracket.png",
                "hero/assets/ico_least_likely.png",
                "hero/assets/ico_most_likely.png",
                "hero/assets/ico_tides.png",
                "hero/assets/reset_triskelion_F4F4F4.png",
                "hero/assets/skill_courage.png",
                "hero/assets/skill_cunning.png",
                "hero/assets/skill_endurance.png",
                "hero/assets/skill_fury.png",
                "hero/assets/skill_will.png",
                "hero/assets/skill_wisdom.png",
                "hero/assets/tri_danger.png",
                "hero/assets/tri_fate.png",
                "hero/assets/tri_rage.png",
            },
            {item["faces"]["front"] for item in hero_icons},
        )
        self.assertEqual(46, len([item for item in payload["items"] if item["module"] == "故事书配图"]))
        self.assertEqual(33, len([item for item in payload["items"] if item["module"] == "故事书补充页"]))
        self.assertEqual(5, len([item for item in payload["items"] if item["module"] == "科技树总览"]))
        self.assertEqual(17, len([item for item in payload["items"] if item["module"] == "泰坦职业配图"]))
        self.assertEqual(2, len([item for item in payload["items"] if item["module"] == "地图模块图标"]))
        battle_board_items = [item for item in payload["items"] if item["module"] == "决战版图"]
        terrain_items = [item for item in battle_board_items if item["subgroup"] == "地形板块"]
        terrain_cards = [item for item in battle_board_items if item["subgroup"] == "地形卡"]
        self.assertEqual(124, len(battle_board_items))
        self.assertEqual(78, len(terrain_items))
        self.assertEqual(84, sum(len(item["faces"]) for item in terrain_items))
        self.assertEqual(45, len(terrain_cards))
        self.assertTrue(any(item["number"] == "CJ1475" for item in payload["items"]))
        fixed_paths = {path for item in payload["items"] for path in item["faces"].values()}
        self.assertEqual(4271, len(fixed_paths))
        self.assertIn("map/images/c5-face-a.png", fixed_paths)
        self.assertIn("map/images/c5-face-b.png", fixed_paths)
        self.assertIn("aibp/ps/other/SW.jpg", fixed_paths)
        self.assertIn("aibp/ps/other/DW.jpg", fixed_paths)
        self.assertIn("aibp/ps/other/trait/COMMON_TR_001.jpg", fixed_paths)
        self.assertIn("aibp/ps/other/trait/C4_CURSED_TR_001.jpg", fixed_paths)
        self.assertIn("aibp/ps/other/trait/C5_TR_001.jpg", fixed_paths)
        self.assertIn("aibp/ps/other/trait/C45_COMMON_TR_001.jpg", fixed_paths)
        self.assertIn("map/tokens/sandstorm.jpg", fixed_paths)
        self.assertIn("ss/battle-board.jpg", fixed_paths)
        self.assertIn("ss/terrain/anchor-blue.jpg", fixed_paths)
        self.assertIn("ss/terrain/anchor-green.jpg", fixed_paths)
        self.assertIn("ss/terrain/anchor-red.jpg", fixed_paths)
        self.assertIn("ss/terrain/anchor-yellow.png", fixed_paths)
        self.assertIn("ss/terrain/arcology-back.jpg", fixed_paths)
        self.assertIn("ss/terrain-cards/arcology.jpg", fixed_paths)
        oracle_ai_iii = [
            item for item in payload["items"]
            if item["number"].startswith("HYPERTIME_ORACLE_AI_III_")
        ]
        self.assertEqual(
            [f"HYPERTIME_ORACLE_AI_III_{number:03d}" for number in range(1, 7)],
            [item["number"] for item in oracle_ai_iii],
        )
        self.assertTrue(all(set(item["faces"]) == {"front", "back"} for item in oracle_ai_iii))
        aibp_tokens = [item for item in payload["items"] if item["subgroup"] == "AIBP 标记"]
        self.assertEqual(17, len(aibp_tokens))
        self.assertEqual(set(AIBP_TOKEN_LABELS.values()), {item["name"] for item in aibp_tokens})
        self.assertEqual(17, len({item["id"] for item in aibp_tokens}))
        self.assertTrue(any(item["number"] == "AT+" for item in aibp_tokens))
        self.assertTrue(any(item["number"] == "AT-" for item in aibp_tokens))
        map_tokens = [item for item in payload["items"] if item["subgroup"] == "地图标记"]
        self.assertEqual(set(MAP_TOKEN_LABELS.values()), {item["name"] for item in map_tokens})
        record_resources = [item for item in payload["items"] if item["subgroup"] == "记录表资源"]
        self.assertEqual(66, len(record_resources))
        self.assertEqual(
            {f"{label}资源图标（{key}）" for key, label in RECORD_RESOURCE_LABELS.items()},
            {item["name"] for item in record_resources},
        )
        status_cards = [item for item in payload["items"] if item["module"] == "状态卡"]
        self.assertEqual(set(STATUS_CARD_LABELS.values()), {item["name"] for item in status_cards})
        detailed_components = [
            item for item in payload["items"]
            if item["module"] in {"通用标记", "资源标记", "状态卡"}
        ]
        self.assertFalse(any(item["name"].strip() == item["number"].strip() for item in detailed_components))
        self.assertEqual(
            set(HERO_PORTRAIT_LABELS.values()),
            {item["name"] for item in payload["items"] if item["subgroup"] == "英雄"},
        )
        self.assertEqual(
            set(ALLY_LABELS.values()),
            {item["name"] for item in payload["items"] if item["subgroup"] == "盟友"},
        )
        self.assertEqual(
            set(SUMMON_CARD_LABELS.values()),
            {item["name"] for item in payload["items"] if item["subgroup"] == "神形/宁芙"},
        )
        summon_cards = [item for item in payload["items"] if item["subgroup"] == "神形/宁芙"]
        self.assertTrue(any(item["number"] == "246_Godform_Dionysus" for item in summon_cards))
        self.assertTrue(any(item["number"] == "259_Nymph_Aether_Nymph" for item in summon_cards))
        self.assertTrue(any(item["number"] == "305_Godform_Hermes_Exalted" for item in summon_cards))

    def test_full_pack_uses_current_format_and_project_overlay(self):
        apk = self.root / "source.apk"
        overlay = self.root / "overlay"
        destination = self.root / "current.atopack"
        board = overlay / "ss" / "battle-board.jpg"
        board.parent.mkdir(parents=True)
        board.write_bytes(b"current battle board")
        stories = {"books": [{"id": "c1", "entries": [{"id": "1", "chapterKey": "main"}]}]}
        entities = {"entities": [{"id": "apostle-1", "name": "Test Apostle"}]}
        with zipfile.ZipFile(apk, "w") as archive:
            archive.writestr(
                "assets/web/story/data/storybook-data.js",
                f"window.STORYBOOK_DATA = {json.dumps(stories)};",
            )
            archive.writestr(
                "assets/web/story/data/entity-index.json",
                json.dumps(entities),
            )
        catalog = {
            "source": {"catalog_version": "test-current"},
            "items": [{
                "id": "common:battle-board",
                "cycle": "common",
                "module": "决战版图",
                "subgroup": "战斗版图",
                "name": "决战版图",
                "number": "battle-board",
                "sort_order": 1,
                "faces": {"front": "ss/battle-board.jpg"},
                "capture_required": True,
            }],
        }
        with patch("tools.build_full_pack.fixed_catalog_payload", return_value=catalog):
            result = build_full_pack(apk, destination, overlay)
        self.assertEqual(1, result["assets"])
        self.assertEqual(1, result["entities"])
        with zipfile.ZipFile(destination) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(2, manifest["version"])
            self.assertEqual("story/entity-index.json", manifest["storyFiles"][0]["member"])
            self.assertEqual(b"current battle board", archive.read(manifest["assets"][0]["member"]))

    def test_story_import_split_merge(self):
        source = self.root / "story.txt"
        source.write_text("001：开始\n第一段正文。\n\n002：继续\n第二段正文。", encoding="utf-8")
        result = import_story(self.db, self.library, source, "c1", "测试故事", "main", "正文")
        self.assertEqual(2, result["segments"])
        rows = story_segments(self.db, "c1")
        new_id = split_segment(self.db, rows[0]["id"], 3)
        self.assertTrue(new_id)
        self.assertEqual(3, len(story_segments(self.db, "c1")))
        merge_next_segment(self.db, rows[0]["id"])
        self.assertEqual(2, len(story_segments(self.db, "c1")))
        rows = story_segments(self.db, "c1")
        self.db.execute("UPDATE story_segments SET reviewed=1 WHERE id=?", (rows[0]["id"],))
        shared = storybook_payload(self.db, reviewed_only=True, omit_empty=True)
        self.assertEqual(1, len(shared["books"][0]["entries"]))

    def test_database_migrates_legacy_story_metadata_column(self):
        legacy_path = self.root / "legacy.sqlite3"
        with closing(sqlite3.connect(legacy_path)) as conn:
            conn.execute("""CREATE TABLE story_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT NOT NULL,
                chapter_key TEXT NOT NULL DEFAULT 'main',
                chapter_title TEXT NOT NULL DEFAULT '正文',
                entry_number TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                reviewed INTEGER NOT NULL DEFAULT 0
            )""")
        migrated = Database(legacy_path)
        columns = migrated.all("PRAGMA table_info(story_segments)")
        self.assertIn("metadata_json", {column["name"] for column in columns})

    def test_scanned_pdf_is_rejected(self):
        from pypdf import PdfWriter
        source = self.root / "scan.pdf"
        writer = PdfWriter()
        writer.add_blank_page(width=600, height=800)
        with source.open("wb") as output:
            writer.write(output)
        with self.assertRaisesRegex(ValueError, "不支持扫描图片 OCR"):
            extract_text(source)

    def test_package_roundtrip_and_compat(self):
        store_image(self.db, self.library, self.image(), self.item.id, "front", "photo.png", "image/png")
        self.db.execute("INSERT INTO skipped_faces(item_id,face) VALUES(?,?)", (self.item.id, "back"))
        pack = self.library / "exports" / "test.atopack"
        result = export_package(self.db, self.library, pack)
        self.assertEqual(1, result["assets"])
        with zipfile.ZipFile(pack) as archive:
            # .atopack keeps the original project tree and filename rather
            # than replacing them with an opaque hash-based member name.
            self.assertIn("assets/test/001-front.jpg", archive.namelist())
        inspection = inspect_package(self.db, pack)
        self.assertEqual(1, inspection["summary"]["same"])
        self.assertEqual({"add": 0, "replace": 0}, inspection["stories"])
        target_library = self.root / "friend"
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (target_library / child).mkdir(parents=True, exist_ok=True)
        friend = Database(target_library / "library.sqlite3")
        imported = import_package(friend, target_library, pack)
        self.assertEqual(1, imported["imported"])
        self.assertEqual(1, friend.one("SELECT COUNT(*) n FROM skipped_faces")["n"])
        restored = friend.one("SELECT * FROM asset_revisions WHERE is_current=1")
        deferred_preview = target_library / restored["preview_path"]
        self.assertFalse(deferred_preview.exists())
        self.assertIsNone(restored["width"])
        self.assertEqual(deferred_preview, ensure_preview(friend, target_library, restored["preview_path"]))
        self.assertTrue(deferred_preview.is_file())
        plan_root = self.root / "friend-ato"
        for child in ("aibp", "map", "story", "technology"):
            (plan_root / child).mkdir(parents=True)
        (plan_root / "index.html").write_text("ATO", encoding="utf-8")
        restored_plan = install_plan(friend, target_library, plan_root)
        self.assertTrue(restored_plan["files"][0]["source"].startswith("objects/"))
        self.assertTrue(restored_plan["files"][0]["direct_copy"])
        restored_apply = apply_install(friend, target_library, plan_root, [])
        self.assertEqual(1, restored_apply["installed"])
        self.assertEqual(1, install_plan(friend, target_library, plan_root)["summary"]["same"])
        compat = self.library / "exports" / "compat.zip"
        export_compat(self.db, self.library, compat)
        with zipfile.ZipFile(compat) as archive:
            self.assertIn("assets/test/001-front.jpg", archive.namelist())
            self.assertEqual(b"\xff\xd8", archive.read("assets/test/001-front.jpg")[:2])

    def test_package_roundtrip_includes_entity_biographies(self):
        self.db.execute(
            "INSERT INTO story_books(id,title,source_name,source_path,status) VALUES(?,?,?,?,?)",
            ("c1", "Test Story", "test", "", "review"),
        )
        self.db.execute(
            """INSERT INTO story_segments(
            book_id,chapter_key,chapter_title,entry_number,title,body,sort_order,reviewed
            ) VALUES(?,?,?,?,?,?,?,?)""",
            ("c1", "main", "Story", "0001", "Start", "Hero enters.", 0, 1),
        )
        ato_source = self.root / "source-ato"
        (ato_source / "story/data").mkdir(parents=True)
        entity_payload = {
            "generatedAt": "test",
            "entityCount": 1,
            "entities": [{
                "id": "hero",
                "name": "Hero",
                "matchAliases": ["Hero"],
                "intro": "The test hero.",
            }],
        }
        (ato_source / "story/data/entity-index.json").write_text(
            json.dumps(entity_payload, ensure_ascii=False),
            encoding="utf-8",
        )

        pack = self.library / "exports" / "entities.atopack"
        exported = export_package(self.db, self.library, pack, ato_root=ato_source)
        self.assertTrue(exported["entity_index"])
        inspected = inspect_package(self.db, pack, verify_hashes=True)
        self.assertEqual({"included": True, "entity_count": 1}, inspected["entity_index"])
        with zipfile.ZipFile(pack) as archive:
            self.assertIn("story/entity-index.json", archive.namelist())
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(2, manifest["version"])

        friend_library = self.root / "entity-friend"
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (friend_library / child).mkdir(parents=True, exist_ok=True)
        friend = Database(friend_library / "library.sqlite3")
        imported = import_package(friend, friend_library, pack)
        self.assertTrue(imported["entity_index_imported"])
        self.assertTrue((friend_library / "sources/story/entity-index.json").is_file())

        install_root = self.root / "entity-ato"
        for child in ("aibp", "map", "story", "technology"):
            (install_root / child).mkdir(parents=True)
        (install_root / "index.html").write_text("ATO", encoding="utf-8")
        plan = install_plan(friend, friend_library, install_root)
        targets = {entry["target"] for entry in plan["files"]}
        self.assertIn("story/data/entity-index.json", targets)
        self.assertIn("story/data/entity-index.js", targets)
        apply_install(friend, friend_library, install_root, [])
        installed_js = (install_root / "story/data/entity-index.js").read_text(encoding="utf-8")
        self.assertIn("window.STORY_ENTITY_INDEX", installed_js)
        self.assertIn('"id": "hero"', installed_js)

        compat = friend_library / "exports" / "entities-compat.zip"
        compat_result = export_compat(friend, friend_library, compat)
        self.assertTrue(compat_result["entity_index"])
        with zipfile.ZipFile(compat) as archive:
            self.assertIn("story/data/storybook-data.js", archive.namelist())
            self.assertIn("story/data/entity-index.json", archive.namelist())
            self.assertIn("story/data/entity-index.js", archive.namelist())

    def test_v2_story_package_requires_entity_biographies(self):
        pack = self.library / "tmp" / "missing-entities.atopack"
        with zipfile.ZipFile(pack, "w", allowZip64=True) as archive:
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack",
                "version": 2,
                "items": [],
                "assets": [],
                "stories": {"books": [{"id": "c1", "title": "Story", "entries": []}]},
                "storyFiles": [],
            }))
        with self.assertRaisesRegex(ValueError, "没有人物小传索引"):
            inspect_package(self.db, pack)

    def test_entity_index_can_be_loaded_from_runtime_javascript(self):
        ato = self.root / "js-only-ato"
        target = ato / "story/data/entity-index.js"
        target.parent.mkdir(parents=True)
        target.write_text(
            '(function () {\n  window.STORY_ENTITY_INDEX = {"entities":[{"id":"hero","name":"Hero"}]};\n})();\n',
            encoding="utf-8",
        )
        entity_index = find_entity_index(self.library, ato)
        self.assertIsNotNone(entity_index)
        self.assertEqual(1, entity_index.entity_count)

    def test_package_story_roundtrip_preserves_subchapter_metadata(self):
        pack = self.library / "tmp" / "stories.atopack"
        story_entry = {
            "key": "c4-mnemos-M001",
            "id": "M001",
            "title": "M001",
            "entryType": "number",
            "chapterKey": "mnemos-breakthroughs",
            "chapter": "回忆突破",
            "encounterKey": "第三个愿望-the-third-wish",
            "encounter": "第三个愿望 (The Third Wish)",
            "section": "第三个愿望 (The Third Wish)",
            "order": 123,
            "line": 42,
            "links": ["0123"],
            "text": "测试正文",
        }
        with zipfile.ZipFile(pack, "w", allowZip64=True) as archive:
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack", "version": 1, "items": [], "assets": [],
                "stories": {
                    "generatedAt": "fixture",
                    "books": [{
                        "id": "c4", "title": "测试 C4", "entryCount": 1,
                        "chapters": [{"key": "mnemos-breakthroughs", "title": "回忆突破"}],
                        "entries": [story_entry],
                    }],
                },
            }, ensure_ascii=False))

        imported = import_package(self.db, self.library, pack)
        self.assertEqual(1, imported["stories_imported"])
        restored = storybook_payload(self.db, reviewed_only=True)["books"][0]["entries"][0]
        self.assertEqual(story_entry, restored)

        ato = self.root / "story-ato"
        for child in ("aibp", "map", "story", "technology"):
            (ato / child).mkdir(parents=True)
        (ato / "index.html").write_text("ATO", encoding="utf-8")
        apply_install(self.db, self.library, ato, [])
        installed = (ato / "story/data/storybook-data.js").read_text(encoding="utf-8")
        self.assertIn('"encounterKey":"第三个愿望-the-third-wish"', installed)
        self.assertIn('"links":["0123"]', installed)

        entity_index = self.library / "sources/story/entity-index.json"
        entity_index.parent.mkdir(parents=True, exist_ok=True)
        entity_index.write_text(
            json.dumps({
                "entityCount": 1,
                "entities": [{"id": "test", "name": "Test", "intro": "Test biography"}],
            }),
            encoding="utf-8",
        )
        exported = self.library / "exports" / "stories-roundtrip.atopack"
        export_package(self.db, self.library, exported)
        with zipfile.ZipFile(exported) as archive:
            manifest = json.loads(archive.read("manifest.json"))
        exported_entry = manifest["stories"]["books"][0]["entries"][0]
        self.assertEqual(story_entry, exported_entry)

    def test_package_backfills_story_metadata_without_replacing_body(self):
        self.db.execute(
            "INSERT INTO story_books(id,title,source_name,source_path,status) VALUES(?,?,?,?,?)",
            ("c4", "本地 C4", "旧资料包", "", "review"),
        )
        self.db.execute(
            """INSERT INTO story_segments(
            book_id,chapter_key,chapter_title,entry_number,title,body,sort_order,reviewed
            ) VALUES(?,?,?,?,?,?,?,?)""",
            ("c4", "mnemos-breakthroughs", "回忆突破", "M001", "M001", "本地校对正文", 0, 1),
        )
        pack = self.library / "tmp" / "backfill.atopack"
        with zipfile.ZipFile(pack, "w", allowZip64=True) as archive:
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack", "version": 1, "items": [], "assets": [],
                "stories": {"books": [{
                    "id": "c4", "title": "包内 C4", "entries": [{
                        "key": "c4-mnemos-M001", "id": "M001", "title": "M001",
                        "chapterKey": "mnemos-breakthroughs", "chapter": "回忆突破",
                        "encounterKey": "第三个愿望-the-third-wish",
                        "encounter": "第三个愿望 (The Third Wish)",
                        "links": ["0123"], "text": "包内正文",
                    }],
                }]},
            }, ensure_ascii=False))

        imported = import_package(self.db, self.library, pack, replace=False)
        self.assertEqual(1, imported["stories_imported"])
        restored = storybook_payload(self.db, reviewed_only=True)["books"][0]["entries"][0]
        self.assertEqual("本地校对正文", restored["text"])
        self.assertEqual("第三个愿望-the-third-wish", restored["encounterKey"])
        self.assertEqual(["0123"], restored["links"])

    def test_import_package_retires_obsolete_scan_item_without_deleting_assets(self):
        obsolete = CatalogItem(
            id="c3:aibp:hypertime-oracle-ai:hypertime-oracle-ai-iii-007",
            cycle="c3", module="AIBP", subgroup="HYPERTIME_ORACLE / AI",
            name="旧 AI III 007", number="HYPERTIME_ORACLE_AI_III_007", sort_order=7,
            faces={"front": "aibp/ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_III_007.jpg"},
        )
        apply_catalog(self.db, [self.item, obsolete], {"apk": "test.apk", "stories": [], "aibp_enemies": 1})
        store_image(self.db, self.library, self.image(), obsolete.id, "front", "old.png", "image/png")
        pack = self.library / "tmp" / "retire.atopack"
        with zipfile.ZipFile(pack, "w", allowZip64=True) as archive:
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack", "version": 1, "items": [], "assets": [],
                "stories": {"books": []}, "retiredItems": [obsolete.id],
            }))
        import_package(self.db, self.library, pack)
        self.assertEqual(0, self.db.one("SELECT capture_required FROM catalog_items WHERE id=?", (obsolete.id,))["capture_required"])
        self.assertEqual(1, self.db.one("SELECT COUNT(*) n FROM asset_revisions WHERE item_id=?", (obsolete.id,))["n"])

    def test_install_preview_apply_and_backup(self):
        store_image(self.db, self.library, self.image(), self.item.id, "front", "photo.png", "image/png")
        ato = self.root / "ato"
        for child in ("aibp", "map", "story", "technology"):
            (ato / child).mkdir(parents=True)
        (ato / "index.html").write_text("ATO", encoding="utf-8")
        plan = install_plan(self.db, self.library, ato)
        self.assertEqual(1, plan["summary"]["add"])
        result = apply_install(self.db, self.library, ato, [])
        self.assertEqual(1, result["installed"])
        target = ato / "assets/test/001-front.jpg"
        target.write_bytes(b"old")
        replace_plan = install_plan(self.db, self.library, ato)
        self.assertEqual(1, replace_plan["summary"]["replace"])
        result = apply_install(self.db, self.library, ato, ["assets/test/001-front.jpg"])
        self.assertTrue(result["backup"])
        self.assertTrue(any((self.library / "backups").rglob("001-front.jpg")))

    def test_web_ui_has_safe_one_click_install_actions(self):
        static = Path(__file__).resolve().parents[1] / "static"
        html = (static / "index.html").read_text(encoding="utf-8")
        script = (static / "app.js").read_text(encoding="utf-8")
        styles = (static / "styles.css").read_text(encoding="utf-8")
        self.assertIn('id="captureInstall"', html)
        self.assertIn('id="previewInstall" class="button install-cta', html)
        self.assertIn("一键导入并添加到原项目", script)
        self.assertIn("一键添加到原项目", script)
        self.assertIn("replacements:[]", script)
        self.assertIn(".install-cta", styles)


@unittest.skipUnless(APK.is_file(), "APK fixture not available")
class ApkCatalogTests(unittest.TestCase):
    def test_apk_catalog_shape_and_privacy(self):
        items, source = CatalogBuilder(str(APK)).build()
        self.assertEqual(4645, source["source_images"])
        self.assertEqual(19, source["aibp_enemies"])
        self.assertEqual({"c1", "c1.5", "c2", "c2.5", "c3", "c4", "c5"}, {book["id"] for book in source["stories"]})
        self.assertGreater(len(items), 2000)
        self.assertFalse(any("duplicate" in path.lower() or "partial" in path.lower() for item in items for path in item.faces.values()))
        serialized = json.dumps(source, ensure_ascii=False)
        self.assertNotIn("entries", serialized)
        self.assertNotIn("text", serialized)


if __name__ == "__main__":
    unittest.main()
