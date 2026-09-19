"""官方版打包器（tools/build_official_pack.py）的回归测试。

官方版的三个口径：官中图优先替换、缺了保留工程原图；故事书 js 只留官方正文；官方原书
扫描图一起打进包。同时验证 CLI 默认值真的按这套走。

运行（在 asset-studio 目录下）：python -m unittest tests.test_official_pack -v
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.catalog import CatalogItem, apply_catalog
from app.db import Database
from app.packages import import_package, inspect_package
from app.story_extras import ENTITY_INDEX_JSON_TARGET
from tools.build_fan_pack import (
    OFFICIAL_STORY_DATA,
    STORY_DATA_MEMBER,
    PackError,
    Reporter,
    build,
)
from tools.build_official_pack import main as official_main


def _mkdtemp_0777(suffix: str | None = None, prefix: str | None = None, dir: str | None = None) -> str:
    suffix = suffix or ""
    prefix = prefix or "tmp"
    directory = dir or tempfile.gettempdir()
    for _ in range(10000):
        name = os.path.join(directory, prefix + next(tempfile._get_candidate_names()) + suffix)
        try:
            os.mkdir(name, 0o777)
        except FileExistsError:
            continue
        return name
    raise FileExistsError("无法创建临时目录")


def _relax_tempdirs_when_the_sandbox_forbids_0700_dirs() -> None:
    probe = tempfile.mkdtemp()
    try:
        (Path(probe) / "probe").write_text("x", encoding="utf-8")
    except OSError:
        tempfile.mkdtemp = _mkdtemp_0777
    finally:
        shutil.rmtree(probe, ignore_errors=True)


_relax_tempdirs_when_the_sandbox_forbids_0700_dirs()

QUIET = Reporter(quiet=True)
FAN_MARKER = "民间正文甲"
OFFICIAL_MARKER = "官方正文甲"


class OfficialFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.ato = self.root / "ato"
        # 工程图：001 有官中覆盖图，002 没有（必须原样保留）
        self.project_images = {
            "assets/test/001-front.jpg": (10, 20, 30),
            "assets/test/002.png": (40, 50, 60),
        }
        for relative, color in self.project_images.items():
            path = self.ato / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (240, 320), color).save(path)
        (self.ato / "index.html").write_text("<html></html>", encoding="utf-8")

        # 官中覆盖图：只覆盖 001
        overlay = self.ato / "official-assets" / "assets" / "test"
        overlay.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (240, 320), (200, 30, 30)).save(overlay / "001-front.jpg")
        self.overlay_digest = hashlib.sha256((overlay / "001-front.jpg").read_bytes()).hexdigest()
        self.project_digests = {
            relative: hashlib.sha256((self.ato / relative).read_bytes()).hexdigest()
            for relative in self.project_images
        }

        self.catalog = [
            CatalogItem(
                id="c1:test:cards:001", cycle="c1", module="测试卡", subgroup="测试",
                name="测试卡 001", number="001", sort_order=1,
                faces={"front": "assets/test/001-front.jpg"},
            ),
            CatalogItem(
                id="c1:test:cards:002", cycle="c1", module="测试卡", subgroup="测试",
                name="测试卡 002", number="002", sort_order=2,
                faces={"front": "assets/test/002.png"},
            ),
        ]
        self.payload = {
            "items": [
                {
                    "id": item.id, "cycle": item.cycle, "module": item.module, "subgroup": item.subgroup,
                    "name": item.name, "number": item.number, "sort_order": item.sort_order,
                    "capture_required": item.capture_required, "faces": item.faces,
                }
                for item in self.catalog
            ],
            "source": {"catalog_version": "test-official-catalog", "catalog_items": len(self.catalog)},
        }

        # 民间骨架（章节/order/links 这些元数据由它提供）
        story_dir = self.ato / "story" / "data"
        story_dir.mkdir(parents=True, exist_ok=True)
        skeleton = {
            "generatedAt": "ATO Asset Studio",
            "books": [
                {
                    "id": "c1",
                    "title": "ATO C1 测试故事书",
                    "entryCount": 3,
                    "chapters": [{"key": "main", "title": "主线"}, {"key": "battle", "title": "战斗"}],
                    "entries": [
                        {"key": "c1-0-0", "id": "0001", "title": "民间标题甲", "chapterKey": "main",
                         "chapter": "主线", "section": "主线", "order": 0, "text": FAN_MARKER},
                        {"key": "c1-0-1", "id": "0002", "title": "民间标题乙", "chapterKey": "main",
                         "chapter": "主线", "section": "主线", "order": 1, "text": "民间正文乙"},
                        {"key": "c1-15-0", "id": "battle-slug", "title": "民间标题丙", "chapterKey": "battle",
                         "chapter": "战斗", "section": "战斗", "order": 0, "text": "民间正文丙"},
                    ],
                }
            ],
        }
        (story_dir / "storybook-data.js").write_text(
            "window.STORYBOOK_DATA = " + json.dumps(skeleton, ensure_ascii=False) + ";\n", encoding="utf-8"
        )
        # 官方数据：甲有官方正文、乙没有（要丢）、丙有官方正文，另加一条官方独有的条目
        official = {
            "officialVersion": {"label": "测试"},
            "books": [
                {
                    "id": "c1",
                    "entries": [
                        {"key": "c1-0-0", "id": "0001", "officialTitle": "官方标题甲",
                         "officialText": OFFICIAL_MARKER,
                         "officialScan": {"src": "./data/ato-storybook-key-scans/c1-0-0.jpg"}},
                        {"key": "c1-0-1", "id": "0002", "officialTitle": "官方标题乙"},
                        {"key": "c1-15-0", "id": "battle-slug", "officialTitle": "官方标题丙",
                         "officialText": "官方正文丙",
                         "officialScan": {"src": "./data/ato-storybook-key-scans/c1-15-0.jpg"}},
                        {"key": "c1-9-official-0001", "id": "official-only", "officialTitle": "官方独有条目",
                         "officialText": "官方正文丁",
                         "officialScan": {"src": "./data/ato-storybook-key-scans/c1-9-official-0001.jpg"}},
                    ],
                }
            ],
        }
        (self.ato / OFFICIAL_STORY_DATA).write_text(
            "window.STORYBOOK_OFFICIAL_DATA = " + json.dumps(official, ensure_ascii=False) + ";\n",
            encoding="utf-8",
        )
        scans = story_dir / "ato-storybook-key-scans"
        scans.mkdir(parents=True, exist_ok=True)
        for name in ("c1-0-0.jpg", "c1-15-0.jpg", "c1-9-official-0001.jpg"):
            Image.new("RGB", (60, 80), (1, 2, 3)).save(scans / name)
        (story_dir / "entity-index.json").write_text(
            json.dumps({"generatedAt": "test", "entities": [{"id": "e1", "name": "测试人物"}]}, ensure_ascii=False),
            encoding="utf-8",
        )
        (self.ato / "assets" / "bgm").mkdir(parents=True, exist_ok=True)
        (self.ato / "assets" / "bgm" / "LB_Test_1.mp3").write_bytes(b"ID3fake-audio-bytes")

        self.library = self.root / "library"
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (self.library / child).mkdir(parents=True, exist_ok=True)
        self.db = Database(self.library / "library.sqlite3")
        apply_catalog(self.db, self.catalog, {"apk": "test.apk", "stories": [], "aibp_enemies": 0})

        self.output = self.root / "official.atopack"

    def tearDown(self):
        self.temp.cleanup()

    def build(self, **overrides) -> dict:
        kwargs = {
            "ato_root": self.ato,
            "output": self.output,
            "library_path": None,
            "cycles": [],
            "modules": [],
            "complete_only": False,
            "include_story_data": True,
            "include_bgm": True,
            "include_story_files": True,
            "official_story": True,
            "official_scans": True,
            "official_assets": True,
            "skip_missing": False,
            "force": False,
            "dry_run": False,
            "compression_name": "store",
            "verify_mode": "full",
            "verify_sample": 32,
            "reporter": QUIET,
            "story_source": "official",
            "edition": "official",
        }
        kwargs.update(overrides)
        with patch("tools.build_fan_pack.fixed_catalog_payload", return_value=self.payload):
            return build(**kwargs)

    def read_manifest(self, path: Path | None = None) -> dict:
        with zipfile.ZipFile(path or self.output) as archive:
            return json.loads(archive.read("manifest.json").decode("utf-8"))

    def pack_member_bytes(self, member: str) -> bytes:
        with zipfile.ZipFile(self.output) as archive:
            return archive.read(member)


class OfficialPackTests(OfficialFixture):
    def test_official_images_replace_and_otherwise_keep_project(self):
        result = self.build()
        self.assertEqual(1, result.from_official_assets, "官中图命中一张")
        self.assertEqual(1, result.from_project, "没有官中图的那张保留工程原图")
        self.assertEqual(0, result.from_library)
        self.assertEqual(
            self.overlay_digest,
            hashlib.sha256(self.pack_member_bytes("assets/test/001-front.jpg")).hexdigest(),
        )
        self.assertEqual(
            self.project_digests["assets/test/002.png"],
            hashlib.sha256(self.pack_member_bytes("assets/test/002.png")).hexdigest(),
        )

    def test_no_official_assets_flag_keeps_project_images(self):
        self.build(official_assets=False)
        self.assertEqual(
            self.project_digests["assets/test/001-front.jpg"],
            hashlib.sha256(self.pack_member_bytes("assets/test/001-front.jpg")).hexdigest(),
        )

    def test_story_js_keeps_only_official_text(self):
        result = self.build()
        self.assertEqual(OFFICIAL_STORY_DATA, result.story_source)
        self.assertEqual(1, result.story_entries_dropped, "没有官方正文的那条要丢掉")
        self.assertEqual(1, result.story_entries_added, "官方独有的条目要补进来")

        raw = self.pack_member_bytes(STORY_DATA_MEMBER).decode("utf-8")
        self.assertTrue(raw.startswith("window.STORYBOOK_DATA = "))
        payload = json.loads(raw[len("window.STORYBOOK_DATA = "):].strip().removesuffix(";"))
        self.assertEqual(1, len(payload["books"]))
        entries = {entry["key"]: entry for entry in payload["books"][0]["entries"]}
        self.assertEqual({"c1-0-0", "c1-15-0", "c1-9-official-0001"}, set(entries))
        self.assertNotIn("c1-0-1", entries, "没有官方正文的条目不该出现")
        self.assertEqual(OFFICIAL_MARKER, entries["c1-0-0"]["text"])
        self.assertEqual("官方标题甲", entries["c1-0-0"]["title"])
        self.assertEqual("main", entries["c1-0-0"]["chapterKey"], "章节等骨架元数据要保留")
        self.assertEqual(0, entries["c1-0-0"]["order"])
        extra = entries["c1-9-official-0001"]
        self.assertEqual("官方正文丁", extra["text"])
        self.assertEqual("main", extra["chapterKey"])
        # 民间正文一个字都不能进包
        with zipfile.ZipFile(self.output) as archive:
            for name in archive.namelist():
                self.assertNotIn(FAN_MARKER.encode("utf-8"), archive.read(name), f"{name} 里有民间正文")
                self.assertNotIn("民间正文乙".encode("utf-8"), archive.read(name), f"{name} 里有民间正文")

        manifest = self.read_manifest()
        self.assertEqual("official", manifest["build"]["edition"])
        self.assertTrue(manifest["build"]["officialScans"])

    def test_story_source_project_keeps_fan_text(self):
        result = self.build(story_source="project")
        self.assertEqual(STORY_DATA_MEMBER, result.story_source)
        raw = self.pack_member_bytes(STORY_DATA_MEMBER).decode("utf-8")
        self.assertIn(FAN_MARKER, raw)
        self.assertEqual(0, result.story_entries_dropped)

    def test_official_scans_are_packed_with_the_story_data(self):
        result = self.build()
        self.assertEqual(4, result.official_files, "官方正文数据 1 个 + 扫描图 3 张")
        self.assertEqual(3, result.package_version)
        manifest = self.read_manifest()
        targets = sorted(item["target"] for item in manifest["resourceFiles"])
        self.assertEqual(
            [
                "story/data/ato-storybook-key-scans/c1-0-0.jpg",
                "story/data/ato-storybook-key-scans/c1-15-0.jpg",
                "story/data/ato-storybook-key-scans/c1-9-official-0001.jpg",
                OFFICIAL_STORY_DATA,
            ],
            targets,
        )
        with zipfile.ZipFile(self.output) as archive:
            names = set(archive.namelist())
            for target in targets:
                self.assertIn(target, names)
            self.assertIn("story/entity-index.json", names)
            self.assertIn("assets/bgm/LB_Test_1.mp3", names)

    def test_no_official_scans_keeps_only_the_story_data(self):
        result = self.build(official_scans=False)
        self.assertEqual(1, result.official_files)
        self.assertEqual(3, result.package_version, "只带官方正文数据也是版本 3")
        manifest = self.read_manifest()
        self.assertEqual([OFFICIAL_STORY_DATA], [item["target"] for item in manifest["resourceFiles"]])
        self.assertFalse(manifest["build"]["officialScans"])
        with zipfile.ZipFile(self.output) as archive:
            self.assertFalse([name for name in archive.namelist() if "key-scans" in name])

    def test_missing_scan_stops_the_build(self):
        (self.ato / "story" / "data" / "ato-storybook-key-scans" / "c1-15-0.jpg").unlink()
        with self.assertRaises(PackError):
            self.build()

    def test_missing_official_data_stops_the_build(self):
        (self.ato / OFFICIAL_STORY_DATA).unlink()
        with self.assertRaises(PackError):
            self.build()

    def test_package_round_trips_through_the_studio(self):
        self.build()
        outcome = (
            inspect_package(self.db, self.output, verify_hashes=True, library=self.library)
        )
        self.assertEqual(2, outcome["summary"]["same"] + outcome["summary"]["add"] + outcome["summary"]["replace"])
        self.assertEqual(0, outcome["summary"]["missing"])
        self.assertEqual(4, outcome["official_resources"])
        self.assertEqual(1, outcome["stories"]["add"])
        self.assertTrue(outcome["entity_index"]["included"])

        target = self.root / "imported"
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (target / child).mkdir(parents=True, exist_ok=True)
        fresh = Database(target / "library.sqlite3")
        apply_catalog(fresh, self.catalog, {"apk": "test.apk", "stories": [], "aibp_enemies": 0})
        imported = import_package(fresh, target, self.output, replace=False)
        self.assertEqual(2, imported["imported"])
        self.assertEqual(1, imported["stories_imported"])
        self.assertTrue(imported["entity_index_imported"])
        self.assertEqual(1, imported["bgm_imported"])
        self.assertTrue((target / "sources" / "official-resources" / OFFICIAL_STORY_DATA).is_file())
        scan = target / "sources" / "official-resources" / "story/data/ato-storybook-key-scans/c1-0-0.jpg"
        self.assertTrue(scan.is_file())

    def test_atomic_write_still_guaranteed(self):
        with patch("tools.build_fan_pack.verify_partial", side_effect=PackError("模拟校验失败")):
            with self.assertRaises(PackError):
                self.build()
        self.assertFalse(self.output.exists())
        self.assertTrue(Path(str(self.output) + ".partial").exists())


class OfficialCliTests(OfficialFixture):
    def test_cli_defaults_match_the_official_edition(self):
        buffer = io.StringIO()
        with patch("tools.build_fan_pack.fixed_catalog_payload", return_value=self.payload):
            with redirect_stdout(buffer):
                code = official_main(
                    ["--ato-root", str(self.ato), "--output", str(self.output), "--dry-run", "--json", "--quiet"]
                )
        self.assertEqual(0, code)
        result = json.loads(buffer.getvalue())
        self.assertEqual("official", result["edition"])
        self.assertTrue(result["official_scans"], "官方版默认打包原书扫描图")
        self.assertEqual(OFFICIAL_STORY_DATA, result["story_source"], "官方版默认只留官方正文")
        self.assertEqual(1, result["from_official_assets"], "官方版默认用 official-assets 覆盖图")
        self.assertEqual(4, result["official_files"])
        self.assertFalse(self.output.exists(), "--dry-run 不写盘")

    def test_cli_dry_run_does_not_write(self):
        buffer = io.StringIO()
        with patch("tools.build_fan_pack.fixed_catalog_payload", return_value=self.payload):
            with redirect_stdout(buffer):
                code = official_main(
                    [
                        "--ato-root", str(self.ato), "--output", str(self.output),
                        "--no-official-scans", "--no-official-assets", "--story-source", "project",
                        "--dry-run", "--json", "--quiet",
                    ]
                )
        self.assertEqual(0, code)
        result = json.loads(buffer.getvalue())
        self.assertFalse(result["official_scans"])
        self.assertEqual(0, result["from_official_assets"])
        self.assertEqual(STORY_DATA_MEMBER, result["story_source"])


if __name__ == "__main__":
    unittest.main()
