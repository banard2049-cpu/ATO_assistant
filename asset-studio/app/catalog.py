from __future__ import annotations

import hashlib
import json
import re
import zipfile
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import PurePosixPath
from typing import Any, Iterable

from .db import Database
from .fixed_resources import RESOURCE_LABELS


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
WEB_PREFIX = "assets/web/"
DERIVED_MARKERS = ("-duplicate", "-partial", "contact", "_contact")
AIBP_CYCLES = {
    "HEKATON": "c1", "LABYRINTHAUROS": "c1", "HERMESIAN_PURSUER": "c1", "ALPHA_TEMENOS": "c1",
    "CHIMERA_METASTASIOS": "c2", "CYCLONUS": "c2", "THE_BURDEN": "c2+c3", "THE_NIETZSCJEAN": "c2",
    "HYPERTIME_ORACLE": "c3", "ICARIAN_HARPY": "c3", "SUN_DESCENDANT": "c3",
    "MIDASCORE": "c4", "DEMIDJINN": "c4", "THE_BABELIAN_LUNACY": "c4", "DAHAKA": "c4",
    "DRAGON_OF_PHOBOS": "c5", "MEDUKETOS": "c5", "UR_FLEECE": "c5", "TITAN_X": "c5",
}
AIBP_NAMES = {
    "HEKATON": "百臂巨人 / Hekaton",
    "LABYRINTHAUROS": "迷宫机牛 / Labyrinthauros",
    "HERMESIAN_PURSUER": "赫尔墨斯追踪者 / Hermesian Pursuer",
    "ALPHA_TEMENOS": "阿尔法圣域 / Alpha Temenos",
    "CHIMERA_METASTASIOS": "蠕变奇美拉 / Chimera Metastasios",
    "CYCLONUS": "独眼巨人 / Cyclonus",
    "THE_BURDEN": "重担 / The Burden",
    "THE_NIETZSCJEAN": "尼采超人 / The Nietzschean",
    "HYPERTIME_ORACLE": "超时神谕 / Hypertime Oracle",
    "ICARIAN_HARPY": "伊卡洛斯鹰身女妖 / Icarian Harpy",
    "SUN_DESCENDANT": "太阳后裔 / Sun Descendant",
    "MIDASCORE": "迈达狮 / Midascore",
    "DEMIDJINN": "半神迪精 / Demidjinn",
    "THE_BABELIAN_LUNACY": "巴比伦疯塔 / The Babelian Lunacy",
    "DAHAKA": "达哈卡 / Dahaka",
    "DRAGON_OF_PHOBOS": "深海惧龙 / Dragon of Phobos",
    "MEDUKETOS": "须目塞特斯 / Meduketos",
    "UR_FLEECE": "乌尔-弗里斯 / Ur-Fleece",
    "TITAN_X": "泰坦 X / Titan X",
}
GEAR_CYCLES = {"A": "c1", "B": "c2", "C": "c3", "D": "c4", "E": "c5"}
HERO_RECORD_ICONS = {
    "skill_courage.png": ("技能图标：勇气", "技能图标"),
    "skill_wisdom.png": ("技能图标：智慧", "技能图标"),
    "skill_will.png": ("技能图标：意志", "技能图标"),
    "skill_endurance.png": ("技能图标：耐力", "技能图标"),
    "skill_cunning.png": ("技能图标：狡黠", "技能图标"),
    "skill_fury.png": ("技能图标：力量", "技能图标"),
    "tri_rage.png": ("三相图标：怒气", "三相图标"),
    "tri_fate.png": ("三相图标：命运", "三相图标"),
    "tri_danger.png": ("三相图标：危险", "三相图标"),
    "reset_triskelion_F4F4F4.png": ("三相重置图标", "三相图标"),
    "ico_most_likely.png": ("最大似然图标", "判定图标"),
    "ico_least_likely.png": ("最小似然图标", "判定图标"),
    "ico_tides.png": ("潮汐图标", "记录表界面图标"),
    "ico_katharsis_bracket.png": ("净化值框图标", "记录表界面图标"),
}

TITAN_IMAGE_LABELS = {
    "tt_ascender": ("c3", "晋升者 / Ascender"),
    "tt_cloudsoarer": ("c4", "翔云者 / Cloudsoarer"),
    "tt_earthshaker": ("c1", "撼地者 / Earthshaker"),
    "tt_executioner": ("c5", "行刑者 / Executioner"),
    "tt_feareater": ("c5", "无惧者 / Feareater"),
    "tt_firestarter": ("c2", "燃火者 / Firestarter"),
    "tt_helldiver": ("c5", "潜渊者 / Helldiver"),
    "tt_mazerunner": ("c1", "迷宫疾行者 / Mazerunner"),
    "tt_pabysswatcher": ("c2", "深渊凝望者 / Primordial Abysswatcher"),
    "tt_pdawnburner": ("c3", "曙光点燃者 / Primordial Dawnburner"),
    "tt_plogicbreaker": ("c1", "破逻辑者 / Primordial Logicbreaker"),
    "tt_plunarlander": ("c4", "登月者 / Primordial Lunarlander"),
    "tt_returner": ("c3", "回归者 / Returner"),
    "tt_shadowdancer": ("c4", "影舞者 / Shadowdancer"),
    "tt_trespasser": ("c5", "越界者 / Trespasser"),
    "tt_warkeeper": ("c2", "历战者 / Warkeeper"),
    "tt_wishender": ("c4", "终愿者 / Wishender"),
}

