"""Run the real Android .atopack importer against ZIPs and platform file stubs.

Run: python tools/test_android_atopack_import.py
No Android SDK is needed; uses Java 17 and the app's pinned ZIP dependency.
"""
from __future__ import annotations

import os
import subprocess
import tempfile

from export_android import ensure_java, java_home
from packaging.package_common import CACHE_ROOT, PROJECT_ROOT, download


def main() -> None:
    java = ensure_java()
    javac = java_home(java) / "bin" / ("javac.exe" if os.name == "nt" else "javac")
    dependencies = [
        ("org/json/json/20240303/json-20240303.jar", "json-20240303.jar"),
        ("org/apache/commons/commons-compress/1.21/commons-compress-1.21.jar", "commons-compress-1.21.jar"),
    ]
    jars = [download(f"https://repo.maven.apache.org/maven2/{path}", CACHE_ROOT / "android" / name)
            for path, name in dependencies]
    fixtures = PROJECT_ROOT / "tests/fixtures/android-atopack-import"
    source = PROJECT_ROOT / "tools/packaging/android/app/src/main/java/com/ato/assistant/AtopackStore.java"
    with tempfile.TemporaryDirectory(dir=CACHE_ROOT / "android") as directory:
        classpath = os.pathsep.join(map(str, jars))
        subprocess.run([
            str(javac), "-encoding", "UTF-8", "-cp", classpath, "-d", directory,
            str(source), *(str(path) for path in sorted(fixtures.rglob("*.java"))),
        ], check=True)
        subprocess.run([
            # Keep the importer honest about large catalogs and story indexes: the
            # real device process also has to share its heap with the WebView.
            str(java), "-Xmx96m", "-cp", os.pathsep.join((directory, classpath)),
            "com.ato.assistant.AtopackImportHarness", directory,
        ], check=True)


if __name__ == "__main__":
    main()
