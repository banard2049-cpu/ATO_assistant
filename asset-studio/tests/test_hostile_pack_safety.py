"""敌意 .atopack 的路径与哈希安全回归测试（BLOCKER 1 / H5 / M6）。

运行（在 asset-studio 目录下）：
    python -m unittest tests.test_hostile_pack_safety -v

覆盖（每条在修复前都会失败）：
1. ``items[].faces`` 里的越界/怪异目标（``..\\..\\chain-escape\\pwn.js``、``C:evil.js``、
   ``\\\\srv\\share\\x.png``、``assets/x.png.``）在导入阶段就被拒绝，清单不会被污染；
2. 即使清单已经被污染（旧版本导入过的库），``export_compat`` 也不会把渲染文件写到
   渲染临时目录之外 —— 用可控的固定渲染目录复现原来那条越界写入链；
2b. 第二层防线独立成立：``faces = ".."``（``PurePosixPath("..").name`` 仍是 ``".."``）以及
   带盘符/UNC 的写法，即使清单校验被绕过，也不能让渲染路径落到渲染目录之外，
   压缩包成员名也不能跑出资料包；
3. 内置清单（2776 条 / 4298 个目标）里的合法目标仍然全部导出、安装 —— 防止修安全
   问题时把正常素材一起挡掉；
4. 成员字节与 manifest 声明的 sha256 不符时必须导入失败（否则会静默指向库里另一张图）；
5. 失败的导入不留 library/tmp 临时文件，也不改清单。

受限环境说明：``mkdtemp`` 建的目录是 0700，个别沙箱不允许在这种目录里创建条目，
所以模块导入时探测一次，必要时把 ``tempfile.mkdtemp`` 换成 0777 版本；这只发生在
测试进程里，正常环境探测通过、不做任何替换。（生产代码不做任何妥协。）
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path, PurePosixPath
from unittest.mock import patch

from PIL import Image

import app.packages as packages
from app.db import Database
from app.fixed_catalog import ensure_fixed_catalog
from app.installer import apply_install, install_plan
from app.packages import export_compat, export_package, import_package, safe_member
from app.storage import store_image


ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / ".local" / "tests" / "hostile-pack-safety"

# 导入必须拒绝的四种写法；前两种会逃出项目树，第三种是 UNC，第四种是结尾的点。
HOSTILE_TARGETS = (
    r"..\..\chain-escape\pwn.js",
    "C:evil.js",
    r"\\srv\share\x.png",
    "assets/x.png.",
)
# 导出侧复现越界写入链时使用的目标：都只会落在本测试可控的 SCRATCH 里面。
ESCAPE_TARGETS = (
    r"..\..\chain-escape\pwn.js",
    r"..\..\render-escape\escaped.png",
)


def _mkdtemp_0777(suffix: str | None = None, prefix: str | None = None, dir: str | None = None) -> str:
    suffix = suffix or ""
    prefix = prefix or "tmp"
    directory = dir or tempfile.gettempdir()
    for _ in range(10000):
        name = os.path.join(directory, prefix + next(tempfile._get_candidate_names()) + suffix)
        try:
            os.mkdir(name, 0o777)
        except FileExistsError:
            continue
        return name
    raise FileExistsError("无法创建临时目录")


def _relax_tempdirs_when_the_sandbox_forbids_0700_dirs() -> None:
    """探测沙箱是否禁止在 0700 目录里创建条目；是则只在本进程内换成 0777 版本。"""
    probe = tempfile.mkdtemp()
    try:
        (Path(probe) / "probe").write_text("x", encoding="utf-8")
    except OSError:
        tempfile.mkdtemp = _mkdtemp_0777
    finally:
        shutil.rmtree(probe, ignore_errors=True)


_relax_tempdirs_when_the_sandbox_forbids_0700_dirs()


class _FixedTempDir:
    """把 TemporaryDirectory 固定到已知目录，方便断言渲染文件有没有越界。"""

    def __init__(self, path: Path) -> None:
        self.path = path

    def __enter__(self) -> str:
        self.path.mkdir(parents=True, exist_ok=True)
        return str(self.path)

    def __exit__(self, *exc_info) -> bool:
        return False


class HostilePackSafetyTests(unittest.TestCase):
    def setUp(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)
        self.library = SCRATCH / "library"
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (self.library / child).mkdir(parents=True, exist_ok=True)
        self.db = Database(self.library / "library.sqlite3")
        self.ato = SCRATCH / "ato"
        (self.ato / "story/data").mkdir(parents=True, exist_ok=True)
        (self.ato / "index.html").write_text("ATO", encoding="utf-8")
        for child in ("aibp", "map", "story", "technology"):
            (self.ato / child).mkdir(exist_ok=True)

    def tearDown(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)

    # ---- 工具方法 -------------------------------------------------------
    def image(self, name: str = "photo.png", color=(180, 40, 40)) -> Path:
        path = self.library / "tmp" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (64, 80), color).save(path)
        return path

    def item(self, item_id: str, target: str, order: int = 1) -> dict:
        return {
            "id": item_id, "cycle": "c1", "module": "M", "subgroup": "",
            "name": item_id, "number": item_id, "sort_order": order,
            "faces": {"front": target},
        }

    def insert_item(self, item_id: str, target: str, order: int = 1) -> None:
        """直接写库：模拟旧版本已经导入过带怪异目标的清单。"""
        self.db.execute(
            """INSERT INTO catalog_items(id,cycle,module,subgroup,name,number,sort_order,faces_json,capture_required,source_version)
            VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (item_id, "c1", "M", "", item_id, item_id, order,
             json.dumps({"front": target}), 1, "package"),
        )

    def pack(self, name: str, items: list[dict], assets: list[dict],
             members: dict[str, bytes] | None = None) -> Path:
        path = SCRATCH / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for member, payload in (members or {}).items():
                archive.writestr(member, payload)
            archive.writestr("manifest.json", json.dumps(
                {"format": "ato-asset-pack", "version": 3, "items": items, "assets": assets},
                ensure_ascii=False,
            ))
        return path

    def catalog_targets(self) -> list[str]:
        return [
            target
            for row in self.db.all("SELECT faces_json FROM catalog_items")
            for target in json.loads(row["faces_json"]).values()
        ]

    # ---- 1. 导入侧 ------------------------------------------------------
    def test_hostile_pack_is_refused_on_import(self):
        """恶意 faces 目标必须在导入阶段失败，清单不能被污染。"""
        for index, target in enumerate(HOSTILE_TARGETS, 1):
            with self.subTest(target=target):
                pack = self.pack(f"hostile-{index}.atopack",
                                 items=[self.item(f"evil:{index}", target)],
                                 assets=[],
                                 members={target: self.image(f"member-{index}.png").read_bytes()})
                with self.assertRaises(ValueError, msg=f"导入竟然接受了目标 {target!r}"):
                    import_package(self.db, self.library, pack)
                self.assertNotIn(target, json.dumps(self.catalog_targets(), ensure_ascii=False),
                                 "清单里仍然带着被拒绝的目标")
                self.assertEqual([], self.db.all("SELECT id FROM catalog_items"))
                self.assertFalse((SCRATCH / "chain-escape").exists(), "越界目录被创建了")
                self.assertFalse(list(SCRATCH.rglob("pwn.js")), "越界文件被写出来了")
                self.assertEqual([], [p.name for p in (self.library / "tmp").glob("package-*")],
                                 "失败的导入留下了临时文件")

    def test_safe_member_rejects_windows_escape_spellings(self):
        """路径校验器本身：所有会在 Windows 上被解释成别的文件的写法都要拒绝。"""
        for target in (*HOSTILE_TARGETS, "assets/x.png ", "assets/con.png", "assets/./x.png",
                       "../x.png", "/etc/passwd", "assets//x.png", 'assets/x|y.png'):
            with self.subTest(target=target):
                with self.assertRaises(ValueError):
                    safe_member(target)
        self.assertEqual("assets/exploration-cards/c1/1.jpg",
                         str(safe_member("assets/exploration-cards/c1/1.jpg")))

    # ---- 2. 导出侧（越界写入链）----------------------------------------
    def test_export_compat_never_writes_outside_the_render_dir(self):
        """清单被污染时，export_compat 必须失败且不把渲染文件写到渲染目录之外。"""
        for order, target in enumerate(ESCAPE_TARGETS, 1):
            item_id = f"evil:{order}"
            self.insert_item(item_id, target, order)
            store_image(self.db, self.library, self.image(f"source-{order}.png"),
                        item_id, "front", f"source-{order}.png", "image/png")
        # 渲染目录固定成 SCRATCH/render/inner：上两级就是 SCRATCH，
        # 旧的 `Path(temp_dir) / PurePosixPath(target).name` 会落到 SCRATCH/chain-escape/。
        render = SCRATCH / "render" / "inner"
        destination = self.library / "exports" / "compat.zip"
        error: Exception | None = None
        with patch("app.packages.tempfile.TemporaryDirectory", lambda *a, **k: _FixedTempDir(render)):
            try:
                export_compat(self.db, self.library, destination,
                              {"include_stories": False, "include_bgm": False})
            except Exception as exc:  # 这里就是要看它有没有报错
                error = exc
        self.assertIsNotNone(error, "被污染的 faces 目标必须让 export_compat 失败")
        self.assertIsInstance(error, ValueError, f"应当是清晰的 ValueError，实际是 {error!r}")
        self.assertFalse((SCRATCH / "chain-escape" / "pwn.js").exists(),
                         "渲染文件逃出了临时目录（chain-escape/pwn.js）")
        self.assertFalse((SCRATCH / "render-escape").exists(),
                         "渲染文件逃出了临时目录（render-escape/）")
        left_over = sorted(p.name for p in render.rglob("*")) if render.exists() else []
        self.assertEqual([], left_over, "渲染目录里不应该留下文件")

    # ---- 2b. 第二层（渲染文件名 / 成员名）独立成立 ----------------------
    def test_render_name_layer_rejects_parent_directory_and_drive_targets(self):
        """名字层必须挡住 `..` / `.` / 空名 / 盘符相对与 UNC 写法。

        ``PurePosixPath("..").name`` 就是 ``".."``（不是空串），所以这一层必须显式排除；
        带盘符的 ``C:evil.png`` 会被平台路径解析成盘符相对路径（``Path(...).name`` 只剩
        ``evil.png``），也要在这一层拦掉。
        """
        for target in ("", ".", "..", "assets/..", r"a\..\..\x.png", "C:evil.png",
                       "D:evil.png", "//srv/share/x.png", "/etc/passwd",
                       "assets/../../evil.png", "assets//x.png", "assets/./x.png",
                       r"\\srv\share\x.png"):
            with self.subTest(target=target):
                with self.assertRaises(ValueError, msg=f"名字层放过了 {target!r}"):
                    packages._safe_render_names(target)
        render_root = SCRATCH / "layer2-render"
        normalised_root = Path(os.path.normpath(render_root))
        for target in (*HOSTILE_TARGETS, "assets/x.png.", "assets/exploration-cards/c1/1.jpg",
                       "story/images/battles/c2/battle.png", "assets/bgm/track.mp3"):
            with self.subTest(target=target):
                try:
                    leaf, member = packages._safe_render_names(target)
                except ValueError:
                    continue  # (i) 这一层直接拒绝
                # (ii) 没有拒绝时：渲染路径必须是渲染目录的直接子项，成员名必须留在包里
                rendered = Path(os.path.normpath(render_root / leaf))
                self.assertEqual(normalised_root, rendered.parent, f"渲染路径越界：{rendered}")
                self.assertFalse(member.is_absolute(), f"成员名是绝对路径：{member}")
                self.assertNotIn("..", member.parts, f"成员名跑出资料包：{member}")
                self.assertEqual(leaf, member.name)

    def test_export_compat_layer_two_stops_a_parent_directory_target(self):
        """清单校验被绕过时，faces = ".." 也不能让 export_compat 写到渲染目录之外。"""
        self.insert_item("layer2:1", "..")
        store_image(self.db, self.library, self.image("layer2-source.png"),
                    "layer2:1", "front", "layer2-source.png", "image/png")
        render = SCRATCH / "layer2-render" / "inner"
        destination = self.library / "exports" / "layer2.zip"
        error: Exception | None = None
        # 把第一层（safe_member）换成恒等函数，单独考察第二层
        with patch("app.packages.safe_member", lambda name, *a, **k: PurePosixPath(str(name))), \
                patch("app.packages.tempfile.TemporaryDirectory", lambda *a, **k: _FixedTempDir(render)):
            try:
                export_compat(self.db, self.library, destination,
                              {"include_stories": False, "include_bgm": False})
            except Exception as exc:  # 这里就是要看它有没有报错
                error = exc
        # 先断言安全不变式（越界写入），这样将来出现回归时错误信息直接指出逃出来的文件
        root = SCRATCH / "layer2-render"
        stray = sorted(str(p.relative_to(SCRATCH)) for p in root.rglob("*") if p.is_file()) if root.exists() else []
        self.assertEqual([], stray, f"渲染目录之外出现了文件：{stray}")
        self.assertIsNotNone(error, "faces='..' 竟然让 export_compat 成功了")
        self.assertIsInstance(error, ValueError, f"应当是清晰的 ValueError，实际是 {error!r}")

    # ---- 3. 内置清单：不能过度封锁 --------------------------------------
    def test_builtin_catalog_targets_still_export_and_install(self):
        """内置清单的合法目标必须照旧通过校验、导出、安装。"""
        ensure_fixed_catalog(self.db)
        rows = self.db.all("SELECT id,faces_json FROM catalog_items")
        self.assertEqual(2776, len(rows))
        targets = [target for row in rows for target in json.loads(row["faces_json"]).values()]
        self.assertEqual(4298, len(targets))
        rejected = []
        for target in targets:
            try:
                safe_member(target)
            except ValueError as exc:  # pragma: no cover - 失败时下面会断言
                rejected.append((target, str(exc)))
        self.assertEqual([], rejected, "内置清单里的合法目标被路径校验挡掉了")

        # 每棵素材树抽样一个真实图片目标，跑通导出与安装。
        samples: dict[str, tuple[str, str, str]] = {}
        for item_id, face, target in (
            (row["id"], face, target)
            for row in rows
            for face, target in json.loads(row["faces_json"]).items()
        ):
            tree = target.split("/")[0]
            if tree not in samples and target.lower().endswith((".png", ".jpg")):
                samples[tree] = (item_id, face, target)
        self.assertEqual(8, len(samples), f"抽样没有覆盖全部素材树：{sorted(samples)}")
        for item_id, face, target in samples.values():
            store_image(self.db, self.library, self.image(f"sample{Path(target).suffix}"),
                        item_id, face, Path(target).name,
                        "image/png" if target.lower().endswith(".png") else "image/jpeg")

        pack = self.library / "exports" / "builtin.atopack"
        exported = export_package(self.db, self.library, pack)
        self.assertEqual(len(samples), exported["assets"])
        with zipfile.ZipFile(pack) as archive:
            members = set(archive.namelist())
        compat = self.library / "exports" / "builtin-compat.zip"
        escaped = export_compat(self.db, self.library, compat,
                                {"include_stories": False, "include_bgm": False})
        self.assertEqual(len(samples), escaped["files"])
        with zipfile.ZipFile(compat) as archive:
            compat_members = set(archive.namelist())
        for _, _, target in samples.values():
            self.assertIn(target, members, "合法目标没能进 .atopack")
            self.assertIn(target, compat_members, "合法目标没能进兼容 ZIP")

        plan = install_plan(self.db, self.library, self.ato)
        planned = {entry["target"] for entry in plan["files"]}
        for _, _, target in samples.values():
            self.assertIn(target, planned, "合法目标被安装计划挡掉了")
        self.assertEqual(len(samples), plan["summary"]["add"])
        installed = apply_install(self.db, self.library, self.ato, [])
        self.assertEqual(len(samples), installed["installed"])
        for _, _, target in samples.values():
            self.assertTrue((self.ato / Path(*target.split("/"))).is_file(), f"没有安装 {target}")
        self.assertEqual(len(samples), install_plan(self.db, self.library, self.ato)["summary"]["same"])

    # ---- 4. 哈希谎言 ----------------------------------------------------
    def test_import_verifies_the_manifest_hash(self):
        """成员字节与声明的 sha256 不符时必须失败，不能静默指向库里另一张图。"""
        self.insert_item("a:1", "assets/a.png")
        existing = store_image(self.db, self.library, self.image("existing.png", (10, 200, 10)),
                               "a:1", "front", "existing.png", "image/png")
        forged = b"this is not the image the manifest claims"
        pack = self.pack("hash-lie.atopack",
                         items=[self.item("b:1", "assets/b.png")],
                         assets=[{"itemId": "b:1", "face": "front", "sha256": existing["sha256"],
                                  "member": "assets/b.png", "mimeType": "image/png",
                                  "originalName": "b.png"}],
                         members={"assets/b.png": forged})
        with self.assertRaises(ValueError):
            import_package(self.db, self.library, pack)
        self.assertIsNone(self.db.one("SELECT id FROM catalog_items WHERE id='b:1'"),
                          "哈希不符的资料包改动了清单")
        self.assertIsNone(self.db.one("SELECT id FROM asset_revisions WHERE item_id='b:1'"),
                          "哈希不符的成员被当成了已有图片")
        self.assertEqual(1, self.db.one("SELECT COUNT(*) n FROM asset_revisions")["n"])

    # ---- 5. 失败导入的副作用 -------------------------------------------
    def test_failed_import_leaves_no_temp_file_and_no_catalog_change(self):
        """资源引用了清单没有的面：导入失败，且不留临时文件、不改清单。"""
        payload = self.image("payload.png").read_bytes()
        pack = self.pack("bad-reference.atopack",
                         items=[self.item("new:1", "assets/n.png")],
                         assets=[{"itemId": "new:1", "face": "back",
                                  "sha256": hashlib.sha256(payload).hexdigest(),
                                  "member": "assets/n.png", "mimeType": "image/png",
                                  "originalName": "n.png"}],
                         members={"assets/n.png": payload})
        with self.assertRaises(ValueError):
            import_package(self.db, self.library, pack)
        self.assertEqual(0, self.db.one("SELECT COUNT(*) n FROM catalog_items")["n"],
                         "失败的导入已经写进了清单条目")
        self.assertEqual([], [p.name for p in (self.library / "tmp").glob("package-*")],
                         "失败的导入留下了 library/tmp 临时文件")


if __name__ == "__main__":
    unittest.main()
