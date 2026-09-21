"""图片重编码（tools/image_shrink.py）的回归测试。

口径是「收益不够就原样保留」：小图、读不出的、软边透明、省得不够的都不动；
只有真的换掉了才返回新字节，并保证透明图的 alpha 逐字节不变。

运行（在 asset-studio 目录下）：python -m unittest tests.test_image_shrink -v
"""
from __future__ import annotations

import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageFilter

from tools.image_shrink import (
    JPEG_MAX_RATIO,
    ShrinkStats,
    is_image_member,
    load_keep_patterns,
    matches_any,
    shrink_image,
)


def _relax_tempdirs_when_the_sandbox_forbids_0700_dirs() -> None:
    probe = tempfile.mkdtemp()
    try:
        (Path(probe) / "probe").write_text("x", encoding="utf-8")
    except OSError:
        def _mkdtemp_0777(suffix: str | None = None, prefix: str | None = None, dir: str | None = None) -> str:
            directory = dir or tempfile.gettempdir()
            for _ in range(10000):
                name = os.path.join(directory, (prefix or "tmp") + next(tempfile._get_candidate_names()) + (suffix or ""))
                try:
                    os.mkdir(name, 0o777)
                except FileExistsError:
                    continue
                return name
            raise FileExistsError("无法创建临时目录")

        tempfile.mkdtemp = _mkdtemp_0777  # type: ignore[assignment]
    finally:
        shutil.rmtree(probe, ignore_errors=True)


_relax_tempdirs_when_the_sandbox_forbids_0700_dirs()


def photo_like_rgb(size=(600, 400)) -> Image.Image:
    """造「照片式」内容（模糊噪声）：PNG 压不动，转 JPEG 收益很大，接近卡面扫描。"""
    noise = Image.frombytes("RGB", size, os.urandom(size[0] * size[1] * 3))
    return noise.filter(ImageFilter.GaussianBlur(1.2))


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def jpeg_bytes(image: Image.Image, quality: int) -> bytes:
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, "JPEG", quality=quality)
    return buffer.getvalue()


class ImageShrinkTests(unittest.TestCase):
    def test_image_member_detection(self):
        for member in ("a/b/c.png", "a/b/c.JPG", "x.jpeg", "y.webp"):
            self.assertTrue(is_image_member(member), member)
        for member in ("a/b/c.mp3", "a/b/c.js", "noext", ""):
            self.assertFalse(is_image_member(member), member)

    def test_small_files_are_left_alone(self):
        stats = ShrinkStats()
        self.assertIsNone(shrink_image(b"x" * 1024, 85, member="a/b.png", stats=stats))
        self.assertEqual(1, stats.kept_small)
        self.assertEqual(0, stats.converted)

    def test_unreadable_bytes_are_left_alone(self):
        stats = ShrinkStats()
        payload = bytes(range(256)) * 400  # 100 KiB 噪声，不是任何图片
        self.assertIsNone(shrink_image(payload, 85, member="a/b.png", stats=stats))
        self.assertEqual(1, stats.kept_broken)

    def test_opaque_png_becomes_jpeg(self):
        original = png_bytes(photo_like_rgb())
        stats = ShrinkStats()
        shrunk = shrink_image(original, 85, member="assets/x/card.png", stats=stats)
        self.assertIsNotNone(shrunk, "照片式 PNG 应该被换成 JPEG")
        self.assertTrue(shrunk.startswith(b"\xff\xd8\xff"), "换出来的是 JPEG 字节")
        self.assertLess(len(shrunk), len(original) * 0.6, "至少省 40% 才换")
        self.assertEqual(1, stats.png_to_jpeg)
        self.assertEqual(len(original), stats.before)
        self.assertEqual(len(shrunk), stats.after)
        with Image.open(io.BytesIO(shrunk)) as check:
            check.load()
            self.assertEqual(Image.open(io.BytesIO(original)).size, check.size)

    def test_jpg_target_uses_the_jpeg_threshold(self):
        """清单目标是 .jpg 时门槛是 15%（85%），比 PNG 宽进严出得更彻底。"""
        original = png_bytes(photo_like_rgb())
        stats = ShrinkStats()
        shrunk = shrink_image(original, 85, member="assets/x/card.jpg", stats=stats)
        self.assertIsNotNone(shrunk)
        self.assertEqual(1, stats.reencoded_jpeg, "按 .jpg 目标算 JPEG 重编")
        self.assertEqual(0, stats.png_to_jpeg)
        self.assertLessEqual(len(shrunk), len(original) * JPEG_MAX_RATIO)

    def test_tight_jpeg_is_not_reencoded(self):
        original = jpeg_bytes(photo_like_rgb((900, 600)), 60)
        self.assertGreater(len(original), 40 * 1024, "样本要够大，别落到「小图不动」那条规则上")
        stats = ShrinkStats()
        self.assertIsNone(
            shrink_image(original, 85, member="assets/x/card.jpg", stats=stats),
            "已经压得很紧的 JPEG 不该为了 q85 反而变大",
        )
        self.assertEqual(1, stats.kept_no_gain)
        self.assertEqual(0, stats.converted)

    def test_soft_alpha_png_is_left_alone(self):
        image = photo_like_rgb((300, 200)).convert("RGBA")
        alpha = Image.linear_gradient("L").resize((300, 200))
        image.putalpha(alpha)
        stats = ShrinkStats()
        self.assertIsNone(
            shrink_image(png_bytes(image), 85, member="assets/x/tile.png", stats=stats),
            "软边透明不能量化成调色板",
        )
        self.assertEqual(1, stats.kept_alpha)

    def test_binary_alpha_png_keeps_alpha_exactly(self):
        image = photo_like_rgb((420, 300)).convert("RGBA")
        mask = Image.new("L", (420, 300), 0)
        for x in range(420):
            for y in range(0, 300, 3):
                mask.putpixel((x, y), 255)
        image.putalpha(mask)
        original = png_bytes(image)
        stats = ShrinkStats()
        shrunk = shrink_image(original, 85, member="assets/x/tile.png", stats=stats)
        if shrunk is None:
            self.assertEqual(1, stats.kept_alpha + stats.kept_no_gain, "没换就记一条保留原因")
            return
        self.assertEqual(1, stats.palette_png)
        with Image.open(io.BytesIO(original)) as before, Image.open(io.BytesIO(shrunk)) as after:
            before.load()
            after.load()
            self.assertEqual(
                before.convert("RGBA").getchannel("A").tobytes(),
                after.convert("RGBA").getchannel("A").tobytes(),
                "alpha 必须逐字节不变",
            )

    def test_stats_describe_is_readable(self):
        stats = ShrinkStats()
        shrink_image(png_bytes(photo_like_rgb()), 85, member="a/b.png", stats=stats)
        self.assertIn("图片瘦身", stats.describe())
        self.assertGreater(stats.saved, 0)


