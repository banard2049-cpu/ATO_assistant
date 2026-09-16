"""安装目标白名单与备份/回滚安全回归测试（BLOCKER 2 / H3）。

运行（在 asset-studio 目录下）：
    python -m unittest tests.test_install_target_safety -v

覆盖（每条在修复前都会失败）：
1. ``faces.front = "story/data/panel.js"`` 之类的共享资料包不能静默往原项目写脚本：
   ``install_plan`` / ``apply_install`` 必须明确拒绝，项目里不会出现允许素材树之外的
   文件（``assets/*.php``、``story/data/*.js`` 等）；
2. 正常图片目标仍然照旧安装（正面用例，防止修安全问题时把合法安装一起挡掉）；
3. 大小写/结尾点别名指向同一个文件时必须拒绝该安装计划；
4. 回滚不能把用户原图变成中间态：旧实现每个条目一个备份，别名条目会把备份覆盖成
   已经装好的红图，回滚后原图就变成红色（此处注入第三个文件写入失败来复现）。

本文件不使用 ``tempfile``：所有目录都建在 ``asset-studio/.local/tests/`` 下（已被 .gitignore
覆盖），因此不受“沙箱禁止在 0700 目录里创建条目”的影响。
"""
from __future__ import annotations

import json
import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.db import Database
from app.installer import apply_install, install_plan
from app.storage import store_image

import app.installer as installer


ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / ".local" / "tests" / "install-target-safety"

WHITE = (255, 255, 255)
RED = (255, 0, 0)
BLUE = (0, 0, 255)


class InstallTargetSafetyTests(unittest.TestCase):
    def setUp(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)
        self.library = SCRATCH / "library"
        for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
            (self.library / child).mkdir(parents=True, exist_ok=True)
        self.db = Database(self.library / "library.sqlite3")
        self.ato = SCRATCH / "ato"
        for child in ("index.html", "aibp", "map", "story", "technology"):
            if child.endswith(".html"):
                (self.ato / child).parent.mkdir(parents=True, exist_ok=True)
                (self.ato / child).write_text("ATO", encoding="utf-8")
            else:
                (self.ato / child).mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        shutil.rmtree(SCRATCH, ignore_errors=True)

    # ---- 工具方法 -------------------------------------------------------
    def image(self, name: str, color=(180, 40, 40)) -> Path:
        path = self.library / "tmp" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (32, 40), color).save(path)
        return path

    def add_item(self, item_id: str, target: str, name: str, color=(180, 40, 40),
                 order: int = 1) -> dict:
        """登记一个 package 来源的条目：源文件后缀与目标后缀一致时是直接拷贝。"""
        self.db.execute(
            """INSERT INTO catalog_items(id,cycle,module,subgroup,name,number,sort_order,faces_json,capture_required,source_version)
            VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (item_id, "c1", "M", "", item_id, item_id, order,
             json.dumps({"front": target}), 1, "package"),
        )
        return store_image(self.db, self.library, self.image(name, color), item_id, "front",
                           name, "image/png", source="package")

    def write_project_file(self, target: str, color) -> Path:
        path = self.ato / Path(*target.split("/"))
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (32, 40), color).save(path)
        return path

    # ---- 1. 脚本目标必须被拒绝 ------------------------------------------
    def test_script_target_is_refused_and_never_installed(self):
        """共享资料包里的 .js/.php 目标不能悄悄落进原项目。"""
        for index, target in enumerate(("story/data/panel.js", "assets/evil.php"), 1):
            with self.subTest(target=target):
                item_id = f"evil:{index}"
                self.add_item(item_id, target, f"evil-{index}.png", order=index)
                with self.assertRaises(ValueError, msg=f"安装计划竟然接受了 {target}"):
                    install_plan(self.db, self.library, self.ato)
                with self.assertRaises(ValueError, msg=f"安装竟然接受了 {target}"):
                    apply_install(self.db, self.library, self.ato, [])
                self.assertFalse((self.ato / Path(*target.split("/"))).exists(),
                                 f"{target} 被装进了原项目")
        self.assertEqual([], [str(p.relative_to(self.ato)) for p in self.ato.rglob("*.js")],
                         "原项目里出现了脚本文件")
        self.assertEqual([], [str(p.relative_to(self.ato)) for p in self.ato.rglob("*.php")],
                         "原项目里出现了 PHP 文件")

    # ---- 2. 正常图片目标照旧 --------------------------------------------
    def test_normal_image_target_still_installs(self):
        """正面用例：合法图片目标仍然能预览、安装，并且第二次预览判定为相同。"""
        target = "assets/test/001-front.jpg"
        self.add_item("c1:test:001", target, "001-front.jpg")
        plan = install_plan(self.db, self.library, self.ato)
        self.assertEqual(1, plan["summary"]["add"])
        self.assertEqual([target], [entry["target"] for entry in plan["files"]])
        self.assertEqual(1, apply_install(self.db, self.library, self.ato, [])["installed"])
        installed = self.ato / Path(*target.split("/"))
        self.assertTrue(installed.is_file(), "合法图片目标没有被安装")
        revision = self.db.one("SELECT original_path FROM asset_revisions WHERE item_id=?",
                               ("c1:test:001",))
        self.assertEqual((self.library / revision["original_path"]).read_bytes(), installed.read_bytes())
        self.assertEqual(1, install_plan(self.db, self.library, self.ato)["summary"]["same"])

    # ---- 3. 别名目标必须被拒绝 ------------------------------------------
    def test_aliased_targets_are_rejected_by_the_plan(self):
        """大小写别名在 Windows 上是同一个文件：计划阶段就要拒绝。"""
        self.add_item("alias:1", "assets/alias.png", "alias-one.png", RED, order=1)
        self.add_item("alias:2", "assets/Alias.PNG", "alias-two.png", BLUE, order=2)
        with self.assertRaises(ValueError) as ctx:
            install_plan(self.db, self.library, self.ato)
        self.assertIn("冲突", str(ctx.exception))

    # ---- 4. 回滚不能破坏用户原图 ----------------------------------------
    def test_rollback_cannot_turn_the_original_into_an_intermediate_image(self):
        """白原图 + 两个别名条目 + 第三个文件写入失败 → 回滚后原图必须还是白色。"""
        original = self.write_project_file("assets/alias.png", WHITE)
        white_bytes = original.read_bytes()
        self.add_item("alias:1", "assets/alias.png", "alias-one.png", RED, order=1)
        self.add_item("alias:2", "assets/Alias.PNG", "alias-two.png", BLUE, order=2)
        self.add_item("third:1", "assets/third.png", "third.png", (10, 10, 10), order=3)

        real_copy2 = shutil.copy2

        def failing_copy2(source, destination, *args, **kwargs):
            # 第三个条目（含它的备份）写入失败，触发旧实现的回滚
            if "third" in Path(destination).name:
                raise OSError("模拟第三个文件写入失败")
            return real_copy2(source, destination, *args, **kwargs)

        with patch.object(installer.shutil, "copy2", failing_copy2):
            try:
                apply_install(self.db, self.library, self.ato,
                              ["assets/alias.png", "assets/Alias.PNG", "assets/third.png"])
            except Exception:  # 计划拒绝或中途失败都算预期
                pass
        self.assertEqual(white_bytes, original.read_bytes(),
                         "回滚把用户原图写成了中间态（别名条目覆盖了同一个备份文件）")
        self.assertEqual([], [p.name for p in self.ato.rglob(".*ato-studio.tmp*")],
                         "失败后项目里留下了临时文件")


if __name__ == "__main__":
    unittest.main()
