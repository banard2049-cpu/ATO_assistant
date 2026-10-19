from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import unittest
import zipfile
from dataclasses import asdict
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.catalog import CatalogItem, apply_catalog
from app.db import Database
from app.fixed_catalog import card_back_paths
from app.installer import apply_install, install_plan
from app.packages import export_compat, export_package, import_package, inspect_package
from app.storage import store_image
from tools.build_fan_pack import Reporter, build as build_fan_pack
from tools.build_full_pack import build as build_full_pack
from tools.update_full_pack import update_full_pack


def _relax_sandbox_tempdirs():
    probe = tempfile.mkdtemp()
    try:
        (Path(probe) / "probe").write_text("x", encoding="utf-8")
    except OSError:
        def mkdtemp(suffix=None, prefix=None, dir=None):
            for _ in range(10000):
                name = os.path.join(dir or tempfile.gettempdir(),
                                    (prefix or "tmp") + next(tempfile._get_candidate_names()) + (suffix or ""))
                try:
                    os.mkdir(name, 0o777)
                    return name
                except FileExistsError:
                    continue
            raise FileExistsError("无法创建临时目录")
        tempfile.mkdtemp = mkdtemp
    finally:
        shutil.rmtree(probe, ignore_errors=True)


_relax_sandbox_tempdirs()


class SharedCardBackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.ato = self.root / "ato"
        self.ato.mkdir()
        (self.ato / "index.html").write_text("<html></html>", encoding="utf-8")
        for directory in ("aibp", "map", "story", "technology"):
            (self.ato / directory).mkdir()
        self.back = "aibp/ps/TEST_MONSTER/TEST_MONSTER_AI_III_BACK.jpg"
        self.special = "aibp/ps/TEST_MONSTER/TEST_MONSTER_AI_III_SPECIAL_BACK.jpg"
        self.items = [
            CatalogItem(
                id=f"c1:shared:{number}", cycle="c1", module="AIBP", subgroup="TEST_MONSTER / AI",
                name=f"Card {number}", number=str(number), sort_order=number,
                faces={"front": f"aibp/ps/TEST_MONSTER/CARD_{number}.jpg",
                       "back": self.special if number == 3 else self.back},
            )
            for number in range(1, 4)
        ]
        self.payload = {"source": {"catalog_version": "shared-back-test"},
                        "items": [asdict(item) for item in self.items]}
        self.targets = {target for item in self.items for target in item.faces.values()}
        for index, target in enumerate(sorted(self.targets)):
            path = self.ato / target
            path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (120, 180), (30 * index, 20, 50)).save(path)
        self.library, self.db = self.new_library("library")
        apply_catalog(self.db, self.items, {"catalog_version": "shared-back-test"})
        for item in self.items:
            for face, target in item.faces.items():
                upload = self.library / "tmp" / f"{item.number}-{face}.jpg"
                shutil.copyfile(self.ato / target, upload)
                store_image(self.db, self.library, upload, item.id, face, Path(target).name,
                            "image/jpeg", "package")
        self.filters = {key: False for key in (
            "include_stories", "include_bgm", "include_icons", "include_cryptic", "include_mixed_media",
        )}

    def tearDown(self):
        self.temp.cleanup()

    def new_library(self, name):
        library = self.root / name
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (library / child).mkdir(parents=True, exist_ok=True)
        db = Database(library / "library.sqlite3")
        return library, db

    def check_pack(self, path):
        with zipfile.ZipFile(path) as archive:
            self.assertEqual(len(archive.namelist()), len(set(archive.namelist())))
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(6, len(manifest["assets"]))
            self.assertEqual(self.targets, {asset["member"] for asset in manifest["assets"]})
            self.assertEqual(2, sum(asset["member"] == self.back for asset in manifest["assets"]))
            self.assertEqual(1, archive.namelist().count(self.back))
            self.assertEqual(1, archive.namelist().count(self.special))
            for asset in manifest["assets"]:
                self.assertEqual(asset["sha256"], hashlib.sha256(archive.read(asset["member"])).hexdigest())
        return manifest

    def test_package_round_trip_keeps_card_relations_and_one_shared_object(self):
        package = self.root / "export.atopack"
        export_package(self.db, self.library, package, self.filters)
        self.check_pack(package)
        library, db = self.new_library("restored")
        self.assertEqual(6, inspect_package(db, package, verify_hashes=True, library=library)["summary"]["add"])
        self.assertEqual(6, import_package(db, library, package)["imported"])
        backs = db.all("SELECT original_path FROM asset_revisions WHERE face='back' ORDER BY item_id")
        self.assertEqual(backs[0]["original_path"], backs[1]["original_path"])
        self.assertNotEqual(backs[0]["original_path"], backs[2]["original_path"])
        plan = install_plan(db, library, self.ato)
        self.assertEqual(5, len(plan["files"]))

    def test_compat_writes_one_member_per_shared_target(self):
        package = self.root / "compat.zip"
        result = export_compat(self.db, self.library, package, self.filters)
        self.assertEqual(5, result["files"])
        with zipfile.ZipFile(package) as archive:
            self.assertEqual(self.targets, set(archive.namelist()))
            self.assertEqual(5, len(archive.namelist()))

    def test_compat_rejects_conflicting_shared_sources(self):
        upload = self.library / "tmp" / "conflict.jpg"
        Image.new("RGB", (120, 180), (255, 0, 0)).save(upload)
        store_image(self.db, self.library, upload, self.items[1].id, "back", upload.name,
                    "image/jpeg", "package")
        with self.assertRaisesRegex(ValueError, "资源路径冲突"):
            export_compat(self.db, self.library, self.root / "conflict.zip", self.filters)

    def test_legacy_ai3_import_keeps_canonical_paths_and_corrected_back(self):
        front = "aibp/ps/HEKATON/HEKATON_AI_III_003.jpg"
        canonical = "aibp/ps/HEKATON/HEKATON_AI_III_SPECIAL_BACK.jpg"
        old_back = "aibp/ps/HEKATON/HEKATON_AI_III_003_BACK.jpg"
        item = CatalogItem(
            id="c1:aibp:hekaton-ai:hekaton-ai-iii-003", cycle="c1", module="AIBP",
            subgroup="HEKATON / AI", name="HEKATON AI III 003", number="HEKATON_AI_III_003",
            sort_order=3, faces={"front": front, "back": canonical},
        )
        apply_catalog(self.db, [item], {"catalog_version": "canonical"})
        correct = self.library / "tmp" / "correct.jpg"
        Image.new("RGB", (120, 180), (10, 200, 10)).save(correct)
        revision = store_image(self.db, self.library, correct, item.id, "back", "correct.jpg",
                               "image/jpeg", "package")
        old_item = asdict(item)
        old_item["faces"] = {"front": front, "back": old_back}
        legacy = self.root / "legacy.atopack"
        assets = []
        with zipfile.ZipFile(legacy, "w") as archive:
            for face, member in old_item["faces"].items():
                raw = (self.ato / next(iter(self.targets))).read_bytes()
                archive.writestr(member, raw)
                assets.append({"itemId": item.id, "face": face, "member": member,
                               "sha256": hashlib.sha256(raw).hexdigest(), "mimeType": "image/jpeg",
                               "originalName": Path(member).name})
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack", "version": 2, "items": [old_item],
                "assets": assets, "stories": {"books": []},
            }))
        result = import_package(self.db, self.library, legacy, replace=True)
        self.assertEqual(1, result["legacy_ai3_backs_skipped"])
        self.assertEqual(1, result["imported"])
        faces = json.loads(self.db.one("SELECT faces_json FROM catalog_items WHERE id=?", (item.id,))["faces_json"])
        self.assertEqual(canonical, faces["back"])
        current = self.db.one("SELECT sha256 FROM asset_revisions WHERE item_id=? AND face='back' AND is_current=1", (item.id,))
        self.assertEqual(revision["sha256"], current["sha256"])
        # A new library requests the corrected shared back instead of accepting
        # bytes whose old per-card filename cannot prove the special mapping.
        library, db = self.new_library("legacy-restored")
        import_package(db, library, legacy)
        self.assertIsNone(db.one("SELECT id FROM asset_revisions WHERE face='back' AND is_current=1"))
        self.assertEqual(canonical, json.loads(db.one("SELECT faces_json FROM catalog_items")["faces_json"])["back"])

    def test_legacy_ai12_bp_import_skips_retired_backs_but_keeps_dragon_effect_face(self):
        mapping = card_back_paths()
        fronts = [f"aibp/ps/HEKATON/HEKATON_{deck}_001.jpg"
                  for deck in ("AI_I", "AI_II", "BP_I", "BP_II", "BP_III")]
        dragon_front = "aibp/ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_BP_I_002.jpg"
        fronts.append(dragon_front)
        items = [CatalogItem(
            id=f"c1:mapped:{index}", cycle="c1", module="AIBP", subgroup="mapped / AI BP",
            name=Path(front).stem, number=Path(front).stem, sort_order=index,
            faces={"front": front, "back": mapping[front]},
        ) for index, front in enumerate(fronts)]
        apply_catalog(self.db, items, {"catalog_version": "canonical-all-backs"})
        current = {}
        for item in items:
            correct = self.library / "tmp" / f"correct-{item.sort_order}.jpg"
            Image.new("RGB", (120, 180), (10, 200, 10)).save(correct)
            current[item.id] = store_image(self.db, self.library, correct, item.id, "back", correct.name,
                                           "image/jpeg", "package")["sha256"]
        old_items = []
        assets = []
        legacy = self.root / "legacy-all-backs.atopack"
        raw = (self.ato / next(iter(self.targets))).read_bytes()
        with zipfile.ZipFile(legacy, "w") as archive:
            for item in items:
                old_item = asdict(item)
                old_item["faces"]["back"] = item.faces["front"].replace(".jpg", "_BACK.jpg")
                old_items.append(old_item)
                for face, member in old_item["faces"].items():
                    archive.writestr(member, raw)
                    assets.append({"itemId": item.id, "face": face, "member": member,
                                   "sha256": hashlib.sha256(raw).hexdigest(), "mimeType": "image/jpeg",
                                   "originalName": Path(member).name})
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack", "version": 2, "items": old_items,
                "assets": assets, "stories": {"books": []},
            }))
        result = import_package(self.db, self.library, legacy, replace=True)
        self.assertEqual(5, result["legacy_card_backs_skipped"])
        self.assertEqual(0, result["legacy_ai3_backs_skipped"])
        self.assertEqual(7, result["imported"])
        for item in items:
            with self.subTest(front=item.faces["front"]):
                faces = json.loads(self.db.one("SELECT faces_json FROM catalog_items WHERE id=?", (item.id,))["faces_json"])
                self.assertEqual(mapping[item.faces["front"]], faces["back"])
                digest = self.db.one("SELECT sha256 FROM asset_revisions WHERE item_id=? AND face='back' AND is_current=1",
                                     (item.id,))["sha256"]
                self.assertEqual(hashlib.sha256(raw).hexdigest() if item.faces["front"] == dragon_front else current[item.id],
                                 digest)

    def mapped_items(self, deck="AI_I", boss="HEKATON", count=2):
        mapping = card_back_paths()
        return [CatalogItem(
            id=f"mapped:{boss}:{deck}:{number}", cycle="c1", module="AIBP", subgroup=f"{boss} / {deck}",
            name=f"{boss} {deck} {number}", number=str(number), sort_order=number,
            faces={"front": front, "back": mapping[front]},
        ) for number in range(1, count + 1)
          for front in [f"aibp/ps/{boss}/{boss}_{deck}_{number:03d}.jpg"]]

    def make_mapped_pack(self, path, items, backs):
        assets = []
        with zipfile.ZipFile(path, "w") as archive:
            for item, raw in zip(items, backs):
                member = f"objects/{item.id.replace(':', '-')}.jpg"
                archive.writestr(member, raw)
                assets.append({"itemId": item.id, "face": "back", "member": member,
                               "sha256": hashlib.sha256(raw).hexdigest(), "mimeType": "image/jpeg",
                               "originalName": Path(item.faces["back"]).name})
            archive.writestr("manifest.json", json.dumps({
                "format": "ato-asset-pack", "version": 2, "items": [asdict(item) for item in items],
                "assets": assets, "stories": {"books": []},
            }))

    def test_canonical_filename_cannot_restore_known_old_tone_including_dragon_effect_back(self):
        items = [*self.mapped_items("AI_III", count=1),
                 *self.mapped_items("BP_I", "DRAGON_OF_PHOBOS", count=1)]
        apply_catalog(self.db, items, {"catalog_version": "tone-test"})
        raw = (self.ato / next(iter(self.targets))).read_bytes()
        old_digest = hashlib.sha256(raw).hexdigest()
        current = {}
        for item in items:
            upload = self.library / "tmp" / f"corrected-{item.sort_order}-{item.number}.jpg"
            Image.new("RGB", (120, 180), (10, 100, 40)).save(upload)
            current[item.id] = store_image(self.db, self.library, upload, item.id, "back", upload.name,
                                           "image/jpeg", "package")["sha256"]
        package = self.root / "old-tone-new-path.atopack"
        self.make_mapped_pack(package, items, [raw] * len(items))
        revisions = {item.faces["back"]: {"fromSha256": old_digest, "toSha256": current[item.id]}
                     for item in items}
        with patch("app.fixed_catalog.card_back_revisions", return_value=revisions):
            result = import_package(self.db, self.library, package, replace=True)
        self.assertEqual(2, result["legacy_card_backs_skipped"])
        self.assertEqual(2, result["outdated_card_backs_skipped"])
        self.assertEqual(0, result["imported"])
        for item in items:
            self.assertEqual(current[item.id], self.db.one(
                "SELECT sha256 FROM asset_revisions WHERE item_id=? AND face='back' AND is_current=1",
                (item.id,))["sha256"])
        library, db = self.new_library("outdated-tone-restored")
        with patch("app.fixed_catalog.card_back_revisions", return_value=revisions):
            result = import_package(db, library, package, replace=True)
        self.assertEqual(2, result["outdated_card_backs_skipped"])
        self.assertIsNone(db.one("SELECT id FROM asset_revisions WHERE face='back' AND is_current=1"))

    def test_import_rejects_conflicting_shared_bytes_before_changing_library(self):
        items = self.mapped_items()
        package = self.root / "conflicting-shared.atopack"
        self.make_mapped_pack(package, items, [
            (self.ato / target).read_bytes() for target in sorted(self.targets)[:2]
        ])
        library, db = self.new_library("conflicting-shared")
        with self.assertRaisesRegex(ValueError, "共享牌背内容冲突"):
            import_package(db, library, package, replace=True)
        self.assertIsNone(db.one("SELECT id FROM catalog_items"))
        self.assertIsNone(db.one("SELECT id FROM asset_revisions"))

    def test_safe_import_keeps_omitted_shared_peer_and_replace_updates_whole_group(self):
        items = self.mapped_items()
        apply_catalog(self.db, items, {"catalog_version": "shared-peer-test"})
        upload = self.library / "tmp" / "peer-custom.jpg"
        Image.new("RGB", (120, 180), (20, 210, 30)).save(upload)
        current = store_image(self.db, self.library, upload, items[0].id, "back", upload.name,
                              "image/jpeg", "upload")["sha256"]
        self.db.execute("UPDATE asset_revisions SET is_current=0 WHERE item_id=?", (items[1].id,))
        raw = (self.ato / next(iter(self.targets))).read_bytes()
        package = self.root / "missing-peer.atopack"
        self.make_mapped_pack(package, [items[1]], [raw])
        inspection = inspect_package(self.db, package, library=self.library)
        self.assertEqual(1, inspection["summary"]["replace"])
        self.assertEqual(0, import_package(self.db, self.library, package)["imported"])
        self.assertEqual(current, self.db.one(
            "SELECT sha256 FROM asset_revisions WHERE item_id=? AND is_current=1", (items[0].id,))["sha256"])
        self.assertEqual(1, import_package(self.db, self.library, package, replace=True)["imported"])
        for item in items:
            self.assertEqual(hashlib.sha256(raw).hexdigest(), self.db.one(
                "SELECT sha256 FROM asset_revisions WHERE item_id=? AND is_current=1", (item.id,))["sha256"])

    def test_automatic_shared_back_install_and_compat_preserve_original_jpeg_bytes(self):
        item = self.mapped_items(count=1)[0]
        apply_catalog(self.db, [item], {"catalog_version": "migration-original-test"})
        upload = self.library / "tmp" / "canonical.jpg"
        shutil.copyfile(self.ato / next(iter(self.targets)), upload)
        raw = upload.read_bytes()
        store_image(self.db, self.library, upload, item.id, "back", upload.name, "image/jpeg",
                    "shared-back-migration", defer_preview=True)
        row = self.db.one("SELECT * FROM asset_revisions WHERE item_id=? AND is_current=1", (item.id,))
        self.assertFalse((self.library / row["preview_path"]).is_file())
        entry = next(entry for entry in install_plan(self.db, self.library, self.ato)["files"]
                     if entry["target"] == item.faces["back"])
        self.assertTrue(entry["direct_copy"])
        self.assertEqual(row["original_path"], entry["source"])
        apply_install(self.db, self.library, self.ato, replacements=[])
        self.assertEqual(raw, (self.ato / item.faces["back"]).read_bytes())
        output = self.root / "exact-original.zip"
        export_compat(self.db, self.library, output, self.filters)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(raw, archive.read(item.faces["back"]))

    def test_install_plan_materializes_deferred_user_preview(self):
        item = self.mapped_items(count=1)[0]
        apply_catalog(self.db, [item], {"catalog_version": "deferred-preview-test"})
        upload = self.library / "tmp" / "custom.jpg"
        shutil.copyfile(self.ato / next(iter(self.targets)), upload)
        store_image(self.db, self.library, upload, item.id, "back", upload.name, "image/jpeg", "upload",
                    defer_preview=True)
        row = self.db.one("SELECT * FROM asset_revisions WHERE item_id=? AND is_current=1", (item.id,))
        self.assertFalse((self.library / row["preview_path"]).is_file())
        entry = next(entry for entry in install_plan(self.db, self.library, self.ato)["files"]
                     if entry["target"] == item.faces["back"])
        self.assertFalse(entry["direct_copy"])
        self.assertTrue((self.library / row["preview_path"]).is_file())

    def test_full_and_updated_pack_share_one_member(self):
        apk = self.root / "owned.apk"
        with zipfile.ZipFile(apk, "w") as archive:
            for target in self.targets:
                archive.write(self.ato / target, f"assets/web/{target}")
            archive.writestr("assets/web/story/data/storybook-data.js", 'window.STORYBOOK_DATA = {"books":[]};')
            archive.writestr("assets/web/story/data/entity-index.json", '{"entities":[{"id":"a","name":"A"}]}')
        full = self.root / "full.atopack"
        with patch("tools.build_full_pack.fixed_catalog_payload", return_value=self.payload):
            build_full_pack(apk, full, include_cryptic=False, include_mixed_media=False)
        self.check_pack(full)
        # Exercise base-pack fallback as well as current project overlays.
        for name, overlay in (("base", self.root / "empty"), ("overlay", self.ato)):
            overlay.mkdir(exist_ok=True)
            updated = self.root / f"updated-{name}.atopack"
            with patch("tools.update_full_pack.fixed_catalog_payload", return_value=self.payload):
                update_full_pack(full, updated, overlay, include_cryptic=False, include_mixed_media=False)
            self.check_pack(updated)

    def test_fan_pack_shares_one_member(self):
        output = self.root / "fan.atopack"
        with patch("tools.build_fan_pack.fixed_catalog_payload", return_value=self.payload):
            build_fan_pack(
                ato_root=self.ato, output=output, library_path=None, cycles=[], modules=[],
                complete_only=False, include_story_data=False, include_bgm=False, include_icons=False,
                include_cryptic=False, include_mixed_media=False, include_story_files=False,
                official_story=False, official_scans=False, official_assets=False, skip_missing=False,
                force=False, dry_run=False, compression_name="store", verify_mode="full",
                verify_sample=32, reporter=Reporter(quiet=True),
            )
        self.check_pack(output)


if __name__ == "__main__":
    unittest.main()
