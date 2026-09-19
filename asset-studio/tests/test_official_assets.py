"""官中图片覆盖（official-assets）：路径写法、扩展名与唯一性规则。

运行（在 asset-studio 目录下）：python -m unittest tests.test_official_assets -v

刻意不用 tempfile：部分受限环境里 mkdtemp 建的目录随后连自己都读不了，
这里用 .local/（已被 .gitignore 覆盖）当临时目录，结束时清掉。
"""
from __future__ import annotations

import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from app import official_assets
from app.official_assets import clear_cache, find, resolve


ROOT = Path(__file__).resolve().parents[1]
# 目录名刻意不叫 official-assets：根目录本身叫这个名字时会被当成官中图目录，
# 那样 library/ 也会落进扫描范围，测不出回退行为。
SCRATCH = ROOT / ".local" / "tests" / "official-asset-overrides"


class OfficialAssetTests(unittest.TestCase):
    def setUp(self) -> None:
        # 索引带缓存（导出一个包会调 4000+ 次 find，不该重复建索引），用例之间必须
        # 显式清掉，否则上一个用例的索引会在 TTL 内被下一个用例复用。
        clear_cache()
        shutil.rmtree(SCRATCH, ignore_errors=True)
        self.assets = SCRATCH / "official-assets"

    def tearDown(self) -> None:
        clear_cache()
        shutil.rmtree(SCRATCH, ignore_errors=True)

    def write(self, relative: str, payload: bytes = b"official") -> Path:
        path = self.assets / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        return path

    def test_exact_and_compact_layouts(self) -> None:
        compact = self.write("HEKATON/CARD.jpg")
        target = "aibp/ps/HEKATON/CARD.jpg"
        self.assertEqual(compact, find(SCRATCH, target))
        fallback = SCRATCH / "library" / "CARD.jpg"
        fallback.parent.mkdir(parents=True, exist_ok=True)
        fallback.write_bytes(b"captured")
        self.assertEqual((compact, True), resolve(SCRATCH, target, fallback))
        self.assertEqual((fallback, False), resolve(SCRATCH, "aibp/ps/HEKATON/MISSING.jpg", fallback))

    def test_ambiguous_filename_falls_back(self) -> None:
        for folder in ("one", "two"):
            self.write(f"{folder}/CARD.jpg", folder.encode())
        self.assertIsNone(find(SCRATCH, "assets/cards/CARD.jpg"))

    def test_other_extension_still_matches_the_target(self) -> None:
        """清单写 .jpg、官中图是 .png（或反过来）也算命中。"""
        png = self.write("HEKATON/CARD.png", b"official png")
        self.assertEqual(png, find(SCRATCH, "aibp/ps/HEKATON/CARD.jpg"))

        jpg = self.write("doom/DOOM.jpg", b"official jpg")
        # 索引在 TTL 内是缓存视图（长驻进程最多 2 秒看到新文件）；用例中途改目录要
        # 显式清一次，避免测到旧视图。
        clear_cache()
        self.assertEqual(jpg, find(SCRATCH, "assets/story-doom-cards/DOOM.png"))

    def test_same_stem_in_two_folders_still_falls_back(self) -> None:
        """去掉后缀后同名但分处两地时不算命中，避免张冠李戴。"""
        for folder in ("one", "two"):
            self.write(f"{folder}/CARD.png", folder.encode())
        self.assertIsNone(find(SCRATCH, "assets/cards/CARD.jpg"))

    def test_case_does_not_matter(self) -> None:
        """路径与扩展名的大小写都不参与匹配。"""
        upper = self.write("hekaton/CARD.PNG", b"upper")
        self.assertEqual(upper, find(SCRATCH, "aibp/ps/HEKATON/CARD.jpg"))
        self.assertEqual(upper, find(SCRATCH, "aibp/ps/Hekaton/card.png"))

    def test_exact_path_wins_over_other_extension(self) -> None:
        """同一目录里两种后缀都在时，清单后缀优先。"""
        exact = self.write("HEKATON/CARD.jpg", b"exact")
        self.write("HEKATON/CARD.png", b"other")
        self.assertEqual(exact, find(SCRATCH, "aibp/ps/HEKATON/CARD.jpg"))

    def test_lookup_index_is_cached_and_clearable(self) -> None:
        """索引只建一次：导出一个包会调 4000+ 次 find，重复扫描是几十分钟的开销。

        实测（真实官中目录 1300+ 张）单次 find 从 426 ms 降到 3 ms。
        """
        self.write("HEKATON/CARD.jpg")
        clear_cache()
        scanned: list[Path] = []
        original = official_assets._files

        def counting(root: Path):
            scanned.append(root)
            return original(root)

        with patch.object(official_assets, "_files", counting):
            find(SCRATCH, "aibp/ps/HEKATON/CARD.jpg")
            find(SCRATCH, "aibp/ps/HEKATON/CARD.jpg")
            find(SCRATCH, "aibp/ps/HEKATON/OTHER.jpg")
            self.assertEqual(1, len(scanned))
            # 清缓存后重新扫一次，新放进来的图立刻可见。
            clear_cache()
            self.assertIsNone(find(SCRATCH, "aibp/ps/HEKATON/ADDED.jpg"))
            self.write("HEKATON/ADDED.jpg")
            clear_cache()
            self.assertIsNotNone(find(SCRATCH, "aibp/ps/HEKATON/ADDED.jpg"))
            self.assertEqual(3, len(scanned))


if __name__ == "__main__":
    unittest.main()
