import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(rootDir, "story", "data", "storybook-data.js");
const outJsPath = path.join(rootDir, "story", "characters.js");
const outJsonPath = path.join(rootDir, "story", "character-stories.json");
const outAuditPath = path.join(rootDir, "story", "character-candidates-audit.json");

const sourceBooks = new Set(["c1", "c2", "c3", "c4", "c5"]);
const manualCharacters = [
  {
    id: "acacallis",
    name: "阿卡卡利斯",
    englishName: "Acacallis",
    aliases: ["阿卡卡利斯", "阿卡卡利斯公主", "米诺斯向导", "Acacallis", "Minoan Guide"],
    matchAliases: ["阿卡卡利斯", "阿卡卡利斯公主", "Acacallis", "Minoan Guide", "米诺斯向导"],
    role: "米诺斯公主；米诺斯向导",
    faction: "米诺斯王室",
    bioNonSpoiler: "阿卡卡利斯是米诺斯王室的公主，也是故事中“米诺斯向导”盟友卡实际指向的人物。她熟悉克里特局势，会作为同行者帮助阿尔戈英雄，并在多条分支中影响你与米诺斯王室、牛角卫和克里特人民的关系。",
    bioSpoiler: "段落 0043 明确写出“你的米诺斯向导，阿卡卡利斯公主”。她最初受命监视阿尔戈英雄，但同行经历让她改变立场，请求你们帮助她拯救克里特。此后米诺斯向导不能离开你，相关段落会通过阿卡卡利斯计数标记记录她的转变。",
  },
  {
    id: "helios",
    name: "赫利俄斯",
    englishName: "Helios",
    aliases: ["赫利俄斯", "太阳神", "全视者", "无情的神", "Helios", "Panoptes", "Pitiless"],
    matchAliases: ["赫利俄斯", "太阳神", "全视者", "无情的神", "Helios", "Panoptes", "Pitiless", "Sun God"],
    role: "太阳神",
    faction: "奥林匹斯诸神",
    bioNonSpoiler: "赫利俄斯是太阳神，也是德尔菲线与太阳领域中反复出现的神性威胁。他常以“全视者”或“无情的神”等称号被提及，和伊卡洛斯、德尔菲、太阳领域的灾难密切相关。",
    bioSpoiler: "赫利俄斯/全视者在德尔菲线中成为太阳领域痛苦循环的核心。相关段落会揭示他对伊卡洛斯与渴望者号悲剧的影响，并让西西弗斯等角色卷入对太阳神权威的反抗。",
  },
  {
    id: "minos",
    name: "米诺斯国王",
    englishName: "King Minos",
    aliases: ["米诺斯国王", "King Minos", "Minos"],
    matchAliases: ["米诺斯国王", "King Minos", "Minos"],
    role: "克里特的国王",
    faction: "米诺斯王室",
    bioNonSpoiler: "米诺斯国王是克里特旧秩序的核心。阿尔戈号寻找他，是因为他可能掌握进入代达罗斯宝库和理解克里特危机的关键。",
    bioSpoiler: "米诺斯的统治、女儿们与王朝选择共同构成克里特线的核心冲突。关于忒修斯、受罚者和神罚的真相会动摇他塑造的秩序，并最终改变克里特宫廷的权力局面。",
  },
  {
    id: "theseus",
    name: "忒修斯",
    englishName: "Theseus",
    aliases: ["忒修斯", "屠牛者", "受罚者", "受罚之人", "Theseus", "The Punished", "Punished"],
    matchAliases: ["忒修斯", "屠牛者", "Theseus", "受罚者", "受罚之人", "The Punished", "Punished"],
    role: "传说中的屠牛者",
    faction: "旧英雄传说",
    bioNonSpoiler: "忒修斯是克里特创伤中反复被提及的旧英雄：有人将他视为有目标的英雄，也有人把他视为灾难的起点。他与米诺陶洛斯、阿里阿德涅和迷宫真相都有密切关系。",
    bioSpoiler: "故事逐渐揭示“受罚者”与忒修斯的关系。忒修斯在阿里阿德涅死后崩溃，成为迷宫真相的源头之一；这个真相会影响米诺斯王朝、阿卡卡利斯以及克里特线的终局判断。",
  },
  {
    id: "phaedra",
    name: "淮德拉",
    englishName: "Phaedra",
    aliases: ["淮德拉", "法德拉", "Phaedra"],
    matchAliases: ["淮德拉", "法德拉", "Phaedra"],
    role: "米诺斯的女儿",
    faction: "米诺斯王室",
    bioNonSpoiler: "淮德拉是米诺斯的女儿之一，早期在克诺索斯宫殿门前迎接阿尔戈英雄。她与米诺斯王室对外来者的态度、王朝内部的裂痕和克里特真相密切相关。",
    bioSpoiler: "在克里特宫廷段落中，淮德拉/法德拉会出现在米诺斯倒台和王室选择的关键场景中。她不是“米诺斯向导”；向导身份明确属于阿卡卡利斯。",
  },
  {
    id: "old-priest",
    name: "老祭司",
    englishName: "Old Priest",
    aliases: ["老祭司", "Old Priest"],
    role: "阿尔戈号上的长者与向导",
    faction: "阿尔戈号",
    bioNonSpoiler: "老祭司是在阿尔戈英雄醒来后照顾他们的人，也是早期解释阿尔戈号、克里特和旧世界背景的重要声音。",
    bioSpoiler: "老祭司不仅承担规则和背景提示，也反复出现在阿尔戈号日常事件中。他的脆弱、幽默和回忆让阿尔戈号从工具变成一个真实共同体。",
  },
  {
    id: "nietzschean",
    name: "尼采超人",
    englishName: "Nietzschean",
    aliases: ["尼采超人", "阿喀琉斯", "The Nietzschean", "Nietzschean", "Achilles"],
    matchAliases: ["尼采超人", "阿喀琉斯", "The Nietzschean", "Nietzschean", "Achilles", "斯巴达暴君", "Spartan Tyrant"],
    role: "斯巴达暴君",
    faction: "斯巴达",
    bioNonSpoiler: "尼采超人是斯巴达线的核心敌人，也是拉科尼亚战争背后的暴君。他代表一种崇拜力量、支配和冷酷选择的秩序，会不断逼迫阿尔戈英雄证明自己不会变成他那样的人。",
    bioSpoiler: "尼采超人的旧名是阿喀琉斯。他曾经是英雄，却在末世后的苦难和力量崇拜中堕落为斯巴达暴君。C2 后期会围绕他、帕特罗克洛斯以及拉科尼亚各派系的命运展开最终清算。",
  },
];

