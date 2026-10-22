"""Focused tests for clean numeral rendering and replacement of scan cutouts."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import unittest
import uuid

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).resolve().parents[1] / 'tools/complete-map-hidden-numbers.py'
SPEC = importlib.util.spec_from_file_location('map_hidden_numbers', SCRIPT)
EXTRACTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXTRACTOR)


class HiddenNumberMergeTests(unittest.TestCase):
    def test_preserves_partial_alpha_and_hidden_rgb_outside_numbers(self):
        old = np.full((16, 16, 4), [13, 27, 39, 0], dtype=np.uint8)
        old[2, 2] = [100, 90, 80, 100]
        new = np.zeros_like(old)
        new[8:10, 8:10] = [30, 40, 35, 255]
        new[2, 2] = [20, 20, 20, 5]
        merged, effective, stats = EXTRACTOR.merge_additions(Image.fromarray(old), Image.fromarray(new))
        actual = np.asarray(merged)
        self.assertTrue(np.array_equal(actual[new[:, :, 3] == 0], old[new[:, :, 3] == 0]))
        self.assertEqual(actual[2, 2].tolist(), old[2, 2].tolist())
        self.assertEqual(actual[8, 8].tolist(), new[8, 8].tolist())
        self.assertEqual(np.asarray(effective)[2, 2].tolist(), [0, 0, 0, 0])
        self.assertEqual(stats['addedPixels'], 4)
        self.assertEqual(stats['protectedAntialiasOverlapPixels'], 1)

    def test_rejects_substantial_existing_symbol_collision(self):
        old = Image.new('RGBA', (8, 8), (50, 60, 70, 200))
        new = Image.new('RGBA', (8, 8), (20, 30, 40, 255))
        with self.assertRaisesRegex(ValueError, 'overlap an existing mask'):
            EXTRACTOR.merge_additions(old, new)

    def test_clean_font_color_transparent_holes_and_leading_zero(self):
        number = {'text': '080', 'bounds': [60, 60, 240, 160], 'color': '#69756e'}
        result = EXTRACTOR.render_numbers([number], EXTRACTOR.FONT)
        pixels = np.asarray(result)
        alpha = pixels[:, :, 3]
        self.assertTrue(np.all(pixels[alpha > 0, :3] == [105, 117, 110]))
        self.assertTrue(np.any((alpha > 0) & (alpha < 255)))
        # The first digit has ink on both sides and a transparent enclosed counter.
        zero = alpha[60:160, 60:120]
        self.assertGreater(int(zero[:, :15].max()), 200)
        self.assertGreater(int(zero[:, 45:].max()), 200)
        self.assertEqual(int(zero[50, 30]), 0)
        without_zero = EXTRACTOR.render_numbers([dict(number, text='80')], EXTRACTOR.FONT)
        self.assertFalse(np.array_equal(np.asarray(without_zero), pixels))
        self.assertEqual(result.getpixel((0, 0)), (0, 0, 0, 0))


class HiddenNumberInstallTests(unittest.TestCase):
    def setUp(self):
        scratch = SCRIPT.parents[1] / 'tmp'
        scratch.mkdir(exist_ok=True)
        self.root = scratch / ('map-hidden-test-' + uuid.uuid4().hex)
        self.root.mkdir()
        assert self.root.resolve().is_relative_to(scratch.resolve())
        self.addCleanup(shutil.rmtree, self.root)
        self.hd, self.out = self.root / 'hd', self.root / 'report'
        (self.hd / 'overlay').mkdir(parents=True)
        (self.hd / 'base').mkdir()
        old = Image.new('RGBA', (1024, 1024), (11, 22, 33, 0))
        old.putpixel((800, 800), (99, 98, 97, 132))
        self.baseline = self.root / 'baseline.png'
        old.save(self.baseline)
        self.baseline_pixels = np.asarray(old)
        current = old.copy()
        # This old scan rectangle includes RGB/alpha outside and inside glyph ink.
        for y in range(97, 147):
            for x in range(97, 207):
                current.putpixel((x, y), (22, 44, 33, 200))
        current.save(self.hd / 'overlay/tile.png')
        Image.new('RGB', (1024, 1024), (60, 80, 70)).save(self.hd / 'base/tile.png')
        self.overlay_hash = EXTRACTOR.sha(self.hd / 'overlay/tile.png')
        self.base_hash = EXTRACTOR.sha(self.hd / 'base/tile.png')
        self.spec = self.root / 'spec.json'
        self.entry = {'baselineFile': str(self.baseline), 'overlaySha256': EXTRACTOR.sha(self.baseline),
                      'replaceableOverlaySha256': [self.overlay_hash],
                      'numbers': [{'text': '080', 'bounds': [100, 100, 204, 144], 'color': '#69756e'}]}
        self.write_spec({'tile': self.entry})

    def write_spec(self, tiles):
        self.spec.write_text(json.dumps({'version': 2, 'tiles': tiles}), encoding='utf-8')

    def run_tool(self, apply=False):
        return EXTRACTOR.run(self.spec, self.out, apply=apply, hd=self.hd)

    def test_replaces_cutout_from_baseline_and_preserves_rgba_outside_numerals(self):
        report = self.run_tool(apply=True)
        actual = np.asarray(Image.open(self.hd / 'overlay/tile.png'))
        numerals = np.asarray(Image.open(self.out / 'additions/tile.png'))
        self.assertTrue(np.array_equal(actual[numerals[:, :, 3] == 0], self.baseline_pixels[numerals[:, :, 3] == 0]))
        self.assertTrue(np.array_equal(actual[self.baseline_pixels[:, :, 3] > 0], self.baseline_pixels[self.baseline_pixels[:, :, 3] > 0]))
        self.assertEqual(actual[98, 98].tolist(), [11, 22, 33, 0])
        self.assertNotEqual(report['files'][0]['afterSha256'], self.overlay_hash)
        self.assertEqual(EXTRACTOR.sha(self.out / 'existing-overlays/tile.png'), self.overlay_hash)
        self.assertEqual(EXTRACTOR.sha(self.out / 'base-overlays/tile.png'), self.entry['overlaySha256'])

    def test_preview_apply_and_rerun_without_old_report_are_idempotent(self):
        staged = self.run_tool()
        self.assertEqual(EXTRACTOR.sha(self.hd / 'overlay/tile.png'), self.overlay_hash)
        self.assertTrue((self.out / 'numbers/tile.png').is_file())
        self.assertTrue((self.out / 'tile-detail-0.png').is_file())
        first = self.run_tool(apply=True)
        self.baseline.unlink()  # Only the new tool's verified cache is required.
        second = self.run_tool(apply=True)
        expected = staged['files'][0]['afterSha256']
        self.assertEqual(EXTRACTOR.sha(self.hd / 'overlay/tile.png'), expected)
        self.assertEqual(first['files'][0]['afterSha256'], second['files'][0]['afterSha256'])
        self.assertEqual(EXTRACTOR.sha(self.hd / 'base/tile.png'), self.base_hash)
        self.assertEqual(EXTRACTOR.sha(self.out / 'existing-overlays/tile.png'), self.overlay_hash)
        self.assertEqual(list((self.hd / 'overlay').glob('*.pending')), [])

    def test_bad_second_input_does_not_modify_first_target_or_create_output(self):
        entry = dict(self.entry, overlaySha256='0' * 64)
        self.write_spec({'tile': self.entry, 'zzz': entry})
        with self.assertRaisesRegex(ValueError, 'Baseline overlay hash changed'):
            self.run_tool(apply=True)
        self.assertEqual(EXTRACTOR.sha(self.hd / 'overlay/tile.png'), self.overlay_hash)
        self.assertFalse(self.out.exists())

    def test_changed_second_target_does_not_modify_first_or_create_output(self):
        shutil.copyfile(self.hd / 'base/tile.png', self.hd / 'base/zzz.png')
        Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)).save(self.hd / 'overlay/zzz.png')
        self.write_spec({'tile': self.entry, 'zzz': self.entry})
        with self.assertRaisesRegex(ValueError, 'Installed overlay changed: zzz'):
            self.run_tool(apply=True)
        self.assertEqual(EXTRACTOR.sha(self.hd / 'overlay/tile.png'), self.overlay_hash)
        self.assertFalse(self.out.exists())

    def test_refuses_modified_backup_before_replacing_any_target(self):
        self.run_tool()
        Image.new('RGBA', (1024, 1024), (40, 40, 40, 0)).save(self.out / 'existing-overlays/tile.png')
        with self.assertRaisesRegex(ValueError, 'Existing overlay backup hash changed'):
            self.run_tool(apply=True)
        self.assertEqual(EXTRACTOR.sha(self.hd / 'overlay/tile.png'), self.overlay_hash)

    def test_target_as_initial_baseline_works_with_no_baseline_file(self):
        shutil.copyfile(self.baseline, self.hd / 'overlay/tile.png')
        entry = dict(self.entry)
        del entry['baselineFile']
        self.write_spec({'tile': entry})
        first = self.run_tool(apply=True)
        second = self.run_tool(apply=True)
        self.assertEqual(first['files'][0]['afterSha256'], second['files'][0]['afterSha256'])


if __name__ == '__main__':
    unittest.main()
