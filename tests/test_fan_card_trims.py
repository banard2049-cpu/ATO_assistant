import importlib.util
import io
import json
from pathlib import Path
import unittest
import zipfile

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("generate_fan_card_trims", ROOT / "tools/generate_fan_card_trims.py")
trims = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trims)


class FanCardTrimTests(unittest.TestCase):
    def test_only_the_affected_edge_is_trimmed(self):
        image = Image.new("RGB", (470, 740), "#e8e3d0")
        ImageDraw.Draw(image).line((0, 739, 469, 739), fill="black")
        self.assertEqual(trims.detect_trims(image), [0, 0, 1, 0])

    def test_embedded_cut_line_after_a_light_margin(self):
        image = Image.new("RGB", (743, 1043), "#eee8dd")
        ImageDraw.Draw(image).line((0, 5, 742, 5), fill="black")
        self.assertEqual(trims.detect_trims(image), [6, 0, 0, 0])

    def test_gray_scan_line_on_a_light_panel_is_not_missed(self):
        image = Image.new("RGB", (2404, 1647), (205, 205, 205))
        ImageDraw.Draw(image).line((2403, 0, 2403, 1646), fill=(96, 96, 96))
        self.assertEqual(trims.detect_trims(image), [0, 1, 0, 0])

    def test_tilted_thin_line_can_cross_several_rows(self):
        image = Image.new("RGB", (743, 1043), "#eee8dd")
        ImageDraw.Draw(image).line((0, 0, 742, 5), fill="black")
        self.assertEqual(trims.detect_trims(image), [6, 0, 0, 0])

    def test_dark_header_and_thick_printed_frame_are_preserved(self):
        image = Image.new("RGB", (470, 740), "#e8e3d0")
        ImageDraw.Draw(image).rectangle((0, 0, 469, 90), fill="black")
        self.assertEqual(trims.detect_trims(image), [0, 0, 0, 0])
        image = Image.new("RGB", (743, 1043), "#eee8dd")
        ImageDraw.Draw(image).rectangle((0, 0, 742, 1042), outline="black", width=14)
        self.assertEqual(trims.detect_trims(image), [0, 0, 0, 0])

    def test_title_ornaments_do_not_extend_a_one_pixel_crop(self):
        image = Image.new("RGB", (743, 1043), "#eee8dd")
        drawing = ImageDraw.Draw(image)
        drawing.line((0, 0, 742, 0), fill="black")
        for x in range(40, 700, 50):
            drawing.rectangle((x, 12, x + 15, 19), fill="black")
        self.assertEqual(trims.detect_trims(image), [1, 0, 0, 0])

    def test_compressed_fan_variants_keep_the_original_edge_measurement(self):
        target = "assets/exploration-cards/c3/13517.png"
        original = Image.new("RGB", (470, 740), (220, 220, 220))
        data = {"images": {target: [{"size": [470, 740], "samples": trims.samples(original), "trim": [0, 0, 1, 0]}]}}

        def pack(edition, color):
            image = io.BytesIO()
            Image.new("RGB", (470, 740), color).save(image, "PNG")
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as archive:
                archive.writestr("manifest.json", json.dumps({"format": "ato-asset-pack", "build": {"edition": edition},
                    "assets": [{"member": target}]}))
                archive.writestr(target, image.getvalue())
            buffer.seek(0)
            return buffer

        self.assertEqual(trims.add_pack_variants(data, pack("fan", (224, 224, 224))), 1)
        self.assertEqual(data["images"][target][-1]["trim"], [0, 0, 1, 0])
        self.assertEqual(trims.add_pack_variants(data, pack("fan", (100, 100, 100))), 0)
        with self.assertRaises(ValueError):
            trims.add_pack_variants(data, pack("official", (220, 220, 220)))


if __name__ == "__main__":
    unittest.main()
