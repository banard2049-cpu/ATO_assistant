"""Exercise the real per-WebView navigation policy without an emulator."""
from __future__ import annotations

import os
import subprocess
import uuid

from export_android import ensure_java, java_home
from packaging.package_common import CACHE_ROOT, PROJECT_ROOT


def main() -> None:
    java = ensure_java()
    javac = java_home(java) / "bin" / ("javac.exe" if os.name == "nt" else "javac")
    directory = CACHE_ROOT / "android" / ("story-webview-test-" + uuid.uuid4().hex)
    directory.mkdir(parents=True)
    source = PROJECT_ROOT / "tools/packaging/android/app/src/main/java/com/ato/assistant/StoryWebViewSession.java"
    harness = PROJECT_ROOT / "tests/fixtures/android-story-webview/com/ato/assistant/StoryWebViewSessionHarness.java"
    policy = PROJECT_ROOT / "tools/packaging/android/app/src/main/java/com/ato/assistant/TabNavigationPolicy.java"
    policy_harness = PROJECT_ROOT / "tests/fixtures/android-story-webview/com/ato/assistant/TabNavigationPolicyHarness.java"
    subprocess.run([str(javac), "-encoding", "UTF-8", "-d", str(directory), str(source), str(harness), str(policy), str(policy_harness)], check=True)
    subprocess.run([str(java), "-cp", str(directory), "com.ato.assistant.StoryWebViewSessionHarness"], check=True)
    subprocess.run([str(java), "-cp", str(directory), "com.ato.assistant.TabNavigationPolicyHarness"], check=True)


if __name__ == "__main__":
    main()
