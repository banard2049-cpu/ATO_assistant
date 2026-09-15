"""主控台 BGM 走资料包通道：导出写 bgmFiles、导入进素材库、安装落回 assets/bgm/。

运行（在 asset-studio 目录下）：python -m unittest tests.test_bgm_resources -v

刻意不用 tempfile：部分受限环境里 mkdtemp 建的 0700 目录随后连自己都读不了，
这里用 .local/（已被 .gitignore 覆盖）当临时目录，结束时清掉。
"""
from __future__ import annotations

import hashlib
import json
import shutil
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from app.bgm_resources import LIBRARY as BGM_LIBRARY
from app.bgm_resources import checked_bytes, collect
from app.db import Database
from app.fixed_catalog import BGM_TRACKS, fixed_catalog_payload
from app.installer import apply_install, install_plan
from app.packages import export_compat, export_package, import_package, inspect_package
from tools.update_full_pack import update_full_pack

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / ".local" / "tests" / "bgm-resources"


class BgmResourceTests(unittest.TestCase):
    def setUp(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)
        (SCRATCH / "ato" / "assets" / "bgm").mkdir(parents=True)
        self.source = SCRATCH / "ato"
        (self.source / "index.html").touch()
        (self.source / "assets" / "bgm" / "bgm.js").write_text("// player\n", encoding="utf-8")
        (self.source / "assets" / "bgm" / "LB_Armory.mp3").write_bytes(b"armory-bytes")
        (self.source / "assets" / "bgm" / "LB_Old_Priest_Theme.mp3").write_bytes(b"priest-bytes")
        # 名字不合规 / 非音频的文件应被忽略，而不是让整包导出失败。
        (self.source / "assets" / "bgm" / "带空格 的名字.mp3").write_bytes(b"stray")
        (self.source / "assets" / "bgm" / "LB_Titan_Stoa.MP3").write_bytes(b"uppercase")
        (self.source / "assets" / "bgm" / "notes.txt").write_text("note\n", encoding="utf-8")
        self.library = SCRATCH / "library"
        self.library.mkdir()
        self.db = Database(self.library / "db.sqlite")
        self.pack = SCRATCH / "bgm.atopack"

    def tearDown(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)

    def test_collect_only_audio(self) -> None:
        targets = [target for target, _ in collect(self.source)]
        self.assertEqual(["assets/bgm/LB_Armory.mp3", "assets/bgm/LB_Old_Priest_Theme.mp3"], targets)

    def test_export_inspect_import_install_roundtrip(self) -> None:
        without = SCRATCH / "without-bgm.atopack"
        export_package(self.db, self.library, without, {"include_bgm": False}, ato_root=self.source)
        export_package(self.db, self.library, self.pack, ato_root=self.source)
        result = inspect_package(self.db, self.pack)
        self.assertEqual(2, result["bgm_files"])
        # bgmFiles 是附加字段，不改变资料包版本号，老读取方会直接忽略。
        versions = []
        for path in (without, self.pack):
            with zipfile.ZipFile(path) as archive:
                versions.append(json.loads(archive.read("manifest.json").decode("utf-8"))["version"])
        self.assertEqual(versions[0], versions[1])

        with zipfile.ZipFile(self.pack) as archive:
            names = set(archive.namelist())
            self.assertIn("assets/bgm/LB_Armory.mp3", names)
            self.assertNotIn("assets/bgm/bgm.js", names)
            record = result["manifest"]["bgmFiles"][0]
            with self.assertRaises(ValueError):
                checked_bytes(archive, {**record, "sha256": "0" * 64})
            with self.assertRaises(ValueError):
                checked_bytes(archive, {**record, "target": "assets/bgm/../evil.mp3"})
            with self.assertRaises(ValueError):
                checked_bytes(archive, {**record, "target": "story/data/x.js"})

        imported = import_package(self.db, self.library, self.pack)
        self.assertEqual(2, imported["bgm_imported"])
        stored = self.library / BGM_LIBRARY / "assets" / "bgm" / "LB_Armory.mp3"
        self.assertEqual(b"armory-bytes", stored.read_bytes())

        installed = SCRATCH / "installed"
        installed.mkdir()
        (installed / "index.html").touch()
        for folder in ("aibp", "map", "story"):
            (installed / folder).mkdir()
        plan = install_plan(self.db, self.library, installed)
        bgm_entries = [entry for entry in plan["files"] if entry["item_id"] == "bgm"]
        self.assertEqual(2, len(bgm_entries))
        self.assertTrue(all(entry["direct_copy"] for entry in bgm_entries))
        self.assertTrue(all(entry["status"] == "add" for entry in bgm_entries))
        apply_install(self.db, self.library, installed, [])
        self.assertEqual(b"priest-bytes", (installed / "assets" / "bgm" / "LB_Old_Priest_Theme.mp3").read_bytes())
        # 安装只落音频，不碰 assets/bgm/ 里的播放器代码。
        self.assertFalse((installed / "assets" / "bgm" / "bgm.js").exists())

        again = install_plan(self.db, self.library, installed)
        self.assertTrue(all(entry["status"] == "same" for entry in again["files"] if entry["item_id"] == "bgm"))

    def test_reexport_without_root_uses_library_copy(self) -> None:
        export_package(self.db, self.library, self.pack, ato_root=self.source)
        import_package(self.db, self.library, self.pack)
        shutil.rmtree(self.source / "assets" / "bgm")  # 模拟只有素材库、根目录没放音频的机器
        second = SCRATCH / "second.atopack"
        export_package(self.db, self.library, second)
        with zipfile.ZipFile(second) as archive:
            self.assertEqual(b"armory-bytes", archive.read("assets/bgm/LB_Armory.mp3"))

    def test_export_can_skip_bgm(self) -> None:
        export_package(self.db, self.library, self.pack, {"include_bgm": False}, ato_root=self.source)
        with zipfile.ZipFile(self.pack) as archive:
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        self.assertNotIn("bgmFiles", manifest)

    def test_compat_zip_carries_bgm(self) -> None:
        compat = SCRATCH / "compat.zip"
        export_compat(self.db, self.library, compat, {"include_stories": False}, None, self.source)
        with zipfile.ZipFile(compat) as archive:
            self.assertIn("assets/bgm/LB_Armory.mp3", archive.namelist())

    def test_catalog_lists_every_track_without_capture(self) -> None:
        payload = fixed_catalog_payload()
        bgm = [item for item in payload["items"] if item["module"] == "背景音乐"]
        self.assertEqual({stem for stem, _ in BGM_TRACKS}, {item["number"] for item in bgm})
        self.assertEqual(19, len(bgm))
        for item in bgm:
            self.assertFalse(item["capture_required"])
            self.assertEqual(f"assets/bgm/{item['number']}.mp3", item["faces"]["front"])

    def test_update_full_pack_carries_bgm(self) -> None:
        """重建完整资料包（update_full_pack）同样要把 assets/bgm/ 写进 bgmFiles。

        BGM 被排除在图片清单遍历之外（音频不由 APK/旧包提供），所以遗漏这段
        只会在重建后才发现——这里用最小旧包 + overlay 固定住这个行为。
        """
        card = {
            "id": "common:card", "cycle": "common", "module": "决战版图",
            "subgroup": "战斗版图", "name": "决战版图", "number": "card",
            "sort_order": 1, "faces": {"front": "assets/cards/001.jpg"},
            "capture_required": True,
        }
        bgm_item = {
            "id": "common:bgm:armory", "cycle": "common", "module": "背景音乐",
            "subgroup": "主控台 BGM", "name": "军械库（LB_Armory）", "number": "LB_Armory",
            "sort_order": 2, "faces": {"front": "assets/bgm/LB_Armory.mp3"},
            "capture_required": False,
        }
        entities = json.dumps({"entities": [{"id": "a", "name": "A"}]}).encode("utf-8")
        base = SCRATCH / "base.atopack"
        with zipfile.ZipFile(base, "w") as archive:
            archive.writestr("assets/cards/001.jpg", b"old card")
            archive.writestr("story/entity-index.json", entities)
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack", "version": 2, "items": [card],
                "assets": [{"itemId": "common:card", "face": "front",
                            "sha256": hashlib.sha256(b"old card").hexdigest(),
                            "member": "assets/cards/001.jpg", "mimeType": "image/jpeg",
                            "originalName": "001.jpg"}],
                "storyFiles": [{"kind": "entity-index", "member": "story/entity-index.json",
                                "target": "story/data/entity-index.json",
                                "sha256": hashlib.sha256(entities).hexdigest(),
                                "bytes": len(entities), "entityCount": 1}],
            }))

        overlay = SCRATCH / "project"
        (overlay / "assets" / "cards").mkdir(parents=True)
        (overlay / "assets" / "bgm").mkdir(parents=True)
        (overlay / "assets" / "cards" / "001.jpg").write_bytes(b"current card")
        (overlay / "assets" / "bgm" / "LB_Armory.mp3").write_bytes(b"armory-bytes")
        (overlay / "assets" / "bgm" / "bgm.js").write_text("// player\n", encoding="utf-8")

        catalog = {"source": {"catalog_version": "test-bgm"}, "items": [card, bgm_item]}
        destination = SCRATCH / "updated.atopack"
        with patch("tools.update_full_pack.fixed_catalog_payload", return_value=catalog):
            result = update_full_pack(base, destination, overlay)
        self.assertEqual(1, result["bgm_files"])

        with zipfile.ZipFile(destination) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual("assets/bgm/LB_Armory.mp3", manifest["bgmFiles"][0]["target"])
            self.assertEqual(hashlib.sha256(b"armory-bytes").hexdigest(),
                             manifest["bgmFiles"][0]["sha256"])
            self.assertEqual(b"armory-bytes", archive.read("assets/bgm/LB_Armory.mp3"))
            self.assertTrue(manifest["build"]["audioIncluded"])
            # 音频不进图片清单，只出现在 bgmFiles 段；播放器代码不随包分发。
            self.assertEqual(["assets/cards/001.jpg"], [a["member"] for a in manifest["assets"]])
            self.assertNotIn("assets/bgm/bgm.js", archive.namelist())
            self.assertEqual(b"current card", archive.read("assets/cards/001.jpg"))
            # bgmFiles 是附加字段，不改变资料包版本号。
            self.assertEqual(2, manifest["version"])


if __name__ == "__main__":
    unittest.main()
