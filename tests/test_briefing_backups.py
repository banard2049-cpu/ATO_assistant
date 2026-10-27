"""Real HTTP ZIP backup round trips with PHP's minimal portable extensions."""
from __future__ import annotations

import hashlib
import base64
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

import pytest

from test_briefing_api import ROOT, PHP, campaign_snapshot, free_port

pytestmark = pytest.mark.skipif(PHP is None, reason="PHP is required")


@pytest.fixture(scope="module")
def backup_server():
    scratch = ROOT / "tmp" / ("briefing-zip-" + uuid.uuid4().hex)
    data = scratch / "data"
    sessions = data / "sessions"
    sessions.mkdir(parents=True)
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    env = dict(os.environ, ATO_DATA_DIR=str(data))
    with (scratch / "php.log").open("wb") as log:
        process = subprocess.Popen([PHP, "-d", "memory_limit=64M", "-S", f"127.0.0.1:{port}", "-t", str(ROOT), "router.php"],
                                   cwd=ROOT, env=env, stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    urllib.request.urlopen(base + "/briefing/backups.php?action=export", timeout=1)
                except urllib.error.HTTPError:
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError("PHP did not start")

            def request(user, action, body=None, headers=None, method=None):
                supplied = dict(headers or {})
                if user:
                    session_id = "backup" + user
                    (sessions / ("sess_" + session_id)).write_text(f'ato_user_id|s:{len(user)}:"{user}";', encoding="utf-8")
                    supplied["Cookie"] = "PHPSESSID=" + session_id
                if body is not None:
                    supplied.setdefault("X-ATO-Backup", "1")
                    supplied.setdefault("Content-Type", "application/zip")
                query = action if action.startswith("/") else "/briefing/backups.php?action=" + action
                if method is None and action == "import" and body is not None:
                    method = "PUT"
                req = urllib.request.Request(base + query, data=body, headers=supplied, method=method)
                try:
                    response = urllib.request.urlopen(req, timeout=60)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    raw = response.read()
                    value = json.loads(raw) if "json" in response.headers.get("Content-Type", "") else raw
                    return response.status, value

            yield {"request": request, "data": data}
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
    assert scratch.resolve().parent == (ROOT / "tmp").resolve()
    shutil.rmtree(scratch)


def raw_campaign(day="T6/00", profile="中文::船", cycle="c2", revision=3, padding=""):
    campaign = campaign_snapshot(day=day, explored=["T00"], unlocked=[], active_cycle=cycle, revision=revision)
    dash = campaign["sections"]["dashboard"]
    dash["profiles"][profile] = dash["profiles"].pop("default")
    dash["activeProfileId"] = profile
    dash["profiles"][profile]["name"] = "远征船"
    campaign["sections"]["record"] = {"inventory": padding}
    return json.dumps(campaign, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def package(raws, *, modify=None, extra=None, descriptor=False):
    entries = []
    values = {}
    for i, raw in enumerate(raws, 1):
        campaign = json.loads(raw)
        dash = campaign["sections"]["dashboard"]
        profile = dash["activeProfileId"]
        cycle = dash["profiles"][profile]["activeCycleId"]
        day = str(dash["profiles"][profile]["cycles"][cycle]["state"]["day"])
        name = f"backups/{i:08d}.json"
        entries.append({"file": name, "profileId": profile, "cycleId": cycle, "day": day,
                        "sha256": hashlib.sha256(raw).hexdigest(), "timestamp": 1760000000000 + i * 1000})
        values[name] = raw
    manifest = {"format": "ato-daily-backups", "version": 1, "createdAt": "2026-10-26T00:00:00Z", "cycles": [], "entries": entries}
    if modify:
        modify(manifest, values)
    values["manifest.json"] = json.dumps(manifest, ensure_ascii=False).encode("utf-8")
    if extra:
        values.update(extra)
    # Non-seekable output forces data descriptors, like Java ZipOutputStream.
    class DescriptorOutput(io.BytesIO):
        def seekable(self): return False
        def seek(self, *args): raise io.UnsupportedOperation()
    out = DescriptorOutput() if descriptor else io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, value in values.items():
            archive.writestr(name, value)
    return out.getvalue()


def test_requires_login_and_same_origin_header(backup_server):
    request = backup_server["request"]
    assert request(None, "export")[0] == 401
    assert request("authzip", "import", package([raw_campaign()]), {"X-ATO-Backup": ""})[0] == 403
    assert request("authzip", "import", package([raw_campaign()]), {"Origin": "https://foreign.invalid"})[0] == 403
    assert request("authzip", "import")[0] == 405


def test_import_export_preserves_revisions_and_current_save(backup_server):
    request, data = backup_server["request"], backup_server["data"]
    user = "roundtripzip"
    current = data / f"ato-campaign-{user}.json"
    original = raw_campaign(day="99", profile="current", cycle="c1")
    current.write_bytes(original)
    raws = [raw_campaign(revision=3), raw_campaign(revision=4), raw_campaign(day="2", profile="other", cycle="c5")]
    status, imported = request(user, "import", package(raws, descriptor=True))
    assert status == 200, imported
    assert imported["imported"] == 3 and imported["skipped"] == 0
    assert current.read_bytes() == original
    status, duplicate = request(user, "import", package(raws))
    assert status == 200 and duplicate["imported"] == 0 and duplicate["skipped"] == 3
    status, prepared = request(user, "prepare-export", b"")
    assert status == 200 and prepared["total"] == 3, prepared
    status, content = request(user, "/briefing/" + prepared["downloadUrl"])
    assert status == 200, content
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["format"] == "ato-daily-backups"
        assert len(manifest["entries"]) == 3
        assert {archive.read(entry["file"]) for entry in manifest["entries"]} == set(raws)
        assert {entry["timestamp"] for entry in manifest["entries"]} == {1760000001000, 1760000002000, 1760000003000}
        assert all(hashlib.sha256(archive.read(entry["file"])).hexdigest() == entry["sha256"] for entry in manifest["entries"])
    assert request(user, "/briefing/" + prepared["downloadUrl"])[0] == 404
    assert current.read_bytes() == original


def test_fresh_account_can_replay_imported_profile_without_current_campaign(backup_server):
    request = backup_server["request"]
    user = "freshzip"
    status, result = request(user, "import", package([raw_campaign()]))
    assert status == 200, result
    assert not (backup_server["data"] / f"ato-campaign-{user}.json").exists()
    status, replay = request(user, "/briefing/api.php?format=snapshots&profile=" + urllib.parse.quote("中文::船") + "&cycle=c2")
    assert status == 200, replay
    assert replay["profileId"] == "中文::船" and replay["cycleId"] == "c2"
    assert replay["snapshots"][0]["day"] == "T6/00"
    assert any(cycle["profileName"] == "远征船" for cycle in replay["cycles"])
    assert request("emptyzip", "export")[0] == 404
    assert request("unrelatedzip", "export")[0] == 404


@pytest.mark.parametrize("corruption", ["path", "extra", "digest", "identity", "json", "truncated", "symlink", "duplicate"])
def test_invalid_archives_do_not_partially_import(backup_server, corruption):
    request, data = backup_server["request"], backup_server["data"]
    user = "invalidzip" + corruption
    raws = [raw_campaign(day="1"), raw_campaign(day="2")]
    def modify(manifest, values):
        entry = manifest["entries"][1]
        if corruption == "path":
            values["../escape.json"] = values.pop(entry["file"])
            entry["file"] = "../escape.json"
        elif corruption == "digest": entry["sha256"] = "0" * 64
        elif corruption == "identity": entry["day"] = "777"
        elif corruption == "json":
            values[entry["file"]] = b"invalid"
            entry["sha256"] = hashlib.sha256(b"invalid").hexdigest()
    content = package(raws, modify=modify, extra={"unexpected.txt": b"x"} if corruption == "extra" else None)
    if corruption == "truncated": content = content[:-10]
    if corruption in ("symlink", "duplicate"):
        out = io.BytesIO(content)
        with zipfile.ZipFile(out, "a") as archive:
            info = zipfile.ZipInfo("backups/00000003.json" if corruption == "symlink" else "backups/00000002.json")
            if corruption == "symlink":
                info.create_system = 3
                info.external_attr = (0o120777 << 16)
            archive.writestr(info, b"target")
        content = out.getvalue()
    status, result = request(user, "import", content)
    assert status in (400, 413), result
    assert result["ok"] is False
    assert list((data / "backups" / user).rglob("import-*.json")) == []
    assert not (data / "backups" / user / "briefing-catalog.json").exists()


def test_zip_large_history_stays_bounded(backup_server):
    # A large total history never becomes one JSON or one in-memory ZIP on PHP.
    raws = [raw_campaign(day=str(day), padding="x" * (512 * 1024)) for day in range(50)]
    request = backup_server["request"]
    status, result = request("largezip", "import", package(raws))
    assert status == 200 and result["imported"] == 50, result
    status, prepared = request("largezip", "prepare-export", b"")
    assert status == 200 and prepared["total"] == 50, prepared
    status, content = request("largezip", "/briefing/" + prepared["downloadUrl"])
    assert status == 200
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        assert len(archive.namelist()) == 51 and archive.testzip() is None


def test_catalog_tracks_latest_game_day_and_new_imports(backup_server):
    request = backup_server["request"]
    status, result = request("catalogzip", "import", package([raw_campaign(day="80"), raw_campaign(day="9")]))
    assert status == 200 and result["cycles"][0]["day"] == "80", result
    status, replay = request("catalogzip", "/briefing/api.php?format=snapshots")
    assert status == 200 and replay["cycles"][0]["day"] == "80"
    assert request("catalogzip", "import", package([raw_campaign(day="81")]))[0] == 200
    status, replay = request("catalogzip", "/briefing/api.php?format=snapshots")
    assert status == 200 and replay["cycles"][0]["day"] == "81"


def test_download_token_is_bound_to_account(backup_server):
    request = backup_server["request"]
    assert request("ownerzip", "import", package([raw_campaign()]))[0] == 200
    status, prepared = request("ownerzip", "prepare-export", b"")
    assert status == 200, prepared
    path = "/briefing/" + prepared["downloadUrl"]
    assert request("strangerzip", path)[0] == 404
    assert request(None, path)[0] == 401
    assert request("ownerzip", path)[0] == 200


def test_malformed_manifest_array_and_oversize_declaration_rejected(backup_server):
    request, data = backup_server["request"], backup_server["data"]
    def keyed(manifest, values):
        manifest["entries"] = {"../../escaped": manifest["entries"][0]}
    assert request("keyedzip", "import", package([raw_campaign()], modify=keyed))[0] == 400
    content = bytearray(package([raw_campaign()]))
    central = content.index(b"PK\x01\x02")
    # The central uncompressed-size field is checked before any decompression.
    content[central + 24:central + 28] = (17 * 1024 * 1024).to_bytes(4, "little")
    assert request("limitzip", "import", bytes(content))[0] == 413
    assert list((data / "backups" / "limitzip").rglob("import-*.json")) == []


def test_crc_corruption_rejected_before_any_backup_write(backup_server):
    content = bytearray(package([raw_campaign()]))
    central = content.index(b"PK\x01\x02")
    # Change both CRC fields together to ensure stream CRC verification catches it.
    content[central + 16:central + 20] = b"\0\0\0\0"
    content[14:18] = b"\0\0\0\0"
    status, result = backup_server["request"]("crczip", "import", bytes(content))
    assert status == 400, result
    assert list((backup_server["data"] / "backups" / "crczip").rglob("import-*.json")) == []


def test_raw_zip_larger_than_default_form_post_limit(backup_server):
    padding = base64.b64encode(os.urandom(9 * 1024 * 1024)).decode("ascii")
    content = package([raw_campaign(padding=padding)])
    assert len(content) > 8 * 1024 * 1024
    status, result = backup_server["request"]("bigrequestzip", "import", content)
    assert status == 200 and result["imported"] == 1, result


def test_more_than_24_revisions_keep_highest_revision_after_import(backup_server):
    best = json.loads(raw_campaign(day="1", revision=100))
    best["sections"]["dashboard"]["profiles"]["中文::船"]["cycles"]["c2"]["state"]["notes"] = "highest revision"
    raw = json.dumps(best, ensure_ascii=False).encode("utf-8")
    # Highest revision sorts first by its imported timestamp, outside the old
    # last-24-filenames window. Every revision still belongs to the same day.
    content = package([raw] + [raw_campaign(day="1", revision=i) for i in range(35)])
    request = backup_server["request"]
    status, result = request("revisionszip", "import", content)
    assert status == 200 and result["imported"] == 36, result
    for query, field in [("?format=snapshots", "snapshots"), ("", "timeline")]:
        status, replay = request("revisionszip", "/briefing/api.php" + query)
        assert status == 200, replay
        assert next(entry for entry in replay[field] if entry["day"] == "1")["notes"] == "highest revision"


def test_millisecond_timestamps_survive_export_and_choose_latest_tied_revision(backup_server):
    def raw_with_note(note):
        value = json.loads(raw_campaign(day="2", revision=7))
        value["sections"]["dashboard"]["profiles"]["中文::船"]["cycles"]["c2"]["state"]["notes"] = note
        return json.dumps(value, ensure_ascii=False).encode("utf-8")

    stamps = [1760000000123, 1760000000789]
    content = package([raw_with_note("earlier"), raw_with_note("later")],
                      modify=lambda manifest, _: [entry.update(timestamp=stamp) for entry, stamp in zip(manifest["entries"], stamps)])
    request = backup_server["request"]
    assert request("millizip", "import", content)[1]["imported"] == 2
    status, replay = request("millizip", "/briefing/api.php?format=snapshots")
    assert status == 200 and replay["snapshots"][0]["notes"] == "later"
    status, exported = request("millizip", "export")
    assert status == 200
    with zipfile.ZipFile(io.BytesIO(exported)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
    assert sorted(entry["timestamp"] for entry in manifest["entries"]) == stamps
