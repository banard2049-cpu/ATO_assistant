from __future__ import annotations

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image

from app.catalog import CatalogBuilder, CatalogItem, apply_catalog, catalog_stats
from app.db import Database
from app.fixed_catalog import ensure_fixed_catalog, fixed_catalog_payload
from app.fixed_resources import RESOURCE_MAP, card_resource_note, card_resources
from app.installer import apply_install, install_plan
from app.packages import export_compat, export_package, import_package, inspect_package
from app.storage import store_image
from app.stories import import_story, merge_next_segment, split_segment, story_segments, storybook_payload
from app.stories import extract_text


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
        self.assertEqual(2450, result["items"])
        self.assertEqual(19, result["aibp_enemies"])
        self.assertEqual({"c1", "c1.5", "c2", "c2.5", "c3", "c4", "c5"}, {book["id"] for book in payload["source"]["stories"]})
        self.assertNotIn("apk", payload["source"])
        self.assertFalse(any("entries" in book or "text" in book for book in payload["source"]["stories"]))
        self.assertEqual([{"key": "RA", "label": "神浆原液", "count": 1}], card_resources("HEKATON_BP_I_001"))
        self.assertEqual([], card_resources("HEKATON_AI_I_001"))
        self.assertEqual(342, len(RESOURCE_MAP))
        self.assertEqual("无直接资源（特殊 BP）", card_resource_note("TITAN_X_BP_I_001", "TITAN_X / BP"))

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
        compat = self.library / "exports" / "compat.zip"
        export_compat(self.db, self.library, compat)
        with zipfile.ZipFile(compat) as archive:
            self.assertIn("assets/test/001-front.jpg", archive.namelist())
            self.assertEqual(b"\xff\xd8", archive.read("assets/test/001-front.jpg")[:2])

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
