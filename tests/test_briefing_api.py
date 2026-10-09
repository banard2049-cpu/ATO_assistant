"""战役简报（briefing/）的端到端回归测试。

简报的数据全部来自每日存档备份，所以测试不去伪造接口返回值，而是：

1. 在临时目录里造一份 **假的数据目录**（账号文件 + 战役存档 + 每日备份），
2. 用 `ATO_DATA_DIR` 让真实的 PHP 代码为它服务（api/campaign-state.php 负责注册/登录，
   briefing/api.php 负责简报），
3. 通过 HTTP 走一遍「注册 → 登录 → 取简报 → 断言逐日差分」的完整链路。

这样测试跑的是生产路径上的同一份代码，而且不会碰仓库里的 data/ 真实存档。
需要 php 可执行文件在 PATH 上；没有 php 时整个模块 skip。
"""

from __future__ import annotations

import json
import hashlib
import os
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PHP = shutil.which("php")

pytestmark = pytest.mark.skipif(PHP is None, reason="需要 php 可执行文件；本机没有装 PHP")

# 假账号：注册接口要求 3-32 位小写字母/数字/下划线/连字符。
TEST_USER = "briefinguser"
TEST_PASS = "briefing-pass-1234"
CYCLE = "c1"


# --------------------------------------------------------------------------- #
# 假存档 / 假备份
# --------------------------------------------------------------------------- #

def campaign_snapshot(
    *,
    day: str,
    explored: list[str],
    unlocked: list[str],
    current_tile: str = "",
    latest_revealed: str = "",
    story_section: str = "",
    story_title: str = "",
    notes: str = "",
    heroes: list[str] | None = None,
    saved_at: str = "2026-01-01T00:00:00+00:00",
    revision: int = 1,
    active_cycle: str = CYCLE,
    card_tracks: dict | None = None,
    card_tracks_version: int | str | None = None,
    card_counters: dict | None = None,
) -> dict:
    """按真实存档结构造一份快照（只填简报会读到的字段）。

    账号存档里始终有 5 个循环（真实客户端就是这样初始化 dashboard 的），
    简报的循环下拉与「有循环但没有备份」的情况都要照着这个形状测。
    """
    state = {
        "day": day,
        "location": current_tile,
        "objective": "",
        "reminder": "",
        "notes": notes,
        "dateNotes": [],
        "specialEventConstantsActive": "",
        "pharosDreamsActive": "",
        "mainStoryConstantsActive": "",
        "mapSnapshot": {
            "savedAt": saved_at,
            "cycleId": active_cycle,
            "currentTileId": current_tile,
            "latestRevealedTileId": latest_revealed,
            "adversaryTileId": "",
            "lastCityTileId": "",
            "lastOasisTileId": "",
            "lastSilverRuinTileId": "",
            "scoutCount": 0,
            "scoutTileId": "",
            "currentTileTagLabels": [],
            "currentTileFactionLabels": [],
            "latestRevealedTileTagLabels": [],
            "exploredCount": len(explored),
            "totalTiles": 87,
            "exploredIds": list(explored),
            "tileNotes": [],
            "markers": [],
        },
        "unlockedTech": {
            "techCycle": "cycle1",
            "unlockedKeys": list(unlocked),
            "unlocked": [{"key": key, "category": "structure"} for key in unlocked],
        },
        "exploration": {"drawStateByCycle": {active_cycle: {"history": []}}},
    }
    if card_tracks is not None:
        state["cardTracks"] = card_tracks
    if card_tracks_version is not None:
        state["cardTracksVersion"] = card_tracks_version
    if card_counters is not None:
        state["cardCounters"] = card_counters
    cycles = {}
    for cycle_id in ("c1", "c2", "c3", "c4", "c5"):
        cycles[cycle_id] = {
            "id": cycle_id,
            "state": dict(state, day=day if cycle_id == active_cycle else "0",
                          mapSnapshot={} if cycle_id != active_cycle else state["mapSnapshot"],
                          unlockedTech={} if cycle_id != active_cycle else state["unlockedTech"]),
        }
    return {
        "version": 1,
        "updatedAt": saved_at,
        "sections": {
            "dashboard": {
                "activeProfileId": "default",
                "profiles": {"default": {"id": "default", "name": "默认", "activeCycleId": active_cycle,
                                         "cycles": cycles}},
            },
            "technology": {"users": {"default": {"currentCycle": active_cycle, "unlocked": list(unlocked)}}},
            "heroes": {
                "heroes": [{"id": f"hero-{name}", "argonaut": name} for name in (heroes or [])],
                "activeHeroId": f"hero-{(heroes or [''])[0]}",
                "graveyard": [],
            },
            "story": {
                "bookTitle": "ATO C1 故事书",
                "section": story_section,
                "title": story_title,
                "id": story_title,
                "updatedAt": saved_at,
            },
        },
        "sectionRevisions": {"dashboard": revision, "map": 1, "record": 1, "technology": 1,
                             "heroes": 1, "aibp": 1, "story": 1},
    }