AIBP_TOKEN_LABELS = {
    "Ambrosia": "神浆实体标记（Ambrosia）",
    "AT+": "AT 数值增加标记（AT+）",
    "AT-": "AT 数值降低标记（AT-）",
    "CA": "充能标记（CA，闪电图案）",
    "CM": "临界质量标记（CM，星芒图案）",
    "DA+": "危险值增加标记（DA+）",
    "DA-": "危险值降低标记（DA-）",
    "ED+": "闪避值增加标记（ED+，晶体图案）",
    "ED-": "闪避值降低标记（ED-，晶体图案）",
    "GF": "神形标记（GF，旋涡图案）",
    "HT+": "命中值增加标记（HT+，拳头图案）",
    "HT-": "命中值降低标记（HT-，拳头图案）",
    "ps+": "精准值增加标记（PS+，眼睛图案）",
    "ps-": "精准值降低标记（PS-，眼睛图案）",
    "py+": "超时神谕危险值增加标记（PY+，希腊字母 Ψ 图案）",
    "SP+": "速度值增加标记（SP+，靴子图案）",
    "SP-": "速度值降低标记（SP-，靴子图案）",
}

MAP_TOKEN_LABELS = {
    "AA": "循环 III 专用地图标记（AA）",
    "AD": "使徒位置标记（AD，使徒头盔图案）",
    "AG": "阿尔戈号位置标记（AG，船只图案）",
    "body": "后日奥德赛·船体补给标记（Body）",
    "c11": "循环 I 专用地图标记（C11）",
    "c12": "循环 I 专用地图标记（C12）",
    "c13": "循环 I 专用地图标记（C13）",
    "dof": "后日奥德赛·DOF 补给标记",
    "end": "后日奥德赛·终点标记（End）",
    "ENGIN": "引擎侦察标记（ENGIN）",
    "hs": "侦察船标记（HS）",
    "knowledge": "后日奥德赛·知识补给标记（Knowledge）",
    "last_city": "最后到访的城市标记（Last City）",
    "last_oasis": "最后到访的绿洲标记（Last Oasis）",
    "last_silver_ruin": "最后到访的白银遗迹标记（Last Silver Ruin）",
    "rr": "后日奥德赛·RR 补给标记",
    "sandstorm": "循环 IV 沙尘暴地图标记（Sandstorm）",
    "staff": "后日奥德赛·人员补给标记（Staff）",
    "taitan": "后日奥德赛·泰坦补给标记（Taitan）",
    "c4_city_of_squalor": "循环 IV 贫民窟城市标记（City of Squalor）",
    "c4_cloud_ship": "循环 IV 云船标记（Cloud Ship）",
    "c5_atlantean_capital": "循环 V 亚特兰蒂斯首都标记（Atlantean Capital）",
    "c5_black_beak": "循环 V 黑喙标记（Black Beak）",
    "c5_last_visited_underwater_city": "循环 V 最后到访的水下城市标记",
    "c5_nemesis": "循环 V 涅墨西斯号标记（Nemesis）",
    "c5_ruin": "循环 V 遗迹标记（Ruin）",
    "night_nymph": "夜之宁芙地图标记（Night Nymph）",
}

STATUS_CARD_LABELS = {
    "C45_STATUS_001": "强欲 / COVETOUS（C4/C5 状态卡 001）",
    "C45_STATUS_002": "满足 / ENRICHED（C4/C5 状态卡 002）",
    "C45_STATUS_003": "登临者 / LANDER（C4/C5 状态卡 003）",
    "C45_STATUS_004": "恐怖 / TERROR（C4/C5 状态卡 004）",
    "C45_STATUS_005": "贪婪 / GREED-CRAZED（C4/C5 状态卡 005）",
    "C45_STATUS_006": "开悟 / ENLIGHTENED（C4/C5 状态卡 006）",
    "C45_STATUS_007": "决意 / RESOLVE（C4/C5 状态卡 007）",
    "C45_STATUS_008": "大恐怖 / HOLY TERROR（C4/C5 状态卡 008）",
    "C45_STATUS_009": "愿望热情 / WISHKEEN（C4/C5 状态卡 009）",
    "C45_STATUS_010": "浮空（上）/ FLOAT (UP)（C4/C5 状态卡 010）",
    "C45_STATUS_011": "英勇 / BRAVERY（C4/C5 状态卡 011）",
    "C45_STATUS_012": "愿望狂热 / WISHAGOG（C4/C5 状态卡 012）",
    "C45_STATUS_013": "浮空（下）/ FLOAT (DOWN)（C4/C5 状态卡 013）",
}

