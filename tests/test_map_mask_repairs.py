"""Regression cases for contour replacement around adjacent printed symbols."""
import importlib.util
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location(
    'map_mask_repairs', Path(__file__).resolve().parents[1] / 'tools/repair-map-masks.py')
repairs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repairs)


class MapMaskRepairTests(unittest.TestCase):
    def test_replace_removes_rectangular_background_preserves_ink_and_nearby_triangle(self):
        old = Image.new('RGBA', (1024, 1024))
        draw = ImageDraw.Draw(old)
        draw.rectangle((100, 100, 260, 160), fill=(20, 40, 60, 255))
        draw.polygon([(170, 92), (180, 92), (175, 88)], fill=(190, 160, 90, 255))
        replacement = Image.new('RGBA', old.size)
        ImageDraw.Draw(replacement).polygon(
            [(100, 130), (118, 99), (201, 99), (201, 161), (118, 161)],
            fill=(90, 100, 110, 255))
        result, box = repairs.replace_contour(old, replacement)
        actual, original = np.asarray(result), np.asarray(old)
        self.assertEqual(tuple(actual[130, 240]), (0, 0, 0, 0), 'Old sea rectangle must be cleared')
        self.assertEqual(tuple(actual[99, 150]), (90, 100, 110, 255), 'Restore the clipped outer ink edge')
        self.assertEqual(tuple(actual[130, 150]), tuple(original[130, 150]), 'Keep existing opaque ink RGB')
        np.testing.assert_array_equal(actual[85:96], original[85:96], 'Keep the adjacent direction triangle')
        left, top, right, bottom = box
        outside = np.ones(old.size, dtype=bool)
        outside[top:bottom, left:right] = False
        np.testing.assert_array_equal(actual[outside], original[outside])

    def test_rejects_contour_that_would_merge_separate_symbols(self):
        old = Image.new('RGBA', (1024, 1024))
        draw = ImageDraw.Draw(old)
        draw.rectangle((100, 100, 180, 160), fill='white')
        draw.rectangle((200, 100, 240, 160), fill='white')
        replacement = Image.new('RGBA', old.size)
        ImageDraw.Draw(replacement).rectangle((100, 100, 240, 160), fill='white')
        with self.assertRaisesRegex(AssertionError, 'overlap another symbol'):
            repairs.replace_contour(old, replacement)


if __name__ == '__main__':
    unittest.main()
