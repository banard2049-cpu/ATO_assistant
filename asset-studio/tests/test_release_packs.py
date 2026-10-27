"""固定三包顺序、版本口径、断点恢复与密码 ZIP 的回归检查。"""
from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from tools import build_release_packs as releases


class ReleasePackTests(unittest.TestCase):
    def setUp(self):
        self.temp = releases.staging_directory(Path(tempfile.gettempdir()), "test-release-packs-")
        self.root = self.temp.__enter__()
        self.addCleanup(self.temp.__exit__, None, None, None)
        self.kwargs = dict(ato_root=self.root, version="3.8.13", date="2026-10-26",
                           reporter=releases.Reporter(quiet=True))
        self.calls = []

    def fake_build(self, **kwargs):
        self.calls.append(kwargs)
        path = kwargs["output"]
        data = kwargs["edition"].encode() + kwargs["map_mask_version"].encode()
        manifest = {"format": "ato-asset-pack", "version": 3,
                    "assets": [{"member": "assets/test.bin", "sha256": hashlib.sha256(data).hexdigest()}],
                    "build": {"edition": kwargs["edition"], "mapMaskVersion": kwargs["map_mask_version"],
                              "imageQuality": kwargs["image_quality"],
                              "imageQualityKeep": sorted(kwargs["image_quality_keep"]),
                              "officialScans": kwargs["official_scans"]}}
        if not kwargs["dry_run"]:
            path.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("manifest.json", json.dumps(manifest))
                archive.writestr("assets/test.bin", data)
        return SimpleNamespace(output=str(path), bytes=len(data), edition=kwargs["edition"],
                               map_mask_version=kwargs["map_mask_version"])

    def fake_zip(self, source, destination, member, *args):
        destination.write_bytes(b"protected zip")
        return {"output": str(destination), "member": member, "password": "20"}

    def run_fixture(self, **extra):
        with patch.object(releases, "build", side_effect=self.fake_build), \
                patch.object(releases, "find_zip_tools", return_value=(Path("zip"), Path("unzip"))), \
                patch.object(releases, "encrypted_zip", side_effect=self.fake_zip):
            return releases.build_release(**self.kwargs, **extra)

    def test_three_editions_have_fixed_mask_story_and_quality_settings(self):
        result = self.run_fixture(incremental_fan=self.root / "previous-fan.atopack",
                                  incremental_official=self.root / "previous-official.atopack")
        self.assertEqual([(row["edition"], row["map_mask_version"]) for row in self.calls],
                         [("fan", "legacy"), ("official", "legacy"), ("fan", "current")])
        self.assertEqual([row["story_source"] for row in self.calls], ["project", "official", "project"])
        self.assertEqual([row["official_scans"] for row in self.calls], [False, True, False])
        self.assertEqual([row["official_assets"] for row in self.calls], [False, True, False])
        self.assertEqual(self.calls[2]["incremental_from"], self.calls[0]["output"])
        for row in self.calls:
            self.assertEqual(row["image_quality"], 85)
            self.assertIn("map/*", row["image_quality_keep"])
            self.assertEqual(row["verify_mode"], "full")
            self.assertFalse(row["skip_missing"])
        self.assertEqual(result["encrypted"]["password"], "20")
        self.assertTrue(result["encrypted"]["member"].isascii())
        recorded = json.loads(Path(result["summary"]).read_text(encoding="utf-8"))
        self.assertEqual([row["variant"] for row in recorded["packs"]],
                         ["fan_legacy", "official_legacy", "fan_current"])

    def test_existing_output_is_rejected_before_any_build(self):
        paths = releases.output_paths(self.root / "export", "3.8.13", "2026-10-26")
        paths["fan_current"].parent.mkdir()
        paths["fan_current"].write_bytes(b"old")
        with self.assertRaisesRegex(releases.PackError, "输出已存在"):
            self.run_fixture()
        self.assertEqual(self.calls, [])

    def test_custom_current_name_changes_only_current_pack_and_password_zip(self):
        result = self.run_fixture(current_name="测试用请勿下载")
        self.assertEqual(Path(result["packs"][0]["output"]).name,
                         "ATOassets-民间版-分层地图-q85-2026-10-26-v3.8.13.atopack")
        self.assertEqual(Path(result["packs"][1]["output"]).name,
                         "ATOassets-官方版-分层地图-q85-2026-10-26-v3.8.13.atopack")
        self.assertEqual(Path(result["packs"][2]["output"]).name, "测试用请勿下载.atopack")
        self.assertEqual(Path(result["encrypted"]["output"]).name, "测试用请勿下载.zip")
        self.assertEqual(result["encrypted"]["password"], "20")
        self.assertTrue(result["encrypted"]["member"].isascii())
        self.assertEqual(self.calls[2]["incremental_from"], self.calls[0]["output"])

    def test_custom_current_name_cannot_escape_or_collide(self):
        legacy = "ATOassets-民间版-分层地图-q85-2026-10-26-v3.8.13"
        for name in ("", ".", "..", "../test", "C:\\test", "bad:name", "tail.", "tail ", "CON", legacy):
            with self.subTest(name=name), self.assertRaises(releases.PackError):
                releases.output_paths(self.root, "3.8.13", "2026-10-26", current_name=name)

    def test_resume_checks_hashes_and_skips_completed_packs(self):
        result = self.run_fixture()
        self.calls.clear()
        with patch.object(releases, "verify_encrypted_zip", return_value=result["encrypted"]):
            resumed = self.run_fixture(resume=True)
        self.assertEqual(self.calls, [])
        self.assertTrue(all(row["resumed"] for row in resumed["packs"]))
        self.assertTrue(all(row["verification"]["hashes_checked"] == 1 for row in resumed["packs"]))

    def test_resume_rejects_wrong_mask_instead_of_silently_reusing(self):
        result = self.run_fixture()
        path = Path(result["packs"][0]["output"])
        with zipfile.ZipFile(path) as archive:
            manifest = json.loads(archive.read("manifest.json"))
        manifest["build"]["mapMaskVersion"] = "current"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("manifest.json", json.dumps(manifest))
        with self.assertRaisesRegex(releases.PackError, "mapMaskVersion"):
            self.run_fixture(resume=True)

    def test_dry_run_does_not_require_zip_or_write_outputs(self):
        with patch.object(releases, "build", side_effect=self.fake_build), \
                patch.object(releases, "find_zip_tools", side_effect=AssertionError("not needed")):
            result = releases.build_release(**self.kwargs, dry_run=True)
        self.assertTrue(result["dry_run"])
        self.assertEqual(len(self.calls), 3)
        self.assertFalse((self.root / "export").exists())

    def test_version_and_date_cannot_escape_output_directory(self):
        for version, date in (("../3.8.13", "2026-10-26"), ("3.8.13", "2026-2-3"),
                              ("3.8.13", "2026-02-30")):
            with self.subTest(version=version, date=date), self.assertRaises(releases.PackError):
                releases.output_paths(self.root, version, date)

    def test_real_password_zip_roundtrips_without_chinese_filename_corruption(self):
        try:
            zip_tool, unzip_tool = releases.find_zip_tools()
        except releases.PackError as error:
            self.skipTest(str(error))
        source = self.root / "民间版-新版蒙版.atopack"
        source.write_bytes(b"atopack fixture\x00\xff" * 300)
        destination = self.root / "民间版-新版蒙版.zip"
        member = "ATOassets-fan-current.atopack"
        result = releases.encrypted_zip(source, destination, member, zip_tool, unzip_tool,
                                        releases.Reporter(quiet=True))
        self.assertEqual(result["decoded_sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
        with zipfile.ZipFile(destination) as archive:
            self.assertEqual(archive.namelist(), [member])
            with self.assertRaises(RuntimeError):
                archive.read(member)
            with self.assertRaises(RuntimeError):
                archive.read(member, pwd=b"wrong")
            self.assertEqual(archive.read(member, pwd=b"20"), source.read_bytes())
        self.assertEqual(list(self.root.glob(".encrypt-atopack-*")), [])
        self.assertEqual(list(self.root.glob(".verify-atopack-*")), [])


if __name__ == "__main__":
    unittest.main()