RECORD_RESOURCE_LABELS = {
    "amygdalanExtract": "杏仁体萃取物", "armament": "军备", "atlanteanTekne": "亚特兰蒂斯技艺",
    "babylonianContraption": "巴比伦装置", "blackChain": "黑色锁链", "blackenedHalo": "黑化光环",
    "blackTaintedStepfinger": "染黑阶梯指", "blackWoolStrand": "黑羊毛丝", "burnedOutGrace": "燃尽恩典",
    "calcifiedKnuckle": "钙化指节骨", "chimericTar": "奇美拉焦油", "clothflesh": "肉布", "core": "核心",
    "cursedBloatsack": "诅咒胀囊", "cursedDerelict": "诅咒船骸", "cyclopeanMetal": "独眼巨人甲胄",
    "daedalusMakina": "代达罗斯器械", "echoes": "记忆之回响", "eyesCluster": "眼球簇",
    "fadingLightConstruct": "消逝之光构造体", "fearEssence": "恐惧精华", "fleshyMantle": "血肉块",
    "frozenAmbrosia": "凝固神浆", "grotesqueBeak": "怪异喙片", "hydradynamicScales": "流体力学鳞片",
    "hyperboreanAlloy": "冻土合金", "icarianFeather": "伊卡洛斯之羽", "imperialScroll": "帝国卷轴",
    "infusedMechanism": "浸液机件", "ireEssence": "愤怒精华", "liquidAether": "液态以太",
    "livingAbyss": "活体深渊", "livingGold": "活化黄金", "mazeFragment": "迷宫碎片",
    "microwaveCell": "微波细胞", "monument": "石筑", "muscleCluster": "肌肉簇",
    "mutableAmbrosia": "易变神浆", "oldIremFragment": "旧伊雷姆碎片", "onyxDust": "缟玛瑙粉尘",
    "orichalcumAlloy": "山铜合金", "orichalcumChunk": "山铜块", "oxidizedAmbrosia": "氧化神浆",
    "photophobicFlesh": "畏光血肉", "powderedMatter": "粉化奇物", "priests": "祭司",
    "promisedFuturesCarcass": "未来承诺残骸", "pygmalionStones": "皮格马利翁之石", "rare": "稀有资源",
    "rawAmbrosia": "神浆原液", "razorclaw": "利爪", "relief": "岩雕", "reliefshellFragment": "岩壳碎片",
    "retractableMechanism": "伸缩机构", "sirenshell": "塞壬壳", "sisyphusTears": "西西弗斯之泪",
    "skinOfMalice": "怨恨之皮", "slaveMetal": "奴隶金属", "sunburnedSkull": "日灼头骨",
    "supersolidRelief": "超固体块", "trireme": "船材", "violentAmbrosia": "不稳定神浆",
    "warMachine": "战械", "warTrireme": "舰材", "wishEmbryo": "愿望胚胎", "writhingTentacle": "扭动触手",
}

HERO_PORTRAIT_LABELS = {
    "argonaut_01_odys": "英雄头像 01：奥德修斯·零 / Odys Zero",
    "argonaut_02_circe": "英雄头像 02：喀耳刻卫 / Circegard",
    "argonaut_03_phenelope": "英雄头像 03：珀涅罗珀 / Phenelope",
    "argonaut_04_telebac": "英雄头像 04：忒勒巴科斯 / Telebacchus",
    "argonaut_05_herakleides": "英雄头像 05：赫拉克莱德斯 / Herakleides",
    "argonaut_06_olympia": "英雄头像 06：奥林匹亚 / Olympia",
    "argonaut_07_leocules": "英雄头像 07：莱奥库勒斯 / Leocules",
    "argonaut_08_raz": "英雄头像 08：拉兹 / Raz",
    "argonaut_09_fisher": "英雄头像 09：费舍尔 / Fisher",
    "argonaut_10_blank": "空白英雄头像槽位 10",
    "argonaut_11_blank": "空白英雄头像槽位 11",
    "argonaut_12_blank": "空白英雄头像槽位 12",
    "argonaut_13_blank": "空白英雄头像槽位 13",
    "argonaut_14_blank": "空白英雄头像槽位 14",
    "argonaut_15_blank": "空白英雄头像槽位 15",
    "argonaut_16_blank": "空白英雄头像槽位 16",
    "argonaut_17_hypatia": "英雄头像 17：希帕提亚 / Hypatia",
    "argonaut_18_anakreon": "英雄头像 18：阿纳克里翁 / Anakreon",
    "argonaut_19_anathea": "英雄头像 19：安纳忒亚 / Anathea",
    "argonaut_20_orphan": "英雄头像 20：DMT 的孤儿 / Orphan",
    "argonaut_21_aster": "英雄头像 21：阿斯特 / Aster",
    "argonaut_22_dastan": "英雄头像 22：达斯坦 / Dastan",
    "argonaut_23_aktisaeos": "英雄头像 23：阿克提赛俄斯 / Aktisaeos",
    "argonaut_24_oleander": "英雄头像 24：欧利安德 / Oleander",
    "argonaut_25_omorfos": "英雄头像 25：欧莫弗斯 / Omorfos",
    "argonaut_empty": "通用空白英雄头像",
}