const canonicalAliases = new Map();
for (const character of manualCharacters) {
  for (const alias of [character.name, character.englishName, ...(character.aliases || []), ...(character.matchAliases || [])]) {
    if (alias) canonicalAliases.set(normalizeAlias(alias), character.id);
  }
}
canonicalAliases.set(normalizeAlias("Minoan Guide"), "acacallis");
canonicalAliases.set(normalizeAlias("米诺斯向导"), "acacallis");
canonicalAliases.set(normalizeAlias("阿卡卡利斯公主"), "acacallis");
canonicalAliases.set(normalizeAlias("受罚者"), "theseus");
canonicalAliases.set(normalizeAlias("受罚之人"), "theseus");
canonicalAliases.set(normalizeAlias("The Punished"), "theseus");
canonicalAliases.set(normalizeAlias("Punished"), "theseus");
canonicalAliases.set(normalizeAlias("法德拉"), "phaedra");
canonicalAliases.set(normalizeAlias("淮德拉"), "phaedra");
canonicalAliases.set(normalizeAlias("太阳神"), "helios");
canonicalAliases.set(normalizeAlias("全视者"), "helios");
canonicalAliases.set(normalizeAlias("无情的神"), "helios");
canonicalAliases.set(normalizeAlias("Sun God"), "helios");
canonicalAliases.set(normalizeAlias("Panoptes"), "helios");
canonicalAliases.set(normalizeAlias("Pitiless"), "helios");

const autoCanonicalIds = new Map([
  ["Sokratoares", "socratoares"],
  ["Socratoares", "socratoares"],
  ["Selena", "selene"],
  ["Selene", "selene"],
  ["Phaethon", "phaeton"],
  ["Phaeton", "phaeton"],
  ["The Intermediary", "intermediary"],
  ["Intermediary", "intermediary"],
  ["Hephaeston", "hephaestum"],
  ["Hephaestum", "hephaestum"],
  ["Oenagus", "oeanagus"],
  ["Oeanagus", "oeanagus"],
].map(([alias, id]) => [normalizeAlias(alias), id]));

const zhDenyTerms = [
  "阿尔戈号", "阿尔戈英雄", "米诺斯人", "迷宫徒", "黑衣迷宫徒", "角誓者", "泰坦", "始徒",
  "亚里士多德远征军", "云贼", "浪费者", "太阳后裔", "暮光守望", "德尔菲人", "希洛人",
  "斯巴达人", "追随者", "难民", "城邦联盟", "邦联同盟", "帝国", "护国", "保护国",
  "阿瑞特", "弃民先锋", "罗德", "罗得", "亚特兰蒂斯", "未知提洛斯", "永恒帝国",
  "神浆", "命运", "危险", "怒气", "装备", "武器", "回忆", "检定", "外交", "故事",
  "段落", "灾祸", "进展", "船员", "知识", "苦痛", "绝望", "调查", "胜利", "失败",
  "奖励", "惩罚", "损伤", "资源", "阶段", "航行", "战斗", "探索", "地形", "指示物",
  "图标", "标记", "卡", "牌", "节点", "规则", "时间线", "身份", "科技", "派系",
  "迷宫", "真相", "克诺索斯", "克里特", "奥林匹斯", "哈迪斯", "雅典", "斯巴达",
  "王国", "城市", "神庙", "宝库", "宫殿", "港口", "舰队", "船只", "机器", "轮机",
  "引擎", "同步", "浸池", "枢纽", "圣殿", "废墟", "遗迹", "实验室", "工坊",
  "车间", "图书馆", "办公室", "集市", "市场", "神像", "雕像", "贝壳", "湖", "坑",
  "矿井", "水渠", "泉", "船坞", "武器库", "陵墓", "火焰", "公牛", "牛角卫",
  "狮尾", "齿轮", "巴比伦债务", "巴比伦疯塔", "最小似然", "命潮回退", "照明弹",
  "军备", "恩惠", "破甲", "抗力池", "核心圈", "记忆之回响", "皮格马利翁之石",
  "西西弗斯之泪", "巴比伦装置", "液态以太", "法洛斯深寻", "黄金平均",
  "测试", "进行", "拿取", "可以", "与你的", "状态", "循环", "盟友", "暮光",
  "末世", "终末", "奥德赛", "宿命", "边缘", "承诺", "灾难", "波斯", "回响",
  "进度", "地点", "必要", "错误", "联盟", "基克拉泽斯", "传承", "线索",
  "希腊", "召唤", "国王", "贪婪", "板块", "船材", "吞域兽", "播种", "收割",
  "团结", "利剑", "甲板", "三幅节", "三体", "征服", "神谕", "交战", "圆柱",
  "太阳", "攻击", "弃民", "阴影", "基克拉泽", "深渊", "寒冷", "广场", "抵抗",
  "憎恨", "卫城", "大海", "唤醒", "重担", "悖论", "神权政治", "创伤", "远征军",
  "终结", "觉醒", "塞拉岛", "巴拉尼翁", "时间前线", "联络员", "执政官", "寝园",
  "最后学院", "圆桌舰桥", "米诺斯王朝", "马拉松式", "冻土", "市民议会", "工厂",
  "连接点", "战械", "意公主", "永恒财政官", "共同体", "悬空花园", "大光墙",
  "愿望面纱", "神殿的内殿", "大运河工程", "潘多拉视界", "埃米尔委员会", "法官塔米娜",
  "王朝", "塞壬", "波塞冬信徒", "波塞冬教徒", "纯粹主义者", "不朽者", "白银种",
  "管家", "圆盘", "拆除锚", "特性", "难题", "返乡", "冥界", "星图室", "永动机",
  "努比亚", "努比亚人", "阿斯克勒庇俄斯圣堂", "吉阿洛斯岛", "阿帕达纳", "马拉松",
  "尼尼微", "帕萨尔加德", "安善", "神圣港", "科林斯", "纳什蒂凡", "部落",
];

