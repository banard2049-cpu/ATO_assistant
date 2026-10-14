"""Synthetic-only checks: no game text, local assets or credentials required."""
import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SPEC = importlib.util.spec_from_file_location("c4c5_terms", Path(__file__).with_name("apply-c4c5-terms.py"))
patch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(patch)


def assignment(name, value):
    return "window.%s = %s;\n" % (name, json.dumps(value, ensure_ascii=False))


def dataset(text):
    return {"books": [{"id": "c%d" % i, "entries": [{"key": "c%d-test" % i, "officialText": text,
            "originalText": "Original (Example)", "links": ["c1-test"], "id": "stable"}]} for i in range(1, 6)],
            "metadata": {"keep": "unchanged"}}


def manifest(old="旧词 (Example)", new="新词 (Example)"):
    return {"stages": [{"name": "inherited", "fields": [{
        "path": ["books", 3, "entries", 0, "officialText"], "entry_key": "c4-test",
        "source_field_sha256": patch.sha(old), "output_field_sha256": patch.sha(new),
        "edits": [[0, 2, "旧词", "新词"]]}]}]}


def mapping_manifest():
    old = {"book": "c4", "key": "c4-test", "variant": "official", "anchor": "旧词",
           "assetSha256": "image-unchanged", "path": "local.png", "sourceBBox": [1, 2, 3, 4]}
    new = {**old, "anchor": "新词"}
    return {"rows": [old]}, {"rows": [{"path": ["rows", 0], "book": "c4", "key": "c4-test",
        "source_row_sha256": patch.canonical_sha(old), "output_row_sha256": patch.canonical_sha(new),
        "final_story_sha256": patch.sha("新词 (Example)"), "changes": {"anchor": {"slice": [0, 2]}}}]}