ALLY_LABELS = {
    "ARISTOTELIANS": "盟友阵营：亚里士多德派 / Aristotelians",
    "CLOUDTHIEVES": "盟友阵营：云盗 / Cloud Thieves",
    "CYCLADEANPROTECTORATE": "盟友阵营：基克拉迪保护国 / Cycladean Protectorate",
    "CYCLOPES": "盟友阵营：独眼巨人 / Cyclopes",
    "DELPHIANS": "盟友阵营：德尔菲人 / Delphians",
    "FOLLOWERSOFARETE": "盟友阵营：阿瑞忒追随者 / Followers of Areté",
    "HELOTS": "盟友阵营：希洛人 / Helots",
    "HORNSWORN": "盟友阵营：角誓者 / Hornsworn",
    "LABYRINTHIANS": "盟友阵营：迷宫徒 / Labyrinthians",
    "MINOANS": "盟友阵营：米诺斯人 / Minoans",
    "OUTCASTVANGUARD": "盟友阵营：流放者先锋 / Outcast Vanguard",
    "SUNHEIRS": "盟友阵营：太阳后裔 / Sunheirs",
    "SYMMACHY": "盟友阵营：邦联同盟 / Symmachy",
    "TWILIGHTWATCH": "盟友阵营：暮光守望 / Twilight Watch",
    "WASTERS": "盟友阵营：荒原者 / Wasters",
}

SUMMON_CARD_LABELS = {
    "001_Nymph_Engine_Nymph": "宁芙 001：引擎宁芙 / Engine Nymph",
    "002_Nymph_Solitude_Nymph": "宁芙 002：孤独宁芙 / Solitude Nymph",
    "003_Nymph_Amalthean_Nymph": "宁芙 003：阿玛尔忒娅宁芙 / Amalthean Nymph",
    "004_Nymph_Labyrinth_Nymph": "宁芙 004：迷宫宁芙 / Labyrinth Nymph",
    "005_Nymph_Depths_Nymph": "宁芙 005：深海宁芙 / Depths Nymph",
    "006_Godform_Zeus": "神形 006：宙斯 / Zeus",
    "006_Nymph_Curiosity_Nymph": "宁芙 006：好奇宁芙 / Curiosity Nymph",
    "007_Godform_Poseidon": "神形 007：波塞冬 / Poseidon",
    "007_Nymph_Night_Nymph": "宁芙 007：夜之宁芙 / Night Nymph",
    "007_Nymph_Sweets_Nymph": "宁芙 007：甜食宁芙 / Sweets Nymph",
    "008_Godform_Demeter": "神形 008：德墨忒尔 / Demeter",
    "008_Nymph_Age_Nymph": "宁芙 008：年岁宁芙 / Age Nymph",
    "008_Nymph_Nietzschean_Nymph": "宁芙 008：尼采宁芙 / Nietzschean Nymph",
    "009_Nymph_Forge_Nymph": "宁芙 009：锻炉宁芙 / Forge Nymph",
    "009_Nymph_Hope_Nymph": "宁芙 009：希望宁芙 / Hope Nymph",
    "010_Nymph_Blade_Nymph": "宁芙 010：刀刃宁芙 / Blade Nymph",
    "010_Nymph_Machina_Nymph": "宁芙 010：机械宁芙 / Machina Nymph",
    "011_Godform_Artemis": "神形 011：阿尔忒弥斯 / Artemis",
    "011_Nymph_Knowledge_Nymph": "宁芙 011：知识宁芙 / Knowledge Nymph",
    "012_Godform_Athena": "神形 012：雅典娜 / Athena",
    "012_Nymph_Mask_Nymph": "宁芙 012：面具宁芙 / Mask Nymph",
    "013_Godform_Hades": "神形 013：哈迪斯 / Hades",
    "013_Godform_Hephaestus": "神形 013：赫菲斯托斯 / Hephaestus",
    "014_Godform_Hermes": "神形 014：赫尔墨斯 / Hermes",
    "015_Godform_Ares": "神形 015：阿瑞斯 / Ares",
    "246_Godform_Dionysus": "神形秘密卡 246：狄俄尼索斯 / Dionysus",
    "247_Godform_Aphrodite": "神形秘密卡 247：阿佛洛狄忒 / Aphrodite",
    "248_Godform_Helios_Apollonis_Exalted": "神形秘密卡 248：赫利俄斯·阿波罗尼斯（至高） / Helios Apollonis Exalted",
    "249_Nymph_Silica_Nymph": "宁芙秘密卡 249：硅石宁芙 / Silica Nymph",
    "250_Nymph_Midas_Nymph": "宁芙秘密卡 250：迈达斯宁芙 / Midas Nymph",
    "251_Nymph_Natron_Nymph": "宁芙秘密卡 251：泡碱宁芙 / Natron Nymph",
    "255_Godform_Hera": "神形秘密卡 255：赫拉 / Hera",
    "256_Godform_Poseidon_Exalted": "神形秘密卡 256：波塞冬（至高） / Poseidon Exalted",
    "257_Godform_Zeus_Exalted": "神形秘密卡 257：宙斯（至高） / Zeus Exalted",
    "258_Nymph_Ambrosia_Nymph": "宁芙秘密卡 258：神浆宁芙 / Ambrosia Nymph",
    "259_Nymph_Aether_Nymph": "宁芙秘密卡 259：以太宁芙 / Aether Nymph",
    "305_Godform_Hermes_Exalted": "泰坦 X 神形秘密卡 305：赫尔墨斯（至高） / Hermes Exalted",
    **{f"token_{index:02d}": f"宁芙实体指示物 {index:02d}" for index in range(1, 15)},
}


