"""Verify the public image inventory without reading campaign data or starting a server."""
import json
from pathlib import Path
import shutil
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]


class ImageIndexTests(unittest.TestCase):
    def setUp(self):
        self.php = shutil.which("php")
        if not self.php:
            self.skipTest("PHP unavailable")
        self.root = ROOT / "tmp" / ("aibp-image-index-" + uuid.uuid4().hex)
        self.root.mkdir(parents=True)
        self.addCleanup(self.clean_fixture)
        (self.root / "api").mkdir()
        self.endpoint = self.root / "api/aibp-image-index.php"
        shutil.copyfile(ROOT / "api/aibp-image-index.php", self.endpoint)

    def clean_fixture(self):
        target = self.root.resolve()
        intended = (ROOT / "tmp").resolve()
        if target.parent != intended or not target.name.startswith("aibp-image-index-"):
            raise RuntimeError("Unexpected fixture cleanup path")
        shutil.rmtree(target)

    def touch(self, path):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"fixture")

    def inventory(self):
        result = subprocess.run([self.php, str(self.endpoint)], check=True, capture_output=True, text=True)
        return json.loads(result.stdout)["images"]

    def test_only_existing_public_images_are_listed(self):
        for name in ["HYPERTIME_ORACLE.jpg", "HYPERTIME_ORACLE_AI_X_002.jpg",
                     "HYPERTIME_ORACLE_TR_V_025.png", "catalog.json", "hidden.bin"]:
            self.touch("aibp/ps/HYPERTIME_ORACLE/" + name)
        self.touch("aibp/ps/other/trait/COMMON_TR_001.jpg")
        self.touch("aibp/ps/other/3b6e9d20/secret.bin")
        self.touch("data/private.jpg")
        self.assertEqual(self.inventory(), sorted([
            "ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE.jpg",
            "ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_X_002.jpg",
            "ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_TR_V_025.png",
            "ps/other/trait/COMMON_TR_001.jpg",
        ]))

    def test_refresh_discovers_newly_imported_images(self):
        self.assertEqual(self.inventory(), [])
        self.touch("aibp/ps/TITAN_X/TITAN_X_FEINT_X_010.jpg")
        self.assertEqual(self.inventory(), ["ps/TITAN_X/TITAN_X_FEINT_X_010.jpg"])


if __name__ == "__main__":
    unittest.main()