const enDeny = new Set([
  "Argo", "Argonaut", "Argonauts", "Minoan", "Minoans", "Labyrinthian", "Labyrinthians",
  "Black Labyrinthians", "Hornsworn", "Titan", "Titans", "Primordial", "Primordials",
  "Aristotelians", "Aristotelian", "Cloud Thieves", "Cloud Thief", "Wasters", "Waster",
  "Sunheirs", "Twilight Watch", "Delphians", "Delphian", "Helots", "Helot", "Spartans",
  "Spartan", "Followers", "Refugees", "Refugee", "Symmachy", "Empire", "Imperial",
  "Protectorate", "Allied", "Friendly", "Unfriendly", "Denounced", "Humanity",
  "Ambrosia", "Argo Fate", "Danger", "Rage", "Gear", "Mnemos", "Diplomacy", "Story",
  "Doom", "Voyage", "Battle", "ProgressToken", "Progress Token", "ArgoKnowledge",
  "Argo Knowledge", "Despair", "Wisdom", "Cunning", "Might", "Courage", "Will",
  "Endurance", "Fate", "Opening", "Break", "Armament", "Identity", "Technology",
  "Faction", "Inner Circle", "SR", "Timeline", "Cycle V", "Mortal", "Boons", "Boon",
  "Aether", "Liquid Aether", "Flare", "Pain", "Fear", "Relief", "Sisyphus Tear",
  "Echo of Recollection", "Pygmalion Stone", "Babylonian Contraption", "Imperial Scroll",
  "Time", "Frozen Time", "Tides of Fate", "Kratos Pool", "Nicomachean Ethics",
  "Maze", "Labyrinth", "Truth", "Knossos", "Crete", "Athens", "Sparta", "Lakonia",
  "Delphi", "Hades", "Olympus", "Mount Olympus", "Atlantis", "Unknown Delos",
  "Eternal Empire", "City", "Kingdom", "Temple", "Shrine", "Ruins", "Armory", "Workshop",
  "Laboratory", "Ship", "Fleet", "Trireme", "Vessel", "Office", "Market", "Polis",
  "Dome", "Vault", "Daedalus Vault", "Aeolipile Engine", "Horned Guard", "Bull",
  "Minotaur", "Goats", "Dog", "Lion Tail Whip", "The Stray", "The Burden",
  "Correct Conclusion", "Incorrect Conclusion", "Secret Admirer", "Fete for the Aeons",
  "The Absent Rule", "Shape of Things to Come", "Inward Odyssey", "Pharos Delve",
  "Crime", "Curse", "Tragedy", "Family", "Dream", "Gods", "Fate", "Deed", "AFTERMATH",
  "Fury", "Hope", "Captain", "Party Leader", "Dread", "Priest", "Priests", "Vanguard",
  "The Vanguard", "Mnestis", "Aeon", "Hull", "Condition", "Conditions", "Cycle",
  "Ally", "Twilight", "Eschaton", "Odyssey", "Fated", "Watch", "Edge", "Promise",
  "Disaster", "Persia", "Echo", "Progress", "Location", "Necessity", "Error",
  "Alliance", "Cyclades", "Heritage", "Clue", "Hellas", "Summoning", "King",
  "Greed", "Tile", "Triremes", "Temenos", "Deprived", "Sow", "United", "Xiphos",
  "Reap", "Acropolis Deck", "Triskelion", "Conquest", "Oracle", "At War", "Column",
  "Sun", "Attacks", "The Outcasts", "Shade", "Cycladean", "Abyss", "Cold", "Agora",
  "Resist", "Hatred", "Acropolis", "Great Sea", "Roused", "Burden", "Paradox",
  "Theocracy", "Trauma", "Expeditionary Force", "Closure", "Awaken", "Awakening",
  "Awakenings", "Thera", "Balaneion", "Timefront", "Liaison", "Archon", "Mausoleum",
  "Last Academy", "Bridge Tholos", "Minoan Dynasty", "Marathonian", "Hyperborean",
  "Ecclesia", "Manufactory", "Junction", "War Machine", "Princess", "Eternal Treasurer",
  "Synoikismos", "Hanging Gardens", "Great Lightwall", "Wish-veil", "Inner Hallow",
  "Great River Works", "Pandora Horizon", "Emir Board", "Tahmina",
  "Dynasty", "Siren", "Sirens", "Olympian", "Olympians", "Dionysian", "The Poseidonites",
  "Poseidonites", "Poseidonite", "Purist", "Purists", "Immortal", "Immortals",
  "The Silver Ones", "Silver Ones", "Stewards", "Leleges", "Midas Curse", "Aurochs",
  "Traits", "Marathon", "Conundrum", "Nubia", "Nubian", "Asklepieion", "Gyaros",
  "Apadana", "Nineveh", "Pasargadae", "Anshan", "Sacred Harbor", "Corinth",
  "Areology", "Perpetual Engine", "Grip", "Nostos", "Tartarus", "Underworld",
  "Casualty", "Casualties", "Evolving", "Bid", "Discus", "Gamechanger", "Death-thrower",
  "Furies", "Watchers",
  "Crew", "Fated Mnemos", "Wound", "Truth Machine", "The Truth Machine", "Titan Stoa",
  "Titanokinigos", "Titanaktisos", "Triskelion Junction", "Hope Logic Technology",
  "Sunheir", "Truthsayer",
  "Anostos", "Intermediary", "The Intermediary", "Defector", "Aspirant", "Bestowment",
]);

const leadingNoiseRe = /^(?:如果|若|当|在|和|与|或|以及|返回|获得|失去|标记|做|选择|每个|每位|一个|一位|那位|这位|名叫|叫|所谓|关于|对|向|从|把|将|令|使|为了|因为|然后|否则|如果你有|如果没有|你们|你|我们|我|他们|她们|他|她|其|的|是|不是|并非|即使是|但|而|并|来|去|让|使|被|给|向|跟|同|由|为|到|从|自|凭|据说|看着|看到|听到|抽到|抽取|站在|坐在|戴着|接受|拒绝|扑向|加入了|转向|提到|声称|认为|前往|进入|离开|拥有|没有|可以|需要|试图|带到|被带到|特征是|曾经对|者去|年轻的|昔日的|完整的|非|那个|这个|这些|那些|个|张|块|单位|点|艘|名|位|只|条|枚|本|段|场|次|轮|件|份|幅)+/u;
const trailingNoiseRe = /(?:们|人|族|派|号|舰队|地图|阶段|事件|行动|战斗|冒险|主线故事|故事|规则|卡|牌|资源|指示物|标记)$/u;

const personTitleHints = ["公主", "国王", "王后", "王子", "祭司", "先知", "将军", "执政官", "信使", "女儿", "儿子", "宁芙", "神", "女神", "海神", "酒神", "诗人", "贵族", "指挥官", "骑士", "队长"];
const mythicOrHistoricalNames = new Set([
  "Aphrodite", "Asklepios", "Athena", "Demeter", "Hades", "Nyx", "Persephone", "Phineus",
  "Phaethon", "Polyphemos", "Tantalus", "Zeus",
  "Ares", "Ariadne", "Aristophanes", "Daedalus", "Dionysus", "Helios", "Hera", "Hermes",
  "Jason", "Midas", "Moirai", "Odysseus", "Pandora", "Phaeton", "Pirithous", "Poseidon",
  "Scheherazade", "Sisyphus", "Theseus", "Typhon", "Xerxes",
]);

const genericUntitledNames = new Set([
  "Teacher", "Prophet", "Nymph", "Tyrant", "Defector", "Aspirant", "Watcher", "Pursuer",
  "Assessor", "Proxenos", "Heliast", "Ephor", "Emir", "Oracle", "King", "Princess",
]);