def component_display_name(path: str, stem: str | None = None) -> str:
    """Return the user-facing name for fixed icons that otherwise only have file codes."""
    raw_stem = (stem if stem is not None else PurePosixPath(path).stem).strip()
    if path.startswith("aibp/ps/other/token/"):
        return AIBP_TOKEN_LABELS.get(raw_stem, f"AIBP 标记（{raw_stem}）")
    if path.startswith("aibp/ps/other/resouce/"):
        label = RESOURCE_LABELS.get(raw_stem, "核心" if raw_stem == "core" else raw_stem)
        return f"{label}资源图标（{raw_stem}）"
    if path.startswith("record/assets/resource-icons/"):
        label = RECORD_RESOURCE_LABELS.get(raw_stem, raw_stem)
        return f"{label}资源图标（{raw_stem}）"
    if path.startswith("map/tokens/"):
        return MAP_TOKEN_LABELS.get(raw_stem, f"地图标记（{raw_stem}）")
    if path.startswith("aibp/ps/other/status/"):
        return STATUS_CARD_LABELS.get(raw_stem, f"C4/C5 状态卡（{raw_stem}）")
    if path.startswith("hero/assets/argonaut_"):
        return HERO_PORTRAIT_LABELS.get(raw_stem, f"英雄头像（{raw_stem}）")
    if path.startswith("record/assets/ally/"):
        return ALLY_LABELS.get(raw_stem, f"盟友阵营图标（{raw_stem}）")
    if path.startswith("record/assets/godforms-nymphs/"):
        return SUMMON_CARD_LABELS.get(raw_stem, f"神形或宁芙实体素材（{raw_stem}）")
    return raw_stem.replace("_", " ")


def simple_group_id_number(path: str, stem: str) -> str:
    """Keep legacy minus-token IDs while giving plus tokens a distinct, stable ID."""
    if path.startswith("aibp/ps/other/token/") and stem.strip().endswith("+"):
        return f"{stem.strip()[:-1]}-plus"
    return stem


@dataclass(frozen=True)
class CatalogItem:
    id: str
    cycle: str
    module: str
    subgroup: str
    name: str
    number: str
    sort_order: int
    faces: dict[str, str]
    capture_required: bool = True


def slug(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return text or hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]


def natural_key(value: str) -> list[Any]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def make_id(cycle: str, module: str, subgroup: str, number: str, name: str) -> str:
    return ":".join(map(slug, (cycle, module, subgroup, number or name)))


def parse_js_assignment(raw: bytes, variable: str) -> dict:
    text = raw.decode("utf-8-sig")
    match = re.match(rf"\s*{re.escape(variable)}\s*=\s*(.*);\s*$", text, re.S)
    if not match:
        raise ValueError(f"无法解析 {variable}")
    return json.loads(match.group(1))


def aibp_type(stem: str) -> str:
    for marker, label in (
        ("_AI_", "AI"), ("_BP_", "BP"), ("_TR_", "Trait"),
        ("_ROUTINE_", "Routine"), ("_SIGNATURE_", "Signature"),
    ):
        if marker in stem:
            return label
    return "Special"


def base_face_path(path: str) -> tuple[str, str]:
    stem = str(PurePosixPath(path).with_suffix(""))
    ext = PurePosixPath(path).suffix
    if stem.lower().endswith("_back"):
        return stem[:-5] + ext, "back"
    if stem.lower().endswith("-back"):
        return stem[:-5] + ext, "back"
    if stem.lower().endswith("_face"):
        return stem[:-5] + ext, "front"
    if stem.lower().endswith("-front"):
        return stem[:-6] + ext, "front"
    return path, "front"


