"""Real PHP regression for paged briefings on portable and Docker builds.

The server has a 64 MiB PHP memory limit. All campaigns are synthetic and live
in an isolated workspace directory, so these checks never read personal saves.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.parse
import uuid

import pytest

from test_briefing_api import (
    Client,
    PHP,
    ROOT,
    campaign_snapshot,
    free_port,
    write_campaign_file,
    write_daily_backup,
)


pytestmark = pytest.mark.skipif(PHP is None, reason="PHP is required")
PAGE_PATH = "/briefing/api.php?format=snapshots"


@pytest.fixture(scope="module")
def limited_server():
    # Ordinary mkdir also lets PHP access this directory in the Windows sandbox.
    scratch = ROOT / "tmp" / ("briefing-memory-" + uuid.uuid4().hex)
    data_dir = scratch / "data"
    sessions = data_dir / "sessions"
    sessions.mkdir(parents=True)
    port = free_port()
    env = dict(os.environ, ATO_DATA_DIR=str(data_dir))
    log_path = scratch / "php.log"
    with log_path.open("wb") as log:
        process = subprocess.Popen(
            [PHP, "-d", "memory_limit=64M", "-S", f"127.0.0.1:{port}", "-t", str(ROOT), "router.php"],
            cwd=ROOT, env=env, stdout=log, stderr=log,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                try:
                    Client(base).request(PAGE_PATH)
                    break
                except (OSError, ValueError):
                    time.sleep(0.1)
            else:
                raise RuntimeError("PHP did not start: " + log_path.read_text(encoding="utf-8", errors="replace"))

            def account(name: str) -> Client:
                session_id = "briefing" + uuid.uuid4().hex
                (sessions / ("sess_" + session_id)).write_text(
                    f'ato_user_id|s:{len(name)}:"{name}";', encoding="utf-8"
                )
                write_campaign_file(data_dir, name, campaign_snapshot(day="80", explored=["T00"], unlocked=[]))
                client = Client(base)
                client.cookie = "PHPSESSID=" + session_id
                return client

            yield {"base": base, "data_dir": data_dir, "account": account}
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
    # Only remove the synthetic test directory whose absolute path we checked.
    resolved = scratch.resolve()
    assert resolved.parent == (ROOT / "tmp").resolve()
    assert resolved.name.startswith("briefing-memory-")
    shutil.rmtree(resolved)


def stored_files(data_dir: Path, user: str) -> dict:
    paths = [data_dir / f"ato-campaign-{user}.json"]
    paths.extend((data_dir / "backups" / user).rglob("*.json"))
    result = {}
    for path in paths:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        result[str(path.relative_to(data_dir))] = (path.stat().st_mtime_ns, digest.hexdigest())
    return result


def read_pages(client: Client):
    query = {}
    snapshots = []
    cursors = set()
    first = None
    pages = 0
    while True:
        path = PAGE_PATH + ("&" + urllib.parse.urlencode(query) if query else "")
        status, page = client.request(path)
        assert status == 200 and page["ok"] is True, page
        assert page["source"] == "daily-backups"
        assert page["snapshotFormat"] == "briefing"
        assert len(page["snapshots"]) <= 4
        if first is None:
            first = page
        else:
            for field in ("profileId", "cycleId", "user"):
                assert page[field] == first[field]
        snapshots.extend(page["snapshots"])
        pages += 1
        cursor = page["nextCursor"]
        if cursor is None:
            first["snapshots"] = snapshots
            first["nextCursor"] = None
            return first, pages
        assert isinstance(cursor, str) and cursor.isdigit() and cursor not in cursors
        cursors.add(cursor)
        query = {"profile": first["profileId"], "cycle": first["cycleId"], "cursor": cursor}
        assert pages < 100, "Pagination did not terminate"


def test_eighty_large_daily_archives_fit_64_mib_without_writes(limited_server):
    user = "briefingmemory"
    client = limited_server["account"](user)
    data_dir = limited_server["data_dir"]
    padding = "n" * (384 * 1024)
    for day in range(80):
        snapshot = campaign_snapshot(day=str(day), explored=["T00"], unlocked=[],
                                     notes=f"Day {day}: " + padding, heroes=["historic hero"])
        cycles = snapshot["sections"]["dashboard"]["profiles"]["default"]["cycles"]
        for cycle_id, cycle in cycles.items():
            if cycle_id != "c1":
                cycle["state"]["notes"] = ""
        snapshot["sections"]["record"] = {"unusedPayload": "UNUSED RECORD " + padding}
        write_daily_backup(data_dir, user, "c1", str(day), snapshot, "20261026T000000Z")
    before = stored_files(data_dir, user)
    source, pages = read_pages(client)
    assert pages == 20
    assert len(source["snapshots"]) == 80
    by_day = {entry["day"]: entry for entry in source["snapshots"]}
    assert set(by_day) == {str(day) for day in range(80)}
    for day, snapshot in by_day.items():
        assert snapshot["notes"] == f"Day {day}: " + padding
        assert snapshot["heroes"]["names"] == ["historic hero"]
        assert "record" not in snapshot and "UNUSED RECORD" not in json.dumps(snapshot)
    assert stored_files(data_dir, user) == before

    # The legacy full-response endpoint remains compatible for small histories;
    # its much larger response must become valid JSON if the PHP budget is hit.
    status, result = client.request("/briefing/api.php")
    # Some PHP SAPIs commit their own HTTP 500 before the shutdown callback.
    assert status in (500, 503) and result["ok"] is False, (status, result.get("code"))
    assert result["code"] == "BRIEFING_MEMORY_LIMIT"
    assert stored_files(data_dir, user) == before
    # A failed large request must not poison subsequent small page requests.
    assert client.request(PAGE_PATH)[0] == 200


def test_paged_auth_cursor_isolation_and_empty_history(limited_server):
    assert Client(limited_server["base"]).request(PAGE_PATH)[0] == 401
    client = limited_server["account"]("briefingempty")
    status, source = client.request(PAGE_PATH)
    assert status == 200 and source["snapshots"] == [] and source["nextCursor"] is None
    assert source["user"]["id"] == "briefingempty"
    assert {cycle["cycleId"] for cycle in source["cycles"]} == {"c1", "c2", "c3", "c4", "c5"}
    for cursor in ("-1", "invalid", "99999999999999999999999999999", "1"):
        status, error = client.request(PAGE_PATH + "&cursor=" + cursor)
        assert status == 400 and error["code"] == "INVALID_BRIEFING_CURSOR", error
    status, source = client.request(PAGE_PATH + "&profile=invalid&cycle=invalid")
    assert status == 200 and source["profileId"] == "default" and source["cycleId"] == "c1"
    status, error = client.request(PAGE_PATH, method="POST", payload={})
    assert status == 405 and error["ok"] is False


def test_bad_and_mismatched_revisions_keep_valid_history(limited_server):
    user = "briefingcorrupt"
    client = limited_server["account"](user)
    data_dir = limited_server["data_dir"]
    good = campaign_snapshot(day="1", explored=["T00"], unlocked=[], notes="valid archive", revision=2)
    write_daily_backup(data_dir, user, "c1", "1", good, "001-valid")
    wrong_day = campaign_snapshot(day="99", explored=[], unlocked=[], notes="WRONG DAY", revision=999)
    write_daily_backup(data_dir, user, "c1", "1", wrong_day, "999-wrong-day")
    folder = data_dir / "backups" / user / "daily" / "default" / "c1" / "day-1"
    (folder / "zzz-broken.json").write_text("{broken JSON", encoding="utf-8")
    source, _ = read_pages(client)
    assert [entry["day"] for entry in source["snapshots"]] == ["1"]
    assert source["snapshots"][0]["notes"] == "valid archive"


@pytest.mark.parametrize("day", ["10001", "T10001", "9999999999999999999999999"])
def test_malformed_day_cannot_allocate_unbounded_date_axis(limited_server, day):
    user = "briefingday" + uuid.uuid4().hex[:10]
    client = limited_server["account"](user)
    data_dir = limited_server["data_dir"]
    write_daily_backup(data_dir, user, "c1", day,
                       campaign_snapshot(day=day, explored=[], unlocked=[]), "20261026T000000Z")
    for path in (PAGE_PATH, "/briefing/api.php"):
        status, error = client.request(path)
        assert status == 422 and error["code"] == "INVALID_BRIEFING_DAY", error


def test_single_archive_larger_than_php_budget_returns_json(limited_server):
    user = "briefingoversized"
    client = limited_server["account"](user)
    data_dir = limited_server["data_dir"]
    campaign = campaign_snapshot(day="99", explored=[], unlocked=[], notes="PADDING_PLACEHOLDER")
    raw = json.dumps(campaign, ensure_ascii=False)
    prefix, suffix = raw.split("PADDING_PLACEHOLDER", 1)
    path = data_dir / "backups" / user / "daily" / "default" / "c1" / "day-99" / "large.json"
    path.parent.mkdir(parents=True)
    with path.open("wb") as stream:
        stream.write(prefix.encode("utf-8"))
        for _ in range(64):
            stream.write(b"n" * (1024 * 1024))
        stream.write(suffix.encode("utf-8"))
    before = stored_files(data_dir, user)
    status, error = client.request(PAGE_PATH)
    assert status == 503 and error["code"] == "BRIEFING_MEMORY_LIMIT", error
    assert stored_files(data_dir, user) == before

    # Merely enumerating days must not decode a later page's oversized archive.
    for day in range(4):
        write_daily_backup(data_dir, user, "c1", str(day),
                           campaign_snapshot(day=str(day), explored=[], unlocked=[]), "20261026T000000Z")
    status, page = client.request(PAGE_PATH)
    assert status == 200 and len(page["snapshots"]) == 4 and page["nextCursor"] == "4"
    status, error = client.request(PAGE_PATH + "&cursor=4&profile=default&cycle=c1")
    assert status == 503 and error["code"] == "BRIEFING_MEMORY_LIMIT", error


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for browser conversion parity")
def test_paged_source_build_matches_legacy_replay(limited_server):
    user = "briefingpagedparity"
    client = limited_server["account"](user)
    data_dir = limited_server["data_dir"]
    notes = ""
    for index, day in enumerate(("0", "1", "2", "4", "5", "6")):
        notes += ("\n" if notes else "") + "Map note " + day
        snapshot = campaign_snapshot(
            day=day, explored=["T00", "005"] + (["006"] if index >= 3 else []),
            unlocked=["trireme armor"] + (["argo works"] if index >= 4 else []),
            current_tile="006" if index >= 3 else "005", notes=notes,
            heroes=["odys"] + (["new hero"] if index >= 3 else []),
            story_section="chapter " + str(index // 2), story_title="story " + day,
            card_tracks={"story": {"position": index, "progress": index + 1}}, card_tracks_version=2,
        )
        state = snapshot["sections"]["dashboard"]["profiles"]["default"]["cycles"]["c1"]["state"]
        state["dateNotes"] = {day: "Date note " + day}
        state["surveyConstants"] = {"hubs": {"hub": {"one": True, "two": index >= 4}},
                                    "activeHub": {"itemId": "hub", "boxId": "one"}}
        write_daily_backup(data_dir, user, "c1", day, snapshot, "20261026T000000Z")
    status, expected = client.request("/briefing/api.php")
    assert status == 200
    source, pages = read_pages(client)
    assert pages == 2
    script = """
const fs = require('node:fs');
const vm = require('node:vm');
const { build } = require('./briefing/briefing-local.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('./map/map-data.js', 'utf8'), sandbox);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(build(input, sandbox.window.ATO_MAP_DATA,
  JSON.parse(fs.readFileSync('./technology/tech_card_dictionary.min.json', 'utf8')))));
"""
    result = subprocess.run([shutil.which("node"), "-e", script], cwd=ROOT,
                            input=json.dumps(source, ensure_ascii=False), encoding="utf-8",
                            capture_output=True, check=True)
    actual = json.loads(result.stdout)
    for payload in (actual, expected):
        for entry in payload["timeline"]:
            entry.pop("savedAtLocal", None)
    assert actual == expected