const placeOrThingZhRe = /(?:岛|圣堂|神庙|神殿|港|室|城|王朝|议会|委员会|学院|工程|视界|花园|墙|面纱|圆盘|齿轮|锚|诅咒|债务|装置|引擎|发动机|特性|难题|返乡|冥界|地狱|部落|港口|工厂)$/u;
const groupZhRe = /(?:人|族|民|徒|教徒|信徒|主义者|管家|不朽者|白银种|远征军|舰队|卫兵|守卫|难民|弃民)$/u;
const groupEnglishRe = /^(?:The\s+)?[A-Z][A-Za-z'’\-\s]*(?:ians?|ites?|ists?|als?|ones|wards|guards|priests|stewards|followers|refugees|outcasts|immortals|muses|sirens|leleges)$/i;
const zhExactDenyTerms = new Set(["卡", "牌", "国王", "祭司", "公主", "执政官", "联络员"]);

function isDeniedChineseAlias(alias) {
  return zhDenyTerms.some((term) => {
    if (zhExactDenyTerms.has(term)) return alias === term;
    return alias.includes(term);
  });
}

function normalizeAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

function slugify(value) {
  const ascii = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  return `char-${Buffer.from(String(value || "unknown")).toString("hex").slice(0, 16)}`;
}

function cleanChineseName(raw) {
  let value = String(raw || "").replace(/\s+/g, "").trim();
  let previous = "";
  while (previous !== value) {
    previous = value;
    value = value.replace(leadingNoiseRe, "");
  }
  value = value.replace(/[：:，,。；;、]+$/g, "");
  if (value === "法德拉") return "淮德拉";
  if (value === "老纺线者") return "老纺纱工";
  if (value === "阿尔西比亚狄斯" || value === "阿尔基比亚德斯" || value === "阿尔基比亚德") return "阿尔西比亚德斯";
  if (value === "皮里托斯") return "皮里托奥斯";
  return value;
}

function isCleanChineseAlias(value) {
  const alias = String(value || "").trim();
  if (alias.length < 2 || alias.length > 10) return false;
  if (isDeniedChineseAlias(alias)) return false;
  if (trailingNoiseRe.test(alias) && !personTitleHints.some((hint) => alias.includes(hint))) return false;
  if (/^(?:如果|在|和|与|或|获得|失去|返回|做|添加|重置|选择|每个|个|张|块|单位|都|所以|然后|你|你们|但|而|并|让|是|到达|看到|抽到|站在|坐在|戴着|接受|拒绝|扑向|加入|那个|这个|这些|那些)/.test(alias)) return false;
  if (/[的了着过]/.test(alias) && !personTitleHints.some((hint) => alias.includes(hint))) return false;
  return true;
}

function scoreChineseAlias(value, count = 1) {
  const alias = String(value || "");
  if (!isCleanChineseAlias(alias)) return -10000;
  let score = count * 8;
  if (alias.length >= 2 && alias.length <= 5) score += 24;
  if (alias.length >= 6 && alias.length <= 8) score += 8;
  if (personTitleHints.some((hint) => alias.includes(hint))) score += 5;
  score -= Math.max(0, alias.length - 5);
  return score;
}

function chooseChineseName(candidate) {
  if (candidate.manualCharacter?.name) return candidate.manualCharacter.name;
  const scored = [...candidate.zhCounts.entries()]
    .map(([alias, count]) => ({ alias, score: scoreChineseAlias(alias, count), count }))
    .filter((item) => item.score > -1000)
    .sort((a, b) => b.score - a.score || b.count - a.count || a.alias.length - b.alias.length || a.alias.localeCompare(b.alias, "zh-CN"));
  return scored[0]?.alias || candidate.zh;
}

function cleanEnglishName(raw) {
  return String(raw || "")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPersonHint(text, zh, en) {
  const index = text.indexOf(`${zh}`);
  const windowText = index >= 0 ? text.slice(Math.max(0, index - 80), index + zh.length + en.length + 120) : text;
  return personTitleHints.some((hint) => windowText.includes(hint))
    || /(?:Princess|King|Queen|Prince|Priest|Oracle|Prophet|General|Commander|Knight|Nymph|God|Goddess|Messenger|Archon|Captain|Leader|Daughter|Son)/i.test(windowText)
    || /名叫|叫[作做]?|自称|我是|他说|她说|问道|说道|喊道/.test(windowText);
}

function hasStrongPersonEvidence(candidate) {
  if (mythicOrHistoricalNames.has(candidate.en)) return true;
  return candidate.contexts.some((ctx) => {
    const text = ctx.text;
    const zh = ctx.zhRaw;
    const en = candidate.en;
    const index = text.indexOf(zh);
    const windowText = index >= 0 ? text.slice(Math.max(0, index - 90), index + zh.length + en.length + 150) : text;
    const mention = `${escapeRegExp(zh)}\\s*[（(]\\s*${escapeRegExp(en)}\\s*[）)]`;
    const titleBefore = "(?:公主|国王|王后|王子|祭司|先知|将军|执政官|信使|女儿|儿子|宁芙|贵族|指挥官|骑士|队长)";
    const titleAfter = "(?:公主|国王|王后|王子|祭司|先知|将军|执政官|信使|女儿|儿子|宁芙|贵族|指挥官|骑士|队长)";
    const speech = "(?:说|说道|问|问道|喊|喊道|回答|回答道|继续|继续说道|低声说道|笑着说|怒视|宣称|说道)";
    return new RegExp(`(?:名叫|叫作|叫做|自称|我是|他叫|她叫|名为)[^。！？\\n]{0,16}${mention}`).test(windowText)
      || new RegExp(`${titleBefore}[^。！？\\n]{0,10}${mention}`).test(windowText)
      || new RegExp(`${mention}[^。！？\\n]{0,10}${titleAfter}`).test(windowText)
      || new RegExp(`${mention}[^。！？\\n]{0,28}${speech}`).test(windowText)
      || new RegExp(`[“"]${mention}[^。！？\\n]{0,30}${speech}`).test(windowText)
      || new RegExp(`${mention}[^。！？\\n]{0,24}(?:的女儿|的儿子|的姐姐|的妹妹|的父亲|的母亲|的妻子|的丈夫)`).test(windowText)
      || new RegExp(`(?:Princess|King|Queen|Prince|Priest|Oracle|Prophet|General|Commander|Knight|Nymph|Messenger|Archon|Daughter|Son)\\s+${escapeRegExp(en)}\\b`).test(windowText)
      || new RegExp(`\\b${escapeRegExp(en)}\\s+(?:Princess|King|Queen|Prince|Priest|Oracle|Prophet|General|Commander|Knight|Nymph|Messenger|Archon)\\b`).test(windowText)
      || new RegExp(`\\b${escapeRegExp(en)}\\b[^.!?\\n]{0,28}\\b(?:said|asked|answered|shouted|whispered|declared)\\b`, "i").test(windowText);
  });
}

function candidateEvidence(candidate) {
  const { en, count, contexts } = candidate;
  const zh = chooseChineseName(candidate);
  const hasHint = contexts.some((ctx) => hasPersonHint(ctx.text, ctx.zhRaw, en));
  const strongEvidence = hasStrongPersonEvidence(candidate);
  const mythicOrHistorical = mythicOrHistoricalNames.has(en);
  const singlePersonalName = /^[A-Z][a-z'’-]{2,24}$/.test(en);
  const titledPersonalName = /^(?:The\s+)?[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,2}$/.test(en) && hasHint;
  const hasTitle = personTitleHints.some((hint) => zh.includes(hint))
    || /(?:Princess|King|Queen|Prince|Priest|Oracle|Prophet|General|Commander|Knight|Nymph|God|Goddess|Messenger|Archon|Captain|Leader|Daughter|Son|Father|Judge|Satrap|High Priest)/i.test(en);
  const genericTitle = genericUntitledNames.has(en);
  const groupLike = groupZhRe.test(zh) || groupEnglishRe.test(en);
  const placeOrThingLike = placeOrThingZhRe.test(zh)
    || /(?:Token|Track|Phase|Action|Card|Map|Icon|Table|Pool|Workshop|Temple|Shrine|Ruins|Armory|Fleet|Ship|Wreck|Trireme|Scroll|Contraption|Debt|Lunacy|Event|Outcome|Adventure|Delve|Battle|Engine|Harbor|Apadana|Marathon|Nineveh|Pasargadae|Nubia|Corinth|Underworld|Tartarus)$/i.test(en);
  const noisePhrase = /^(?:The|A|An)\s+(?:Sleep|Wind|Burden|Stray|Absent|Golden|Long|Other|Last|Flesh|Shape|Secret|Correct|Incorrect|Fate|Curse|Crime|Dream|Family|Gods|Deed|Tragedy)/i.test(en)
    || /^(?:如果|在|和|与|或|获得|失去|返回|做|添加|重置|选择|每个|个|张|块|单位|都|所以|然后|你|你们)/.test(zh);

  return {
    zh,
    en,
    count,
    hasHint,
    strongEvidence,
    mythicOrHistorical,
    singlePersonalName,
    titledPersonalName,
    hasTitle,
    genericTitle,
    groupLike,
    placeOrThingLike,
    noisePhrase,
  };
}

function classifyCandidate(candidate) {
  if (candidate.manual) return { status: "accepted", confidence: "manual", reason: "manual character override" };
  const evidence = candidateEvidence(candidate);
  const { zh, en, count } = evidence;
  const reject = (reason) => ({ status: "rejected", confidence: "rejected", reason, evidence });
  const audit = (reason, confidence = "audit") => ({ status: "audit", confidence, reason, evidence });
  const accept = (reason, confidence = "auto") => ({ status: "accepted", confidence, reason, evidence });

  if (!zh || !en) return reject("missing bilingual name");
  if (zh.length < 2 || zh.length > 12) return reject("chinese alias length outside person range");
  if (/^[A-Za-z]{1,2}$/.test(en)) return reject("english alias is too short to be a useful character link");
  if (/^[A-Z0-9]{1,4}$/.test(en)) return reject("english alias is too short or acronym-like");
  if (enDeny.has(en)) return reject("english deny-list");
  if (!isCleanChineseAlias(zh)) return reject("chinese alias failed cleanliness checks");
  if (isDeniedChineseAlias(zh)) return reject("chinese deny-list");
  if (trailingNoiseRe.test(zh) && !evidence.hasTitle) return reject("chinese alias has non-person suffix");
  if (evidence.noisePhrase) return reject("rule or prose phrase, not a name");
  if (evidence.placeOrThingLike) return reject("place, object, card, or abstract term");
  if (evidence.groupLike && !evidence.mythicOrHistorical) return reject("group, faction, or plural collective");
  if (!evidence.singlePersonalName && !evidence.titledPersonalName) return reject("english form is not a personal name");
  if (!evidence.strongEvidence) return audit("no strong person evidence near bilingual mention", "low");
  if (evidence.genericTitle && !evidence.mythicOrHistorical && count < 10) return audit("generic role title with limited evidence", "low");

  if (evidence.mythicOrHistorical) return accept("known mythic or historical personal name", "high");
  if (evidence.hasTitle && count >= 1) return accept("personal title evidence near bilingual mention", count >= 3 ? "high" : "medium");
  if (count >= 3 && evidence.hasHint) return accept("repeated personal name with dialogue/title hint", "medium");
  if (count >= 2 && evidence.singlePersonalName) return accept("repeated single personal name with strong evidence", "medium");
  return audit("single low-frequency personal-looking mention", "low");
}

function looksLikePersonCandidate(candidate) {
  return classifyCandidate(candidate).status === "accepted";
}

function buildCandidateAudit(candidates) {
  return [...candidates.values()]
    .map((candidate) => {
      const classification = classifyCandidate(candidate);
      const zh = classification.evidence?.zh || chooseChineseName(candidate);
      const first = candidate.contexts[0];
      return {
        id: candidate.id,
        name: zh,
        englishName: candidate.en,
        status: classification.status,
        confidence: classification.confidence,
        reason: classification.reason,
        count: candidate.count,
        firstSeen: first ? `${first.bookId.toUpperCase()} ${first.entry.id}` : "",
        aliases: [...candidate.aliases].filter(Boolean).slice(0, 12),
        evidence: classification.evidence,
        snippets: candidate.contexts.slice(0, 3).map((ctx) => ({
          book: ctx.bookId,
          id: ctx.entry.id,
          title: ctx.entry.title || ctx.entry.id,
          snippet: summarizeSnippet(ctx.text, [zh, candidate.en, ctx.zhRaw]),
        })),
      };
    })
    .sort((a, b) => {
      const statusOrder = { accepted: 0, audit: 1, rejected: 2 };
      return statusOrder[a.status] - statusOrder[b.status] || b.count - a.count || a.name.localeCompare(b.name, "zh-CN");
    });
}

function mergeDuplicateCandidates(candidateMap) {
  const groups = new Map();
  for (const candidate of candidateMap.values()) {
    const canonicalId = canonicalAliases.get(normalizeAlias(candidate.en))
      || canonicalAliases.get(normalizeAlias(candidate.zh))
      || autoCanonicalIds.get(normalizeAlias(candidate.en))
      || autoCanonicalIds.get(normalizeAlias(candidate.zh))
      || candidate.id;
    if (!groups.has(canonicalId)) groups.set(canonicalId, []);
    groups.get(canonicalId).push(candidate);
  }

  const merged = new Map();
  for (const [id, group] of groups) {
    const base = group.slice().sort((a, b) => b.count - a.count)[0];
    const combined = {
      ...base,
      key: id,
      id,
      aliases: new Set(),
      zhCounts: new Map(),
      count: 0,
      contexts: [],
      manual: group.some((candidate) => candidate.manual),
      manualCharacter: group.find((candidate) => candidate.manualCharacter)?.manualCharacter,
    };
    for (const candidate of group) {
      combined.count += candidate.count;
      for (const alias of candidate.aliases) combined.aliases.add(alias);
      for (const [zhName, zhCount] of candidate.zhCounts) combined.zhCounts.set(zhName, (combined.zhCounts.get(zhName) || 0) + zhCount);
      combined.contexts.push(...candidate.contexts);
      if (candidate.manualCharacter) combined.manualCharacter = candidate.manualCharacter;
    }
    combined.zh = chooseChineseName(combined);
    merged.set(id, combined);
  }
  candidateMap.clear();
  for (const [id, candidate] of merged) candidateMap.set(id, candidate);
}

function entryBookTitle(bookId) {
  return bookId.toUpperCase();
}

function summarizeSnippet(text, aliases) {
  const clean = text.replace(/\s+/g, " ").trim();
  const lowerAliases = aliases.map(normalizeAlias).filter(Boolean);
  let best = -1;
  for (const alias of lowerAliases) {
    const idx = normalizeAlias(clean).indexOf(alias);
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  if (best < 0) return clean.slice(0, 260);
  const start = Math.max(0, best - 90);
  const end = Math.min(clean.length, best + 220);
  return `${start > 0 ? "..." : ""}${clean.slice(start, end)}${end < clean.length ? "..." : ""}`;
}

function countMentions(text, aliases) {
  let total = 0;
  for (const alias of aliases) {
    if (!alias) continue;
    const pattern = new RegExp(escapeRegExp(alias), /[A-Za-z]/.test(alias) ? "gi" : "g");
    const matches = text.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferRole(character, entries) {
  if (character.role) return character.role;
  const haystack = `${character.name} ${character.englishName} ${entries.slice(0, 5).map((entry) => entry.snippet).join(" ")}`;
  const names = [character.name, character.englishName, ...(character.aliases || [])].filter(Boolean).map(escapeRegExp);
  const namePattern = names.length ? names.join("|") : "$^";
  if (new RegExp(`(?:公主[^。！？]{0,12}(?:${namePattern})|(?:${namePattern})[^。！？]{0,12}公主|Princess\\s+(?:${namePattern})|(?:${namePattern})\\s+Princess)`, "i").test(haystack)) return "公主";
  if (new RegExp(`(?:国王[^。！？]{0,12}(?:${namePattern})|(?:${namePattern})[^。！？]{0,12}国王|King\\s+(?:${namePattern})|(?:${namePattern})\\s+King)`, "i").test(haystack)) return "国王";
  if (new RegExp(`(?:王后[^。！？]{0,12}(?:${namePattern})|(?:${namePattern})[^。！？]{0,12}王后|Queen\\s+(?:${namePattern})|(?:${namePattern})\\s+Queen)`, "i").test(haystack)) return "王后";
  if (new RegExp(`(?:大?祭司[^。！？]{0,12}(?:${namePattern})|(?:${namePattern})[^。！？]{0,12}大?祭司|Priest\\s+(?:${namePattern})|(?:${namePattern})\\s+Priest)`, "i").test(haystack)) return "祭司";
  if (/^(?:Poseidon|Dionysus|Ares|Helios|Hera|Hermes|Aphrodite|Demeter|Zeus|Hades|Nyx|Moirai)$/i.test(character.englishName)) return "神话人物";
  if (new RegExp(`(?:宁芙[^。！？]{0,12}(?:${namePattern})|(?:${namePattern})[^。！？]{0,12}宁芙|Nymph\\s+(?:${namePattern})|(?:${namePattern})\\s+Nymph)`, "i").test(haystack)) return "神话性存在";
  if (new RegExp(`(?:信使[^。！？]{0,12}(?:${namePattern})|(?:${namePattern})[^。！？]{0,12}信使|Messenger\\s+(?:${namePattern})|(?:${namePattern})\\s+Messenger)`, "i").test(haystack)) return "信使";
  if (new RegExp(`(?:执政官[^。！？]{0,12}(?:${namePattern})|(?:${namePattern})[^。！？]{0,12}执政官|Archon\\s+(?:${namePattern})|(?:${namePattern})\\s+Archon)`, "i").test(haystack)) return "执政官";
  return "命名人物";
}

function inferFaction(character, entries) {
  if (character.faction) return character.faction;
  const chapterText = entries.map((entry) => `${entry.book} ${entry.chapter}`).join(" ");
  if (/c1|克里特|米诺斯|Knossos|Crete/i.test(chapterText)) return "克里特";
  if (/c2|斯巴达|Sparta/i.test(chapterText)) return "斯巴达";
  if (/c3|德尔菲|Delphi/i.test(chapterText)) return "德尔菲";
  if (/c4|巴比伦|Babylon/i.test(chapterText)) return "巴比伦";
  if (/c5|亚特兰蒂斯|Atlantis|Delos/i.test(chapterText)) return "亚特兰蒂斯";
  return "";
}

function makeNonSpoilerBio(character, entries) {
  if (character.bioNonSpoiler) return cleanBioLabelLanguage(character.bioNonSpoiler);
  const role = inferRole(character, entries);
  const faction = inferFaction(character, entries);
  const first = entries[0];
  if (!first) {
    return `${character.name}${character.englishName ? ` (${character.englishName})` : ""} 是故事中被记录的人物。`;
  }
  const chapters = [...new Set(entries.slice(0, 8).map((entry) => entry.chapter).filter(Boolean))].slice(0, 3);
  const scope = chapters.length ? `相关段落主要分布在${chapters.join("、")}。` : "相关段落分布在多个故事模块。";
  const factionText = faction ? `，与${faction}线有关` : "";
  return `${character.name}${character.englishName ? ` (${character.englishName})` : ""} 是 ${entryBookTitle(first.book)} ${first.id} 起出现的${role}${factionText}。${scope}这个人物会在对应剧情中提供信息、制造选择或体现当地局势。`;
}

function makeSpoilerBio(character, entries) {
  if (!entries.length) return `${character.name} 的相关段落尚未整理出清晰的人物故事。`;
  const manualLead = cleanBioLabelLanguage(character.bioSpoiler);
  const important = entries
    .filter((entry) => /死亡|死|杀|背叛|真相|揭示|承认|监视|间谍|拯救|选择|请求|加入|离开|失去|获得/.test(entry.snippet))
    .slice(0, 8);
  const selected = uniqueEntries([entries[0], ...important, ...entries.slice(-4)].filter(Boolean)).slice(0, 9);
  const refs = selected.map((entry) => `${entry.book.toUpperCase()} ${entry.id}`).join("、");
  const detail = selected.map((entry) => compactSnippet(entry.snippet, 150)).join(" / ");
  const generated = `${character.name} 的人物故事可追踪到 ${entries.length} 个相关段落，关键参考包括 ${refs}。从这些段落可以看到：${detail}`;
  return manualLead ? `${manualLead}\n\n${generated}` : generated;
}

function cleanBioLabelLanguage(value) {
  return String(value || "")
    .replace(/^剧透版[:：]\s*/u, "")
    .replace(/非剧透来看[，,]?\s*/gu, "")
    .trim();
}

function uniqueEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.book}:${entry.key || entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactSnippet(value, length = 150) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length).replace(/[，。；：、\s]+$/u, "")}...`;
}

function isNonPersonAliasUse(raw, text, index) {
  const alias = String(raw || "");
  const after = text.slice(index + alias.length, index + alias.length + 48);
  if (/[\u3400-\u9fff]/.test(alias)) {
    return /^(?:宝库|器械|机器|机械|工坊|工作坊|下水道|安全屋|装置|科技|资源|卡|牌)/u.test(after)
      || /^的(?:宝库|器械|机器|机械|工坊|工作坊|下水道|安全屋|装置|科技|资源|卡|牌)/u.test(after);
  }
  if (/[A-Za-z]/.test(alias)) {
    return /^\s+(?:Vault|Makina|Machina|Machinae|Machine|Machines|Workshops?|Sewers?|Safehouse|Contraption|Technology|Gear|Card|Resource)\b/i.test(after)
      || /^'s\s+(?:Vault|Makina|Machina|Machinae|Machine|Machines|Workshops?|Sewers?|Safehouse|Contraption|Technology|Gear|Card|Resource)\b/i.test(after);
  }
  return false;
}

function buildStoryCollection(entries) {
  const byBook = new Map();
  for (const entry of entries) {
    if (!byBook.has(entry.book)) byBook.set(entry.book, []);
    byBook.get(entry.book).push(entry);
  }
  return [...byBook.entries()].map(([book, bookEntries]) => ({
    book,
    title: entryBookTitle(book),
    entryCount: bookEntries.length,
    entries: bookEntries.map((entry) => ({
      key: entry.key,
      id: entry.id,
      title: entry.title,
      chapter: entry.chapter,
      encounter: entry.encounter || "",
      mentionCount: entry.mentionCount,
      snippet: entry.snippet,
    })),
  }));
}

async function loadStoryData() {
  const source = await fs.readFile(dataPath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { timeout: 30000 });
  return sandbox.window.STORYBOOK_DATA;
}

function extractCandidates(data) {
  const pairRe = /([\u3400-\u9fff][\u3400-\u9fff·・\s]{0,18}?)\s*[（(]\s*([A-Z][A-Za-z'’\-\s]{1,48})\s*[）)]/g;
  const candidates = new Map();
  const entries = [];

  for (const book of data.books.filter((item) => sourceBooks.has(item.id))) {
    for (const entry of book.entries) {
      const text = `${entry.title || ""}\n${entry.text || ""}`;
      entries.push({ book, entry, text });
      let match;
      while ((match = pairRe.exec(text))) {
        const zhRaw = match[1].replace(/\s+/g, "").trim();
        const zh = cleanChineseName(zhRaw);
        const en = cleanEnglishName(match[2]);
        if (!zh || !en) continue;
        const manualId = canonicalAliases.get(normalizeAlias(zh)) || canonicalAliases.get(normalizeAlias(en));
        const key = manualId || `auto:${normalizeAlias(en)}`;
        if (!candidates.has(key)) {
          candidates.set(key, {
            key,
            id: manualId || slugify(en || zh),
            zh,
            en,
            aliases: new Set([zh, en]),
            zhCounts: new Map(),
            count: 0,
            contexts: [],
            manual: Boolean(manualId),
          });
        }
        const candidate = candidates.get(key);
        candidate.count += 1;
        candidate.zhCounts.set(zh, (candidate.zhCounts.get(zh) || 0) + 1);
        candidate.zh = chooseChineseName(candidate);
        if (isCleanChineseAlias(zh)) candidate.aliases.add(zh);
        candidate.aliases.add(en);
        if (zhRaw !== zh && isCleanChineseAlias(zhRaw)) candidate.aliases.add(zhRaw);
        candidate.contexts.push({
          bookId: book.id,
          entry,
          text,
          zhRaw,
          zh,
          en,
        });
      }
    }
  }

  return { candidates, entries };
}

function mergeManualCharacters(candidateMap) {
  for (const character of manualCharacters) {
    if (!candidateMap.has(character.id)) {
      candidateMap.set(character.id, {
        key: character.id,
        id: character.id,
        zh: character.name,
        en: character.englishName,
        aliases: new Set([character.name, character.englishName, ...(character.aliases || []), ...(character.matchAliases || [])].filter(Boolean)),
        zhCounts: new Map([[character.name, 1]]),
        count: 0,
        contexts: [],
        manual: true,
        manualCharacter: character,
      });
    } else {
      const candidate = candidateMap.get(character.id);
      candidate.manual = true;
      candidate.manualCharacter = character;
      [character.name, character.englishName, ...(character.aliases || []), ...(character.matchAliases || [])]
        .filter(Boolean)
        .forEach((alias) => candidate.aliases.add(alias));
      candidate.zhCounts.set(character.name, (candidate.zhCounts.get(character.name) || 0) + 1);
    }
  }
}

function buildCharacters(data, candidates, allEntries) {
  mergeManualCharacters(candidates);
  mergeDuplicateCandidates(candidates);
  const accepted = [...candidates.values()]
    .filter((candidate) => candidate.manual || looksLikePersonCandidate(candidate));

  const characterDrafts = accepted.map((candidate) => {
    const manual = candidate.manualCharacter || manualCharacters.find((item) => item.id === candidate.id) || {};
    const cleanAutoZh = chooseChineseName(candidate);
    const aliasSource = manual.id
      ? [manual.name, manual.englishName, ...(manual.aliases || [])]
      : [cleanAutoZh, candidate.en, ...[...candidate.aliases].filter((alias) => /[A-Za-z]/.test(alias) && autoCanonicalIds.get(normalizeAlias(alias)) === candidate.id)];
    const aliases = aliasSource
      .map((alias) => String(alias || "").trim())
      .filter(Boolean)
      .filter((alias) => /[A-Za-z]/.test(alias) || isCleanChineseAlias(alias))
      .filter((alias, index, list) => list.findIndex((item) => normalizeAlias(item) === normalizeAlias(alias)) === index)
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    const matchAliases = (manual.matchAliases && manual.matchAliases.length ? manual.matchAliases : aliases)
      .filter((alias) => alias && !/^[A-Z0-9]{1,4}$/.test(alias));

    const name = manual.name || cleanAutoZh;
    const englishName = manual.englishName || candidate.en;
    return {
      id: manual.id || candidate.id,
      name,
      englishName,
      aliases,
      matchAliases,
      role: manual.role || "",
      faction: manual.faction || "",
      manual,
    };
  });

  const mentionIndex = collectStoryMentions(characterDrafts, allEntries);

  const characters = characterDrafts.map((draft) => {
    const storyEntries = (mentionIndex.get(draft.id) || [])
      .sort((a, b) => a.book.localeCompare(b.book) || a.order - b.order || String(a.id).localeCompare(String(b.id)));

    const character = {
      id: draft.id,
      name: draft.name,
      englishName: draft.englishName,
      aliases: draft.aliases,
      matchAliases: draft.matchAliases,
      role: draft.role,
      faction: draft.faction,
      firstSeen: storyEntries[0] ? `${storyEntries[0].book.toUpperCase()} ${storyEntries[0].id}` : "",
      mentionCount: storyEntries.reduce((sum, entry) => sum + entry.mentionCount, 0),
      entryCount: storyEntries.length,
      storyEntries,
    };
    character.role = inferRole({ ...character, ...draft.manual }, storyEntries);
    character.faction = inferFaction({ ...character, ...draft.manual }, storyEntries);
    character.bioNonSpoiler = makeNonSpoilerBio({ ...character, ...draft.manual }, storyEntries);
    character.bioSpoiler = makeSpoilerBio({ ...character, ...draft.manual }, storyEntries);
    character.bio = character.bioNonSpoiler;
    character.storyCollection = buildStoryCollection(storyEntries);
    if (draft.manual.notes) character.notes = draft.manual.notes;
    return character;
  });

  characters.sort((a, b) => b.entryCount - a.entryCount || a.name.localeCompare(b.name, "zh-CN"));
  return characters;
}

function collectStoryMentions(characters, allEntries) {
  const aliasRecords = [];
  const aliasToCharacterIds = new Map();
  for (const character of characters) {
    for (const alias of character.matchAliases) {
      const clean = String(alias || "").trim();
      if (!clean || clean.length < 2) continue;
      const key = normalizeAlias(clean);
      if (!aliasToCharacterIds.has(key)) aliasToCharacterIds.set(key, new Set());
      aliasToCharacterIds.get(key).add(character.id);
      aliasRecords.push(clean);
    }
  }

  const uniqueAliases = [...new Set(aliasRecords)]
    .sort((a, b) => b.length - a.length || a.localeCompare(b, "zh-CN"));
  const pattern = new RegExp(uniqueAliases.map(escapeRegExp).join("|"), "gi");
  const byCharacter = new Map(characters.map((character) => [character.id, []]));
  const characterById = new Map(characters.map((character) => [character.id, character]));

  for (const { book, entry, text } of allEntries) {
    pattern.lastIndex = 0;
    const counts = new Map();
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[0];
      const key = normalizeAlias(raw);
      const ids = aliasToCharacterIds.get(key);
      if (!ids) continue;
      const prevChar = text[match.index - 1] || "";
      const nextChar = text[match.index + raw.length] || "";
      if (/^[A-Za-z]/.test(raw) && (/[A-Za-z]/.test(prevChar) || /[A-Za-z]/.test(nextChar))) continue;
      if (/[\u3400-\u9fff]/.test(raw) && /[人族徒们号舰队]/.test(nextChar)) continue;
      const trailingParen = text.slice(match.index + raw.length, match.index + raw.length + 32);
      if (/^\s*[（(]\s*(?:Minoans?|Labyrinthians?|Argonauts?|Titans?|Spartans?|Helots?|Cyclopes?|Delphians?|Aristotelians?|Cloud Thieves|Wasters|Followers|Refugees)/i.test(trailingParen)) continue;
      for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    }

    for (const [id, mentionCount] of counts) {
      const character = characterById.get(id);
      byCharacter.get(id).push({
        book: book.id,
        key: entry.key,
        id: entry.id,
        title: entry.title || entry.id,
        chapter: entry.chapter || "",
        chapterKey: entry.chapterKey || "",
        encounter: entry.encounter || "",
        encounterKey: entry.encounterKey || "",
        order: entry.order,
        mentionCount,
        snippet: summarizeSnippet(text, character.matchAliases),
      });
    }
  }

  return byCharacter;
}

async function main() {
  const data = await loadStoryData();
  const { candidates, entries } = extractCandidates(data);
  const characters = buildCharacters(data, candidates, entries);
  const candidateAudit = buildCandidateAudit(candidates);
  const payload = {
    generatedAt: new Date().toISOString(),
    generator: "tools/generate-story-characters.mjs",
    sourceBooks: [...sourceBooks],
    characterCount: characters.length,
    characters,
  };
  const frontendPayload = {
    generatedAt: payload.generatedAt,
    generator: payload.generator,
    sourceBooks: payload.sourceBooks,
    characterCount: payload.characterCount,
    characters: characters.map((character) => ({
      id: character.id,
      name: character.name,
      englishName: character.englishName,
      aliases: character.aliases,
      matchAliases: character.matchAliases,
      role: character.role,
      faction: character.faction,
      firstSeen: character.firstSeen,
      mentionCount: character.mentionCount,
      entryCount: character.entryCount,
      bio: character.bio,
      bioNonSpoiler: character.bioNonSpoiler,
      bioSpoiler: character.bioSpoiler,
      storyEntries: character.storyEntries,
      storyCollection: character.storyCollection,
      storyPreview: character.storyEntries.map((entry) => ({
        book: entry.book,
        key: entry.key,
        id: entry.id,
        title: entry.title,
        chapter: entry.chapter,
        encounter: entry.encounter || "",
        mentionCount: entry.mentionCount,
        snippet: entry.snippet,
      })),
      notes: character.notes,
    })),
  };

  const json = JSON.stringify(payload, null, 2);
  const frontendJson = JSON.stringify(frontendPayload, null, 2);
  const auditPayload = {
    generatedAt: payload.generatedAt,
    generator: payload.generator,
    sourceBooks: payload.sourceBooks,
    acceptedCount: characters.length,
    auditCount: candidateAudit.filter((item) => item.status === "audit").length,
    rejectedCount: candidateAudit.filter((item) => item.status === "rejected").length,
    candidates: candidateAudit,
  };
  const auditJson = JSON.stringify(auditPayload, null, 2);
  await fs.writeFile(outJsonPath, `${json}\n`, "utf8");
  await fs.writeFile(outJsPath, `(function () {\n  window.STORY_CHARACTER_DATA = ${frontendJson};\n})();\n`, "utf8");
  await fs.writeFile(outAuditPath, `${auditJson}\n`, "utf8");
  console.log(`Generated ${characters.length} characters`);
  console.log(`Wrote ${path.relative(rootDir, outJsPath)}`);
  console.log(`Wrote ${path.relative(rootDir, outJsonPath)}`);
  console.log(`Wrote ${path.relative(rootDir, outAuditPath)}`);
  console.log(`Audit candidates: ${auditPayload.auditCount}; rejected candidates: ${auditPayload.rejectedCount}`);
  const acacallis = characters.find((item) => item.id === "acacallis");
  if (!acacallis || !acacallis.matchAliases.includes("Minoan Guide") || !acacallis.matchAliases.includes("米诺斯向导")) {
    throw new Error("Acacallis/Minoan Guide merge rule did not apply");
  }
  const forbiddenTerms = ["Minoan", "Minoans", "米诺斯人", "Dynasty", "Sirens", "The Poseidonites", "Poseidonite", "Purists", "Stewards"];
  const forbiddenHits = characters.flatMap((character) => {
    const values = [character.name, character.englishName, ...(character.aliases || []), ...(character.matchAliases || [])];
    return values
      .filter((value) => forbiddenTerms.some((term) => normalizeAlias(value) === normalizeAlias(term)))
      .map((value) => `${character.id}:${value}`);
  });
  if (forbiddenHits.length) {
    throw new Error(`Forbidden non-character terms leaked into characters: ${forbiddenHits.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
