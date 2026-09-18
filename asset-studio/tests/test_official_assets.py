from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.official_assets import find, resolve


class OfficialAssetTests(unittest.TestCase):
    def test_exact_and_compact_layouts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            compact = root / "official-assets" / "HEKATON" / "CARD.jpg"
            compact.parent.mkdir(parents=True)
            compact.write_bytes(b"official")

            target = "aibp/ps/HEKATON/CARD.jpg"
            self.assertEqual(compact, find(root, target))
            fallback = root / "library" / "CARD.jpg"
            fallback.parent.mkdir()
            fallback.write_bytes(b"captured")
            self.assertEqual((compact, True), resolve(root, target, fallback))
            self.assertEqual((fallback, False), resolve(root, "aibp/ps/HEKATON/MISSING.jpg", fallback))

    def test_ambiguous_filename_falls_back(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "official-assets"
            for folder in ("one", "two"):
                path = root / folder / "CARD.jpg"
                path.parent.mkdir(parents=True)
                path.write_bytes(folder.encode())
            self.assertIsNone(find(root.parent, "assets/cards/CARD.jpg"))


if __name__ == "__main__":
    unittest.main()