def ordered_faces(faces: dict[str, str]) -> dict[str, str]:
    return {face: faces[face] for face in ("front", "back") if face in faces}


class CatalogBuilder:
    def __init__(self, apk_path: str):
        self.apk_path = apk_path

    def build(self) -> tuple[list[CatalogItem], dict[str, Any]]:
        items: list[CatalogItem] = []
        with zipfile.ZipFile(self.apk_path) as archive:
            names = [info.filename for info in archive.infolist() if not info.is_dir()]
            web_images = [
                name[len(WEB_PREFIX):] for name in names
                if name.startswith(WEB_PREFIX) and PurePosixPath(name).suffix.lower() in IMAGE_EXTENSIONS
            ]
            items.extend(self._exploration(web_images))
            items.extend(self._story_doom(web_images))
            items.extend(self._maps(web_images))
            items.extend(self._aibp(web_images))
            items.extend(self._gear(archive, web_images))
            items.extend(self._technology(archive))
            items.extend(self._simple_groups(web_images))
            story = parse_js_assignment(
                archive.read(f"{WEB_PREFIX}story/data/storybook-data.js"), "window.STORYBOOK_DATA"
            )
            story_skeleton = [
                {
                    "id": book.get("id"), "title": book.get("title"),
                    "chapters": [{"key": c.get("key"), "title": c.get("title")} for c in book.get("chapters", [])],
                }
                for book in story.get("books", [])
            ]
        unique = {item.id: item for item in items}
        sorted_items = sorted(
            unique.values(), key=lambda x: (natural_key(x.cycle), x.module, x.subgroup, x.sort_order, natural_key(x.name))
        )
        source = {
            "apk": PurePosixPath(self.apk_path).name,
            "source_files": len(names),
            "source_images": len(web_images),
            "catalog_items": len(sorted_items),
            "aibp_enemies": len({i.subgroup.split(" / ")[0] for i in sorted_items if i.module == "AIBP"}),
            "stories": story_skeleton,
        }
        return sorted_items, source

    def _exploration(self, paths: Iterable[str]) -> list[CatalogItem]:
        result = []
        for order, path in enumerate(sorted((p for p in paths if p.startswith("assets/exploration-cards/")), key=natural_key)):
            parts = path.split("/")
            cycle, number = parts[2], PurePosixPath(path).stem
            result.append(CatalogItem(make_id(cycle, "exploration", "cards", number, number), cycle, "探索卡", "探索卡", number, number, order, {"front": path}))
        return result

    def _story_doom(self, paths: Iterable[str]) -> list[CatalogItem]:
        groups: dict[str, dict[str, str]] = {}
        for path in paths:
            if not path.startswith("assets/story-doom-cards/") or any(m in path.lower() for m in DERIVED_MARKERS):
                continue
            base, face = base_face_path(path)
            groups.setdefault(base, {})[face] = path
        result = []
        pattern = re.compile(r"assets/story-doom-cards/(c\d)-(story|doom)-([^-]+)-(.+)", re.I)
        for order, (base, faces) in enumerate(sorted(groups.items(), key=lambda pair: natural_key(pair[0]))):
            match = pattern.match(str(PurePosixPath(base).with_suffix("")))
            if not match:
                continue
            cycle, kind, number, raw_name = match.groups()
            name = raw_name.replace("-", " ").title()
            subgroup = "故事卡" if kind.lower() == "story" else "灾厄卡"
            result.append(CatalogItem(make_id(cycle, "story-doom", subgroup, number, name), cycle, "故事/灾厄卡", subgroup, name, number, order, ordered_faces(faces)))
        return result

    def _maps(self, paths: Iterable[str]) -> list[CatalogItem]:
        groups: dict[str, dict[str, str]] = {}
        for path in paths:
            if not path.startswith("map/images/"):
                continue
            base, face = base_face_path(path)
            groups.setdefault(base, {})[face] = path
        result = []
        pattern = re.compile(r"map/images/(c\d)-tile-(.+)", re.I)
        for order, (base, faces) in enumerate(sorted(groups.items(), key=lambda pair: natural_key(pair[0]))):
            match = pattern.match(str(PurePosixPath(base).with_suffix("")))
            if not match:
                continue
            cycle, number = match.groups()
            result.append(CatalogItem(make_id(cycle, "map", "tiles", number, number), cycle, "地图板块", "地图板块", f"板块 {number}", number, order, ordered_faces(faces)))
        return result

    def _aibp(self, paths: Iterable[str]) -> list[CatalogItem]:
        relevant = [p for p in paths if p.startswith("aibp/ps/") and "/other/" not in p]
        groups: dict[str, dict[str, str]] = {}
        for path in relevant:
            base, face = base_face_path(path)
            groups.setdefault(base, {})[face] = path
        result = []
        for order, (base, faces) in enumerate(sorted(groups.items(), key=lambda pair: natural_key(pair[0]))):
            parts = base.split("/")
            if len(parts) < 4:
                continue
            enemy = parts[2]
            stem = PurePosixPath(base).stem
            if stem == enemy:
                continue
            cycle = AIBP_CYCLES.get(enemy, "other")
            kind = aibp_type(stem)
            subgroup = f"{enemy} / {kind}"
            result.append(CatalogItem(make_id(cycle, "aibp", subgroup, stem, stem), cycle, "AIBP", subgroup, stem.replace("_", " "), stem, order, ordered_faces(faces)))
        return result

    def _gear(self, archive: zipfile.ZipFile, paths: Iterable[str]) -> list[CatalogItem]:
        data = json.loads(archive.read(f"{WEB_PREFIX}technology/gear_card_images.json").decode("utf-8-sig"))
        cards = data.get("cards", {})
        result = []
        for order, (number, entry) in enumerate(sorted(cards.items(), key=lambda pair: natural_key(pair[0]))):
            path = f"technology/{entry['src'].lstrip('/')}"
            if path not in paths:
                continue
            cycle = GEAR_CYCLES.get(number[:1].upper(), "other")
            name = entry.get("title") or number
            result.append(CatalogItem(make_id(cycle, "gear", "cards", number, name), cycle, "装备卡", "装备卡", name, number, order, {"front": path}))
        return result

    def _technology(self, archive: zipfile.ZipFile) -> list[CatalogItem]:
        data = json.loads(archive.read(f"{WEB_PREFIX}technology/tech_card_dictionary.min.json").decode("utf-8-sig"))
        result = []
        for order, card in enumerate(data.get("cards", [])):
            image = card.get("image") or {}
            nodes = card.get("nodes") or []
            pages = [str(node.get("page") or "") for node in nodes]
            cycles = sorted({m.group(1) for page in pages if (m := re.search(r"cycle([1-5])", page, re.I))})
            cycle = "+".join(f"c{value}" for value in cycles) or "other"
            names = card.get("names") or {}
            name = names.get("zh") or names.get("en") or card.get("key") or f"科技卡 {order + 1}"
            number = card.get("key") or str(order + 1)
            faces = {}
            for face in ("face", "back"):
                if image.get(face):
                    faces["front" if face == "face" else "back"] = f"technology/{str(image[face]).lstrip('/')}"
            if faces:
                result.append(CatalogItem(make_id(cycle, "technology", card.get("category") or "科技卡", number, name), cycle, "科技卡", card.get("category") or "科技卡", name, number, order, faces))
        return result

    def _simple_groups(self, paths: Iterable[str]) -> list[CatalogItem]:
        rules = (
            ("aibp/ps/other/token/", "common", "通用标记", "AIBP 标记"),
            ("aibp/ps/other/resouce/", "common", "资源标记", "AIBP 资源"),
            ("aibp/ps/other/status/", "c4+c5", "状态卡", "C4/C5 状态"),
            ("map/tokens/", "common", "通用标记", "地图标记"),
            ("record/assets/ally/", "common", "英雄/盟友", "盟友"),
            ("record/assets/godforms-nymphs/", "common", "英雄/盟友", "神形/宁芙"),
            ("record/assets/resource-icons/", "common", "资源标记", "记录表资源"),
        )
        result = []
        for order, path in enumerate(sorted(paths, key=natural_key)):
            if path.startswith("hero/assets/"):
                filename = PurePosixPath(path).name
                stem = PurePosixPath(path).stem
                if filename.startswith("argonaut_"):
                    result.append(CatalogItem(
                        make_id("common", "英雄/盟友", "英雄", stem, stem),
                        "common", "英雄/盟友", "英雄", component_display_name(path, stem),
                        stem, order, {"front": path},
                    ))
                elif filename in HERO_RECORD_ICONS:
                    label, subgroup = HERO_RECORD_ICONS[filename]
                    result.append(CatalogItem(
                        make_id("common", "英雄记录表图标", subgroup, stem, stem),
                        "common", "英雄记录表图标", subgroup, label, stem, order,
                        {"front": path},
                    ))
                continue
            matched = next((rule for rule in rules if path.startswith(rule[0])), None)
            if not matched or "/nymph_tokens/" in path and matched[3] != "神形/宁芙":
                continue
            _, cycle, module, subgroup = matched
            stem = PurePosixPath(path).stem
            id_number = simple_group_id_number(path, stem)
            name = component_display_name(path, stem)
            result.append(CatalogItem(make_id(cycle, module, subgroup, id_number, name), cycle, module, subgroup, name, stem.strip(), order, {"front": path}))
        return result


