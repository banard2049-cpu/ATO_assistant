"""混合媒体素材（私有映射表 + 书籍裁图）走资料包通道：导出写 mixedMediaFiles、导入进素材库、安装落回工程目录。

运行（在 asset-studio 目录下）：python -m pytest tests/test_mixed_media_resources.py -q

和 test_cryptic_resources.py / test_icon_resources.py 同一套路：``mapping.js`` 与
``images/c1..c5/`` 里的裁图都是本地私有素材（``.gitignore`` 里
``/story/assets/mixed-media/mapping.js`` 与 ``/story/assets/mixed-media/images/``），
不进版本库，只能随 .atopack 分发。这里盯住六件事——目标白名单与后缀白名单只在一处收敛
（PNG/SVG 合法，别的目录、大写后缀、``..``、c6、非图后缀一律拒绝）、收集器把映射表排在
前、裁图按名称排序、导出/导入/安装的往返、打成包后版本号不变（附加字段）、
以及「清单里没有这段时不报错」。
"""
from __future__ import annotations

import hashlib
import json
import shutil
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from app import mixed_media_resources as mixed_media
from app.db import Database
from app.installer import apply_install, install_plan, installable_relative
from app.mixed_media_resources import (
    IMAGES_DIR,
    IMAGE_SUFFIXES,
    LIBRARY as MIXED_MEDIA_LIBRARY,
    MAPPING_TARGET,
    MIXED_MEDIA_DIR,
    add_to_archive,
    allowed_target,
    checked_bytes,
    collect,
    collect_library,
    compact_mapping,
    import_resources,
    mime_for,
)
from app.packages import export_compat, export_package, import_package, inspect_package

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / ".local" / "tests" / "mixed-media-resources"

MAPPING_JS = 'window.ATO_MIXED_MEDIA_MAP={"schema":1,"rows":[]};\n'
MAPPING_BYTES = MAPPING_JS.encode("utf-8")
PNG_ONE = b"\x89PNG\r\n\x1a\n" + b"mixed-media-one" * 4
PNG_TWO = b"\x89PNG\r\n\x1a\n" + b"mixed-media-two" * 4
PNG_CHANGED = b"\x89PNG\r\n\x1a\n" + b"mixed-media-changed" * 4
SVG_ONE = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>'
SVG_TWO = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h2v2z"/></svg>'


def fan_pack_kwargs(project: Path) -> dict:
    """打包引擎的固定参数：这里只关心附加段，故事／官方资料一律不带。"""
    from tools.build_fan_pack import Reporter

    return {
        "ato_root": project, "library_path": None, "cycles": [], "modules": [],
        "complete_only": False, "include_story_data": False, "include_bgm": False,
        "include_icons": False, "include_cryptic": False, "include_story_files": False,
        "official_story": False, "official_scans": False, "official_assets": False,
        "skip_missing": False, "force": True, "dry_run": False, "compression_name": "store",
        "verify_mode": "full", "verify_sample": 32, "reporter": Reporter(quiet=True),
    }


