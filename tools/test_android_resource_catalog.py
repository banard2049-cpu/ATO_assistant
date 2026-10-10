"""Check the Android import allowlist, optionally inside a built APK.

Run: python tools/test_android_resource_catalog.py [path/to/app.apk]
"""
from __future__ import annotations

import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

from export_android import asset_studio_catalog

ROOT = Path(__file__).resolve().parents[1]


def exploration_requirements(source: str) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """Read both dashboard catalogs so every visible and hidden card is checked."""
    catalogs = []
    for name in ("explorationDecks", "hiddenExplorationCards"):
        block = re.search(rf"const {name} = \{{([\s\S]*?)\n    \}};", source)
        assert block, f"{name} not found; update this coverage check."
        headings = list(re.finditer(r"^      (c\d+):\s*\[", block[1], re.MULTILINE))
        assert {heading[1] for heading in headings} == {"c1", "c2", "c3", "c4", "c5"}
        assert len(headings) == 5, f"Duplicate cycle in {name}"
        cycles = {}
        for index, heading in enumerate(headings):
            end = headings[index + 1].start() if index + 1 < len(headings) else len(block[1])
            # Deck identifiers are words; physical card identifiers are numbers.
            body = block[1][heading.end():end]
            ids = re.findall(r'\bid:\s*"(\d+)"', body)
            generated = list(re.finditer(
                r"cards:\s*Array\.from\(\{\s*length:\s*(\d+)\s*\},\s*"
                r"\(_,\s*index\)\s*=>\s*\{\s*const id = String\((\d+)\s*\+\s*index\);",
                body,
            ))
            assert len(generated) == len(re.findall(r"cards:\s*Array\.from", body)), (
                f"Unrecognized generated cards in {name}.{heading[1]}; update this coverage check."
            )
            for group in generated:
                start, count = int(group[2]), int(group[1])
                ids.extend(str(start + offset) for offset in range(count))
            if name == "explorationDecks":
                assert ids, f"No ordinary cards found in {heading[1]}; update this coverage check."
            assert len(ids) == len(set(ids)), f"Duplicate card in {name}.{heading[1]}"
            cycles[heading[1]] = set(ids)
        catalogs.append(cycles)
    return catalogs[0], catalogs[1]


def check_exploration_catalog(targets: dict, source: str) -> tuple[int, int]:
    regular, hidden = exploration_requirements(source)
    for cycle in regular:
        assert not regular[cycle] & hidden[cycle], f"Hidden card is already in {cycle}'s ordinary decks"
        for card_id in regular[cycle] | hidden[cycle]:
            key = (f"{cycle}:exploration:cards:{card_id}", "front")
            expected = f"assets/exploration-cards/{cycle}/{card_id}.png"
            assert targets.get(key) == expected, f"Android import catalog missing/mismatched: {key}"
    return sum(map(len, regular.values())), sum(map(len, hidden.values()))


