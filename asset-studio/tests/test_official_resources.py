import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from app.db import Database
from app.installer import apply_install, install_plan
from app.official_resources import DATA, SCANS, collect, checked_bytes
from app.packages import export_package, import_package, inspect_package


class OfficialResourceTests(unittest.TestCase):
    def test_export_import_install_and_reexport(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            scan = SCANS + "c1-0-0.jpg"
            (source / scan).parent.mkdir(parents=True)
            (source / scan).write_bytes(b"original scan bytes")
            data = {"books": [{"id": "c1", "entries": [{"key": "c1-0-0", "officialText": "正文",
                "officialScan": {"src": "./data/ato-storybook-key-scans/c1-0-0.jpg"}}]}]}
            (source / DATA).write_text("window.STORYBOOK_OFFICIAL_DATA = " + json.dumps(data) + ";\n", encoding="utf-8")
            library = root / "library"
            library.mkdir()
            db = Database(library / "db.sqlite")
            pack = root / "official.atopack"
            export_package(db, library, pack, ato_root=source)
            result = inspect_package(db, pack)
            self.assertEqual(2, result["official_resources"])
            self.assertEqual(3, result["manifest"]["version"])
            with zipfile.ZipFile(pack) as archive:
                record = result["manifest"]["resourceFiles"][0]
                with self.assertRaises(ValueError):
                    checked_bytes(archive, {**record, "sha256": "0" * 64})
                with self.assertRaises(ValueError):
                    checked_bytes(archive, {**record, "target": "../outside.js"})
            import_package(db, library, pack)
            installed = root / "installed"
            installed.mkdir()
            (installed / "index.html").touch()
            for folder in ("aibp", "map", "story"):
                (installed / folder).mkdir()
            self.assertEqual(2, install_plan(db, library, installed)["summary"]["add"])
            apply_install(db, library, installed, [])
            for target in (DATA, scan):
                self.assertEqual((source / target).read_bytes(), (installed / target).read_bytes())
            second = root / "second.atopack"
            export_package(db, library, second)
            with zipfile.ZipFile(second) as archive:
                self.assertEqual((source / scan).read_bytes(), archive.read(scan))
            (source / scan).unlink()
            with self.assertRaises(ValueError):
                collect(source)


if __name__ == "__main__":
    unittest.main()