def compare_catalog(db: Database, items: list[CatalogItem], source: dict[str, Any]) -> dict[str, Any]:
    current = {row["id"]: row for row in db.all("SELECT * FROM catalog_items")}
    incoming = {item.id: item for item in items}
    added = [asdict(incoming[key]) for key in incoming.keys() - current.keys()]
    removed = [{"id": key, "name": current[key]["name"], "cycle": current[key]["cycle"], "module": current[key]["module"]} for key in current.keys() - incoming.keys()]
    changed = []
    for key in incoming.keys() & current.keys():
        before = current[key]
        after = incoming[key]
        if (before["name"], before["cycle"], before["module"], before["subgroup"], before["faces_json"]) != (
            after.name, after.cycle, after.module, after.subgroup, json.dumps(after.faces, ensure_ascii=False, sort_keys=True)
        ):
            changed.append({"id": key, "before": {k: before[k] for k in ("name", "cycle", "module", "subgroup")}, "after": asdict(after)})
    return {"source": source, "summary": {"added": len(added), "removed": len(removed), "changed": len(changed), "unchanged": len(incoming) - len(added) - len(changed)}, "added": added, "removed": removed, "changed": changed}


def apply_catalog(db: Database, items: list[CatalogItem], source: dict[str, Any]) -> dict[str, int]:
    source_version = str(source.get("apk") or "")
    incoming_ids = {item.id for item in items}
    with db.connect() as conn:
        for item in items:
            conn.execute(
                """INSERT INTO catalog_items
                (id,cycle,module,subgroup,name,number,sort_order,faces_json,capture_required,source_version)
                VALUES(?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET cycle=excluded.cycle,module=excluded.module,
                subgroup=excluded.subgroup,name=excluded.name,number=excluded.number,
                sort_order=excluded.sort_order,faces_json=excluded.faces_json,
                capture_required=excluded.capture_required,source_version=excluded.source_version""",
                (item.id, item.cycle, item.module, item.subgroup, item.name, item.number, item.sort_order,
                 json.dumps(item.faces, ensure_ascii=False, sort_keys=True), int(item.capture_required), source_version),
            )
        if incoming_ids:
            placeholders = ",".join("?" for _ in incoming_ids)
            conn.execute(
                f"DELETE FROM catalog_items WHERE id NOT IN ({placeholders}) AND id NOT IN (SELECT DISTINCT item_id FROM asset_revisions)",
                tuple(incoming_ids),
            )
    db.set_meta("catalog_source", source)
    return {"items": len(items), "aibp_enemies": int(source.get("aibp_enemies") or 0), "stories": len(source.get("stories") or [])}


