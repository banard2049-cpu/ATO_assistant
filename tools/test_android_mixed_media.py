"""Test the actual Android JsonReader and mapping projection on a small JVM heap.

No emulator/SDK required. --local also compares representative installed private
entries with an independent Python projection (never prints their source text).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import uuid
from pathlib import Path

from export_android import ensure_java, java_home
from packaging.package_common import CACHE_ROOT, PROJECT_ROOT, download


def local_cases(mapping: Path) -> list[dict]:
    source = mapping.read_text(encoding="utf-8-sig")
    data, _ = json.JSONDecoder().raw_decode(source[source.index("{"):])
    ledgers = ("rows", "resourceRows", "battleRows", "requestedRows", "resourceScopeExclusions")
    fields = set("book key variant kind path anchor position replaceText contextBefore contextAfter textFingerprint layout alt resourceLabel semanticLabel retainedNameText scope vectorPath sourcePngSha256 svgSha256 anchorOccurrence anchorCount textLength retainedNameStart retainedNameEnd pdfPage printedPage start end width height textAlreadyNamesResource textAlreadyNamesMedia".split())
    samples = {}
    # Exercise every ledger/book/variant, plus the entry with the largest row count.
    groups = {}
    for ledger in ledgers:
        for row in data.get(ledger, []):
            identity = tuple(row.get(k) for k in ("book", "variant", "key"))
            samples.setdefault((ledger, *identity[:2]), identity)
            groups[identity] = groups.get(identity, 0) + 1
    identities = set(samples.values()) | {max(groups, key=groups.get), ("c2", "fan", "missing-test-entry")}
    cases = []
    for book, variant, key in sorted(identities):
        expected = {name: data[name] for name in ("schema", "resourceSchema", "battleSchema", "requestedSchema", "vectorSchema") if name in data}
        for ledger in (*ledgers, "vectorAssets"):
            if ledger not in data:
                continue
            expected[ledger] = [{name: value for name, value in row.items() if name in fields}
                                for row in data[ledger] if ledger == "vectorAssets"
                                or (row.get("book"), row.get("variant"), row.get("key")) == (book, variant, key)]
        cases.append(dict(book=book, variant=variant, key=key, expected=expected))
    return cases


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true")
    options = parser.parse_args()
    java = ensure_java()
    # An unmodified Android framework implementation, rather than SDK method stubs.
    version = "4.4_r1-robolectric-1"
    android = download(f"https://repo.maven.apache.org/maven2/org/robolectric/android-all/{version}/android-all-{version}.jar",
                       CACHE_ROOT / "android" / f"android-all-{version}.jar")
    directory = CACHE_ROOT / "android" / ("mixed-media-test-" + uuid.uuid4().hex)
    directory.mkdir(parents=True)
    source = PROJECT_ROOT / "tools/packaging/android/app/src/main/java/com/ato/assistant/MixedMediaMapReader.java"
    harness = PROJECT_ROOT / "tests/fixtures/android-mixed-media/com/ato/assistant/MixedMediaMapHarness.java"
    javac = java_home(java) / "bin" / ("javac.exe" if os.name == "nt" else "javac")
    subprocess.run([str(javac), "-encoding", "UTF-8", "-cp", str(android), "-d", str(directory), str(source), str(harness)], check=True)
    arguments = []
    if options.local:
        mapping = PROJECT_ROOT / "story/assets/mixed-media/mapping.js"
        cases = directory / "expected.json"
        cases.write_text(json.dumps(local_cases(mapping), ensure_ascii=False), encoding="utf-8")
        arguments = [str(mapping), str(cases)]
    subprocess.run([str(java), "-Xmx48m", "-cp", os.pathsep.join((str(directory), str(android))),
                    "com.ato.assistant.MixedMediaMapHarness", *arguments], check=True)


if __name__ == "__main__":
    main()
