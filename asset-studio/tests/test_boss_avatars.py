"""记录表「敌人」面板 Boss 头像的清单登记。

头像 PNG 是本地私有素材（/record/assets/ 在 .gitignore 里），不进版本库，
所以清单必须按固定名单登记：少一条资料包就少一张头像，多登记一条打包器会报缺图。
"""
from __future__ import annotations

import unittest

from app.catalog import BOSS_AVATAR_FILES, BOSS_AVATAR_LABELS, component_display_name
from app.fixed_catalog import fixed_catalog_payload


class BossAvatarCatalogTests(unittest.TestCase):
    def test_every_boss_avatar_is_registered_once_under_the_record_module(self):
        payload = fixed_catalog_payload()
        items = [item for item in payload["items"] if item["module"] == "记录表图标"]
        self.assertEqual(19, len(items))
        self.assertEqual(sorted(BOSS_AVATAR_FILES), sorted(item["number"] for item in items))
        self.assertEqual(len({item["id"] for item in items}), 19)
        self.assertEqual(len({item["faces"]["front"] for item in items}), 19)
        self.assertTrue(all(item["cycle"] == "common" for item in items))
        self.assertTrue(all(item["subgroup"] == "Boss 头像" for item in items))
        self.assertTrue(all(item["capture_required"] is False for item in items),
                        "头像不是实体卡，素材库不该提示去拍它")
        for item in items:
            self.assertEqual(f"record/assets/boss-avatars/{item['number']}.png",
                             item["faces"]["front"])
            self.assertEqual(BOSS_AVATAR_LABELS[item["number"]], item["name"])

    def test_catalog_version_changes_so_existing_libraries_pick_the_new_items_up(self):
        payload = fixed_catalog_payload()
        self.assertIn("+record-boss-avatars-20261022", payload["source"]["catalog_version"])

    def test_display_names_cover_known_stems_and_fall_back_for_unknown_ones(self):
        self.assertEqual("Boss 头像：百臂巨人 / Hekaton",
                         component_display_name("record/assets/boss-avatars/HEKATON.png"))
        self.assertEqual("Boss 头像（NEW_BOSS）",
                         component_display_name("record/assets/boss-avatars/NEW_BOSS.png"))


if __name__ == "__main__":
    unittest.main()