def write_daily_backup(data_dir: Path, user: str, cycle: str, day: str, snapshot: dict, stamp: str) -> None:
    day_dir = data_dir / "backups" / user / "daily" / "default" / cycle / f"day-{day}"
    day_dir.mkdir(parents=True, exist_ok=True)
    (day_dir / f"{stamp}.json").write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")


def write_campaign_file(data_dir: Path, user: str, snapshot: dict) -> None:
    """把账号存档写成「当前状态」。

    注册接口只会建一份空存档，简报的循环下拉与每天的更新日期都来自这份当前存档，
    所以测试要把它写成真实客户端的样子：5 个循环都在。
    """
    (data_dir / f"ato-campaign-{user}.json").write_text(
        json.dumps(snapshot, ensure_ascii=False), encoding="utf-8"
    )


def build_fixture(data_dir: Path) -> None:
    """造两天序章（T0、T1）+ 第 0/1/2 天的备份，中间的日期故意缺失。"""
    (data_dir / "sessions").mkdir(parents=True, exist_ok=True)
    (data_dir / "ato-users.json").write_text(
        json.dumps({"version": 1, "users": {}}, ensure_ascii=False), encoding="utf-8"
    )

    # T0：开局，只有 1 格
    write_daily_backup(
        data_dir, TEST_USER, CYCLE, "T0",
        campaign_snapshot(day="T0", explored=["T00"], unlocked=[], current_tile="T00",
                          latest_revealed="T00", saved_at="2026-01-01T00:00:00+00:00", revision=1),
        "20260101T000000Z-aaaa0001",
    )
    # T1：多翻开 2 格
    write_daily_backup(
        data_dir, TEST_USER, CYCLE, "T1",
        campaign_snapshot(day="T1", explored=["T00", "T01", "T02"], unlocked=[], current_tile="T02",
                          latest_revealed="T02", saved_at="2026-01-01T01:00:00+00:00", revision=2),
        "20260101T010000Z-aaaa0002",
    )
    # 第 0 天：点亮第一项科技 + 故事开篇 + 一名英雄；notes 里带一条地图流水
    sync0 = "[地图同步 2026/1/1 10:00:00] / Cycle I / 阿尔戈号：005 / 已揭示：4/87"
    write_daily_backup(
        data_dir, TEST_USER, CYCLE, "0",
        campaign_snapshot(day="0", explored=["T00", "T01", "T02", "005"],
                          unlocked=["trireme armor"], current_tile="005", latest_revealed="005",
                          story_section="主线剧情 - 迷宫的真理", story_title="0001",
                          notes=sync0, heroes=["odys"],
                          saved_at="2026-01-01T02:00:00+00:00", revision=3),
        "20260101T020000Z-aaaa0003",
    )
    # 第 1 天：再点一项科技，翻开一格，notes 追加第二条流水
    sync1 = sync0 + "\n[地图同步 2026/1/1 20:00:00] / Cycle I / 阿尔戈号：006 / 已揭示：5/87"
    write_daily_backup(
        data_dir, TEST_USER, CYCLE, "1",
        campaign_snapshot(day="1", explored=["T00", "T01", "T02", "005", "006"],
                          unlocked=["trireme armor", "argo works"], current_tile="006",
                          latest_revealed="006", story_section="主线剧情 - 迷宫的真理", story_title="0002",
                          notes=sync1, heroes=["odys"],
                          saved_at="2026-01-01T03:00:00+00:00", revision=4),
        "20260101T030000Z-aaaa0004",
    )
    # 第 2 天：同一天存了两份，revision 更大的那份才算当天结束状态
    write_daily_backup(
        data_dir, TEST_USER, CYCLE, "2",
        campaign_snapshot(day="2", explored=["T00", "T01", "T02", "005", "006"],
                          unlocked=["trireme armor", "argo works"], current_tile="006",
                          story_section="主线剧情 - 迷宫的真理", story_title="0002", notes=sync1,
                          heroes=["odys"], saved_at="2026-01-01T04:00:00+00:00", revision=5),
        "20260101T040000Z-aaaa0005",
    )
    write_daily_backup(
        data_dir, TEST_USER, CYCLE, "2",
        campaign_snapshot(day="2", explored=["T00", "T01", "T02", "005", "006", "007"],
                          unlocked=["trireme armor", "argo works", "last tome"], current_tile="007",
                          latest_revealed="007",
                          story_section="主线剧情 - 迷宫的真理", story_title="0003", notes=sync1,
                          heroes=["odys"], saved_at="2026-01-01T05:00:00+00:00", revision=6),
        "20260101T050000Z-aaaa0006",
    )


