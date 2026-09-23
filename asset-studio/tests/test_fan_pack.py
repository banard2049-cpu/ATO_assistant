"""民间版 .atopack 打包器（tools/build_fan_pack.py）的回归测试。

口径以 ATO_assistant 工程目录为真源（图片 / 故事 / 人物小传 / 官方正文数据 / BGM 都从
``--ato-root`` 读），重点覆盖：

1. 打出来的包**真的能被素材库导入**（用 app/packages 自己的 inspect/import 走一遍往返）；
2. 图片字节来自工程目录，而不是素材库；缺图时素材库只做兜底；
3. 官方故事书正文数据默认进包（版本 3），原书扫描图只在显式要求时进包；
4. 失败时最终路径上什么都不留（半成品挡在 ``.partial``）。

运行（在 asset-studio 目录下）：python -m unittest tests.test_fan_pack -v
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.catalog import CatalogItem, apply_catalog
from app.db import Database
from app.packages import import_package, inspect_package
from app.storage import store_image
from app.story_extras import ENTITY_INDEX_JSON_TARGET, find_entity_index
from tools.build_fan_pack import (
    PackError,
    Reporter,
    build as build_fan_pack,
    installable_target,
    safe_relative,
    verify_partial,
)


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
    """与 test_core.py 同一套办法：受限沙箱里 mkdtemp 建的 0700 目录连子目录都建不出来。"""
    probe = tempfile.mkdtemp()
    try:
        (Path(probe) / "probe").write_text("x", encoding="utf-8")
    except OSError:
        tempfile.mkdtemp = _mkdtemp_0777
    finally:
        shutil.rmtree(probe, ignore_errors=True)


_relax_tempdirs_when_the_sandbox_forbids_0700_dirs()

QUIET = Reporter(quiet=True)
OFFICIAL_STORY_MEMBER = "story/data/storybook-official-data.js"


class Fixture(unittest.TestCase):
    """一个工程目录 + 一个素材库：两者图片字节故意不同，用来验证来源。"""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.ato = self.root / "ato"
        self.images: dict[str, tuple[int, int, int]] = {
            "assets/test/001-front.jpg": (150, 70, 30),
            "assets/test/001-back.png": (20, 120, 200),
            "map/tokens/002.png": (200, 200, 20),
            "ss/terrain/003.jpg": (90, 90, 90),
            "ss/terrain/003-back.jpg": (120, 60, 200),
        }
        for relative, color in self.images.items():
            path = self.ato / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (240, 320), color).save(path)
        (self.ato / "index.html").write_text("<html></html>", encoding="utf-8")

        self.catalog = [
            CatalogItem(
                id="c1:test:cards:001", cycle="c1", module="测试卡", subgroup="测试",
                name="测试卡 001", number="001", sort_order=1,
                faces={"front": "assets/test/001-front.jpg", "back": "assets/test/001-back.png"},
            ),
        ]
        self.catalog.append(
            CatalogItem(
                id="c2:test:cards:002", cycle="c2", module="测试卡", subgroup="测试",
                name="测试卡 002", number="002", sort_order=2,
                faces={"front": "map/tokens/002.png"},
            )
        )
        self.catalog.append(
            CatalogItem(
                id="c3:test:cards:003", cycle="c3", module="测试卡", subgroup="测试",
                name="测试卡 003", number="003", sort_order=3,
                faces={"front": "ss/terrain/003.jpg", "back": "ss/terrain/003-back.jpg"},
            )
        )
        self.catalog.append(
            CatalogItem(
                id="common:test:bgm:one", cycle="common", module="背景音乐", subgroup="BGM",
                name="测试曲", number="bgm-1", sort_order=4, capture_required=0,
                faces={"front": "assets/bgm/LB_Test_1.mp3"},
            )
        )
        self.payload = {
            "items": [
                {
                    "id": item.id, "cycle": item.cycle, "module": item.module, "subgroup": item.subgroup,
                    "name": item.name, "number": item.number, "sort_order": item.sort_order,
                    "capture_required": item.capture_required, "faces": item.faces,
                }
                for item in self.catalog
            ],
            "source": {"catalog_version": "test-catalog-1", "catalog_items": len(self.catalog)},
        }

        # 故事正文（工程目录的真源）
        story_dir = self.ato / "story" / "data"
        story_dir.mkdir(parents=True, exist_ok=True)
        story_payload = {
            "generatedAt": "ATO Asset Studio",
            "books": [
                {
                    "id": "c1", "title": "ATO C1 测试故事书", "entryCount": 1,
                    "chapters": [{"key": "main", "title": "主线"}],
                    "entries": [
                        {"key": "c1-0-0", "id": "0001", "title": "0001", "chapterKey": "main",
                         "chapter": "主线", "section": "主线", "text": "民间正文。"}
                    ],
                }
            ],
        }
        (self.ato / "story" / "data" / "storybook-data.js").write_text(
            "window.STORYBOOK_DATA = " + json.dumps(story_payload, ensure_ascii=False) + ";\n",
            encoding="utf-8",
        )
        (self.ato / ENTITY_INDEX_JSON_TARGET).write_text(
            json.dumps({"generatedAt": "test", "entities": [{"id": "e1", "name": "测试人物"}]}, ensure_ascii=False),
            encoding="utf-8",
        )
        # 官方故事书正文数据（默认进包 → 版本 3）
        (self.ato / OFFICIAL_STORY_MEMBER).write_text(
            "window.STORYBOOK_OFFICIAL_DATA = "
            + json.dumps(
                {"books": [{"id": "c1", "entries": [
                    {"id": "0001", "officialScan": {"src": "./data/ato-storybook-key-scans/c1-0-0.jpg"}}
                ]}]},
                ensure_ascii=False,
            )
            + ";\n",
            encoding="utf-8",
        )
        # BGM 音频
        (self.ato / "assets" / "bgm").mkdir(parents=True, exist_ok=True)
        (self.ato / "assets" / "bgm" / "LB_Test_1.mp3").write_bytes(b"ID3fake-audio-bytes")

        # 素材库：同一条目、不同字节，用来验证「不取自素材库」
        self.library = self.root / "library"
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (self.library / child).mkdir(parents=True, exist_ok=True)
        self.db = Database(self.library / "library.sqlite3")
        apply_catalog(self.db, self.catalog, {"apk": "test.apk", "stories": [], "aibp_enemies": 0})
        self.library_shas: dict[tuple[str, str], str] = {}
        for item, face, color in (
            (self.catalog[0], "front", (9, 9, 9)),
            (self.catalog[0], "back", (8, 8, 8)),
            (self.catalog[1], "front", (7, 7, 7)),
            (self.catalog[2], "front", (6, 6, 6)),
        ):
            source = self.library / "tmp" / f"{item.id.replace(':', '-')}-{face}.png"
            Image.new("RGB", (240, 320), color).save(source)
            stored = store_image(self.db, self.library, source, item.id, face, source.name, "image/png")
            self.library_shas[(item.id, face)] = stored["sha256"]

        self.output = self.root / "fan.atopack"

    def tearDown(self):
        self.temp.cleanup()

    # -- helpers -----------------------------------------------------------------
    def project_bytes(self, relative: str) -> bytes:
        return (self.ato / relative).read_bytes()

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
            "official_scans": False,
            "official_assets": False,
            "skip_missing": False,
            "force": False,
            "dry_run": False,
            "compression_name": "store",
            "verify_mode": "full",
            "verify_sample": 32,
            "reporter": QUIET,
        }
        kwargs.update(overrides)
        with patch("tools.build_fan_pack.fixed_catalog_payload", return_value=self.payload):
            return build_fan_pack(**kwargs)

    def read_manifest(self, path: Path | None = None) -> dict:
        with zipfile.ZipFile(path or self.output) as archive:
            return json.loads(archive.read("manifest.json").decode("utf-8"))


class IncrementalTests(Fixture):
    """增量打包：--incremental-from 复用未变成员，产出与全量等价。"""

    def base_pack(self, name: str = "base.atopack") -> Path:
        """先打一个全量包当底包。"""
        base = self.root / name
        self.build(output=base, force=True)
        return base

    def build_incremental(self, base: Path, name: str = "again.atopack", **overrides):
        return self.build(output=self.root / name, force=True, incremental_from=base, **overrides)

    def member_bytes(self, pack: Path) -> dict[str, bytes]:
        with zipfile.ZipFile(pack) as archive:
            return {name: archive.read(name) for name in archive.namelist()}

    def test_incremental_pack_equals_full_pack_and_reuses(self):
        """没有改动时：成员字节与全量包逐一相同，且大量成员来自复用。"""
        base = self.base_pack()
        result = self.build_incremental(base)
        again = self.root / "again.atopack"

        full_members = self.member_bytes(base)
        incremental_members = self.member_bytes(again)
        self.assertEqual(set(full_members), set(incremental_members))
        for name, data in full_members.items():
            if name == "manifest.json":
                continue  # 清单里含时间戳/复用统计，本就不该逐字节相同
            self.assertEqual(hashlib.sha256(data).hexdigest(),
                             hashlib.sha256(incremental_members[name]).hexdigest(),
                             f"{name} 的字节在增量包里变了")

        # 复用发生在"源摘要与底包清单一致"的成员上；这里至少覆盖工程图片与 BGM。
        self.assertGreaterEqual(result.reused_members, 6)
        self.assertEqual(result.reused_members, self.read_manifest(again)["build"]["reusedMembers"])
        self.assertTrue(self.read_manifest(again)["build"]["incrementalFrom"])

    def test_changed_source_is_rebuilt_not_reused(self):
        """源文件改了就重新读盘进包，不能沿用底包里的旧字节。"""
        base = self.base_pack()
        before = self.build_incremental(base, name="before.atopack")
        target = self.ato / "assets/test/001-front.jpg"
        Image.new("RGB", (240, 320), (7, 200, 90)).save(target)

        after = self.build_incremental(base, name="after.atopack")
        self.assertLess(after.reused_members, before.reused_members, "改过的成员不该再复用")
        with zipfile.ZipFile(self.root / "after.atopack") as archive:
            self.assertEqual(
                hashlib.sha256(target.read_bytes()).hexdigest(),
                hashlib.sha256(archive.read("assets/test/001-front.jpg")).hexdigest(),
            )

    def test_write_pack_records_image_quality_policy(self):
        """清单记下图片编码口径；底包与本次口径不同时增量自动退回全量。"""
        base = self.base_pack()
        manifest = self.read_manifest(base)
        self.assertIsNone(manifest["build"]["imageQuality"])
        self.assertEqual([], manifest["build"]["imageQualityKeep"])

        switched = self.build_incremental(base, name="q85.atopack", image_quality=85)
        self.assertEqual(0, switched.reused_members, "编码口径变了就不该复用底包字节")
        self.assertEqual(85, self.read_manifest(self.root / "q85.atopack")["build"]["imageQuality"])

    def test_broken_base_pack_fails_loudly(self):
        """底包不是完整资料包时直接报错，不静默退化成全量。"""
        broken = self.root / "broken.atopack"
        broken.write_bytes(b"PK\x03\x04not-a-real-zip")
        with self.assertRaises(PackError):
            self.build_incremental(broken, name="never.atopack")


class ProjectSourceTests(Fixture):
    def test_pack_is_complete_importable_and_comes_from_the_project(self):
        result = self.build()
        self.assertTrue(self.output.is_file())
        self.assertFalse(Path(str(self.output) + ".partial").exists())
        self.assertEqual(5, result.assets, "BGM 目标不该算进 assets")
        self.assertEqual(4, result.items)
        self.assertEqual(5, result.from_project)
        self.assertEqual(0, result.from_library)
        self.assertEqual(3, result.package_version, "带官方正文数据就是版本 3")
        self.assertEqual(1, result.stories_books)
        self.assertEqual(1, result.official_files)
        self.assertEqual(1, result.bgm_files)
        self.assertFalse(result.official_scans)

        manifest = self.read_manifest()
        self.assertEqual("ato-asset-pack", manifest["format"])
        self.assertEqual(3, manifest["version"])
        self.assertEqual([OFFICIAL_STORY_MEMBER], [item["target"] for item in manifest["resourceFiles"]])
        self.assertFalse(manifest["build"]["officialScans"])
        self.assertEqual(5, len(manifest["assets"]))
        self.assertEqual(1, len(manifest["bgmFiles"]))
        self.assertEqual([], manifest["progress"]["skippedFaces"])
        with zipfile.ZipFile(self.output) as archive:
            names = set(archive.namelist())
            # 图片字节必须就是工程目录里的字节，而不是素材库那张
            self.assertEqual(
                hashlib.sha256(self.project_bytes("assets/test/001-front.jpg")).hexdigest(),
                hashlib.sha256(archive.read("assets/test/001-front.jpg")).hexdigest(),
            )
            self.assertNotEqual(
                self.library_shas[("c1:test:cards:001", "front")],
                hashlib.sha256(archive.read("assets/test/001-front.jpg")).hexdigest(),
            )
            for member in (
                "assets/test/001-front.jpg", "assets/test/001-back.png", "map/tokens/002.png",
                "ss/terrain/003.jpg", OFFICIAL_STORY_MEMBER, "story/entity-index.json",
                "story/data/storybook-data.js", "story/data/entity-index.json",
                "story/data/entity-index.js", "assets/bgm/LB_Test_1.mp3", "manifest.json",
            ):
                self.assertIn(member, names)
            # 官方原书扫描图默认不进包
            self.assertFalse([name for name in names if "key-scans" in name])

        inspection = inspect_package(self.db, self.output, verify_hashes=True, library=self.library)
        self.assertEqual(5, inspection["summary"]["same"] + inspection["summary"]["add"] + inspection["summary"]["replace"])
        self.assertEqual(0, inspection["summary"]["missing"])
        self.assertEqual(1, inspection["official_resources"])
        self.assertTrue(inspection["entity_index"]["included"])

    def test_round_trips_into_a_fresh_library(self):
        self.build()
        target = self.root / "imported"
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (target / child).mkdir(parents=True, exist_ok=True)
        fresh = Database(target / "library.sqlite3")
        apply_catalog(fresh, self.catalog, {"apk": "test.apk", "stories": [], "aibp_enemies": 0})

        outcome = import_package(fresh, target, self.output, replace=False)
        self.assertEqual(5, outcome["imported"])
        self.assertEqual(1, outcome["stories_imported"])
        self.assertTrue(outcome["entity_index_imported"])
        self.assertEqual(1, outcome["bgm_imported"])
        restored = {
            (row["item_id"], row["face"]): row["sha256"]
            for row in fresh.all("SELECT item_id,face,sha256 FROM asset_revisions WHERE is_current=1")
        }
        self.assertEqual(
            hashlib.sha256(self.project_bytes("assets/test/001-front.jpg")).hexdigest(),
            restored[("c1:test:cards:001", "front")],
        )
        self.assertEqual(
            hashlib.sha256(self.project_bytes("map/tokens/002.png")).hexdigest(),
            restored[("c2:test:cards:002", "front")],
        )
        self.assertTrue((target / "sources" / "official-resources" / OFFICIAL_STORY_MEMBER).is_file())
        self.assertEqual(1, find_entity_index(target).entity_count)

    def test_library_is_only_a_fallback(self):
        (self.ato / "map" / "tokens" / "002.png").unlink()
        with self.assertRaises(PackError):
            self.build()
        result = self.build(library_path=self.library)
        self.assertEqual(1, result.from_library, "工程目录缺的那张由素材库兜底")
        self.assertEqual(4, result.from_project)
        with zipfile.ZipFile(self.output) as archive:
            self.assertEqual(
                self.library_shas[("c2:test:cards:002", "front")],
                hashlib.sha256(archive.read("map/tokens/002.png")).hexdigest(),
            )

    def test_official_assets_overlay_only_when_asked(self):
        overlay = self.ato / "official-assets" / "assets" / "test"
        overlay.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (240, 320), (1, 1, 250)).save(overlay / "001-front.jpg")
        overlay_digest = hashlib.sha256((overlay / "001-front.jpg").read_bytes()).hexdigest()
        self.assertNotEqual(
            overlay_digest, hashlib.sha256(self.project_bytes("assets/test/001-front.jpg")).hexdigest()
        )

        plain = self.build()
        self.assertEqual(0, plain.from_official_assets)
        with zipfile.ZipFile(self.output) as archive:
            self.assertEqual(
                hashlib.sha256(self.project_bytes("assets/test/001-front.jpg")).hexdigest(),
                hashlib.sha256(archive.read("assets/test/001-front.jpg")).hexdigest(),
            )

        opted_in = self.build(official_assets=True, force=True)
        self.assertEqual(1, opted_in.from_official_assets)
        with zipfile.ZipFile(self.output) as archive:
            self.assertEqual(
                overlay_digest, hashlib.sha256(archive.read("assets/test/001-front.jpg")).hexdigest()
            )

    def test_official_story_data_is_opt_out(self):
        result = self.build(official_story=False)
        manifest = self.read_manifest()
        self.assertEqual(2, result.package_version)
        self.assertEqual(2, manifest["version"])
        self.assertEqual([], manifest["resourceFiles"])
        with zipfile.ZipFile(self.output) as archive:
            self.assertNotIn(OFFICIAL_STORY_MEMBER, archive.namelist())

    def test_official_scans_only_on_request(self):
        scans = self.ato / "story" / "data" / "ato-storybook-key-scans"
        scans.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (60, 80), (3, 3, 3)).save(scans / "c1-0-0.jpg")

        result = self.build(official_scans=True)
        self.assertTrue(result.official_scans)
        self.assertEqual(2, result.official_files)
        with zipfile.ZipFile(self.output) as archive:
            self.assertIn("story/data/ato-storybook-key-scans/c1-0-0.jpg", archive.namelist())
        # 声明的截图必须齐备：缺一张就报错，而不是打出一个坏包
        (scans / "c1-0-0.jpg").unlink()
        with self.assertRaises((PackError, ValueError)):
            self.build(official_scans=True, force=True)

    def test_story_data_and_entity_index_are_required(self):
        (self.ato / "story" / "data" / "storybook-data.js").unlink()
        with self.assertRaises(PackError):
            self.build()
        result = self.build(include_story_data=False)
        self.assertEqual(0, result.stories_books)
        manifest = self.read_manifest()
        self.assertEqual([], manifest["storyFiles"])
        self.assertEqual([], manifest["stories"]["books"])

    def test_filters_and_dry_run(self):
        dry = self.build(dry_run=True)
        self.assertFalse(self.output.exists())
        self.assertEqual("dry-run", dry.verification["mode"])
        self.assertEqual(5, dry.assets)

        only_c2 = self.build(cycles=["c2"])
        self.assertEqual(1, only_c2.items)
        self.assertEqual(1, only_c2.assets)

        # 少一个背面：默认会中断，--skip-missing + --complete-only 时整条被排除
        (self.ato / "ss" / "terrain" / "003-back.jpg").unlink()
        with self.assertRaises(PackError):
            self.build(force=True)
        skipped = self.build(skip_missing=True, force=True)
        self.assertEqual(4, skipped.assets, "缺的那个面被跳过，正面照旧打进包")
        complete = self.build(complete_only=True, skip_missing=True, force=True)
        self.assertEqual(3, complete.items, "不完整的条目要被 --complete-only 排除")
        self.assertEqual(3, complete.assets)

        no_bgm = self.build(include_bgm=False, skip_missing=True, force=True)
        self.assertEqual(0, no_bgm.bgm_files)
        self.assertNotIn("bgmFiles", self.read_manifest())

    def test_existing_output_needs_force(self):
        self.build()
        with self.assertRaises(PackError):
            self.build()
        self.build(force=True)

    def test_rejects_a_non_project_root(self):
        empty = self.root / "empty"
        empty.mkdir()
        with self.assertRaises(PackError):
            self.build(ato_root=empty)


class AtomicWriteTests(Fixture):
    """最终路径上只可能出现完整、已校验的包。"""

    def test_failed_verification_leaves_nothing_at_the_destination(self):
        with patch("tools.build_fan_pack.verify_partial", side_effect=PackError("模拟校验失败")):
            with self.assertRaises(PackError):
                self.build()
        self.assertFalse(self.output.exists())
        self.assertTrue(Path(str(self.output) + ".partial").exists())

    def test_write_failure_leaves_nothing_at_the_destination(self):
        real_open = Path.open
        reads = {"n": 0}

        def hostile_open(self, *args, **kwargs):  # noqa: ANN001, ANN201
            if "assets" in self.parts or "map" in self.parts or "ss" in self.parts:
                reads["n"] += 1
                if reads["n"] >= 3:
                    raise OSError("模拟写入失败")
            return real_open(self, *args, **kwargs)

        with patch.object(Path, "open", hostile_open):
            with self.assertRaises(OSError):
                self.build()
        self.assertFalse(self.output.exists(), "失败时最终路径上不许出现文件")
        partial = Path(str(self.output) + ".partial")
        self.assertTrue(partial.exists())
        with self.assertRaises((zipfile.BadZipFile, KeyError)):
            with zipfile.ZipFile(partial) as archive:
                archive.read("manifest.json")

    def test_verify_rejects_truncated_zip_and_wrong_hash(self):
        self.build(verify_mode="none")
        manifest = self.read_manifest()
        raw = self.output.read_bytes()
        truncated = self.root / "truncated.atopack"
        truncated.write_bytes(raw[: int(len(raw) * 0.6)])
        with self.assertRaises((zipfile.BadZipFile, PackError)):
            verify_partial(truncated, manifest, [], [], "sample", 4, QUIET)

        manifest["assets"][0]["sha256"] = "0" * 64
        with self.assertRaises(PackError):
            verify_partial(self.output, manifest, [], [], "sample", 4, QUIET)

    def test_verify_rejects_a_missing_official_file(self):
        self.build(verify_mode="none")
        manifest = self.read_manifest()
        manifest["resourceFiles"] = [
            {"target": "story/data/storybook-official-data.js", "member": "story/data/storybook-official-data.js",
             "sha256": "0" * 64, "bytes": 1}
        ]
        with self.assertRaises(PackError):
            verify_partial(self.output, manifest, [], [], "none", 0, QUIET)


class SafetyRuleTests(unittest.TestCase):
    def test_windows_reserved_and_escaping_targets(self):
        for bad in ("../assets/x.jpg", "assets\\x.jpg", "C:evil.jpg", "assets/CON/x.jpg", "/abs/x.jpg"):
            with self.assertRaises(PackError):
                safe_relative(bad)
        for bad in ("story/data/x.js", "assets/bgm/x.wav", "other/x.jpg", "assets/x.js"):
            with self.assertRaises(PackError):
                installable_target(bad)
        self.assertEqual("assets/test/x.jpg", installable_target("assets/test/x.jpg"))
        self.assertEqual("assets/bgm/x.mp3", installable_target("assets/bgm/x.mp3"))


if __name__ == "__main__":
    unittest.main()