def check_catalog(catalog: dict) -> None:
    sys.path.insert(0, str(ROOT / "asset-studio"))
    assert catalog["format"] == "ato-android-resource-catalog"
    targets = {}
    for item in catalog["items"]:
        for face, target in item["faces"].items():
            key = (item["id"], face)
            assert key not in targets, f"Duplicate Android catalog entry: {key}"
            targets[key] = target

    template_targets = [target for target in targets.values()
                        if target == "aibp/ps/other/trait/custom_trait_blank.jpg"]
    assert len(template_targets) == 1, "APK lacks the custom trait template import mapping"
    from app.fixed_catalog import BOSS_LEVEL_BACK_CARDS
    expected = {f"aibp/ps/{enemy}/{stem}.jpg" for enemy, stem in BOSS_LEVEL_BACK_CARDS}
    expected.add("aibp/ps/other/trait/custom_trait_blank.png")
    assert expected <= set(targets.values()), "APK lacks newly registered Boss/trait assets"
    assert "aibp/ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_TR_IV_001.jpg" not in targets.values(), (
        "APK still requests the retired Oracle TR IV card"
    )
    assert "aibp/ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_TR_V_001.jpg" in targets.values(), (
        "APK must retain the Oracle TR V panel"
    )
    assert not any(target.startswith("aibp/ps/other/status/") for target in targets.values()), (
        "APK still requests retired C4/C5 status cards"
    )
    assert not any(target.startswith("technology/images/tech_tree_pages/")
                   for target in targets.values()), "APK still requests obsolete technology tree backgrounds"
    assert any(target.startswith("technology/images/titans/") for target in targets.values())
    assert any(target.startswith("technology/images/gear_cards/") for target in targets.values())

    # story/images/battles/ 整批退场：C1/C3/C4 的 21 张战斗版图本轮随目录删除，C2 的 23 张
    # 扫描件与 C5 的 8 张版图块更早退场，C5 的 153-173 补充页扫描也已在上一轮删除。有了同一
    # 份 .atopack 里的混排映射表与裁图，正文走行内混排、底部版图会被去重，这批登记没有再存在
    # 的理由。APK 名单是安卓导入的白名单，留着就会在资料包缺图时导出/导入失败。
    retired = [target for target in targets.values() if target.startswith((
        "story/images/battles/",
        "story/images/c5/supplement-pages/",
    ))]
    assert not retired, f"APK 名单里仍留着已删除的故事书扫描件：{retired[:3]}"

    # 混合媒体素材（story/assets/mixed-media/）：mapping.js 一份 + images/c1..c5/ 下
    # 434 张裁图（渲染器 pathOK 同时收 PNG 与 SVG）。它们是私有素材，只随 .atopack 的
    # mixedMediaFiles 段分发，但安卓导入只认这份名单 —— 缺一项，资料包里对应的混排图
    # 就会被静默跳过。目标形状与 app/mixed_media_resources.py 的 allowed_target 同源。
    from app.mixed_media_resources import allowed_target as is_mixed_media_target

    mixed_media = sorted(
        target for target in targets.values() if target.startswith("story/assets/mixed-media/")
    )
    assert len(mixed_media) == 435, f"APK 名单里的混合媒体素材不是 435 个：{len(mixed_media)}"
    assert sum(1 for target in mixed_media if target.endswith("/mapping.js")) == 1
    assert sum(1 for target in mixed_media if "/images/" in target) == 434
    assert all(is_mixed_media_target(target) for target in mixed_media), (
        "APK 名单里有 app.mixed_media_resources 不认的混合媒体目标"
    )
    assert all(re.fullmatch(
        r"story/assets/mixed-media/(?:mapping\.js|images/c[1-5]/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|svg))",
        target,
    ) for target in mixed_media), "混合媒体目标路径不合规"
    # renderer.js / styles.css 是随源码发布的程序代码（打包规则把整个目录留给资料包通道，
    # 但这两个文件走程序包），一个都不该出现在名单里。
    assert not any(target.endswith(("/renderer.js", "/styles.css")) for target in mixed_media)

    # 磁盘同步：干净检出里没有 story/assets/mixed-media/（.gitignore 忽略私有素材），
    # 所以只在它存在时核对 —— 本地新加一张裁图却忘了补登记，这条会立刻报出来。
    images_dir = ROOT / "story/assets/mixed-media/images"
    if images_dir.is_dir():
        on_disk = sorted(
            target for target in (
                f"story/assets/mixed-media/images/{cycle.name}/{path.name}"
                for cycle in images_dir.iterdir() if cycle.is_dir()
                for path in cycle.iterdir() if path.is_file()
            ) if is_mixed_media_target(target)
        )
        registered = {target for target in mixed_media if "/images/" in target}
        assert registered == set(on_disk), (
            "混合媒体裁图名单与磁盘不一致："
            f"漏登记 {sorted(set(on_disk) - registered)[:3]} / "
            f"多登记 {sorted(registered - set(on_disk))[:3]}"
        )

    # 密语字形（巴别语／塞壬语，story/assets/cryptic/glyphs/*.png）：字形本身不进版本库，
    # 只在本地由 .atopack 的 crypticFiles 段分发，但 APK 名单必须一直引用它们——名单缺项
    # 的话，安卓会把资料包里的字形整段静默跳过。名单来自随源码发布的 glyph-catalog.js，
    # 所以在只有路径名单、没有 PNG 的干净检出里同样成立。
    glyph_targets = sorted(
        target for item in catalog["items"] if item["id"].startswith("common:")
        for target in item["faces"].values()
        if target.startswith("story/assets/cryptic/glyphs/")
    )
    assert len(glyph_targets) == 84, f"APK 名单里的密语字形不是 84 个：{len(glyph_targets)}"
    assert sum(1 for target in glyph_targets if "/babelian-" in target) == 58
    assert sum(1 for target in glyph_targets if "/siren-" in target) == 26
    assert all(re.fullmatch(r"story/assets/cryptic/glyphs/[A-Za-z0-9][A-Za-z0-9._-]*\.png", target)
               for target in glyph_targets), "密语字形目标路径不合规"

    source = (ROOT / "index.html").read_text(encoding="utf-8")
    regular_count, hidden_count = check_exploration_catalog(targets, source)
    assert regular_count >= 200, "Exploration coverage unexpectedly lost ordinary decks."
    assert hidden_count, "No hidden exploration entries checked."
    declared = json.loads((ROOT / "aibp/ps/other/3b6e9d20/catalog.json").read_text(encoding="utf-8"))["targets"]
    assert declared, "Supplemental resource list is empty"
    binaries = {path.relative_to(ROOT / "aibp/ps/other").as_posix()
                for path in (ROOT / "aibp/ps/other/3b6e9d20").glob("*.bin")}
    if binaries:
        assert binaries == set(declared), "Declared binary import targets differ from local assets"
    # 模拟 GitHub 的干净检出：只有路径名单，没有任何 .bin 文件。
    from app.fixed_catalog import collect_supplemental_resources
    with tempfile.TemporaryDirectory(dir=ROOT) as directory:
        checkout = Path(directory)
        manifest = checkout / "aibp/ps/other/3b6e9d20/catalog.json"
        manifest.parent.mkdir(parents=True)
        manifest.write_text(json.dumps({"version": 1, "targets": declared}), encoding="utf-8")
        items, paths = collect_supplemental_resources(checkout)
        assert paths == {f"aibp/ps/other/{path}" for path in declared}
        for item in items:
            assert targets.get((item.id, "front")) == item.faces["front"], "APK lacks binary import mapping"
    print(f"Android resource catalog passed: {len(targets)} mappings, "
          f"{regular_count} ordinary and {hidden_count} hidden exploration entries.")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with zipfile.ZipFile(sys.argv[1]) as apk:
            check_catalog(json.loads(apk.read("assets/atopack-catalog.json")))
    else:
        check_catalog(asset_studio_catalog())