class KeepPatternTests(unittest.TestCase):
    """豁免名单（--image-quality-keep）：命中的成员原样进包。"""

    def test_matches_any_is_case_insensitive_and_slash_agnostic(self):
        self.assertTrue(matches_any("ss/battle-board.jpg", ["ss/battle-board.jpg"]))
        self.assertTrue(matches_any("SS/Battle-Board.JPG", ["ss/battle-board.jpg"]))
        self.assertTrue(matches_any("aibp/ps/THE_BURDEN/THE_BURDEN.jpg", ["aibp/ps/*/*.jpg"]))
        self.assertTrue(matches_any("aibp/ps/THE_BURDEN/THE_BURDEN_TR_O_001.jpg", ["aibp/ps/*/*_TR_O_001.jpg"]))
        self.assertFalse(matches_any("aibp/ps/THE_BURDEN/THE_BURDEN_AI_I_001.jpg", ["aibp/ps/*/*_TR_O_001.jpg"]))
        self.assertFalse(matches_any("ss/battle-board.jpg", []))
        self.assertFalse(matches_any("ss/battle-board.jpg", None))
        self.assertFalse(matches_any("ss/battle-board.jpg", ["ss/other.jpg"]))

    def test_load_keep_patterns_skips_comments_and_blanks(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "keep.txt"
            path.write_text(
                "# 注释\n\nss/battle-board.jpg\n  aibp/ps/*/*.jpg  \n#尾注\n",
                encoding="utf-8",
            )
            self.assertEqual(
                ["ss/battle-board.jpg", "aibp/ps/*/*.jpg"],
                load_keep_patterns(path),
            )
        self.assertEqual([], load_keep_patterns(None))

    def test_repo_keep_list_covers_the_boss_images(self):
        """提交里那份名单必须盖住决战板图 + 使徒面板 + Trait 大卡。"""
        path = Path(__file__).resolve().parents[1] / "pack-shrink-keep.txt"
        patterns = load_keep_patterns(path)
        self.assertTrue(matches_any("ss/battle-board.jpg", patterns))
        for name in (
            "aibp/ps/THE_BURDEN/THE_BURDEN.jpg",
            "aibp/ps/LABYRINTHAUROS/LABYRINTHAUROS.jpg",
            "aibp/ps/CHIMERA_METASTASIOS/CHIMERA_METASTASIOS.jpg",
        ):
            self.assertTrue(matches_any(name, patterns), name)
        for trait in (
            "aibp/ps/HERMESIAN_PURSUER/HERMESIAN_PURSUER_TR_O_001.jpg",
            "aibp/ps/THE_BURDEN/THE_BURDEN_TR_O_001.jpg",
        ):
            self.assertTrue(matches_any(trait, patterns), trait)
        # 普通卡不该被豁免，否则瘦身就白做了
        for card in (
            "aibp/ps/HEKATON/HEKATON_BP_I_001.jpg",
            "aibp/ps/CHIMERA_METASTASIOS/C.png",
            "technology/images/split_cards/9930e1d34c001d93_back.png",
            "map/images/c2-tile-062-front.png",
        ):
            self.assertFalse(matches_any(card, patterns), card)


if __name__ == "__main__":
    unittest.main()