class MixedMediaResourceTests(unittest.TestCase):
    def test_compact_mapping_keeps_runtime_fields_and_drops_audit(self) -> None:
        row = dict(book="c1", key="one", variant="fan", anchor="中文 □", anchorOccurrence=1,
                   anchorCount=1, position="replace", replaceText="□", contextBefore="中文 ",
                   contextAfter="", textLength=4, textFingerprint="01234567", path=f"{IMAGES_DIR}/c1/test.png",
                   layout="inline", kind="resource-icon", resourceLabel="资源", textAlreadyNamesResource=True,
                   retainedNameText="资源", retainedNameStart=0, retainedNameEnd=2, pdfPage=12, printedPage=10)
        full = dict(schema=1, resourceSchema=1, battleSchema=1, requestedSchema=1, vectorSchema=1,
                    rows=[dict(row, sourceReason="长篇审计", sourceTextSha256="hash", assetSha256="hash")],
                    resourceRows=[row], battleRows=[row], requestedRows=[row],
                    resourceScopeExclusions=[dict(book="c1", variant="fan", key="one", scope="range", start=2, end=4)],
                    vectorAssets=[dict(path="test.png", vectorPath="test.svg", width=2, height=3,
                                       sourcePngSha256="png", svgSha256="svg")],
                    coverage={"audit": "only"}, fanAnchorRevision={"counts": {}}, version="audit-version")
        raw = ("\ufeff/* schema=1 */\nwindow.ATO_MIXED_MEDIA_MAP = " + json.dumps(full, ensure_ascii=False) + ";").encode("utf-8")
        compact = compact_mapping(raw)
        result = json.loads(compact.decode().split("=", 1)[1].strip().rstrip(";"))
        expected = {key: value for key, value in full.items() if key not in ("coverage", "fanAnchorRevision", "version")}
        expected["rows"] = [row]
        self.assertEqual(expected, result)
        self.assertEqual(compact, compact_mapping(compact))
        for invalid in (b"window.WRONG={};", b'window.ATO_MIXED_MEDIA_MAP={"schema":2};',
                        b'window.ATO_MIXED_MEDIA_MAP={"schema":1};alert(1)'):
            with self.assertRaises(ValueError):
                compact_mapping(invalid)

    def test_export_compacts_mapping_and_hashes_the_actual_runtime_bytes(self) -> None:
        full = b'/* audit */\nwindow.ATO_MIXED_MEDIA_MAP={"schema":1,"rows":[],"coverage":{"notes":"audit"}};'
        (self.media / "mapping.js").write_bytes(full)
        with zipfile.ZipFile(self.pack, "w") as archive:
            manifest = {}
            add_to_archive(archive, manifest, self.source)
        with zipfile.ZipFile(self.pack) as archive:
            self.assertEqual(MAPPING_BYTES, archive.read(MAPPING_TARGET))
            self.assertEqual(MAPPING_BYTES, checked_bytes(archive, manifest["mixedMediaFiles"][0]))
        self.assertEqual(full, (self.media / "mapping.js").read_bytes())

    def setUp(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)
        self.source = SCRATCH / "ato"
        self.source.mkdir(parents=True)
        (self.source / "index.html").touch()
        self.media = self.source / MIXED_MEDIA_DIR
        for cycle in ("c1", "c2", "c6"):
            (self.media / "images" / cycle).mkdir(parents=True, exist_ok=True)
        (self.media / "mapping.js").write_bytes(MAPPING_BYTES)
        (self.media / "images" / "c1" / "a-diagram.png").write_bytes(PNG_ONE)
        (self.media / "images" / "c1" / "b-icon.svg").write_bytes(SVG_ONE)
        (self.media / "images" / "c2" / "c-map.png").write_bytes(PNG_TWO)
        # 不合规的名字、后缀与目录应被忽略，而不是让整包导出失败。
        (self.media / "images" / "c1" / "UPPER.PNG").write_bytes(PNG_ONE)
        (self.media / "images" / "c1" / "带空格的 名字.png").write_bytes(PNG_ONE)
        (self.media / "images" / "c1" / "notes.txt").write_text("note\n", encoding="utf-8")
        (self.media / "images" / "c6" / "d.png").write_bytes(PNG_ONE)
        # 同目录的渲染器与样式表是程序代码（随源码发布），不归这条通道。
        (self.media / "renderer.js").write_text("// renderer\n", encoding="utf-8")
        (self.media / "styles.css").write_text(".ato-mm{}\n", encoding="utf-8")
        self.library = SCRATCH / "library"
        self.library.mkdir()
        self.db = Database(self.library / "db.sqlite")
        self.pack = SCRATCH / "mixed-media.atopack"

    def tearDown(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)

    def test_allowed_target_whitelist(self) -> None:
        for good in (
            MAPPING_TARGET,
            f"{IMAGES_DIR}/c1/a-diagram.png",
            f"{IMAGES_DIR}/c5/b-icon.svg",
            f"{IMAGES_DIR}/c1/name-1_2.svg",
        ):
            self.assertTrue(allowed_target(good), good)
        for bad in (
            "", None,
            MIXED_MEDIA_DIR,
            f"{MIXED_MEDIA_DIR}/renderer.js",
            f"{MIXED_MEDIA_DIR}/styles.css",
            f"{MIXED_MEDIA_DIR}/mapping.js.bak",
            "story/assets/mixed-media/images/c1/a-diagram.png".replace("images/", "img/"),
            f"{IMAGES_DIR}/c6/a.png",
            f"{IMAGES_DIR}/c0/a.png",
            f"{IMAGES_DIR}/c1/a.PNG",
            f"{IMAGES_DIR}/c1/a.SVG",
            # 渲染器 pathOK 不许名字里有点或大写：这类名字即使进包也没有任何引用。
            f"{IMAGES_DIR}/c1/name.with.dots-1_2.svg",
            f"{IMAGES_DIR}/c1/Upper.png",
            f"{IMAGES_DIR}/c1/a.jpg",
            f"{IMAGES_DIR}/c1/a.gif",
            f"{IMAGES_DIR}/c1/.hidden.png",
            f"{IMAGES_DIR}/c1/-dash.png",
            f"{IMAGES_DIR}/c1/a.png.exe",
            f"{IMAGES_DIR}/../images/c1/a.png",
            f"{MIXED_MEDIA_DIR}/images/c1/a.png/../b.png",
            "story/data/evil.png",
            "assets/icons/argo.svg",
            f"/{IMAGES_DIR}/c1/a.png",
            f"{IMAGES_DIR}\\c1\\a.png",
        ):
            self.assertFalse(allowed_target(bad), bad)

    def test_suffix_whitelist_is_defined_once(self) -> None:
        """.png/.svg 只在 IMAGE_SUFFIXES 里写一次，目标正则与 mime 都从它派生。"""
        self.assertEqual((".png", ".svg"), IMAGE_SUFFIXES)
        for suffix in IMAGE_SUFFIXES:
            self.assertIn(suffix[1:], mixed_media._TARGET.pattern)
            self.assertTrue(allowed_target(f"{IMAGES_DIR}/c1/x{suffix}"))
        for other in (".jpg", ".jpeg", ".gif", ".webp", ".PNG"):
            self.assertNotIn(other[1:], mixed_media._TARGET.pattern)
        self.assertEqual(set(IMAGE_SUFFIXES) | {".js"}, set(mixed_media._MIME))

    def test_mime_for(self) -> None:
        self.assertEqual("image/png", mime_for(f"{IMAGES_DIR}/c1/a.png"))
        self.assertEqual("image/svg+xml", mime_for(f"{IMAGES_DIR}/c1/a.svg"))
        self.assertEqual("text/javascript", mime_for(MAPPING_TARGET))
        self.assertEqual("application/octet-stream", mime_for("story/data/x.json"))

    def test_collect_puts_mapping_first_then_sorted_images(self) -> None:
        self.assertEqual(
            [
                MAPPING_TARGET,
                f"{IMAGES_DIR}/c1/a-diagram.png",
                f"{IMAGES_DIR}/c1/b-icon.svg",
                f"{IMAGES_DIR}/c2/c-map.png",
            ],
            [target for target, _ in collect(self.source)],
        )
        # 路径白名单挡下的东西一个都不收：大写后缀、c6、非图后缀、渲染器与样式表。
        targets = {target for target, _ in collect(self.source)}
        self.assertNotIn(f"{IMAGES_DIR}/c1/UPPER.PNG", targets)
        self.assertNotIn(f"{IMAGES_DIR}/c6/d.png", targets)
        self.assertNotIn(f"{IMAGES_DIR}/c1/notes.txt", targets)
        self.assertNotIn(f"{MIXED_MEDIA_DIR}/renderer.js", targets)
        self.assertNotIn(f"{MIXED_MEDIA_DIR}/styles.css", targets)
        # 没有工程根目录时返回空表，不当成错误。
        self.assertEqual([], collect(None))
        self.assertEqual([], collect(SCRATCH / "missing-project"))

    def test_collect_library(self) -> None:
        self.assertEqual([], collect_library(self.library))
        (self.library / MIXED_MEDIA_LIBRARY / MAPPING_TARGET).parent.mkdir(parents=True)
        (self.library / MIXED_MEDIA_LIBRARY / MAPPING_TARGET).write_bytes(MAPPING_BYTES)
        (self.library / MIXED_MEDIA_LIBRARY / IMAGES_DIR / "c1").mkdir(parents=True)
        (self.library / MIXED_MEDIA_LIBRARY / IMAGES_DIR / "c1" / "b-icon.svg").write_bytes(SVG_ONE)
        self.assertEqual(
            [MAPPING_TARGET, f"{IMAGES_DIR}/c1/b-icon.svg"],
            [target for target, _ in collect_library(self.library)],
        )

    def test_limits(self) -> None:
        with patch.object(mixed_media, "MAX_MAPPING_BYTES", 8):
            with self.assertRaisesRegex(ValueError, "过大"):
                collect(self.source)
        with patch.object(mixed_media, "MAX_IMAGE_FILES", 1):
            with self.assertRaisesRegex(ValueError, "数量超过"):
                collect(self.source)

    def test_add_to_archive_writes_section_and_hashes(self) -> None:
        manifest: dict = {}
        with zipfile.ZipFile(self.pack, "w") as archive:
            count = add_to_archive(archive, manifest, self.source)
        self.assertEqual(4, count)
        entries = manifest["mixedMediaFiles"]
        self.assertEqual(4, len(entries))
        self.assertEqual([MAPPING_TARGET, f"{IMAGES_DIR}/c1/a-diagram.png",
                          f"{IMAGES_DIR}/c1/b-icon.svg", f"{IMAGES_DIR}/c2/c-map.png"],
                         [entry["target"] for entry in entries])
        with zipfile.ZipFile(self.pack) as archive:
            names = set(archive.namelist())
            for entry in entries:
                self.assertEqual(entry["target"], entry["member"])
                self.assertIn(entry["target"], names)
                raw = archive.read(entry["target"])
                self.assertEqual(hashlib.sha256(raw).hexdigest(), entry["sha256"])
                self.assertEqual(len(raw), entry["bytes"])
            by_target = {entry["target"]: entry for entry in entries}
            self.assertEqual("text/javascript", by_target[MAPPING_TARGET]["mimeType"])
            self.assertEqual("image/png", by_target[f"{IMAGES_DIR}/c1/a-diagram.png"]["mimeType"])
            self.assertEqual("image/svg+xml", by_target[f"{IMAGES_DIR}/c1/b-icon.svg"]["mimeType"])
            self.assertEqual(PNG_ONE, archive.read(f"{IMAGES_DIR}/c1/a-diagram.png"))
            self.assertEqual(SVG_ONE, archive.read(f"{IMAGES_DIR}/c1/b-icon.svg"))

    def test_add_to_archive_without_local_copy_pops_section(self) -> None:
        # 本地、素材库、旧包都没有素材时：段被清掉、返回 0，而不是留下空段或报错。
        manifest: dict = {"mixedMediaFiles": [{"target": "stale"}]}
        with zipfile.ZipFile(SCRATCH / "empty.atopack", "w") as archive:
            self.assertEqual(0, add_to_archive(archive, manifest, None))
        self.assertNotIn("mixedMediaFiles", manifest)

    def test_add_to_archive_falls_back_to_library_files_and_old_pack(self) -> None:
        # 1) 工程目录没有素材 → 退到素材库里的副本。
        stored = self.library / MIXED_MEDIA_LIBRARY
        (stored / MAPPING_TARGET).parent.mkdir(parents=True)
        (stored / MAPPING_TARGET).write_bytes(MAPPING_BYTES)
        (stored / IMAGES_DIR / "c1").mkdir(parents=True)
        (stored / IMAGES_DIR / "c1" / "b-icon.svg").write_bytes(SVG_ONE)
        manifest: dict = {}
        with zipfile.ZipFile(SCRATCH / "from-library.atopack", "w") as archive:
            self.assertEqual(2, add_to_archive(archive, manifest, None, fallback_library=self.library))
        self.assertEqual([MAPPING_TARGET, f"{IMAGES_DIR}/c1/b-icon.svg"],
                         [entry["target"] for entry in manifest["mixedMediaFiles"]])

        # 2) 素材库也没有 → 从旧包成员里挑白名单内的路径。
        legacy = SCRATCH / "legacy.atopack"
        with zipfile.ZipFile(legacy, "w") as archive:
            archive.writestr("assets/web/" + MAPPING_TARGET, MAPPING_BYTES)
            archive.writestr("assets/web/" + f"{IMAGES_DIR}/c1/a-diagram.png", PNG_ONE)
            archive.writestr("assets/web/" + f"{IMAGES_DIR}/c1/x.jpg", b"jpeg")
            archive.writestr("assets/web/" + f"{MIXED_MEDIA_DIR}/renderer.js", b"// renderer")
        old_manifest: dict = {}
        with zipfile.ZipFile(SCRATCH / "from-old.atopack", "w") as archive, zipfile.ZipFile(legacy) as previous:
            self.assertEqual(
                2,
                add_to_archive(archive, old_manifest, None, fallback_archive=previous,
                               fallback_prefix="assets/web/"),
            )
        self.assertEqual({MAPPING_TARGET, f"{IMAGES_DIR}/c1/a-diagram.png"},
                         {entry["target"] for entry in old_manifest["mixedMediaFiles"]})

        # 3) 旧素材库行（fallback_files）里的同名字形不重复收。
        extra = SCRATCH / "legacy-row.png"
        extra.write_bytes(PNG_TWO)
        files_manifest: dict = {}
        with zipfile.ZipFile(SCRATCH / "from-rows.atopack", "w") as archive:
            count = add_to_archive(
                archive, files_manifest, None,
                fallback_files=lambda present: [(f"{IMAGES_DIR}/c1/legacy.png", extra)],
            )
        self.assertEqual(1, count)
        self.assertEqual([f"{IMAGES_DIR}/c1/legacy.png"],
                         [entry["target"] for entry in files_manifest["mixedMediaFiles"]])

    def test_checked_bytes_rejects_tampering(self) -> None:
        manifest: dict = {}
        with zipfile.ZipFile(self.pack, "w") as archive:
            add_to_archive(archive, manifest, self.source)
        record = manifest["mixedMediaFiles"][0]
        self.assertEqual(MAPPING_TARGET, record["target"])
        with zipfile.ZipFile(self.pack) as archive:
            with self.assertRaisesRegex(ValueError, "校验失败"):
                checked_bytes(archive, {**record, "sha256": "0" * 64})
            with self.assertRaisesRegex(ValueError, "大小不符"):
                checked_bytes(archive, {**record, "bytes": record["bytes"] + 1})
            with self.assertRaisesRegex(ValueError, "不支持的混合媒体路径"):
                checked_bytes(archive, {**record, "target": f"{IMAGES_DIR}/c6/a.png"})
            with self.assertRaisesRegex(ValueError, "不支持的混合媒体路径"):
                checked_bytes(archive, {**record, "target": f"{MIXED_MEDIA_DIR}/../evil.js"})
            with self.assertRaisesRegex(ValueError, "不支持的混合媒体路径"):
                checked_bytes(archive, {**record, "member": "story/data/elsewhere.js"})
            with self.assertRaisesRegex(ValueError, "缺少混合媒体文件"):
                checked_bytes(archive, {**record, "target": f"{IMAGES_DIR}/c1/missing.png",
                                        "member": f"{IMAGES_DIR}/c1/missing.png"})
            self.assertEqual(MAPPING_BYTES, checked_bytes(archive, record))

    def test_install_whitelist_allows_mixed_media(self) -> None:
        for good in (MAPPING_TARGET, f"{IMAGES_DIR}/c1/a-diagram.png", f"{IMAGES_DIR}/c5/b-icon.svg"):
            self.assertEqual(good, installable_relative(good))
        for bad in (
            f"{MIXED_MEDIA_DIR}/renderer.js",
            f"{MIXED_MEDIA_DIR}/styles.css",
            f"{MIXED_MEDIA_DIR}/mapping.JS",
            "story/data/evil.js",
            f"{IMAGES_DIR}/c1/a.gif",
            f"{IMAGES_DIR}/../c1/a.png",
            f"{MIXED_MEDIA_DIR}/images/c6/../c1/a.png",
        ):
            with self.assertRaises(ValueError):
                installable_relative(bad)
        # story/ 下既有的图片规则不受影响（与密语字形的口径一致）：c6 目录、别的图片后缀
        # 都按通用图片规则放行——这条通道只从素材库里收集，不会把这类路径写进去。
        self.assertEqual(f"{IMAGES_DIR}/c6/a.png", installable_relative(f"{IMAGES_DIR}/c6/a.png"))
        self.assertEqual(f"{IMAGES_DIR}/c1/a.jpg", installable_relative(f"{IMAGES_DIR}/c1/a.jpg"))
        # story/ 下既有的图片目标不受影响（与密语字形的口径一致）。
        for good in ("story/assets/OO/DY1P5.png", "assets/cards/001.jpg"):
            self.assertEqual(good, installable_relative(good))

    def test_export_inspect_import_install_roundtrip(self) -> None:
        without = SCRATCH / "without-mixed-media.atopack"
        export_package(self.db, self.library, without, {"include_mixed_media": False}, ato_root=self.source)
        result = export_package(self.db, self.library, self.pack, ato_root=self.source)
        self.assertEqual(4, result["mixed_media_files"])
        # mixedMediaFiles 是附加字段，不改变资料包版本号，老读取方会直接忽略。
        versions = []
        for path in (without, self.pack):
            with zipfile.ZipFile(path) as archive:
                versions.append(json.loads(archive.read("manifest.json").decode("utf-8"))["version"])
        self.assertEqual(versions[0], versions[1])

        inspection = inspect_package(self.db, self.pack)
        self.assertEqual(4, inspection["mixed_media_files"])
        self.assertEqual([], inspection["mixed_media_warnings"])
        with zipfile.ZipFile(self.pack) as archive:
            names = set(archive.namelist())
            manifest = inspection["manifest"]
            entries = {entry["target"]: entry for entry in manifest["mixedMediaFiles"]}
            self.assertEqual(
                {MAPPING_TARGET, f"{IMAGES_DIR}/c1/a-diagram.png",
                 f"{IMAGES_DIR}/c1/b-icon.svg", f"{IMAGES_DIR}/c2/c-map.png"},
                set(entries),
            )
            self.assertEqual("image/svg+xml", entries[f"{IMAGES_DIR}/c1/b-icon.svg"]["mimeType"])
            self.assertEqual(hashlib.sha256(SVG_ONE).hexdigest(),
                             entries[f"{IMAGES_DIR}/c1/b-icon.svg"]["sha256"])
            self.assertEqual(SVG_ONE, archive.read(f"{IMAGES_DIR}/c1/b-icon.svg"))
            # 映射表不进 assets 段（专属段分发），也不收同目录的渲染器与样式表。
            self.assertEqual([], manifest["assets"])
            self.assertNotIn(f"{MIXED_MEDIA_DIR}/renderer.js", names)
            self.assertNotIn(f"{MIXED_MEDIA_DIR}/styles.css", names)
            self.assertNotIn(f"{IMAGES_DIR}/c1/notes.txt", names)
            self.assertNotIn(f"{IMAGES_DIR}/c6/d.png", names)

        imported = import_package(self.db, self.library, self.pack)
        self.assertEqual(4, imported["mixed_media_imported"])
        self.assertEqual(0, imported["mixed_media_skipped"])
        self.assertEqual(MAPPING_BYTES,
                         (self.library / MIXED_MEDIA_LIBRARY / MAPPING_TARGET).read_bytes())
        self.assertEqual(SVG_ONE,
                         (self.library / MIXED_MEDIA_LIBRARY / IMAGES_DIR / "c1" / "b-icon.svg").read_bytes())

        installed = SCRATCH / "installed"
        installed.mkdir()
        (installed / "index.html").touch()
        for folder in ("aibp", "map", "story"):
            (installed / folder).mkdir()
        plan = install_plan(self.db, self.library, installed)
        entries = [entry for entry in plan["files"] if entry["item_id"] == "mixed-media"]
        self.assertEqual(4, len(entries))
        self.assertTrue(all(entry["direct_copy"] for entry in entries))
        self.assertTrue(all(entry["status"] == "add" for entry in entries))
        apply_install(self.db, self.library, installed, [])
        self.assertEqual(MAPPING_BYTES, (installed / MAPPING_TARGET).read_bytes())
        self.assertEqual(PNG_TWO, (installed / IMAGES_DIR / "c2" / "c-map.png").read_bytes())
        self.assertEqual(SVG_ONE, (installed / IMAGES_DIR / "c1" / "b-icon.svg").read_bytes())
        # 只落映射表与裁图，不碰同目录下的程序代码。
        self.assertFalse((installed / MIXED_MEDIA_DIR / "renderer.js").exists())

        again = install_plan(self.db, self.library, installed)
        self.assertTrue(all(entry["status"] == "same" for entry in again["files"]
                            if entry["item_id"] == "mixed-media"))

    def test_missing_section_is_quiet(self) -> None:
        """清单里没有 mixedMediaFiles 时不报错：导入、清点、安装都当它是 0 个。"""
        plain = SCRATCH / "plain.atopack"
        with zipfile.ZipFile(plain, "w") as archive:
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack", "version": 2, "items": [], "assets": [],
            }))
        inspection = inspect_package(self.db, plain, verify_hashes=True, library=self.library)
        self.assertEqual(0, inspection["mixed_media_files"])
        self.assertEqual([], inspection["mixed_media_warnings"])
        imported = import_package(self.db, self.library, plain)
        self.assertEqual(0, imported["mixed_media_imported"])
        self.assertEqual(0, imported["mixed_media_skipped"])
        with zipfile.ZipFile(plain) as archive:
            self.assertEqual(0, import_resources(archive, {}, self.library, False))
        installed = SCRATCH / "plain-installed"
        installed.mkdir()
        (installed / "index.html").touch()
        for folder in ("aibp", "map", "story"):
            (installed / folder).mkdir()
        plan = install_plan(self.db, self.library, installed)
        self.assertEqual([], [entry for entry in plan["files"] if entry["item_id"] == "mixed-media"])

    def test_compat_zip_carries_mixed_media(self) -> None:
        compat = SCRATCH / "compat.zip"
        export_compat(self.db, self.library, compat, {"include_stories": False}, None, self.source)
        with zipfile.ZipFile(compat) as archive:
            names = set(archive.namelist())
            self.assertIn(MAPPING_TARGET, names)
            self.assertIn(f"{IMAGES_DIR}/c1/b-icon.svg", names)
            self.assertNotIn(f"{MIXED_MEDIA_DIR}/renderer.js", names)

    def test_fan_pack_carries_mixed_media(self) -> None:
        """打包引擎把映射表与裁图写进 mixedMediaFiles 段；--no-mixed-media 时整段不出现。"""
        from tools.build_fan_pack import build as build_fan_pack

        card = {
            "id": "common:card", "cycle": "common", "module": "决战版图",
            "subgroup": "战斗版图", "name": "决战版图", "number": "card",
            "sort_order": 1, "faces": {"front": "assets/cards/001.jpg"},
            "capture_required": True,
        }
        project = SCRATCH / "project"
        media = project / MIXED_MEDIA_DIR
        (project / "assets" / "cards").mkdir(parents=True)
        (media / "images" / "c1").mkdir(parents=True)
        (project / "assets" / "cards" / "001.jpg").write_bytes(b"card-bytes")
        (media / "mapping.js").write_bytes(b'/* audit */ window.ATO_MIXED_MEDIA_MAP={"schema":1,"rows":[],"coverage":{"audit":true}};')
        (media / "images" / "c1" / "a-diagram.png").write_bytes(PNG_ONE)
        (media / "images" / "c1" / "b-icon.svg").write_bytes(SVG_ONE)
        (media / "renderer.js").write_text("// renderer\n", encoding="utf-8")
        (project / "index.html").write_text("ATO", encoding="utf-8")

        catalog = {"source": {"catalog_version": "test-mixed-media"}, "items": [card]}
        for name, include, expected in (
            ("with.atopack", True, 3),
            ("without.atopack", False, 0),
        ):
            output = SCRATCH / name
            if not include:
                shutil.rmtree(media)
            with patch("tools.build_fan_pack.fixed_catalog_payload", return_value=catalog):
                result = build_fan_pack(output=output, include_mixed_media=include,
                                        **fan_pack_kwargs(project))
            self.assertEqual(expected, result.mixed_media_files)
            with zipfile.ZipFile(output) as archive:
                manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
                self.assertEqual(len(archive.namelist()), len(set(archive.namelist())))
                self.assertEqual(["assets/cards/001.jpg"], [a["member"] for a in manifest["assets"]])
                if include:
                    self.assertEqual(MAPPING_BYTES, archive.read(MAPPING_TARGET))
                    entries = {entry["target"]: entry for entry in manifest["mixedMediaFiles"]}
                    self.assertEqual(
                        {MAPPING_TARGET, f"{IMAGES_DIR}/c1/a-diagram.png", f"{IMAGES_DIR}/c1/b-icon.svg"},
                        set(entries),
                    )
                    self.assertEqual(SVG_ONE, archive.read(f"{IMAGES_DIR}/c1/b-icon.svg"))
                    self.assertEqual(hashlib.sha256(SVG_ONE).hexdigest(),
                                     entries[f"{IMAGES_DIR}/c1/b-icon.svg"]["sha256"])
                    self.assertTrue(manifest["build"]["mixedMediaIncluded"])
                    self.assertNotIn(f"{MIXED_MEDIA_DIR}/renderer.js", archive.namelist())
                else:
                    self.assertNotIn("mixedMediaFiles", manifest)
                    self.assertFalse(manifest["build"]["mixedMediaIncluded"])
                    self.assertFalse(any(n.startswith(MIXED_MEDIA_DIR) for n in archive.namelist()))

    def test_incremental_pack_reuses_mixed_media_members(self) -> None:
        """增量底包的段列表要认得 mixedMediaFiles：未改动的搬旧字节，改动的重读。"""
        from tools.build_fan_pack import Reporter, build as build_fan_pack, load_incremental_index

        card = {
            "id": "common:card", "cycle": "common", "module": "决战版图",
            "subgroup": "战斗版图", "name": "决战版图", "number": "card",
            "sort_order": 1, "faces": {"front": "assets/cards/001.jpg"},
            "capture_required": True,
        }
        project = SCRATCH / "incr-project"
        media = project / MIXED_MEDIA_DIR
        (project / "assets" / "cards").mkdir(parents=True)
        (media / "images" / "c1").mkdir(parents=True)
        (project / "assets" / "cards" / "001.jpg").write_bytes(b"card-bytes")
        (media / "mapping.js").write_bytes(MAPPING_BYTES)
        (media / "images" / "c1" / "a-diagram.png").write_bytes(PNG_ONE)
        (media / "images" / "c1" / "b-icon.svg").write_bytes(SVG_ONE)
        (project / "index.html").write_text("ATO", encoding="utf-8")

        catalog = {"source": {"catalog_version": "test-mixed-media"}, "items": [card]}
        base = SCRATCH / "incremental-base.atopack"
        with patch("tools.build_fan_pack.fixed_catalog_payload", return_value=catalog):
            first = build_fan_pack(output=base, **fan_pack_kwargs(project))
        self.assertEqual(3, first.mixed_media_files)

        # 底包的成员索引里必须已经有混合媒体这一段的成员，增量才谈得上复用。
        digests, _build, _edges = load_incremental_index(base, Reporter(quiet=True))
        self.assertIn(MAPPING_TARGET, digests)
        self.assertIn(f"{IMAGES_DIR}/c1/b-icon.svg", digests)

        # 改一张图 + 新增一张 SVG：都要反映到新包；没动的仍从底包搬旧字节。
        (media / "images" / "c1" / "a-diagram.png").write_bytes(PNG_CHANGED)
        (media / "images" / "c1" / "c-new.svg").write_bytes(SVG_TWO)
        second = SCRATCH / "incremental-second.atopack"
        with patch("tools.build_fan_pack.fixed_catalog_payload", return_value=catalog):
            result = build_fan_pack(output=second, incremental_from=base, **fan_pack_kwargs(project))
        self.assertEqual(4, result.mixed_media_files)
        self.assertGreater(result.reused_members, 0, "未改动的成员应从底包复用")

        with zipfile.ZipFile(second) as archive:
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            entries = {entry["target"]: entry for entry in manifest["mixedMediaFiles"]}
            self.assertEqual(
                {MAPPING_TARGET, f"{IMAGES_DIR}/c1/a-diagram.png",
                 f"{IMAGES_DIR}/c1/b-icon.svg", f"{IMAGES_DIR}/c1/c-new.svg"},
                set(entries),
            )
            # 改动的图：包内字节与哈希都是当前磁盘内容，不是底包那份。
            self.assertEqual(PNG_CHANGED, archive.read(f"{IMAGES_DIR}/c1/a-diagram.png"))
            self.assertEqual(hashlib.sha256(PNG_CHANGED).hexdigest(),
                             entries[f"{IMAGES_DIR}/c1/a-diagram.png"]["sha256"])
            # 未改动的映射表与 SVG：哈希沿用底包。
            self.assertEqual(digests[MAPPING_TARGET], entries[MAPPING_TARGET]["sha256"])
            self.assertEqual(digests[f"{IMAGES_DIR}/c1/b-icon.svg"],
                             entries[f"{IMAGES_DIR}/c1/b-icon.svg"]["sha256"])
            # 新增的 SVG：字节与哈希都是新算的。
            self.assertEqual(SVG_TWO, archive.read(f"{IMAGES_DIR}/c1/c-new.svg"))
            self.assertEqual(hashlib.sha256(SVG_TWO).hexdigest(),
                             entries[f"{IMAGES_DIR}/c1/c-new.svg"]["sha256"])

    def test_export_api_payload_defaults_to_mixed_media(self) -> None:
        """素材库网页导出的请求模型默认带混合媒体（对应 GUI 勾选框默认勾上），且能关掉。"""
        from app.main import ExportPayload

        self.assertTrue(ExportPayload().include_mixed_media)
        self.assertFalse(ExportPayload(include_mixed_media=False).include_mixed_media)
        output = SCRATCH / "api-without-mixed-media.atopack"
        export_package(self.db, self.library, output,
                       ExportPayload(include_mixed_media=False).model_dump(), ato_root=self.source)
        with zipfile.ZipFile(output) as archive:
            self.assertNotIn("mixedMediaFiles", json.loads(archive.read("manifest.json")))
        output_with = SCRATCH / "api-with-mixed-media.atopack"
        export_package(self.db, self.library, output_with,
                       ExportPayload().model_dump(), ato_root=self.source)
        with zipfile.ZipFile(output_with) as archive:
            manifest = json.loads(archive.read("manifest.json"))
        self.assertEqual(4, len(manifest["mixedMediaFiles"]))

    def test_full_pack_carries_mixed_media_from_overlay_and_apk(self) -> None:
        """从 APK 重建整包：优先工程覆盖目录里的映射表与裁图，其次 APK 里的历史副本。"""
        from tools.build_full_pack import build as build_full_pack

        card = {
            "id": "common:card", "cycle": "common", "module": "决战版图",
            "subgroup": "战斗版图", "name": "决战版图", "number": "card",
            "sort_order": 1, "faces": {"front": "assets/cards/001.jpg"},
            "capture_required": True,
        }
        catalog = {"source": {"catalog_version": "test-mixed-media"}, "items": [card]}
        storybook = 'window.STORYBOOK_DATA = {"books":[]};'
        entities = '{"entities":[{"id":"a","name":"A"}]}'
        apk = SCRATCH / "owned.apk"
        with zipfile.ZipFile(apk, "w") as archive:
            archive.writestr("assets/web/assets/cards/001.jpg", b"card")
            archive.writestr("assets/web/story/data/storybook-data.js", storybook)
            archive.writestr("assets/web/story/data/entity-index.json", entities)

        overlay = SCRATCH / "full-overlay"
        media = overlay / MIXED_MEDIA_DIR
        (overlay / "assets" / "cards").mkdir(parents=True)
        (media / "images" / "c1").mkdir(parents=True)
        (overlay / "assets" / "cards" / "001.jpg").write_bytes(b"card")
        (media / "mapping.js").write_bytes(MAPPING_BYTES)
        (media / "images" / "c1" / "a-diagram.png").write_bytes(PNG_ONE)
        (media / "images" / "c1" / "b-icon.svg").write_bytes(SVG_ONE)

        for include, expected in ((True, 3), (False, 0)):
            output = SCRATCH / f"full-{include}.atopack"
            with patch("tools.build_full_pack.fixed_catalog_payload", return_value=catalog):
                result = build_full_pack(apk, output, overlay, False, False, include)
            self.assertEqual(expected, result["mixed_media_files"])
            with zipfile.ZipFile(output) as archive:
                manifest = json.loads(archive.read("manifest.json"))
                self.assertEqual(["assets/cards/001.jpg"], [a["member"] for a in manifest["assets"]])
                self.assertEqual(include, "mixedMediaFiles" in manifest)
                self.assertEqual(include, bool(manifest["build"]["mixedMediaIncluded"]))
                if include:
                    entries = {entry["target"]: entry for entry in manifest["mixedMediaFiles"]}
                    self.assertEqual(
                        {MAPPING_TARGET, f"{IMAGES_DIR}/c1/a-diagram.png", f"{IMAGES_DIR}/c1/b-icon.svg"},
                        set(entries),
                    )
                    self.assertEqual(MAPPING_BYTES, archive.read(MAPPING_TARGET))
                    self.assertEqual(hashlib.sha256(MAPPING_BYTES).hexdigest(),
                                     entries[MAPPING_TARGET]["sha256"])
                    self.assertEqual(SVG_ONE, archive.read(f"{IMAGES_DIR}/c1/b-icon.svg"))

        # 工程覆盖目录没有这条通道时，退回 APK 里的历史副本（老包把它们放在 assets/web/ 下）。
        apk_media = SCRATCH / "apk-with-media.apk"
        with zipfile.ZipFile(apk_media, "w") as archive:
            archive.writestr("assets/web/assets/cards/001.jpg", b"card")
            archive.writestr("assets/web/story/data/storybook-data.js", storybook)
            archive.writestr("assets/web/story/data/entity-index.json", entities)
            archive.writestr(f"assets/web/{MAPPING_TARGET}", MAPPING_BYTES)
            archive.writestr(f"assets/web/{IMAGES_DIR}/c1/a-diagram.png", PNG_ONE)
        carried = SCRATCH / "full-from-apk.atopack"
        with patch("tools.build_full_pack.fixed_catalog_payload", return_value=catalog):
            result = build_full_pack(apk_media, carried, None)
        self.assertEqual(2, result["mixed_media_files"])
        with zipfile.ZipFile(carried) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(
                {MAPPING_TARGET, f"{IMAGES_DIR}/c1/a-diagram.png"},
                {entry["target"] for entry in manifest["mixedMediaFiles"]},
            )
            self.assertEqual(PNG_ONE, archive.read(f"{IMAGES_DIR}/c1/a-diagram.png"))

    def test_update_full_pack_carries_mixed_media(self) -> None:
        """重建整包：工程覆盖目录、素材库、底包三条来源都要能带出 mixedMediaFiles 段。"""
        from tools.update_full_pack import update_full_pack

        card = {
            "id": "common:card", "cycle": "common", "module": "决战版图",
            "subgroup": "战斗版图", "name": "决战版图", "number": "card",
            "sort_order": 1, "faces": {"front": "assets/cards/001.jpg"},
            "capture_required": True,
        }
        entities = json.dumps({"entities": [{"id": "a", "name": "A"}]}).encode("utf-8")
        base = SCRATCH / "update-base.atopack"
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

        overlay = SCRATCH / "update-overlay"
        media = overlay / MIXED_MEDIA_DIR
        (overlay / "assets" / "cards").mkdir(parents=True)
        (media / "images" / "c1").mkdir(parents=True)
        (overlay / "assets" / "cards" / "001.jpg").write_bytes(b"current card")
        (media / "mapping.js").write_bytes(MAPPING_BYTES)
        (media / "images" / "c1" / "b-icon.svg").write_bytes(SVG_ONE)

        catalog = {"source": {"catalog_version": "test-mixed-media"}, "items": [card]}
        destination = SCRATCH / "updated.atopack"
        with patch("tools.update_full_pack.fixed_catalog_payload", return_value=catalog):
            result = update_full_pack(base, destination, overlay)
        self.assertEqual(2, result["mixed_media_files"])
        with zipfile.ZipFile(destination) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            entries = {entry["target"]: entry for entry in manifest["mixedMediaFiles"]}
            self.assertEqual({MAPPING_TARGET, f"{IMAGES_DIR}/c1/b-icon.svg"}, set(entries))
            self.assertEqual(MAPPING_BYTES, archive.read(MAPPING_TARGET))
            self.assertEqual(hashlib.sha256(SVG_ONE).hexdigest(),
                             entries[f"{IMAGES_DIR}/c1/b-icon.svg"]["sha256"])
            self.assertTrue(manifest["build"]["mixedMediaIncluded"])
            self.assertEqual(b"current card", archive.read("assets/cards/001.jpg"))

        # 工程覆盖目录没有这条段、底包里已经有：从底包原样带过来。
        media_free = SCRATCH / "update-overlay-without-media"
        (media_free / "assets" / "cards").mkdir(parents=True)
        (media_free / "assets" / "cards" / "001.jpg").write_bytes(b"current card")
        carried = SCRATCH / "updated-carried.atopack"
        with patch("tools.update_full_pack.fixed_catalog_payload", return_value=catalog):
            result = update_full_pack(destination, carried, media_free)
        self.assertEqual(2, result["mixed_media_files"])
        with zipfile.ZipFile(carried) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(
                {MAPPING_TARGET, f"{IMAGES_DIR}/c1/b-icon.svg"},
                {entry["target"] for entry in manifest["mixedMediaFiles"]},
            )
            self.assertEqual(SVG_ONE, archive.read(f"{IMAGES_DIR}/c1/b-icon.svg"))

        # --no-mixed-media：整段不出现，其它段照旧。
        without = SCRATCH / "updated-without.atopack"
        with patch("tools.update_full_pack.fixed_catalog_payload", return_value=catalog):
            result = update_full_pack(base, without, overlay, include_mixed_media=False)
        self.assertEqual(0, result["mixed_media_files"])
        with zipfile.ZipFile(without) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertNotIn("mixedMediaFiles", manifest)
            self.assertFalse(manifest["build"]["mixedMediaIncluded"])
            self.assertFalse(any(name.startswith(MIXED_MEDIA_DIR) for name in archive.namelist()))


if __name__ == "__main__":
    unittest.main()
