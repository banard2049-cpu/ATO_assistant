"""Exercise the label-save API's normalization and output without touching real maps."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class BpResourceLabelerTests(unittest.TestCase):
    def test_saved_project_retains_only_explicitly_reviewed_existing_cards(self):
        php = shutil.which("php")
        if not php:
            self.skipTest("PHP unavailable")
        source = (ROOT / "api/bp-resource-map-c45.php").read_text(encoding="utf-8")
        functions = source[source.index("function respond("):source.index("if (!is_string($_SESSION")]
        first = "MIDASCORE_BP_I_001.jpg"
        second = "MIDASCORE_BP_I_002.jpg"
        fixture = {
            "MIDASCORE": {first: {"mutableAmbrosia": 1}, second: {"mutableAmbrosia": 1}},
        }
        reviewed = [first, first, "unknown.jpg", "TITAN_X_BP_I_002.jpg", None, {}]
        script = "<?php\n" + functions + "\n"
        script += "$data = json_decode(" + json.dumps(json.dumps(fixture)) + ", true);\n"
        script += "$reviewed = normalize_reviewed(json_decode(" + json.dumps(json.dumps(reviewed)) + ", true), $data);\n"
        script += "echo json_encode(['reviewed' => $reviewed, 'content' => map_content($data, $reviewed), 'legacy' => normalize_reviewed(null, $data)]);"
        result = subprocess.run([php], input=script, text=True, capture_output=True, check=True)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["reviewed"], [first])
        self.assertEqual(payload["legacy"], [])
        self.assertIn("window.AIBP_C45_BP_RESOURCE_PREFILL = true;", payload["content"])
        saved_reviewed = re.search(r"AIBP_C45_BP_RESOURCE_REVIEWED = (\[.*?\]);", payload["content"])
        self.assertIsNotNone(saved_reviewed)
        self.assertEqual(json.loads(saved_reviewed[1]), [first])
        self.assertIn(second, payload["content"], "pending labels must survive saving")


if __name__ == "__main__":
    unittest.main()