# --------------------------------------------------------------------------- #
# HTTP 小工具与服务器
# --------------------------------------------------------------------------- #

def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class Client:
    def __init__(self, base: str) -> None:
        self.base = base
        self.cookie: str | None = None

    def request(self, path: str, *, method: str = "GET", payload: dict | None = None):
        url = self.base + path
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(url, data=body, method=method)
        if body is not None:
            request.add_header("Content-Type", "application/json")
        if self.cookie:
            request.add_header("Cookie", self.cookie)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                set_cookie = response.headers.get("Set-Cookie")
                if set_cookie:
                    self.cookie = set_cookie.split(";", 1)[0]
                return response.status, json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as error:  # 4xx/5xx 也要能读 body
            return error.code, json.loads(error.read().decode("utf-8"))


@pytest.fixture(scope="module")
def server(tmp_path_factory):
    data_dir = tmp_path_factory.mktemp("briefing-data")
    build_fixture(data_dir)

    port = free_port()
    env = dict(os.environ)
    env["ATO_DATA_DIR"] = str(data_dir)
    process = subprocess.Popen(
        [PHP, "-S", f"127.0.0.1:{port}", "-t", str(ROOT), "router.php"],
        cwd=str(ROOT), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    client = Client(base)
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            client.request("/api/campaign-state.php?action=me")
            break
        except Exception:  # 服务器还没起来
            time.sleep(0.2)
    else:
        process.kill()
        raise RuntimeError("PHP 内置服务器没有在 15 秒内起来")

    yield {"client": client, "data_dir": data_dir}
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


@pytest.fixture(scope="module")
def logged_in(server):
    client: Client = server["client"]
    data_dir: Path = server["data_dir"]
    status, payload = client.request(
        "/api/campaign-state.php?action=register", method="POST",
        payload={"username": TEST_USER, "password": TEST_PASS},
    )
    assert status == 200, payload
    assert payload["ok"] is True
    status, me = client.request("/api/campaign-state.php?action=me")
    assert status == 200 and me["authenticated"] is True
    assert me["user"]["id"] == TEST_USER
    # 注册只建空存档：这里补上真实存档形状（5 个循环 + 最后一天的状态）。
    write_campaign_file(data_dir, TEST_USER, campaign_snapshot(
        day="2", explored=["T00", "T01", "T02", "005", "006", "007"],
        unlocked=["trireme armor", "argo works", "last tome"], current_tile="007",
        latest_revealed="007", story_section="主线剧情 - 迷宫的真理", story_title="0003",
        heroes=["odys"], saved_at="2026-01-01T05:00:00+00:00", revision=6,
    ))
    return client


# --------------------------------------------------------------------------- #
# 测试
# --------------------------------------------------------------------------- #

def test_requires_login(server):
    """没有登录态时不给数据，避免简报变成绕过登录读存档的口子。"""
    anonymous = Client(server["client"].base)
    status, payload = anonymous.request("/briefing/api.php")
    assert status == 401
    assert payload["code"] == "AUTH_REQUIRED"


def test_cycle_list_includes_every_cycle(logged_in):
    status, payload = logged_in.request("/briefing/api.php")
    assert status == 200
    assert {entry["cycleId"] for entry in payload["cycles"]} == {"c1", "c2", "c3", "c4", "c5"}
    c1 = next(entry for entry in payload["cycles"] if entry["cycleId"] == "c1")
    assert c1["label"] == "循环 I"
    assert c1["profileId"] == "default"


def test_timeline_covers_sequence_with_gaps(logged_in):
    status, payload = logged_in.request("/briefing/api.php")
    assert status == 200 and payload["ok"] is True
    assert payload["hasData"] is True
    timeline = payload["timeline"]
    # 备份里有 T0、T1、0、1、2 → 日期轴补成 T0,T1,0,1,2（没有 T2 之后的内容）
    assert [entry["day"] for entry in timeline] == ["T0", "T1", "0", "1", "2"]
    assert all(entry["present"] for entry in timeline)
    # 序章与正片的天数标题可读
    assert timeline[0]["title"] == "序章 T0"
    assert timeline[2]["title"] == "第 0 天"


def test_daily_diff_reports_new_tiles_and_tech(logged_in):
    status, payload = logged_in.request("/briefing/api.php")
    assert status == 200
    timeline = {entry["day"]: entry for entry in payload["timeline"]}

    # T0 是基线：差分从空状态开始算，所以这一天的内容都算「本次翻开」，
    # 前端会把这天标成基线，不再强调「今天刚点亮」。
    assert timeline["T0"]["map"]["explored"] == ["T00"]
    assert timeline["T0"]["map"]["new"] == ["T00"]

    assert timeline["T1"]["map"]["new"] == ["T01", "T02"]
    assert timeline["0"]["map"]["new"] == ["005"]
    assert timeline["1"]["map"]["new"] == ["006"]
    # 同一天有两份备份时用 revision 更大的那份
    assert timeline["2"]["map"]["new"] == ["007"]
    assert timeline["2"]["map"]["exploredCount"] == 6

    assert timeline["0"]["tech"]["new"] == ["trireme armor"]
    assert timeline["1"]["tech"]["new"] == ["argo works"]
    assert timeline["2"]["tech"]["new"] == ["last tome"]


def test_changes_are_human_readable(logged_in):
    status, payload = logged_in.request("/briefing/api.php")
    assert status == 200
    timeline = {entry["day"]: entry for entry in payload["timeline"]}
    kinds = {change["kind"] for change in timeline["1"]["changes"]}
    assert {"map", "location", "tech", "mapsync"} <= kinds
    map_change = next(c for c in timeline["1"]["changes"] if c["kind"] == "map")
    assert map_change["items"] == ["006"]
    location = next(c for c in timeline["1"]["changes"] if c["kind"] == "location")
    assert "006" in location["label"]
    # 地图流水只带当天新增的那条，不会把历史整段重复一遍
    assert timeline["1"]["mapSync"] == ["[地图同步 2026/1/1 20:00:00] / Cycle I / 阿尔戈号：006 / 已揭示：5/87"]


def test_story_and_heroes_tracked_once(logged_in):
    status, payload = logged_in.request("/briefing/api.php")
    timeline = {entry["day"]: entry for entry in payload["timeline"]}
    story_changes = [c for c in timeline["0"]["changes"] if c["kind"] == "story"]
    assert len(story_changes) == 1 and "迷宫的真理" in story_changes[0]["label"]
    # 第 1 天故事书还在同一节，不该再报一次「故事推进」
    assert [c for c in timeline["1"]["changes"] if c["kind"] == "story"] == []
    hero_changes = [c for c in timeline["0"]["changes"] if c["kind"] == "hero"]
    assert len(hero_changes) == 1 and hero_changes[0]["items"] == ["odys"]


def test_map_payload_has_positions_and_art(logged_in):
    status, payload = logged_in.request("/briefing/api.php")
    map_payload = payload["map"]
    assert map_payload["canvas"]["width"] > 1
    tiles = {tile["id"]: tile for tile in map_payload["tiles"]}
    # 只回传这一轮出现过的板块
    assert set(tiles) == {"T00", "T01", "T02", "005", "006", "007"}
    assert tiles["005"]["known"] is True
    assert tiles["005"]["front"].endswith(".jpg") or tiles["005"]["front"].endswith(".png")
    # 模板里的布局信息（画布、板块定义）原样交给前端复用
    assert map_payload["cycle"]["id"] == CYCLE
    assert len(map_payload["cycle"]["tiles"]) == 87
    # 首次出现的日期可用于回放
    assert tiles["006"]["firstDay"] == "1"
    assert tiles["007"]["firstDay"] == "2"


def test_tech_payload_has_nodes_edges_and_first_day(logged_in):
    status, payload = logged_in.request("/briefing/api.php")
    tech = payload["tech"]
    pages = {page["page"]: page for page in tech["pages"]}
    assert "cycle1" in pages
    page = pages["cycle1"]
    assert page["cycleId"] == CYCLE
    assert len(page["nodes"]) == 53  # cycle1 印刷节点数
    assert page["edges"], "科技树的依赖边不能是空的，否则简报画不出连线"

    by_key = {node["key"]: node for node in page["nodes"]}
    assert by_key["trireme armor"]["firstDay"] == "0"
    assert by_key["trireme armor"]["name"] == "船材护具"
    assert by_key["argo works"]["firstDay"] == "1"
    # 没点亮的节点也要在，前端画成灰底
    locked = [node for node in page["nodes"] if not node["unlocked"]]
    assert locked and all(node["firstDay"] == "" for node in locked)

    unlocked = {record["key"]: record for record in tech["unlocked"]}
    assert set(unlocked) == {"trireme armor", "argo works", "last tome"}
    assert [record["key"] for record in tech["unlocked"]][0] == "trireme armor"


def test_summary_counts(logged_in):
    status, payload = logged_in.request("/briefing/api.php")
    summary = payload["summary"]
    assert summary["days"] == 5
    assert summary["explored"] == 6
    assert summary["totalTiles"] == 87
    assert summary["unlocked"] == 3
    assert summary["firstDay"] == "T0" and summary["lastDay"] == "2"
    assert payload["cycle"]["label"] == "循环 I"
    assert payload["cycle"]["backupDir"].endswith("backups/briefinguser/daily/default/c1")


def test_cycle_without_backups_reports_has_data_false(logged_in):
    """循环存在但一天备份都没有：明确回 hasData=false，让页面给出解释而不是空白。"""
    status, payload = logged_in.request("/briefing/api.php?cycle=c5")
    assert status == 200
    assert payload["ok"] is True
    assert payload["cycle"]["cycleId"] == "c5"
    assert payload["hasData"] is False
    assert payload["timeline"] == []
    assert "message" in payload
    # 循环下拉仍然把 5 个循环都列出来
    assert {entry["cycleId"] for entry in payload["cycles"]} == {"c1", "c2", "c3", "c4", "c5"}


def test_unknown_cycle_falls_back_to_active(logged_in):
    status, payload = logged_in.request("/briefing/api.php?cycle=does-not-exist")
    assert status == 200
    assert payload["cycle"]["cycleId"] == CYCLE


def test_card_progress_comes_from_each_daily_backup(server):
    """卡牌回放保留历史版本与原始计数，不能用当前存档填补缺失记录。"""
    user = "briefingcards"
    client = Client(server["client"].base)
    data_dir: Path = server["data_dir"]
    status, registered = client.request(
        "/api/campaign-state.php?action=register", method="POST",
        payload={"username": user, "password": TEST_PASS},
    )
    assert status == 200 and registered["ok"] is True

    modern_tracks = {
        "story": {"position": "2", "progress": 3, "doom": 1},
        "doom": {"position": 4, "progress": "5", "doom": 0},
        "inwardOdyssey": {"position": 7, "progress": 2},
    }
    legacy_tracks = {
        "story": {"position": 0, "progress": "4", "doom": 2},
        "doom": {"position": "1", "progress": 6, "doom": "3"},
    }
    legacy_counters = {"story": "6", "doom": 3, "storyCount": "7", "doomCount": 4}
    snapshots = {
        "0": campaign_snapshot(
            day="0", explored=["005"], unlocked=[], card_tracks=modern_tracks,
            card_tracks_version=2,
        ),
        "1": campaign_snapshot(
            day="1", explored=["005"], unlocked=[], card_tracks=legacy_tracks,
            card_tracks_version=1,
        ),
        "2": campaign_snapshot(
            day="2", explored=["005"], unlocked=[], card_counters=legacy_counters,
        ),
        "3": campaign_snapshot(day="3", explored=["005"], unlocked=[]),
        # 第 4 天没有备份；第 5 天验证接口只公开卡图所需字段。
        "5": campaign_snapshot(
            day="5", explored=["005"], unlocked=[], card_tracks={
                "story": {"position": 8, "progress": "9", "doom": 0, "private": "ignored"},
                "doom": {"position": 5, "progress": [1, 2], "doom": {"value": 3}},
                "other": {"position": 99},
            }, card_tracks_version="2", card_counters={
                "story": "10", "doomCount": 11, "storyCount": [12], "doom": {"count": 13},
                "other": 14,
            },
        ),
    }
    snapshots["0"]["sections"]["dashboard"]["profiles"]["default"]["cycles"][CYCLE]["state"]["surveyConstants"] = {
        "hubs": {"fated-conundrum": {"alpha": True, "1-2": False, "3-4": True, "private": {"bad": True}}, "plight-of-the-people": {"1": True}},
        "activeHub": {"itemId": "fated-conundrum", "boxId": "3-4", "private": "ignored"},
    }
    for day, snapshot in snapshots.items():
        write_daily_backup(data_dir, user, CYCLE, day, snapshot, f"20260101T0{day}0000Z-card000{day}")

    # 当前状态故意与所有备份不同，既不能覆盖有备份日，也不能填补缺口日。
    write_campaign_file(data_dir, user, campaign_snapshot(
        day="5", explored=["005"], unlocked=[], card_tracks={
            "story": {"position": 99, "progress": 99, "doom": 99},
            "doom": {"position": 88, "progress": 88, "doom": 88},
        }, card_tracks_version=2, card_counters={"story": 99, "doom": 88},
    ))
    status, payload = client.request("/briefing/api.php")
    assert status == 200 and payload["ok"] is True
    timeline = {entry["day"]: entry for entry in payload["timeline"]}
    assert list(timeline) == ["0", "1", "2", "3", "4", "5"]

    assert timeline["0"]["cardTracks"] == modern_tracks
    assert timeline["0"]["cardTracksVersion"] == 2
    assert timeline["0"]["cardCounters"] is None
    assert timeline["0"]["adventureHubs"] == {
        "checked": {"fated-conundrum": ["alpha", "3-4"], "plight-of-the-people": ["1"]}, "activeHub": "fated-conundrum", "activeBox": "3-4",
    }
    # v1 的 position=0、字符串计数都要原样返回，由客户端按其版本解读。
    assert timeline["1"]["cardTracks"] == legacy_tracks
    assert timeline["1"]["cardTracksVersion"] == 1
    assert timeline["1"]["cardCounters"] is None
    assert timeline["2"]["cardTracks"] is None
    assert timeline["2"]["cardTracksVersion"] is None
    assert timeline["2"]["cardCounters"] == legacy_counters
    assert timeline["3"]["present"] is True
    for field in ("cardTracks", "cardTracksVersion", "cardCounters", "adventureHubs"):
        assert timeline["3"][field] is None
        assert field not in timeline["4"]
    assert timeline["4"]["present"] is False
    assert timeline["5"]["cardTracks"] == {
        "story": {"position": 8, "progress": "9", "doom": 0},
        "doom": {"position": 5},
    }
    assert timeline["5"]["cardTracksVersion"] == 2
    assert timeline["5"]["cardCounters"] == {"story": "10", "doomCount": 11}


@pytest.mark.skipif(shutil.which("node") is None, reason="Android briefing parity needs Node.js")
def test_android_briefing_matches_php_daily_replay(server):
    """Run identical archives through PHP and the Android JS converter."""
    user = "androidbriefing"
    client = Client(server["client"].base)
    status, _ = client.request("/api/campaign-state.php?action=register", method="POST",
                               payload={"username": user, "password": TEST_PASS})
    assert status == 200
    snapshots = [
        campaign_snapshot(day="T1/00", explored=["005"], unlocked=["trireme armor"],
                          current_tile="005", notes="第一条", heroes=["odys"]),
        campaign_snapshot(day="3", explored=["005", "006"], unlocked=["trireme armor", "argo works"],
                          current_tile="006", notes="第一条\n第二条", heroes=["odys", "new"],
                          story_section="主线", story_title="0003", card_tracks={
                              "story": {"position": 1, "progress": 2, "doom": False},
                              "doom": {"position": 2, "private": 99},
                          }, card_tracks_version=2, card_counters={"storyCount": "", "doom": 0}),
    ]
    state = snapshots[1]["sections"]["dashboard"]["profiles"]["default"]["cycles"][CYCLE]["state"]
    state["surveyConstants"] = {"hubs": {"hub": {"1": True, "2": False, "invalid": {}}},
                                "activeHub": {"itemId": "hub", "boxId": "1"}}
    for index, snapshot in enumerate(snapshots):
        day = snapshot["sections"]["dashboard"]["profiles"]["default"]["cycles"][CYCLE]["state"]["day"]
        directory_day = day if "/" not in day else day.replace("/", "-") + "-" + hashlib.sha256(day.encode()).hexdigest()[:8]
        write_daily_backup(server["data_dir"], user, CYCLE,
                           directory_day,
                           snapshot, f"20261009T00000{index}Z")
    current = campaign_snapshot(day="9", explored=["999"], unlocked=["today-only"])
    write_campaign_file(server["data_dir"], user, current)
    status, expected = client.request("/briefing/api.php")
    assert status == 200
    source = {"ok": True, "source": "android-daily-backups", "user": {"id": user},
              "campaign": current, "profileId": "default", "cycleId": CYCLE, "snapshots": snapshots}
    script = """
const fs = require('node:fs');
const vm = require('node:vm');
const { build } = require('./briefing/briefing-local.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('./map/map-data.js', 'utf8'), sandbox);
process.stdout.write(JSON.stringify(build(JSON.parse(fs.readFileSync(0, 'utf8')),
  sandbox.window.ATO_MAP_DATA, JSON.parse(fs.readFileSync('./technology/tech_card_dictionary.min.json', 'utf8')))));
"""
    result = subprocess.run([shutil.which("node"), "-e", script], cwd=ROOT,
                            input=json.dumps(source, ensure_ascii=False), encoding="utf-8",
                            capture_output=True, check=True)
    actual = json.loads(result.stdout)
    # Native storage has no filesystem backupDir; timestamps use the phone's timezone.
    for payload in (actual, expected):
        payload["cycle"].pop("backupDir")
        for entry in payload["timeline"]:
            entry.pop("savedAtLocal", None)
    def compare(left, right, path="payload"):
        if isinstance(left, dict) and isinstance(right, dict):
            assert left.keys() == right.keys(), path
            for key in left:
                compare(left[key], right[key], f"{path}.{key}")
        elif isinstance(left, list) and isinstance(right, list):
            assert len(left) == len(right), path
            for index, (a, b) in enumerate(zip(left, right)):
                compare(a, b, f"{path}[{index}]")
        else:
            assert left == right, f"{path}: Android={left!r}, PHP={right!r}"
    compare(actual, expected)
