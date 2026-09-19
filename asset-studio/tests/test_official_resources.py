"""官方资料打包：民间版资源包不带官方版故事书截图。

运行（在 asset-studio 目录下）：python -m unittest tests.test_official_resources -v

刻意不用 tempfile：部分受限环境里 mkdtemp 建的目录随后连自己都读不了，
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

from app.db import Database
from app.installer import apply_install, install_plan
from app.official_resources import DATA, SCANS, collect, checked_bytes
from app.packages import export_compat, export_package, import_package, inspect_package
from tools.update_full_pack import update_full_pack


ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / ".local" / "tests" / "official-resources"
SCAN = SCANS + "c1-0-0.jpg"


def official_data(scan: str | None = SCAN) -> str:
    entry: dict = {"key": "c1-0-0", "officialText": "正文"}
    if scan:
        entry["officialScan"] = {"src": "./" + scan.removeprefix("story/")}
    payload = {"books": [{"id": "c1", "entries": [entry]}]}
    return "window.STORYBOOK_OFFICIAL_DATA = " + json.dumps(payload) + ";\n"


class OfficialResourceTests(unittest.TestCase):
    def setUp(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)
        self.library = SCRATCH / "library"
        self.library.mkdir(parents=True)
        self.db = Database(self.library / "db.sqlite")
        self.source = SCRATCH / "source"
        (self.source / SCAN).parent.mkdir(parents=True)
        (self.source / SCAN).write_bytes(b"original scan bytes")
        (self.source / DATA).write_text(official_data(), encoding="utf-8")

    def tearDown(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)

    def test_export_omits_official_scans_by_default(self):
        """民间版资源包：带官方故事书正文数据，不带官方版故事书截图。"""
        pack = SCRATCH / "fan.atopack"
        export_package(self.db, self.library, pack, ato_root=self.source)
        result = inspect_package(self.db, pack)
        self.assertEqual(1, result["official_resources"])
        self.assertEqual(
            [DATA], [item["target"] for item in result["manifest"]["resourceFiles"]]
        )
        # 官方资料仍是版本 3 特征：不带截图也不会把版本号降回去。
        self.assertEqual(3, result["manifest"]["version"])
        with zipfile.ZipFile(pack) as archive:
            names = archive.namelist()
            self.assertIn(DATA, names)
            self.assertEqual([], [name for name in names if name.startswith(SCANS)])

    def test_export_includes_scans_when_building_the_official_pack(self):
        pack = SCRATCH / "official.atopack"
        export_package(
            self.db, self.library, pack, {"official_scans": True}, ato_root=self.source
        )
        result = inspect_package(self.db, pack)
        self.assertEqual(2, result["official_resources"])
        self.assertEqual(
            [SCAN, DATA], [item["target"] for item in result["manifest"]["resourceFiles"]]
        )
        with zipfile.ZipFile(pack) as archive:
            self.assertEqual((self.source / SCAN).read_bytes(), archive.read(SCAN))
            self.assertEqual((self.source / DATA).read_bytes(), archive.read(DATA))

    def test_official_scans_accept_png_as_well_as_jpg(self):
        """截图后缀放宽：清单引用 `.png` 截图时照常打包、校验、安装。"""
        png_scan = SCANS + "c1-0-0.png"
        (self.source / png_scan).write_bytes(b"png scan bytes")
        (self.source / SCAN).unlink()
        (self.source / DATA).write_text(official_data(png_scan), encoding="utf-8")

        pack = SCRATCH / "official-png.atopack"
        export_package(
            self.db, self.library, pack, {"official_scans": True}, ato_root=self.source
        )
        result = inspect_package(self.db, pack)
        self.assertEqual(2, result["official_resources"])
        self.assertEqual(
            {png_scan, DATA}, {item["target"] for item in result["manifest"]["resourceFiles"]}
        )
        with zipfile.ZipFile(pack) as archive:
            self.assertEqual(b"png scan bytes", archive.read(png_scan))

        import_package(self.db, self.library, pack)
        installed = SCRATCH / "installed-png"
        installed.mkdir()
        (installed / "index.html").touch()
        for folder in ("aibp", "map", "story"):
            (installed / folder).mkdir()
        apply_install(self.db, self.library, installed, [])
        self.assertEqual(
            b"png scan bytes", (installed / png_scan).read_bytes()
        )

    def test_unsupported_scan_extension_is_still_rejected(self):
        """放宽只到 .jpg/.jpeg/.png/.webp（不分大小写），别的后缀依旧拦下。"""
        from app.official_resources import allowed_target

        self.assertTrue(allowed_target(SCANS + "c1-0-0.png"))
        self.assertTrue(allowed_target(SCANS + "C2-15-3.JpEg"))
        self.assertTrue(allowed_target("STORY/DATA/ATO-STORYBOOK-KEY-SCANS/c3-1-2.WEBP"))
        self.assertFalse(allowed_target(SCANS + "c1-0-0.gif"))
        self.assertFalse(allowed_target(SCANS + "c1-0-0.jpg.js"))
        gif_scan = SCANS + "c1-0-0.gif"
        (self.source / gif_scan).write_bytes(b"gif scan")
        (self.source / DATA).write_text(official_data(gif_scan), encoding="utf-8")
        (self.source / SCAN).unlink()
        with self.assertRaisesRegex(ValueError, "官方截图缺失或路径无效"):
            export_package(
                self.db, self.library, SCRATCH / "bad.atopack",
                {"official_scans": True}, ato_root=self.source,
            )

    def test_scan_path_and_suffix_case_are_ignored(self):
        """大小写放宽：`.JPG`/`.PNG` 与路径里的大写都算官方截图。

        编号用 c2-99-9（清单只允许 c1/c2/c3 开头）：这样既测大写前缀和大写后缀，
        又不会和 setUp 建的 c1-0-0.jpg 撞名——Windows 上大小写不敏感，同名会落到
        同一个文件上，测不出「大写名也能打包」。
        """
        upper_scan = SCANS + "C2-99-9.PNG"
        (self.source / upper_scan).write_bytes(b"upper scan bytes")
        (self.source / SCAN).unlink()
        (self.source / DATA).write_text(official_data(upper_scan), encoding="utf-8")

        pack = SCRATCH / "official-upper.atopack"
        export_package(
            self.db, self.library, pack, {"official_scans": True}, ato_root=self.source
        )
        result = inspect_package(self.db, pack)
        self.assertEqual(2, result["official_resources"])
        self.assertEqual(
            {upper_scan, DATA}, {item["target"] for item in result["manifest"]["resourceFiles"]}
        )
        with zipfile.ZipFile(pack) as archive:
            self.assertEqual(b"upper scan bytes", archive.read(upper_scan))

    def test_missing_scan_only_blocks_the_official_pack(self):
        """不带截图的包不该因为本地缺截图而导不出来。"""
        (self.source / SCAN).unlink()
        pack = SCRATCH / "fan.atopack"
        export_package(self.db, self.library, pack, ato_root=self.source)
        self.assertEqual(1, inspect_package(self.db, pack)["official_resources"])
        with zipfile.ZipFile(pack) as archive:
            self.assertIn(DATA, archive.namelist())
        # 素材库安装要取回全部官方资料，所以 collect 的默认行为不变。
        with self.assertRaises(ValueError):
            collect(self.source)
        self.assertEqual([DATA], [target for target, _ in collect(self.source, False)])
        with self.assertRaisesRegex(ValueError, "官方截图缺失或路径无效"):
            export_package(
                self.db, self.library, SCRATCH / "official.atopack",
                {"official_scans": True}, ato_root=self.source,
            )

    def test_compat_zip_omits_official_scans_by_default(self):
        compat = SCRATCH / "fan-compat.zip"
        export_compat(self.db, self.library, compat, ato_root=self.source)
        with zipfile.ZipFile(compat) as archive:
            names = archive.namelist()
            self.assertIn(DATA, names)
            self.assertEqual([], [name for name in names if name.startswith(SCANS)])

    def test_official_pack_roundtrip_install_and_reexport(self):
        """官方版资料包（显式带截图）导出、校验、导入、安装、再导出一条龙。"""
        pack = SCRATCH / "official.atopack"
        export_package(
            self.db, self.library, pack, {"official_scans": True}, ato_root=self.source
        )
        result = inspect_package(self.db, pack)
        self.assertEqual(2, result["official_resources"])
        self.assertEqual(3, result["manifest"]["version"])
        with zipfile.ZipFile(pack) as archive:
            record = next(
                item for item in result["manifest"]["resourceFiles"] if item["target"] == SCAN
            )
            with self.assertRaises(ValueError):
                checked_bytes(archive, {**record, "sha256": "0" * 64})
            with self.assertRaises(ValueError):
                checked_bytes(archive, {**record, "target": "../outside.js"})
        import_package(self.db, self.library, pack)
        installed = SCRATCH / "installed"
        installed.mkdir()
        (installed / "index.html").touch()
        for folder in ("aibp", "map", "story"):
            (installed / folder).mkdir()
        self.assertEqual(2, install_plan(self.db, self.library, installed)["summary"]["add"])
        apply_install(self.db, self.library, installed, [])
        for target in (DATA, SCAN):
            self.assertEqual(
                (self.source / target).read_bytes(), (installed / target).read_bytes()
            )
        second = SCRATCH / "second.atopack"
        export_package(self.db, self.library, second, {"official_scans": True})
        with zipfile.ZipFile(second) as archive:
            self.assertEqual((self.source / SCAN).read_bytes(), archive.read(SCAN))
        # 再导出走素材库副本：此时项目里删掉截图，只带截图的包必须报错。
        (self.source / SCAN).unlink()
        with self.assertRaises(ValueError):
            collect(self.source)

    def test_rebuild_drops_official_scans_unless_requested(self):
        """重建完整资料包：默认把旧包里的官方截图丢掉，只留官方故事书数据。

        旧包是官方版资料包（本地有 2195 张截图）时，这条路径决定了对外发布的是
        民间版还是官方版包，而 manifest 里的 resourceFiles 就是分发内容本身。
        """
        card = {
            "id": "common:card", "cycle": "common", "module": "决战版图",
            "subgroup": "战斗版图", "name": "决战版图", "number": "card",
            "sort_order": 1, "faces": {"front": "assets/cards/001.jpg"},
            "capture_required": True,
        }
        entities = json.dumps({"entities": [{"id": "a", "name": "A"}]}).encode("utf-8")
        story_data = official_data().encode("utf-8")
        scan_bytes = b"scan bytes"
        base = SCRATCH / "base.atopack"
        resource_files = [
            {"target": SCAN, "member": SCAN,
             "sha256": hashlib.sha256(scan_bytes).hexdigest(), "bytes": len(scan_bytes)},
            {"target": DATA, "member": DATA,
             "sha256": hashlib.sha256(story_data).hexdigest(), "bytes": len(story_data)},
        ]
        with zipfile.ZipFile(base, "w") as archive:
            archive.writestr("assets/cards/001.jpg", b"old card")
            archive.writestr("story/entity-index.json", entities)
            archive.writestr(SCAN, scan_bytes)
            archive.writestr(DATA, story_data)
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack", "version": 3, "items": [card],
                "assets": [{"itemId": "common:card", "face": "front",
                            "sha256": hashlib.sha256(b"old card").hexdigest(),
                            "member": "assets/cards/001.jpg", "mimeType": "image/jpeg",
                            "originalName": "001.jpg"}],
                "storyFiles": [{"kind": "entity-index", "member": "story/entity-index.json",
                                "target": "story/data/entity-index.json",
                                "sha256": hashlib.sha256(entities).hexdigest(),
                                "bytes": len(entities), "entityCount": 1}],
                "resourceFiles": resource_files,
            }))
        overlay = SCRATCH / "project"
        (overlay / "assets" / "cards").mkdir(parents=True)
        (overlay / "assets" / "cards" / "001.jpg").write_bytes(b"current card")
        catalog = {"source": {"catalog_version": "test-official"}, "items": [card]}

        fan = SCRATCH / "fan.atopack"
        with patch("tools.update_full_pack.fixed_catalog_payload", return_value=catalog):
            fan_result = update_full_pack(base, fan, overlay)
        self.assertEqual(1, fan_result["official_files"])
        with zipfile.ZipFile(fan) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            names = archive.namelist()
            self.assertEqual([DATA], [item["target"] for item in manifest["resourceFiles"]])
            self.assertFalse(manifest["build"]["officialScans"])
            self.assertEqual(story_data, archive.read(DATA))
            self.assertEqual([], [name for name in names if name.startswith(SCANS)])
            self.assertEqual(3, manifest["version"])

        official = SCRATCH / "official.atopack"
        with patch("tools.update_full_pack.fixed_catalog_payload", return_value=catalog):
            official_result = update_full_pack(
                base, official, overlay, None, include_official_scans=True,
            )
        self.assertEqual(2, official_result["official_files"])
        with zipfile.ZipFile(official) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(
                {SCAN, DATA}, {item["target"] for item in manifest["resourceFiles"]}
            )
            self.assertTrue(manifest["build"]["officialScans"])
            self.assertEqual(scan_bytes, archive.read(SCAN))


if __name__ == "__main__":
    unittest.main()
