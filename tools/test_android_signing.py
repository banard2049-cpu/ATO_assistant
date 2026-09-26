"""Execute the workflow signing step with synthetic secrets, including missing inputs."""
from pathlib import Path
import base64
import os
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SigningWorkflowTest(unittest.TestCase):
    def test_signing_environment(self):
        workflow = (ROOT / '.github/workflows/android-release.yml').read_text(encoding='utf-8')
        step = workflow.split('      - name: Check Android release signing key\n', 1)[1].split('      - name:', 1)[0]
        mappings = re.findall(r'^          (\w+): \$\{\{ secrets\.(\w+) \}\}', step, re.M)
        self.assertEqual(len(mappings), 4)
        script = '\n'.join(line[10:] for line in step.split('        run: |\n', 1)[1].splitlines())
        shell = shutil.which('pwsh') or shutil.which('powershell')
        self.assertIsNotNone(shell, 'PowerShell is needed for this test')
        synthetic = {name: 'synthetic-test-value' for name, _ in mappings}
        synthetic['KEYSTORE_BASE64'] = base64.b64encode(b'test-keystore').decode()
        for missing in [None] + list(synthetic):
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as directory:
                task_dir = Path(directory)
                env = os.environ.copy()
                for name, secret in mappings:
                    env.pop(name, None)
                    env.pop(secret, None)
                env.pop('ATO_ANDROID_REQUIRE_SIGNING', None)
                env.update(synthetic)
                if missing:
                    env.pop(missing)
                env['RUNNER_TEMP'] = directory
                env['GITHUB_ENV'] = str(task_dir / 'github-env')
                script_path = task_dir / 'signing.ps1'
                script_path.write_text("$ErrorActionPreference = 'Stop'\n" + script, encoding='utf-8-sig')
                result = subprocess.run([shell, '-NoProfile', '-File', str(script_path)], env=env, capture_output=True)
                if missing:
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse((task_dir / 'ato-release.jks').exists())
                    self.assertFalse((task_dir / 'github-env').exists())
                else:
                    self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
                    self.assertEqual((task_dir / 'ato-release.jks').read_bytes(), b'test-keystore')
                    exported = (task_dir / 'github-env').read_text(encoding='utf-8-sig')
                    self.assertIn('ATO_ANDROID_REQUIRE_SIGNING=1', exported)
                    self.assertIn('ATO_ANDROID_KEY_ALIAS=synthetic-test-value', exported)


if __name__ == '__main__':
    unittest.main()
