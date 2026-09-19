"""Build a Docker archive and verify the license in both distribution layers."""
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import export_portable as exporter


class DockerLicenseTest(unittest.TestCase):
    def test_docker_archive_includes_outer_and_application_license(self):
        license_text = (Path(__file__).resolve().parent.parent / "LICENSE").read_text(encoding="utf-8")

        def prepare_site(destination, version):
            destination.mkdir(parents=True)
            (destination / "LICENSE").write_text(license_text, encoding="utf-8")
            (destination / "index.html").write_text("<title>test</title>", encoding="utf-8")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(exporter, "CACHE_ROOT", root / "cache"), \
                 patch.object(exporter, "EXPORT_ROOT", root / "export"), \
                 patch.object(exporter, "prepare_site", prepare_site):
                archive_path = exporter.build_docker("1.3.6")
            with zipfile.ZipFile(archive_path) as archive:
                prefix = "ATO-Assistant-Docker-1.3.6/"
                for relative in ("LICENSE", "app/LICENSE"):
                    self.assertEqual(archive.read(prefix + relative).decode("utf-8").replace("\r\n", "\n"), license_text)
                self.assertIn(prefix + "Dockerfile", archive.namelist())


if __name__ == "__main__":
    unittest.main()