def catalog_stats(db: Database) -> dict[str, Any]:
    from .fixed_resources import card_resource_note, card_resources

    rows = db.all("""
      SELECT c.id,c.cycle,c.module,c.subgroup,c.name,c.number,c.faces_json,c.sort_order,
      GROUP_CONCAT(CASE WHEN a.is_current=1 THEN a.face END) AS captured,
      GROUP_CONCAT(s.face) AS skipped
      FROM catalog_items c
      LEFT JOIN asset_revisions a ON a.item_id=c.id AND a.is_current=1
      LEFT JOIN skipped_faces s ON s.item_id=c.id
      WHERE c.capture_required=1
      GROUP BY c.id ORDER BY c.cycle,c.module,c.subgroup,c.sort_order
    """)
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    next_item = None
    output = []
    for row in rows:
        faces = json.loads(row.pop("faces_json"))
        captured = set(filter(None, (row.pop("captured") or "").split(",")))
        skipped = set(filter(None, (row.pop("skipped") or "").split(",")))
        missing = [face for face in faces if face not in captured]
        row.update({
            "faces": faces, "captured": sorted(captured), "skipped": sorted(skipped),
            "missing": missing, "complete": not missing,
            "resources": card_resources(row["number"]),
            "resource_note": card_resource_note(row["number"], row["subgroup"]),
        })
        output.append(row)
        if missing and next_item is None:
            next_item = {**row, "next_face": missing[0]}
        key = (row["cycle"], row["module"])
        group = groups.setdefault(key, {"cycle": key[0], "module": key[1], "items": 0, "complete": 0, "missing_front": 0, "missing_back": 0})
        group["items"] += 1
        group["complete"] += int(not missing)
        group["missing_front"] += int("front" in missing)
        group["missing_back"] += int("back" in missing)
    pending = db.all("""
      SELECT p.suggested_item_id,c.cycle,c.module
      FROM pending_files p LEFT JOIN catalog_items c ON c.id=p.suggested_item_id
      WHERE p.status='pending'
    """)
    for row in pending:
        if row["cycle"] and (row["cycle"], row["module"]) in groups:
            group = groups[(row["cycle"], row["module"])]
            group["pending_review"] = group.get("pending_review", 0) + 1
    unreviewed = db.one("SELECT COUNT(*) AS n FROM story_segments WHERE reviewed=0")["n"]
    return {
        "groups": list(groups.values()), "items": output, "next": next_item,
        "attention": {
            "pending_review": len(pending),
            "conflicts": sum(row["suggested_item_id"] is None for row in pending),
            "story_unreviewed": unreviewed,
        },
        "source": db.get_meta("catalog_source", {}),
    }