class TerminologyPatchTests(unittest.TestCase):
    def test_changes_only_reviewed_chinese(self):
        source = dataset("旧词 (Example)")
        output, count = patch.patch_story(assignment("STORYBOOK_OFFICIAL_DATA", source), manifest())
        expected = copy.deepcopy(source)
        expected["books"][3]["entries"][0]["officialText"] = "新词 (Example)"
        self.assertEqual(patch.JsonAssignment(output, "STORYBOOK_OFFICIAL_DATA").value, expected)
        self.assertEqual(count, 1)

    def test_preserves_raw_escapes_and_unrelated_metadata(self):
        raw = assignment("STORYBOOK_OFFICIAL_DATA", dataset("旧词 (Example)"))
        raw = raw.replace("旧词", "\\u65e7\\u8bcd").replace("unchanged", "new upstream metadata")
        result, _ = patch.patch_story(raw, manifest())
        # Only C4's token changes; C1-C3 and C5 retain their original escapes.
        self.assertEqual(result.count("\\u65e7\\u8bcd"), 4)
        self.assertIn("new upstream metadata", result)

    def test_idempotent(self):
        raw = assignment("STORYBOOK_OFFICIAL_DATA", dataset("旧词 (Example)"))
        result, _ = patch.patch_story(raw, manifest())
        self.assertEqual(patch.patch_story(result, manifest()), (result, 0))

    def test_two_stages_and_intermediate_input(self):
        m = manifest()
        next_field = copy.deepcopy(m["stages"][0]["fields"][0])
        next_field.update(source_field_sha256=patch.sha("新词 (Example)"),
                          output_field_sha256=patch.sha("定词 (Example)"), edits=[[0, 2, "新词", "定词"]])
        m["stages"].append({"name": "new", "fields": [next_field]})
        for initial in ("旧词 (Example)", "新词 (Example)", "定词 (Example)"):
            result, _ = patch.patch_story(assignment("STORYBOOK_OFFICIAL_DATA", dataset(initial)), m)
            self.assertEqual(patch.JsonAssignment(result, "STORYBOOK_OFFICIAL_DATA").value["books"][3]["entries"][0]["officialText"], "定词 (Example)")

    def test_unknown_field_drift_refused(self):
        with self.assertRaisesRegex(ValueError, "Unreviewed text"):
            patch.patch_story(assignment("STORYBOOK_OFFICIAL_DATA", dataset("旧词 (Example) drift")), manifest())

    def test_identity_and_scope_drift_refused(self):
        source = dataset("旧词 (Example)")
        source["books"][3]["entries"][0]["key"] = "different"
        with self.assertRaisesRegex(ValueError, "identity"):
            patch.patch_story(assignment("STORYBOOK_OFFICIAL_DATA", source), manifest())
        m = manifest()
        m["stages"][0]["fields"][0]["path"][1] = 0
        with self.assertRaisesRegex(ValueError, "outside"):
            patch.patch_story(assignment("STORYBOOK_OFFICIAL_DATA", dataset("旧词 (Example)")), m)

    def test_english_or_whitespace_edit_refused(self):
        for old, new in [("Example", "Changed"), (" ", ""), ("-", "")]:
            r = {"source_field_sha256": patch.sha(old), "output_field_sha256": patch.sha(new),
                 "edits": [[0, len(old), old, new]]}
            with self.assertRaisesRegex(ValueError, "Chinese term"):
                patch.apply_edits(json.dumps(old), r, legacy=True)

    def test_only_specific_legacy_hyphen_exception(self):
        old, new = "乌尔-弗里斯", "始源羊毛"
        r = {"source_field_sha256": patch.sha(old), "output_field_sha256": patch.sha(new),
             "edits": [[0, len(old), old, new]]}
        self.assertEqual(json.loads(patch.apply_edits(json.dumps(old), r, legacy=True)), new)
        with self.assertRaises(ValueError):
            patch.apply_edits(json.dumps(old), r)

    def test_surrogate_pair_offsets(self):
        raw = '"\\ud83d\\ude80旧词 (Example)"'
        old, new = json.loads(raw), "🚀新词 (Example)"
        r = {"source_field_sha256": patch.sha(old), "output_field_sha256": patch.sha(new),
             "edits": [[1, 3, "旧词", "新词"]]}
        result = patch.apply_edits(raw, r)
        self.assertEqual(result, '"\\ud83d\\ude80新词 (Example)"')

    def test_plain_json_only_and_duplicate_keys(self):
        for raw in ['window.STORYBOOK_OFFICIAL_DATA = {}; dangerous();',
                    'window.STORYBOOK_OFFICIAL_DATA = {"a":1,"a":2};',
                    'window.STORYBOOK_OFFICIAL_DATA = {"a":NaN};']:
            with self.assertRaises(ValueError):
                patch.JsonAssignment(raw, "STORYBOOK_OFFICIAL_DATA")

    def test_mapping_slices_and_media_preservation(self):
        source, m = mapping_manifest()
        result, count = patch.patch_mapping(assignment("ATO_MIXED_MEDIA_MAP", source), dataset("新词 (Example)"), m)
        expected = copy.deepcopy(source)
        expected["rows"][0]["anchor"] = "新词"
        self.assertEqual(patch.JsonAssignment(result, "ATO_MIXED_MEDIA_MAP").value, expected)
        self.assertEqual(count, 1)
        self.assertEqual(patch.patch_mapping(result, dataset("新词 (Example)"), m), (result, 0))

    def test_mapping_or_story_drift_refused(self):
        source, m = mapping_manifest()
        with self.assertRaisesRegex(ValueError, "patched story"):
            patch.patch_mapping(assignment("ATO_MIXED_MEDIA_MAP", source), dataset("新词 (Example) drift"), m)
        source["rows"][0]["path"] = "upstream-changed.png"
        with self.assertRaisesRegex(ValueError, "Unreviewed mapping"):
            patch.patch_mapping(assignment("ATO_MIXED_MEDIA_MAP", source), dataset("新词 (Example)"), m)

    def test_pair_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            story = root / "story.js"
            mapping = root / "mapping.js"
            story.write_text(assignment("STORYBOOK_OFFICIAL_DATA", dataset("unreviewed")), encoding="utf-8")
            mapping.write_text(assignment("ATO_MIXED_MEDIA_MAP", {"rows": []}), encoding="utf-8")
            original = story.read_bytes()
            result = subprocess.run([sys.executable, str(patch.HERE / "apply-c4c5-terms.py"),
                "--story", str(story), "--mapping", str(mapping), "--output-dir", str(root / "out")], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / "out").exists())
            self.assertEqual(story.read_bytes(), original)

    def test_successful_pair_and_existing_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out"
            argv = ["patch", "--story", "unused", "--mapping", "unused", "--output-dir", str(out)]
            with mock.patch.object(sys, "argv", argv), mock.patch.object(patch, "prepare", return_value=("story", "map", {})):
                self.assertEqual(patch.main(), 0)
                self.assertEqual((out / "story/data/storybook-official-data.js").read_text(), "story")
                self.assertEqual((out / "story/assets/mixed-media/mapping.js").read_text(), "map")
                self.assertEqual(patch.main(), 1)

    def test_racing_empty_output_is_not_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out"
            argv = ["patch", "--story", "unused", "--mapping", "unused", "--output-dir", str(out)]
            mkdir = Path.mkdir
            def race(path, *args, **kwargs):
                if path == out:
                    mkdir(out)
                return mkdir(path, *args, **kwargs)
            with mock.patch.object(sys, "argv", argv), mock.patch.object(patch, "prepare", return_value=("story", "map", {})), mock.patch.object(Path, "mkdir", race):
                self.assertEqual(patch.main(), 1)
            self.assertTrue(out.is_dir())
            self.assertEqual(list(out.iterdir()), [])
            self.assertEqual(list(Path(tmp).glob(".c4c5-terms-*")), [])

    def test_second_write_failure_leaves_no_pair(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out"
            argv = ["patch", "--story", "unused", "--mapping", "unused", "--output-dir", str(out)]
            write = Path.write_bytes
            def fail_mapping(path, value):
                if path.name == "mapping.js":
                    raise OSError("simulated full disk")
                return write(path, value)
            with mock.patch.object(sys, "argv", argv), mock.patch.object(patch, "prepare", return_value=("story", "map", {})), mock.patch.object(Path, "write_bytes", fail_mapping):
                self.assertEqual(patch.main(), 1)
            self.assertFalse(out.exists())
            self.assertEqual(list(Path(tmp).glob(".c4c5-terms-*")), [])

    def test_published_manifest_contains_no_prose_or_urls(self):
        terms = json.loads((patch.HERE / "c4c5-terms/terms-manifest.json").read_text(encoding="utf-8"))
        count, exceptions = 0, 0
        for stage in terms["stages"]:
            for field in stage["fields"]:
                self.assertEqual(set(field), {"path", "entry_key", "source_field_sha256", "output_field_sha256", "edits"})
                self.assertIn(field["path"][1], (3, 4))
                for _, _, old, new in field["edits"]:
                    self.assertLessEqual(max(len(old), len(new)), 32)
                    exception = (old, new) == ("乌尔-弗里斯", "始源羊毛") and stage["name"] == "inherited"
                    self.assertTrue(exception or patch.HAN_CHAR.sub("", old) == patch.HAN_CHAR.sub("", new))
                    exceptions += bool(exception)
                    count += 1
        self.assertEqual((count, exceptions), (12444, 220))
        maps = json.loads((patch.HERE / "c4c5-terms/mapping-manifest.json").read_text(encoding="utf-8"))
        for row in maps["rows"]:
            for key, value in row["changes"].items():
                self.assertIn(key, patch.MAP_FIELDS)
                if key in {"anchor", "replaceText", "contextBefore", "contextAfter", "retainedNameText"}:
                    self.assertEqual(set(value), {"slice"})


if __name__ == "__main__":
    unittest.main()
