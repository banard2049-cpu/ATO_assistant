import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(rootDir, "story", "data", "storybook-data.js");
const outJsonPath = path.join(rootDir, "story", "data", "entity-index.json");
const outCsvPath = path.join(rootDir, "story", "data", "entity-index.csv");
const outJsPath = path.join(rootDir, "story", "data", "entity-index.js");
const outAuditPath = path.join(rootDir, "story", "data", "entity-index.audit.json");

const sourceBooks = new Set(["c1", "c2", "c3", "c4", "c5"]);
const skippedEntryTitle = /制作人员名单|Credits?/i;

const manualMerges = new Map([
  ["the argo", "argo"],
  ["argo", "argo"],
  ["the argonauts", "argonauts"],
  ["the argonaut", "argonauts"],
  ["argonaut", "argonauts"],
  ["argonauts", "argonauts"],
  ["the nietzschean", "nietzschean"],
  ["achilles", "nietzschean"],
  ["king minos", "minos"],
  ["minos", "minos"],
  ["prince theseus", "theseus"],
  ["theseus", "theseus"],
  ["the punished", "theseus"],
  ["punished", "theseus"],
  ["minoans", "minoans"],
  ["minoan", "minoans"],
  ["labyrinthians", "labyrinthians"],
  ["labyrinthian", "labyrinthians"],
  ["labyrinth stewards", "labyrinth-stewards"],
  ["labyrinth steward", "labyrinth-stewards"],
  ["hornsworn", "hornsworn"],
  ["cloud thief", "cloud-thieves"],
  ["cloud thieves", "cloud-thieves"],
  ["waster", "wasters"],
  ["wasters", "wasters"],
  ["poseidonite", "poseidonites"],
  ["poseidonites", "poseidonites"],
  ["purist", "purists"],
  ["purists", "purists"],
  ["immortal", "immortals"],
  ["immortals", "immortals"],
  ["deprived immortal", "deprived-immortals"],
  ["deprived immortals", "deprived-immortals"],
  ["siren", "sirens"],
  ["sirens", "sirens"],
  ["follower", "followers"],
  ["followers", "followers"],
  ["the followers", "followers"],
  ["refugee", "refugees"],
  ["refugees", "refugees"],
  ["cretan", "cretans"],
  ["cretans", "cretans"],
  ["mortal", "mortals"],
  ["mortals", "mortals"],
  ["delphian", "delphians"],
  ["delphians", "delphians"],
  ["athenian", "athenians"],
  ["athenians", "athenians"],
  ["cycladean", "cycladeans"],
  ["cycladeans", "cycladeans"],
  ["atlantean", "atlanteans"],
  ["atlanteans", "atlanteans"],
  ["olympian", "olympians"],
  ["olympians", "olympians"],
  ["imperial", "empire"],
  ["imperials", "empire"],
  ["the empire", "empire"],
  ["elaborator", "elaborators"],
  ["elaborators", "elaborators"],
  ["watch", "twilight-watch"],
  ["the watch", "twilight-watch"],
  ["titan", "titans"],
  ["titans", "titans"],
  ["primordial", "primordials"],
  ["primordials", "primordials"],
  ["cyclops", "cyclopes"],
  ["cyclopes", "cyclopes"],
  ["the symmachy", "symmachy"],
  ["the protectorate", "protectorate"],
  ["sun descendant", "sunheirs"],
  ["sun's descendant", "sunheirs"],
  ["the eschaton", "eschaton"],
  ["escha-ton", "eschaton"],
  ["voyagephase", "voyage-phase"],
  ["voyage phase", "voyage-phase"],
  ["helot", "helots"],
  ["helots", "helots"],
  ["spartan", "spartans"],
  ["spartans", "spartans"],
  ["aristotelian", "aristotelians"],
  ["aristotelians", "aristotelians"],
  ["sunheir", "sunheirs"],
  ["sunheirs", "sunheirs"],
  ["sun god", "helios"],
  ["the sun god", "helios"],
  ["god-king", "xerxes"],
  ["the god-king", "xerxes"],
  ["marathonian", "marathonian"],
  ["the marathonian", "marathonian"],
  ["aspirant", "aspirant"],
  ["hemiolia", "hemiolia"],
  ["alkibiades", "alkibiades"],
  ["alcibiades", "alkibiades"],
  ["axiothea", "axiothea"],
  ["artemisia", "artemisia"],
  ["artabanus", "artabanus"],
  ["socratoares", "socratoares"],
  ["ephialtes", "ephialtes"],
  ["hephaestus", "hephaestus"],
  ["pandora", "pandora"],
  ["temenos", "temenos"],
  ["midascore", "midascore"],
  ["demidjinn", "demidjinn"],
  ["minoan guide", "minoan-guide"],
  ["anostos", "anostos"],
  ["atlantean capital", "atlantean-capital"],
  ["sardis", "sardis"],
  ["ashur", "ashur"],
  ["uruk", "uruk"],
  ["hekatompylos", "hekatompylos"],
  ["ios", "ios"],
  ["gerrha", "gerrha"],
  ["palirroia", "palirroia"],
  ["resistance", "resistance"],
  ["hermesian pursuer", "hermesian-pursuer"],
  ["trade fleet dock", "trade-fleet-dock"],
  ["excursion propylon", "excursion-propylon"],
  ["mnestis theatre", "mnestis-theatre"],
  ["endless staircase", "endless-staircase"],
  ["dark below", "dark-below"],
  ["sun's domain", "sun-s-domain"],
  ["sun domain", "sun-s-domain"],
  ["diktaion antron", "diktaion-antron"],
  ["akleios cove", "akleios-cove"],
  ["nereidas ptoliethra", "nereidas-ptoliethra"],
  ["dionysus liknites", "dionysus-liknites"],
  ["map tile", "map-tile"],
  ["tile", "map-tile"],
  ["bp deck", "bp-deck"],
  ["ai deck", "ai-deck"],
  ["argo fate", "argo-fate"],
  ["argofate", "argo-fate"],
  ["argefate", "argo-fate"],
  ["argo knowledge", "argo-knowledge"],
  ["argoknowledge", "argo-knowledge"],
  ["babeliandebt", "babelian-debt"],
  ["babelian debt", "babelian-debt"],
  ["boons", "boon"],
  ["triskelions", "triskelion"],
  ["doom token", "doom-token"],
  ["doomtoken", "doom-token"],
  ["progress token", "progress-token"],
  ["progresstoken", "progress-token"],
  ["daedalus vault", "daedalus-vault"],
  ["daedalus's vault", "daedalus-vault"],
  ["daedalus workshops", "daedalus-workshops"],
  ["daedalus workshop", "daedalus-workshops"],
  ["daedalus machina", "daedalus-machina"],
  ["daedalus's machina", "daedalus-machina"],
  ["daedalus makina", "daedalus-machina"],
]);

const manualNames = new Map([
  ["argo", { zh: "阿尔戈号", en: "Argo", category: "地点" }],
  ["nietzschean", { zh: "尼采超人", en: "Nietzschean", category: "人物" }],
  ["minos", { zh: "米诺斯", en: "Minos", category: "人物" }],
  ["theseus", { zh: "忒修斯", en: "Theseus", category: "人物" }],
  ["helios", { zh: "赫利俄斯", en: "Helios", category: "人物" }],
  ["minoans", { zh: "米诺斯人", en: "Minoans", category: "派别" }],
  ["labyrinthians", { zh: "迷宫徒", en: "Labyrinthians", category: "派别" }],
  ["labyrinth-stewards", { zh: "迷宫管家", en: "Labyrinth Stewards", category: "派别" }],
  ["hornsworn", { zh: "角誓者", en: "Hornsworn", category: "派别" }],
  ["cloud-thieves", { zh: "云贼", en: "Cloud Thieves", category: "派别" }],
  ["wasters", { zh: "浪费者", en: "Wasters", category: "派别" }],
  ["poseidonites", { zh: "波塞冬信徒", en: "Poseidonites", category: "派别" }],
  ["purists", { zh: "纯粹主义者", en: "Purists", category: "派别" }],
  ["immortals", { zh: "不朽者", en: "Immortals", category: "派别" }],
  ["deprived-immortals", { zh: "被剥夺者不朽者", en: "Deprived Immortals", category: "派别" }],
  ["argonauts", { zh: "阿尔戈英雄", en: "Argonauts", category: "派别" }],
  ["titans", { zh: "泰坦", en: "Titans", category: "派别" }],
  ["primordials", { zh: "始徒", en: "Primordials", category: "派别" }],
  ["cyclopes", { zh: "独眼巨人", en: "Cyclopes", category: "派别" }],
  ["helots", { zh: "希洛人", en: "Helots", category: "派别" }],
  ["spartans", { zh: "斯巴达人", en: "Spartans", category: "派别" }],
  ["aristotelians", { zh: "亚里士多德远征军", en: "Aristotelians", category: "派别" }],
  ["symmachy", { zh: "邦联同盟", en: "Symmachy", category: "派别" }],
  ["protectorate", { zh: "罗德保护国", en: "Protectorate", category: "派别" }],
  ["sunheirs", { zh: "太阳后裔", en: "Sunheirs", category: "派别" }],
  ["twilight-watch", { zh: "暮光守望", en: "Twilight Watch", category: "派别" }],
  ["empire", { zh: "帝国", en: "Empire", category: "派别" }],
  ["eternal-empire", { zh: "永恒帝国", en: "Eternal Empire", category: "派别" }],
  ["vanguard", { zh: "弃民先锋", en: "Vanguard", category: "派别" }],
  ["followers", { zh: "追随者", en: "Followers", category: "派别" }],
  ["refugees", { zh: "难民", en: "Refugees", category: "派别" }],
  ["mortals", { zh: "凡人", en: "Mortals", category: "派别" }],
  ["horned-guard", { zh: "牛角卫", en: "Horned Guard", category: "派别" }],
  ["argonites", { zh: "阿尔戈尼特人", en: "Argonites", category: "派别" }],
  ["bargonaut", { zh: "巴尔戈英雄", en: "Bargonaut", category: "派别" }],
  ["bargonauts", { zh: "巴尔戈英雄", en: "Bargonauts", category: "派别" }],
  ["argo-centimanes", { zh: "阿尔戈号多臂巨人", en: "Argo Centimanes", category: "派别" }],
  ["argo-bred", { zh: "人造泰坦", en: "Argo-bred", category: "派别" }],
  ["labyrinthian-cult", { zh: "迷宫徒邪教", en: "Labyrinthian Cult", category: "派别" }],
  ["labyrinthine-cult", { zh: "迷宫徒邪教", en: "Labyrinthine Cult", category: "派别" }],
  ["cult-of-the-labyrinth", { zh: "迷宫邪教", en: "Cult of the Labyrinth", category: "派别" }],
  ["ecclesia", { zh: "市民议会", en: "Ecclesia", category: "派别" }],
  ["minoans-dynasty", { zh: "米诺斯王朝", en: "Minoan Dynasty", category: "派别" }],
  ["minoan-dynasty", { zh: "米诺斯王朝", en: "Minoan Dynasty", category: "派别" }],
  ["daedalus-vault", { zh: "代达罗斯宝库", en: "Daedalus Vault", category: "地点" }],
  ["daedalus-workshops", { zh: "代达罗斯工坊", en: "Daedalus Workshops", category: "地点" }],
  ["daedalus-machina", { zh: "代达罗斯器械", en: "Daedalus Machina", category: "物品/装备/资源" }],
  ["minos-manos-unit", { zh: "米诺斯劘盘单元", en: "Minos Manos Unit", category: "物品/装备/资源" }],
  ["labyrinthian-temple", { zh: "迷宫神庙", en: "Labyrinthian Temple", category: "地点" }],
  ["temple-of-man", { zh: "人之神殿", en: "Temple of Man", category: "地点" }],
  ["argo-works", { zh: "阿尔戈号工厂", en: "Argo Works", category: "地点" }],
  ["labyrinth", { zh: "迷宫", en: "Labyrinth", category: "地点" }],
  ["maze", { zh: "迷宫", en: "Maze", category: "地点" }],
  ["argo-fate", { zh: "阿尔戈号命运", en: "Argo Fate", category: "规则/状态" }],
  ["argo-knowledge", { zh: "阿尔戈号知识", en: "Argo Knowledge", category: "规则/状态" }],
  ["doom-token", { zh: "灾祸指示物", en: "Doom Token", category: "物品/装备/资源" }],
  ["progress-token", { zh: "进展指示物", en: "Progress Token", category: "物品/装备/资源" }],
  ["hope-tokens", { zh: "希望指示物", en: "Hope Tokens", category: "物品/装备/资源" }],
  ["summoning-token", { zh: "召唤指示物", en: "Summoning Token", category: "物品/装备/资源" }],
  ["argoxiphi", { zh: "阿尔戈短剑", en: "Argoxiphi", category: "物品/装备/资源" }],
  ["argoxiphos", { zh: "阿尔戈西福斯短剑", en: "Argoxiphos", category: "物品/装备/资源" }],
  ["nietzschean-empire", { zh: "尼采超人帝国", en: "Nietzschean Empire", category: "派别" }],
  ["friendly", { zh: "友好", en: "Friendly", category: "规则/状态" }],
  ["unfriendly", { zh: "不友好", en: "Unfriendly", category: "规则/状态" }],
  ["neutral", { zh: "中立", en: "Neutral", category: "规则/状态" }],
  ["hostile", { zh: "敌对", en: "Hostile", category: "规则/状态" }],
  ["allied", { zh: "结盟", en: "Allied", category: "规则/状态" }],
  ["kratos", { zh: "协力", en: "Kratos", category: "规则/状态" }],
  ["protectorate-diplomacy", { zh: "保护国外交", en: "Protectorate Diplomacy", category: "规则/状态" }],
  ["protectorate-backup", { zh: "保护国后援", en: "Protectorate Backup", category: "其他" }],
  ["protectorate-alliance", { zh: "保护国联盟", en: "Protectorate Alliance", category: "其他" }],
  ["nemesis", { zh: "涅墨西斯号", en: "Nemesis", category: "地点" }],
  ["timefront", { zh: "时间前线", en: "Timefront", category: "其他" }],
  ["golden-mean", { zh: "黄金平均", en: "Golden Mean", category: "其他" }],
  ["law-of-bargains", { zh: "契约法则", en: "Law of Bargains", category: "规则/状态" }],
  ["nicomachean-ethics", { zh: "尼各马可伦理学", en: "Nicomachean Ethics", category: "其他" }],
  ["triskelion", { zh: "三幅节", en: "Triskelion", category: "其他" }],
  ["aether", { zh: "以太", en: "Aether", category: "其他" }],
  ["ur-fleece", { zh: "原初金羊毛", en: "Ur-Fleece", category: "物品/装备/资源" }],
  ["midas-curse", { zh: "迈达斯诅咒", en: "Midas Curse", category: "规则/状态" }],
  ["titan-stoa", { zh: "泰坦柱廊", en: "Titan Stoa", category: "地点" }],
  ["disaster", { zh: "灾难", en: "Disaster", category: "事件/章节" }],
  ["pandora-horizon", { zh: "潘多拉视界", en: "Pandora Horizon", category: "其他" }],
  ["twilight-epoch", { zh: "暮光时代", en: "Twilight Epoch", category: "事件/章节" }],
  ["rhodes", { zh: "罗德", en: "Rhodes", category: "地点" }],
  ["olympus", { zh: "奥林匹斯", en: "Olympus", category: "地点" }],
  ["persepolis", { zh: "波斯波利斯", en: "Persepolis", category: "地点" }],
  ["isfahan", { zh: "伊斯法罕", en: "Isfahan", category: "地点" }],
  ["bishapur", { zh: "比沙普尔", en: "Bishapur", category: "地点" }],
  ["petra", { zh: "佩特拉", en: "Petra", category: "地点" }],
  ["atlanteans", { zh: "亚特兰蒂斯人", en: "Atlanteans", category: "派别" }],
  ["cycladeans", { zh: "基克拉泽人", en: "Cycladeans", category: "派别" }],
  ["cretans", { zh: "克里特人", en: "Cretans", category: "派别" }],
  ["delphians", { zh: "德尔菲人", en: "Delphians", category: "派别" }],
  ["athenians", { zh: "雅典人", en: "Athenians", category: "派别" }],
  ["olympians", { zh: "奥林匹斯众神", en: "Olympians", category: "派别" }],
  ["sirens", { zh: "塞壬", en: "Sirens", category: "派别" }],
  ["gods", { zh: "众神", en: "Gods", category: "派别" }],
  ["eschaton", { zh: "末世", en: "Eschaton", category: "事件/章节" }],
  ["alkibiades", { zh: "阿尔西比亚德斯", en: "Alkibiades", category: "人物" }],
  ["axiothea", { zh: "阿克西奥西娅", en: "Axiothea", category: "人物" }],
  ["artemisia", { zh: "阿耳忒弥西亚", en: "Artemisia", category: "人物" }],
  ["artabanus", { zh: "阿尔塔巴努斯", en: "Artabanus", category: "人物" }],
  ["socratoares", { zh: "苏格拉托雷斯", en: "Socratoares", category: "人物" }],
  ["ephialtes", { zh: "埃菲阿尔特斯", en: "Ephialtes", category: "人物" }],
  ["hephaestus", { zh: "赫菲斯托斯", en: "Hephaestus", category: "人物" }],
  ["pandora", { zh: "潘多拉", en: "Pandora", category: "人物" }],
  ["minoan-guide", { zh: "米诺斯向导", en: "Minoan Guide", category: "人物" }],
  ["temenos", { zh: "吞域兽", en: "Temenos", category: "人物" }],
  ["midascore", { zh: "迈达狮", en: "Midascore", category: "人物" }],
  ["demidjinn", { zh: "半神迪精", en: "Demidjinn", category: "人物" }],
  ["hermesian-pursuer", { zh: "赫尔墨斯追踪者", en: "Hermesian Pursuer", category: "人物" }],
  ["anostos", { zh: "阿诺斯托斯", en: "Anostos", category: "地点" }],
  ["atlantean-capital", { zh: "亚特兰蒂斯首都", en: "Atlantean Capital", category: "地点" }],
  ["sardis", { zh: "萨迪斯", en: "Sardis", category: "地点" }],
  ["ashur", { zh: "亚述", en: "Ashur", category: "地点" }],
  ["uruk", { zh: "乌鲁克", en: "Uruk", category: "地点" }],
  ["hekatompylos", { zh: "赫卡托姆皮洛斯", en: "Hekatompylos", category: "地点" }],
  ["ios", { zh: "伊奥斯", en: "Ios", category: "地点" }],
  ["gerrha", { zh: "格拉", en: "Gerrha", category: "地点" }],
  ["mnestis-theatre", { zh: "忆识剧场", en: "Mnestis Theatre", category: "地点" }],
  ["endless-staircase", { zh: "无尽阶梯", en: "Endless Staircase", category: "地点" }],
  ["dark-below", { zh: "黑暗深渊", en: "Dark Below", category: "地点" }],
  ["sun-s-domain", { zh: "太阳领域", en: "Sun's Domain", category: "地点" }],
  ["trade-fleet-dock", { zh: "贸易舰队码头", en: "Trade Fleet Dock", category: "地点" }],
  ["excursion-propylon", { zh: "出击山门", en: "Excursion Propylon", category: "地点" }],
  ["diktaion-antron", { zh: "迪克提洞穴", en: "Diktaion Antron", category: "地点" }],
  ["akleios-cove", { zh: "阿克利奥斯湾", en: "Akleios Cove", category: "地点" }],
  ["nereidas-ptoliethra", { zh: "涅瑞伊得斯·普托利埃特拉", en: "Nereidas Ptoliethra", category: "地点" }],
  ["resistance", { zh: "抵抗组织", en: "Resistance", category: "派别" }],
  ["palirroia", { zh: "帕里罗亚", en: "Palirroia", category: "派别" }],
  ["elaborators", { zh: "阐述者", en: "Elaborators", category: "派别" }],
  ["marathonian", { zh: "马拉松号", en: "Marathonian", category: "地点" }],
  ["hemiolia", { zh: "赫米奥拉", en: "Hemiolia", category: "地点" }],
  ["aspirant", { zh: "渴望号", en: "Aspirant", category: "地点" }],
  ["dionysus-liknites", { zh: "狄俄尼索斯·利克尼特斯", en: "Dionysus Liknites", category: "人物" }],
  ["delphi", { zh: "德尔菲", en: "Delphi", category: "地点" }],
  ["lakonia", { zh: "拉科尼亚", en: "Lakonia", category: "地点" }],
  ["hellas", { zh: "希腊", en: "Hellas", category: "地点" }],
  ["expeditionary-force", { zh: "远征军", en: "Expeditionary Force", category: "派别" }],
  ["dionysian", { zh: "狄俄尼索斯信众", en: "Dionysian", category: "派别" }],
  ["poseidon", { zh: "波塞冬", en: "Poseidon", category: "人物" }],
  ["apollo", { zh: "阿波罗", en: "Apollo", category: "人物" }],
  ["athena", { zh: "雅典娜", en: "Athena", category: "人物" }],
  ["ares", { zh: "阿瑞斯", en: "Ares", category: "人物" }],
  ["hermes", { zh: "赫尔墨斯", en: "Hermes", category: "人物" }],
  ["dionysus", { zh: "狄俄尼索斯", en: "Dionysus", category: "人物" }],
]);

const manualZhAliases = new Map([
  ["nietzschean", ["阿喀琉斯"]],
  ["alkibiades", ["阿尔基比亚德斯", "阿尔基比亚德", "阿尔西比亚狄斯"]],
  ["phaedra", ["法德拉"]],
  ["pirithous", ["皮里托斯"]],
  ["typhon", ["提丰", "泰风", "台风"]],
  ["kratos-pool", ["协力池"]],
  ["golden-mean", ["黄金中道"]],
  ["law-of-bargains", ["交易法", "讨价还价法则"]],
]);

const outputCategoryOrder = ["人物", "地点", "派别"];
const categoryOrder = [...outputCategoryOrder, "其他"];
const primaryCategories = new Set(outputCategoryOrder);
const minimumKeptEntryCount = 3;
const explicitlyExcludedEntityIds = new Set([
  "argonauts",
  "argo",
  "titans",
]);

const personTitleZh = /(?:公主|国王|王后|王子|祭司|先知|将军|执政官|信使|女儿|儿子|宁芙|神|女神|海神|酒神|诗人|贵族|指挥官|队长|船长|法官|学者|首领|领袖|暴君|总督|司令|工头|工匠|老人|男人|女人|向导|盟友|追踪者|亡魂|收购官|哲人|哲学家|书记员|兽|龙)$/u;
const personTitleEn = /^(?:Princess|King|Queen|Prince|Priest|Priestess|Oracle|Prophet|General|Commander|Knight|Nymph|God|Goddess|Messenger|Archon|Captain|Leader|Daughter|Son|Father|Judge|Satrap|Scholar|Strategos|Tyrant|Virtuary|Guide|Ally|Watcher|Pursuer|Revenant|Philosopher|Scribe|Beast|Dragon)\b|\b(?:Princess|King|Queen|Prince|Priest|Priestess|Oracle|Prophet|General|Commander|Knight|Nymph|God|Goddess|Messenger|Archon|Captain|Leader|Daughter|Son|Father|Judge|Satrap|Scholar|Strategos|Tyrant|Virtuary|Hermit|Veteran|Acquisitor|Guide|Ally|Watcher|Pursuer|Revenant|Philosopher|Scribe|Beast|Dragon)$/i;
const groupZh = /(?:人|族|民|徒|教徒|信徒|主义者|管家|不朽者|白银种|远征军|舰队|卫兵|守卫|卫队|骑士团|难民|弃民|英雄|泰坦|始徒|云贼|浪费者|先锋|同盟|保护国|王朝|帝国|势力|派系|邪教|秩序|守望|后裔|追随者|监察官|抵抗军|抵抗组织|战团|商队|学派|阐述者)$/u;
const groupEn = /^(?:The\s+)?[A-Z][A-Za-z'’\-\s]*(?:ians?|ites?|ists?|ones|wards|guards?|priests|priesthood|stewards|followers|refugees|outcasts|immortals?|mortals?|muses|sirens|leleges|argonauts?|titans?|primordials?|cyclopes|thieves|wasters|vanguard|watch|symmachy|protectorate|dynasty|empire|expedition|force|fleet|order|cult|command|sunheirs|sellers|helots|spartans|navigators|revenants|centimanes|heraclidae|lakonians|resistance|elaborators|palirroia|hippeis|hoplites)$/i;
const placeZh = /(?:岛|城|港|港口|宫殿|神庙|神殿|圣堂|圣殿|陵墓|墓地|卫城|学院|工坊|工作坊|实验室|图书馆|办公室|集市|市场|广场|废墟|遗迹|水渠|泉|湖|坑|矿井|船坞|武器库|冥界|塔|塔楼|花园|墙|工程|海岸|都市|村|村庄|营地|办公室|甲板|桥|通道|下水道|宝库|迷宫|首都|码头|剧场|阶梯|深渊|领域|柱廊|圆厅|山门|土地|平原|沙漠|坎儿井)$/u;
const placeEn = /^(?:The\s+)?(?:[A-Z][A-Za-z0-9'’&.\-\/\s]*(?:City|Town|Village|Island|Harbor|Harbour|Port|Palace|Temple|Shrine|Sanctuary|Acropolis|Mausoleum|Necropolis|Academy|Workshop|Laboratory|Library|Office|Market|Agora|Ruins?|Sewers|Canal|Spring|Lake|Pit|Mine|Shipyard|Armory|Underworld|Tartarus|Tower|Gardens?|Wall|Works?|Coast|Vault|Deck|Bridge|Camp|Labyrinth|Maze|Capital|Dock|Docks|Propylon|Theatre|Theater|Staircase|Stoa|Tholos|Domain|Land|Abyss)|[A-Z][A-Za-z0-9'’&.\-\/\s]*(?:Pharos|Apadana|Nineveh|Pasargadae|Corinth|Sparta|Athens|Crete|Knossos|Delphi|Atlantis|Delos|Irem|Babylon|Persia|Lakonia|Hellas|Nubia|Anshan|Anostos|Sardis|Ashur|Uruk|Hekatompylos|Elatea|Ios|Rhages|Gerrha|Cyclades|Rhodes|Olympus|Persepolis|Isfahan|Bishapur|Petra|Thera|Gyaros|Kephallonia))$/i;
const itemZh = /(?:卡|牌|卡组|面板|地图|板块|装备|武器|护甲|防具|资源|指示物|标记|卷轴|装置|器械|机器|机械|引擎|发动机|齿轮|贝壳|泪|石|合金|青铜|银|金|箭|矛|剑|短剑|弩炮|鞭|钥匙|护符|护身符|船材|科技|部件|令牌|硬币|神浆|罐|瓶|头盔|轨|池|信息卡|消息卡|符号|箱|锚|照明弹)$/u;
const itemEn = /^(?:[A-Z][A-Za-z0-9'’&.\-\/\s]*(?:Card|Deck|Map|Tile|Sheet|Gear|Weapon|Weapons|Armor|Armour|Resource|Token|Marker|Scroll|Contraption|Makina|Machina|Machine|Engine|Gear|Shell|Tear|Stone|Alloy|Bronze|Silver|Gold|Arrow|Spear|Javelin|Sword|Xiphos|Ballista|Whip|Key|Talisman|Technology|Part|Icon|Obol|Ambrosia|Jar|Helm|Track|Pool|Symbol|Cryptex|Writ|Anchor|Aegis|Throneshard|Chunk|Flare|Helms?|Amphorae|Bireme)|Ambrosia|Gear|Triremes?|Bireme|War Bireme|Amphorae|Xiphos|Flare|Cryptex|Anchor|Aegis|Technology|Scroll|Map|Tile|Map Tile|AI deck|BP deck)$/i;
const ruleZh = /(?:命运|危险|怒气|智慧|狡黠|勇气|意志|耐力|外交|知识|船员|船体|灾祸|进展|检定|成功|失败|苦痛|状态|回忆|阶段|时间线|节点|条件|规则|难度|攻击|损伤|破甲|机会|恐惧|痛苦|绝望|悖论|播种|收割|必要|陌生人|友好|不友好|中立|敌对|结盟|协力|法则|诅咒|创伤|重担|身份|憎恨|胜利|安保|损耗|觉醒|谴责|唤醒)$/u;
const ruleEn = /^(?:[A-Z][A-Za-z0-9'’&.\-\/\s]*(?:Fate|Danger|Rage|Wisdom|Cunning|Courage|Will|Endurance|Diplomacy|Knowledge|Crew|Hull|Doom|Progress|ProgressToken|Test|Success|Failure|Affliction|Condition|Mnemos|Phase|Timeline|Node|Rule|Attack|Wounds?|Break|Opening|Fear|Pain|Despair|Paradox|Sow|Reap|Necessity|Strangers|ArgoFate|ArgoKnowledge|Friendly|Unfriendly|Neutral|Hostile|Allied|Kratos|Law|Curse|Trauma|Burden|Identity|Hatred|Victory|Security|Attrition|Awakening|Denounced|Roused|Boons?|Debt)|Fate|Danger|Rage|Wisdom|Cunning|Courage|Will|Endurance|Diplomacy|Knowledge|Crew|Hull|Doom|Progress|ProgressToken|Timeline|Strangers|Friendly|Unfriendly|Neutral|Hostile|Allied|Kratos|Paradox|Pain|Fates|Boon|Boons|Denounced|Roused|At War)$/i;
const eventZh = /(?:故事|冒险|事件|后果|梦|奥德赛|结论|结果|任务|欢迎|盛宴|谜题|真相|困境|突破|战斗|战争|循环|轮回|航程|悲剧)$/u;
const eventEn = /^(?:[A-Z][A-Za-z0-9'’&.\-\/\s]*(?:Story|Adventure|Event|Aftermath|Dream|Odyssey|Conclusion|Outcome|Mission|Welcome|Fete|Conundrum|Truth|Plight|Breakthrough|Battle|Delve|War|Cycle|Voyage|Tragedy)|Story|AFTERMATH|RULES|Battle|Dream|Voyage Phase|Inward Odyssey)$/i;
const abstractOrNonPersonEn = /^(?:Friendly|Unfriendly|Neutral|Hostile|Allied|Timefront|Golden Mean|Law of Bargains|Nicomachean Ethics|Triskelion|Aether|Disaster|Truth|Humanity|Fury|Surge|Precision|Closure|Relief|Identity|Passing|Awakening|Conquest|Voyage|Faction|Cycle|Passing|Potential|Potentials|Paracausal|Support|Heal)$/i;

const leadingNoise = /^(?:如果|若|当|在|和|与|或|以及|返回|回到|回到了|获得|失去|标记|做|选择|每个|每位|一个|一位|一座|那位|这位|名叫|叫|所谓|关于|对|向|从|把|将|令|使|为了|因为|然后|否则|你们|你|我们|我|他们|她们|它们|他|她|它|的|是|不是|但|而|并|来|去|让|被|给|到|从|自|据说|看到|听到|听说|听说过|站在|坐在|接受|拒绝|加入了|加入|前往|进入|离开|拥有|没有|不能|可以|需要|现在|这里|那里|那座|这座|这片|那些|这些|那个|这个|这次|其他|两只|所有|任何|许多|很多|更多|更少|无数|额外|同样|相同|每张|每个|每位|图示中|板块|显示了|阅读|查看|搜索|能搜索|访问|使用|重置|执行|执行一次|放置|添加|移除|丢弃|拿取|拿|有|有着|都|仍然|即使|甚至|至少|除非|包括|建议|认为|带领|忽略|救出|伸手|看着|保护|免受|关注|进行|参加了|参加|成为|终生成为|更不用说|就|就是|关系为|直到你们|汹涌的|旧的|者|为|以|个|张|块|单位|点|艘|名|位|只|条|枚|本|段|场|次|轮|件|份|幅)+/u;

const zhBoundaryWords = [
  "被称为",
  "称为",
  "名为",
  "叫作",
  "叫做",
  "自称",
  "凝视着",
  "看着",
  "看向",
  "指着",
  "盯着",
  "扑向",
  "听说过",
  "问",
  "人都听说过",
  "人是",
  "代表了",
  "代表",
  "充满了",
  "宣布为",
  "宣布举行",
  "砍倒了",
  "变成了",
  "变成",
  "到达",
  "抵达",
  "留在",
  "推倒",
  "以为她在",
  "变得像",
  "类似于",
  "像",
  "掌握在",
  "凭借他们的",
  "凭借",
  "处决了",
  "前往",
  "进入",
  "离开",
  "访问",
  "搜索",
  "阅读",
  "查看",
  "中的",
  "书中的",
  "地方有着",
  "有着",
  "容纳",
  "保存在",
  "放置一个",
  "放置",
  "添加一个",
  "添加",
  "获得一个",
  "获得",
  "得到",
  "召唤",
  "摧毁了",
  "坍塌",
  "隐藏",
  "寻找",
  "找到",
  "使用",
  "超过了",
  "新兴的",
  "审视着这位",
  "娶了一位",
  "开始吟唱",
  "举行",
  "充满",
  "由",
  "不会从",
  "不要推进",
  "每场战斗都从",
  "立即在",
  "清空",
  "则在",
  "它的",
  "烧焦了",
  "击碎了",
  "适应",
  "称之为",
  "安装在那里的",
  "压制了",
  "一种摆脱",
  "将由",
  "带有",
  "带到这里来的盟友是",
  "希望",
  "相信",
  "好奇",
  "派出了一支",
  "留下的",
  "归",
  "标有",
  "攻击",
  "简单的",
  "后的",
  "面板和",
  "年度",
];

const zhRolePrefixes = [
  "演说家",
  "商人",
  "总督",
  "指挥官",
  "舰队的指挥官",
  "盟友是",
  "发言人",
  "最高领袖",
  "领袖",
  "队长",
  "船长",
  "学者",
  "将军",
  "先知",
  "祭司",
];

const zhEntityTail = /([\u3400-\u9fff·・]{1,14}(?:公主|国王|王后|王子|祭司|先知|将军|执政官|信使|女儿|儿子|宁芙|女神|海神|酒神|诗人|贵族|指挥官|队长|船长|法官|学者|首领|领袖|暴君|总督|司令|工头|工匠|老人|男人|女人|人|族|民|徒|教徒|信徒|主义者|管家|不朽者|白银种|远征军|舰队|卫兵|守卫|卫队|骑士团|难民|弃民|英雄|泰坦|始徒|云贼|浪费者|先锋|同盟|保护国|王朝|帝国|势力|派系|邪教|秩序|守望|后裔|追随者|岛|城|港|港口|宫殿|神庙|神殿|圣堂|圣殿|陵墓|墓地|卫城|学院|工坊|工作坊|实验室|图书馆|办公室|集市|市场|广场|废墟|遗迹|水渠|泉|湖|坑|矿井|船坞|武器库|冥界|塔|花园|墙|工程|海岸|都市|村|村庄|营地|甲板|桥|通道|下水道|宝库|迷宫|号|卡|牌|面板|地图|装备|武器|护甲|防具|资源|指示物|标记|卷轴|装置|器械|机器|机械|引擎|发动机|齿轮|贝壳|泪|石|合金|青铜|银|金|箭|矛|剑|短剑|弩炮|鞭|钥匙|护符|护身符|船材|科技|部件|令牌|硬币|神浆|罐|头盔|轨|池|信息卡|消息卡|符号|阶段|时间线|节点|条件|规则|难度|攻击|损伤|机会|恐惧|痛苦|绝望|悖论|行动|战斗|故事|冒险|事件|后果|梦|奥德赛|结论|结果|任务|盛宴|谜题|真相|困境|突破))$/u;

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
  return `entity-${Buffer.from(String(value || "unknown")).toString("hex").slice(0, 16)}`;
}

function stripLeadingNoise(value) {
  let next = value;
  let previous = "";
  while (previous !== next) {
    previous = next;
    next = next.replace(leadingNoise, "");
  }
  return next;
}

function takeAfterLast(value, words) {
  let bestIndex = -1;
  let bestWord = "";
  for (const word of words) {
    const index = value.lastIndexOf(word);
    if (index > bestIndex) {
      bestIndex = index;
      bestWord = word;
    }
  }
  if (bestIndex < 0) return value;
  return value.slice(bestIndex + bestWord.length);
}

function cleanZh(raw, en = "") {
  const manualId = canonicalKey(raw, en);
  const manual = manualNames.get(manualId);
  if (manual?.zh) return manual.zh;

  let value = String(raw || "").replace(/\s+/g, "").trim();
  value = takeAfterLast(value, zhBoundaryWords);
  value = stripLeadingNoise(value);
  value = takeAfterLast(value, zhRolePrefixes);
  value = stripLeadingNoise(value);

  if (value.length > 8) {
    const tail = value.match(zhEntityTail)?.[1];
    if (tail && tail.length < value.length) value = tail;
  }

  value = stripLeadingNoise(value);
  value = value.replace(/[：:，,。；;、]+$/g, "");
  if (value === "法德拉") return "淮德拉";
  if (value === "老纺线者") return "老纺纱工";
  if (value === "阿尔西比亚狄斯" || value === "阿尔基比亚德斯" || value === "阿尔基比亚德") return "阿尔西比亚德斯";
  if (value === "皮里托斯") return "皮里托奥斯";
  return value;
}

function looksLikePollutedName(entity) {
  if (manualNames.has(entity.id)) return false;
  const zh = entity.name || "";
  const en = entity.englishName || "";
  if (!zh || !en) return true;
  if (/^(?:AI|BP)$/i.test(en) || /\b(?:AI|BP)\s+deck\b/i.test(en)) return true;
  if (/^(?:Map Tile|Tile|City space|War Bireme|Amphorae|Dog Days)$/i.test(en)) return true;
  if (/^(?:告诉|告诉了|承诺|承诺会|注意|注意到|看到|亲眼|提到|这是|这就是|该|加速|诅咒|已经|地图上|奴隶|永久|越来越|指引|事故|确保|收到|速度|其上|感谢|返回|失去|获得|如果|尽管|当|在|对|向|从|把|将|被|给|让|使|为了|因为|据说|所谓|关于|实际|关系为|直到|基塔|它|他们|她们|我们|你们|一位|一座|这个|那个|这些|那些|所有|任何|每个|每位|经过|居住|心烦意乱|城市处于|封的|集结|描绘|那最好|人群中|属于|年轻的|基础设施|建造|出境|亚里士多德|三次诅咒|市政官|伊雷姆|债务|资本|这将在|了|的|和|与|或|但|而|并)/u.test(zh)) return true;
  if (zh.length > 12 && !/(?:之|的|·|城|岛|港|神庙|神殿|圣殿|学院|工坊|宝库|迷宫|王朝|帝国|同盟|保护国|远征军|守望|后裔|信徒|教团|舰队|甲板|码头|塔|墙|剧场|阶梯|领域|土地)$/u.test(zh)) return true;
  return false;
}

function cleanEn(raw) {
  return String(raw || "")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function containsCjk(value) {
  return /[\u3400-\u9fff]/u.test(String(value || ""));
}

function aliasLooksPolluted(alias, entity) {
  const value = String(alias || "").trim();
  if (!value) return true;
  if (!containsCjk(value)) return false;
  if (manualNames.get(entity.id)?.zh === value) return false;
  if (entity.name && value === entity.name && value.length <= 8 && !/^(?:也许|知道|发现|看到|听到|提到|阻止|不能|可以|需要|拥有|没有|变成|成为|认为|建议|包括|凭借|附近|一路|一座|那座|这座|那就是|这就是|原以为|就连|一刀|这让|且你|留在|抛在|处在|地方|第四|人们|部队|爱人|无数|城市|巩固|审视|速度|火焰|倒塌|上移动|回合|弃置|要我们|喷射|匆忙|偏远|字形|立刻|细节|第一次|定数|夹杂|忘记|天内|页的|这场|曾和|原始|覆盖|暴露|竟然|别告诉|毫无|带到|正在|测试|加上|请测试|一次|要测试|必须|可检定|检定|关系为|直到|汹涌)/u.test(value)) return false;
  if (value.length > 10 && !/(?:之|的)/u.test(value)) return true;
  if (value.length > 14) return true;
  if (/^(?:也许|知道|发现|发现了|发现自己|看到|听到|提到|提到了|阻止|不能|可以|需要|拥有|没有|变成|变成了|成为|成为了|认为|建议|包括|即将|很快|几乎|仍然|曾经|曾多次|凭借|附近|一路|一座|那座|这座|那就是|这就是|原以为|就连|一刀|这让|且你|且你们|留在|抛在|处在|地方|第四|人们|部队|爱人|无数|城市|巩固|审视|速度|火焰|倒塌|上移动|回合|弃置|提到|要我们|喷射|匆忙|偏远|字形|立刻|细节|第一次|定数|夹杂|忘记|这样如果|天内|页的|这场|曾和|原始|覆盖|暴露|竟然|别告诉|毫无|带到|正在|这么多年来|测试|加上|请测试|一次|要测试|必须|可检定|检定|阿尔戈英雄进行|指示物|单位|所有|任何|每个|每位|返回|阅读|查看|搜索|使用|进入|离开|前往|访问|加入|救出|带领|忽略|保护|免受|参与|参加|执行|放置|添加|移除|获得|失去|丢弃|选择|如果|当|若|在|对|向|从|把|将|被|给|让|使|为了|因为|据说|所谓|关于|实际|关系为|直到|汹涌|基塔|它|他们|她们|我们|你们)/u.test(value)) return true;
  if (/[，。！？；：]/u.test(value)) return true;
  if (/^(?:的|了|和|与|或|但|而|并|来|去|为|个|张|块|名|位|只|条|枚|本|段|场|次|轮|件|份|幅)/u.test(value)) return true;
  return false;
}

function cleanAliasList(aliases, entity, fallback = "") {
  const seen = new Set();
  const clean = [];
  for (const alias of aliases) {
    const value = String(alias || "").trim();
    if (!value || aliasLooksPolluted(value, entity)) continue;
    const key = normalizeAlias(value);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(value);
  }
  if (!clean.length && fallback) clean.push(fallback);
  return clean;
}

function cleanZhAliasList(entity) {
  const manual = manualNames.get(entity.id)?.zh;
  const primary = entity.name;
  const candidates = [manual, primary, ...(manualZhAliases.get(entity.id) || [])];
  const fallback = aliasLooksPolluted(primary, entity) ? "" : primary;
  return cleanAliasList(candidates, entity, fallback).slice(0, 8);
}

function bestZhName(entity) {
  const manual = manualNames.get(entity.id);
  if (manual?.zh) return manual.zh;
  const candidates = [...entity.zhAliases.entries()]
    .filter(([alias]) => !aliasLooksPolluted(alias, entity))
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], "zh-CN"));
  if (candidates.length) return candidates[0][0];
  const fallback = mostFrequent(entity.zhAliases, entity.name);
  const tail = fallback.match(zhEntityTail)?.[1];
  return tail || fallback;
}

function canonicalKey(zh, en) {
  const normalizedEn = normalizeAlias(en);
  return manualMerges.get(normalizedEn) || slugify(en || zh);
}

function addEvidence(evidence, reason) {
  if (reason && !evidence.includes(reason)) evidence.push(reason);
}

function textMentions(entity) {
  const zh = escapeRegExp(entity.name);
  const en = escapeRegExp(entity.englishName);
  return `(?:${zh}\\s*[（(]\\s*${en}\\s*[）)]|${zh}|\\b${en}\\b)`;
}

function classifyEntity(entity) {
  const decision = classifyEntityWithEvidence(entity);
  entity.classificationEvidence = decision.evidence;
  return decision.category;
}

function classifyEntityWithEvidence(entity) {
  const manual = manualNames.get(entity.id);
  if (manual?.category) return { category: manual.category, evidence: [`手工确认：${manual.category}`] };
  const zh = entity.name;
  const en = entity.englishName;
  const context = entity.contextText;
  const evidence = [];
  if (abstractOrNonPersonEn.test(en)) {
    addEvidence(evidence, "英文名是抽象/状态词");
    if (ruleZh.test(zh) || ruleEn.test(en)) return { category: "规则/状态", evidence };
    if (eventZh.test(zh) || eventEn.test(en)) return { category: "事件/章节", evidence };
    return { category: "其他", evidence };
  }
  if (/^(?:Princess|King|Queen|Prince|Priest|Priestess|Oracle|Prophet|General|Commander|Knight|Nymph|God|Goddess|Messenger|Archon|Captain|Leader|Daughter|Son|Father|Judge|Satrap|Scholar|Strategos|Tyrant|Virtuary|Guide|Ally|Watcher|Pursuer|Revenant|Philosopher|Scribe|Beast|Dragon)\b/i.test(en)) {
    return { category: "人物", evidence: ["英文名前缀是人物称号"] };
  }
  if (personTitleZh.test(zh) || personTitleEn.test(en)) addEvidence(evidence, "名称命中人物称号");
  if (hasPersonContext(entity, context)) addEvidence(evidence, "上下文命中人物用法");
  if (evidence.length && looksLikeProperPersonName(entity)) return { category: "人物", evidence };

  evidence.length = 0;
  if (itemZh.test(zh) || itemEn.test(en)) return { category: "物品/装备/资源", evidence: ["名称命中物品/装备/资源词"] };
  if (ruleZh.test(zh) || ruleEn.test(en)) return { category: "规则/状态", evidence: ["名称命中规则/状态词"] };
  if (eventZh.test(zh) || eventEn.test(en)) return { category: "事件/章节", evidence: ["名称命中事件/章节词"] };

  if (placeZh.test(zh) || placeEn.test(en)) addEvidence(evidence, "名称命中地点词");
  if (hasPlaceContext(entity, context)) addEvidence(evidence, "上下文命中地点用法");
  if (evidence.some((item) => item.includes("地点"))) return { category: "地点", evidence };

  evidence.length = 0;
  if (groupZh.test(zh) || groupEn.test(en)) addEvidence(evidence, "名称命中派别/群体词");
  if (hasGroupContext(entity, context)) addEvidence(evidence, "上下文命中派别/群体用法");
  if (evidence.some((item) => item.includes("派别") || item.includes("群体"))) return { category: "派别", evidence };

  evidence.length = 0;
  return { category: "其他", evidence: evidence.length ? evidence : ["未命中人物/地点/派别的可靠证据"] };
}

function looksLikeProperPersonName(entity) {
  const zh = entity.name;
  const en = entity.englishName;
  if (abstractOrNonPersonEn.test(en)) return false;
  if (placeZh.test(zh) || placeEn.test(en) || groupZh.test(zh) || groupEn.test(en) || itemZh.test(zh) || itemEn.test(en) || ruleZh.test(zh) || ruleEn.test(en) || eventZh.test(zh) || eventEn.test(en)) return false;
  if (/[·・]/u.test(zh)) return true;
  if (/^[A-Z][a-z]+(?:[-'\s][A-Z][a-z]+)+$/.test(en)) return true;
  if (/^[A-Z][a-z]{3,}$/.test(en) && zh.length >= 2 && zh.length <= 5) return true;
  return false;
}

function hasPersonContext(entity, context) {
  const zh = escapeRegExp(entity.name);
  const en = escapeRegExp(entity.englishName);
  const mention = `(?:${zh}\\s*[（(]\\s*${en}\\s*[）)]|${zh}|\\b${en}\\b)`;
  return new RegExp(`(?:名叫|叫作|叫做|自称|我是|他叫|她叫|名为|一位|这位|那位)[^。！？\\n]{0,24}${mention}`).test(context)
    || new RegExp(`${mention}[^。！？\\n]{0,28}(?:说|说道|问|问道|喊|喊道|回答|回答道|低声说道|宣称|怒视)`).test(context)
    || new RegExp(`${mention}[^。！？\\n]{0,32}(?:的女儿|的儿子|的姐姐|的妹妹|的父亲|的母亲|的妻子|的丈夫|队长|将军|执政官|祭司|先知|学者|领袖|工匠|盟友)`).test(context)
    || new RegExp(`(?:队长|将军|执政官|祭司|先知|学者|领袖|工匠|盟友|向导|追踪者|亡魂|哲人|哲学家)[^。！？\\n]{0,18}${mention}`).test(context)
    || new RegExp(`\\b${en}\\b[^.!?\\n]{0,28}\\b(?:said|asked|answered|shouted|whispered|declared)\\b`, "i").test(context);
}

function hasPlaceContext(entity, context) {
  const mention = textMentions(entity);
  if (placeZh.test(entity.name) || placeEn.test(entity.englishName)) return true;
  return new RegExp(`(?:前往|进入|离开|到达|抵达|访问|探索|位于|抛锚于|停靠在|坐落于|建在)[^。！？\\n]{0,18}${mention}`).test(context)
    || new RegExp(`${mention}[^。！？\\n]{0,24}(?:城|城市|岛|港|码头|神庙|神殿|宝库|工坊|船坞|塔|塔楼|剧场|阶梯|领域|地点|废墟|海岸|首都|旧船坞)`).test(context)
    || new RegExp(`(?:in|at|near|inside|outside|aboard)\\s+(?:the\\s+)?${escapeRegExp(entity.englishName)}\\b`, "i").test(context);
}

function hasGroupContext(entity, context) {
  const mention = textMentions(entity);
  if (groupZh.test(entity.name) || groupEn.test(entity.englishName)) return true;
  return new RegExp(`${mention}[^。！？\\n]{0,30}(?:成员|代表|士兵|战士|舰队|船只|盟友|敌人|联盟|结盟|领导人|队伍|人们|难民|军队|组织|派系|信徒|教徒|守卫|守望|同盟|保护国|远征军)`).test(context)
    || new RegExp(`(?:来自|属于|加入|背叛|代表|率领|领导|召集|一群|一支)[^。！？\\n]{0,24}${mention}`).test(context)
    || new RegExp(`\\b${escapeRegExp(entity.englishName)}\\b[^.!?\\n]{0,30}\\b(?:members|representatives|soldiers|fleet|allies|enemies|faction|cult|order|dynasty|empire|watch|refugees)\\b`, "i").test(context);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summarizeSnippet(text, aliases) {
  const clean = text.replace(/\s+/g, " ").trim();
  const normalized = normalizeAlias(clean);
  let best = -1;
  for (const alias of aliases.map(normalizeAlias).filter(Boolean)) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  if (best < 0) return clean.slice(0, 260);
  const start = Math.max(0, best - 90);
  const end = Math.min(clean.length, best + 220);
  return `${start > 0 ? "..." : ""}${clean.slice(start, end)}${end < clean.length ? "..." : ""}`;
}

function makeIntro(entity) {
  const first = entity.entries[0];
  const category = entity.category;
  const books = [...new Set(entity.entries.map((entry) => entry.book.toUpperCase()))].join("、");
  const chapters = [...new Set(entity.entries.map((entry) => entry.chapter).filter(Boolean))].slice(0, 3).join("、");
  const location = first ? `${first.book.toUpperCase()} ${first.id}` : "未知段落";
  const chapterText = chapters ? `，主要分布在${chapters}` : "";
  return `${entity.name} (${entity.englishName}) 是${category}条目，首次见于 ${location}${chapterText}。总表中记录到 ${entity.entryCount} 个相关段落，覆盖 ${books || "未知书册"}。`;
}

const detailThemes = [
  { label: "会面、交涉与请求", pattern: /会面|觐见|谈判|请求|邀请|答应|拒绝|建议|警告|解释|承认|声明|外交|使节|代表团|说|问|回答/u },
  { label: "调查、发现与真相", pattern: /调查|搜寻|寻找|找到|发现|揭示|真相|秘密|线索|谜题|记忆|回忆|证据/u },
  { label: "航行、抵达与撤离", pattern: /航行|扬帆|抛锚|停靠|前往|进入|离开|抵达|到达|撤离|逃离|返回|登陆/u },
  { label: "冲突、战斗与死亡", pattern: /战斗|攻击|围攻|杀|死亡|死|牺牲|流血|伤|毁灭|摧毁|伏击|敌人|战争|胜利|失败/u },
  { label: "政治、统治与阵营关系", pattern: /国王|王国|王朝|帝国|同盟|保护国|领袖|总督|军队|士兵|结盟|背叛|统治|法律|议会|外交/u },
  { label: "信仰、神庙与仪式", pattern: /神|女神|祭司|先知|神庙|神殿|圣殿|信仰|崇拜|教徒|邪教|祭品|仪式|祈祷/u },
  { label: "机关、建造与资源", pattern: /建造|工坊|机器|机械|装置|引擎|宝库|零件|资源|神浆|船体|修理|工程|武器/u },
  { label: "规则选择与状态变化", pattern: /选择|检定|获得|失去|标记|外交\s*[+-]|命运|灾祸|进展|如果|成功|失败|继续|参见|前往/u },
];

function entryKey(entry) {
  return entry?.key || `${entry?.book || ""}:${entry?.id || ""}:${entry?.order ?? ""}`;
}

function entryRef(entry) {
  return `${String(entry.book || "").toUpperCase()} ${entry.id || entry.key || ""}`.trim();
}

function entrySourceText(entry) {
  return String(entry?._text || entry?.snippet || "").replace(/\s+/g, " ").trim();
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = String(getKey(item) || "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function topCounts(items, getKey, limit = 5) {
  return [...countBy(items, getKey).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, limit);
}

function formatCountList(items, unit = "段") {
  return items.map(([label, count]) => `${label} ${count}${unit}`).join("、");
}

function formatBookCoverage(entries) {
  const counts = countBy(entries, (entry) => String(entry.book || "").toUpperCase());
  return [...counts.entries()]
    .sort((a, b) => [...sourceBooks].indexOf(a[0].toLowerCase()) - [...sourceBooks].indexOf(b[0].toLowerCase()) || a[0].localeCompare(b[0]))
    .map(([book, count]) => `${book} ${count}段`)
    .join("、");
}

function categoryRoleText(category) {
  if (category === "人物") return "相关文本把此人作为行动者、被追踪的对象或被他人评价的角色来处理";
  if (category === "地点") return "相关文本把这里作为航行、探索、会面或冲突发生的空间来处理";
  if (category === "派别") return "相关文本把这一群体作为政治、军事、信仰或社会力量来处理";
  return "相关文本把它作为反复出现的概念、现象、资源或系统来处理";
}

function scoreImportantEntry(entry) {
  const text = entrySourceText(entry);
  let score = 0;
  const weightedPatterns = [
    [/死亡|死|杀|牺牲|毁灭|摧毁|战斗|战争|攻击|伏击/u, 5],
    [/真相|揭示|秘密|发现|承认|解释|记忆|回忆|谜题/u, 4],
    [/请求|选择|加入|离开|背叛|结盟|外交|统治|领袖|国王/u, 3],
    [/建造|宝库|工坊|机器|神庙|神殿|资源|修理|航行/u, 2],
    [/获得|失去|标记|检定|成功|失败|参见|前往/u, 1],
  ];
  weightedPatterns.forEach(([pattern, weight]) => {
    if (pattern.test(text)) score += weight;
  });
  return score;
}

function representativeEntries(entity, limit = 8) {
  const entries = entity.entries || [];
  if (entries.length <= limit) return entries;
  const byBook = new Map();
  entries.forEach((entry) => {
    const key = String(entry.book || "").toLowerCase();
    if (!byBook.has(key)) byBook.set(key, []);
    byBook.get(key).push(entry);
  });
  const bookAnchors = [...byBook.values()].flatMap((bookEntries) => [
    bookEntries[0],
    bookEntries[Math.floor((bookEntries.length - 1) / 2)],
    bookEntries[bookEntries.length - 1],
  ]);
  const quantiles = [0, 0.25, 0.5, 0.75, 1].map((ratio) => entries[Math.round((entries.length - 1) * ratio)]);
  const scored = entries
    .map((entry) => ({ entry, score: scoreImportantEntry(entry) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.order - b.entry.order)
    .slice(0, limit)
    .map((item) => item.entry);
  const selected = uniqueEntries([entries[0], ...bookAnchors, ...quantiles, ...scored, entries[entries.length - 1]]);
  const order = new Map(entries.map((entry, index) => [entryKey(entry), index]));
  return selected
    .sort((a, b) => (order.get(entryKey(a)) ?? 0) - (order.get(entryKey(b)) ?? 0))
    .slice(0, limit);
}

function detailExcerpt(entity, entry, length = 170) {
  const aliases = [entity.name, entity.englishName, ...(entity.matchAliases || []), ...(entity.aliases || [])];
  return compactSnippet(summarizeSnippet(entrySourceText(entry), aliases), length);
}

function makeCoverageDetail(entity) {
  const chapters = topCounts(entity.entries, (entry) => entry.chapter || entry.encounter || entry.title, 4);
  const chapterText = chapters.length ? `；最集中的章节/模块是 ${formatCountList(chapters)}` : "";
  return `全部相关内容共有 ${entity.entryCount} 个段落，覆盖 ${formatBookCoverage(entity.entries) || "未知书册"}${chapterText}`;
}

function makeProgressionDetail(entity) {
  if (!entity.entries.length) return "目前没有可整理的段落脉络。";
  if (entity.entries.length === 1) {
    const entry = entity.entries[0];
    const title = entry.title ? `「${compactSnippet(entry.title, 42)}」` : "";
    return `目前只在 ${entryRef(entry)}${title} 中出现，相关内容集中在这一段的叙述与选择结果里。`;
  }
  const byBook = new Map();
  entity.entries.forEach((entry) => {
    const key = String(entry.book || "").toLowerCase();
    if (!byBook.has(key)) byBook.set(key, []);
    byBook.get(key).push(entry);
  });
  const parts = [...byBook.entries()]
    .sort((a, b) => [...sourceBooks].indexOf(a[0]) - [...sourceBooks].indexOf(b[0]) || a[0].localeCompare(b[0]))
    .map(([book, entries]) => {
      const chapters = topCounts(entries, (entry) => entry.chapter || entry.encounter || entry.title, 2);
      const refs = uniqueEntries([entries[0], entries[Math.floor((entries.length - 1) / 2)], entries[entries.length - 1]]).map(entryRef).join("、");
      const focus = chapters.length ? `主要落在 ${formatCountList(chapters)}` : `从 ${entryRef(entries[0])} 延伸到 ${entryRef(entries[entries.length - 1])}`;
      return `${book.toUpperCase()} ${entries.length}段，${focus}，代表段落 ${refs}`;
    });
  return `按书册脉络看，${parts.join("；")}。`;
}

function makeThemeDetail(entity) {
  const themes = detailThemes
    .map((theme) => ({
      label: theme.label,
      count: entity.entries.filter((entry) => theme.pattern.test(entrySourceText(entry))).length,
    }))
    .filter((theme) => theme.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"))
    .slice(0, 5);
  if (!themes.length) return "";
  return `反复出现的情节线索包括 ${themes.map((theme) => `${theme.label}（${theme.count}段）`).join("、")}。`;
}

function buildEntityDetailContext(entities) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const entryToEntityIds = new Map();
  entities.forEach((entity) => {
    entity.entries.forEach((entry) => {
      const key = entryKey(entry);
      if (!entryToEntityIds.has(key)) entryToEntityIds.set(key, new Set());
      entryToEntityIds.get(key).add(entity.id);
    });
  });
  return { entityById, entryToEntityIds };
}

function makeRelationDetail(entity, context) {
  if (!context?.entryToEntityIds || !context?.entityById) return "";
  const counts = new Map();
  entity.entries.forEach((entry) => {
    const ids = context.entryToEntityIds.get(entryKey(entry));
    if (!ids) return;
    ids.forEach((id) => {
      if (id === entity.id) return;
      counts.set(id, (counts.get(id) || 0) + 1);
    });
  });
  const related = [...counts.entries()]
    .map(([id, count]) => ({ entity: context.entityById.get(id), count }))
    .filter((item) => item.entity)
    .sort((a, b) => b.count - a.count || b.entity.entryCount - a.entity.entryCount || a.entity.name.localeCompare(b.entity.name, "zh-CN"))
    .slice(0, 8);
  if (!related.length) return "";
  return `同段反复关联的有效词条有 ${related.map((item) => `${item.entity.name} (${item.entity.englishName})/${item.entity.category} ${item.count}段`).join("、")}。`;
}

function makeEvidenceDetail(entity) {
  const selected = representativeEntries(entity, 8);
  if (!selected.length) return "";
  return selected.map((entry) => `${entryRef(entry)}：${detailExcerpt(entity, entry)}`).join("；");
}

function makeDetail(entity, context) {
  if (!entity.entries.length) return `${entity.name} (${entity.englishName}) 暂无可整理的详细介绍。`;
  const first = entity.entries[0];
  const title = first.title ? `「${compactSnippet(first.title, 42)}」` : "";
  const lines = [
    `【定位】${entity.name} (${entity.englishName}) 是${entity.category}词条，${categoryRoleText(entity.category)}。${makeCoverageDetail(entity)}；首次见于 ${entryRef(first)}${title}。`,
    `【内容脉络】${makeProgressionDetail(entity)}`,
  ];
  const theme = makeThemeDetail(entity);
  if (theme) lines.push(`【情节线索】${theme}`);
  const relation = makeRelationDetail(entity, context);
  if (relation) lines.push(`【关联对象】${relation}`);
  const evidence = makeEvidenceDetail(entity);
  if (evidence) lines.push(`【代表段落】${evidence}`);
  return lines.join("\n");
}

function enrichEntityDetails(entities) {
  const context = buildEntityDetailContext(entities);
  entities.forEach((entity) => {
    entity.detail = makeDetail(entity, context);
    entity.story = entity.detail;
  });
}

function uniqueEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry) return false;
    const key = `${entry.book}:${entry.key || entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactSnippet(value, length) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length).replace(/[，。；：、\s]+$/u, "")}...`;
}

async function loadStoryData() {
  const source = await fs.readFile(dataPath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { timeout: 30000 });
  return sandbox.window.STORYBOOK_DATA;
}

function extractEntities(data) {
  const pairRe = /([\u3400-\u9fff][\u3400-\u9fff·・\s]{0,24}?)\s*[（(]\s*([A-Z][A-Za-z0-9'’&.\-\/\s]{1,64})\s*[）)]/g;
  const entities = new Map();

  for (const book of data.books.filter((item) => sourceBooks.has(item.id))) {
    for (const entry of book.entries) {
      if (skippedEntryTitle.test(`${entry.title || ""}\n${entry.text || ""}`.slice(0, 120))) continue;
      const text = `${entry.title || ""}\n${entry.text || ""}`;
      let match;
      while ((match = pairRe.exec(text))) {
        const zhRaw = match[1].replace(/\s+/g, "").trim();
        const en = cleanEn(match[2]);
        const zh = cleanZh(zhRaw, en);
        if (!zh || !en || zh.length < 1 || zh.length > 24) continue;
        if (/^[A-Za-z]{1,2}$/.test(en) || /^[A-Z0-9]{1,3}$/.test(en)) continue;
        const id = canonicalKey(zh, en);
        if (!entities.has(id)) {
          const manual = manualNames.get(id);
          entities.set(id, {
            id,
            name: manual?.zh || zh,
            englishName: manual?.en || en,
            zhAliases: new Map(),
            enAliases: new Map(),
            mentionCount: 0,
            contexts: [],
            entriesByKey: new Map(),
            contextText: "",
          });
        }
        const entity = entities.get(id);
        entity.zhAliases.set(zh, (entity.zhAliases.get(zh) || 0) + 1);
        entity.enAliases.set(en, (entity.enAliases.get(en) || 0) + 1);
        entity.mentionCount += 1;
        entity.contexts.push({ bookId: book.id, entry, text, zh, zhRaw, en });
        if (!entity.entriesByKey.has(entry.key)) {
          entity.entriesByKey.set(entry.key, {
            book: book.id,
            key: entry.key,
            id: entry.id,
            title: entry.title || entry.id,
            chapter: entry.chapter || "",
            encounter: entry.encounter || "",
            order: entry.order,
            _text: text,
            snippet: summarizeSnippet(text, [zh, en, zhRaw]),
          });
        }
        if (entity.contextText.length < 8000) entity.contextText += ` ${text.slice(Math.max(0, match.index - 100), match.index + match[0].length + 180)}`;
      }
    }
  }

  return [...entities.values()].map((entity) => finalizeEntity(entity));
}

function mostFrequent(map, fallback = "") {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))[0]?.[0] || fallback;
}

function finalizeEntity(entity) {
  const manual = manualNames.get(entity.id);
  entity.name = bestZhName(entity);
  entity.englishName = manual?.en || mostFrequent(entity.enAliases, entity.englishName);
  const zhAliasCandidates = [...entity.zhAliases.entries()].sort((a, b) => b[1] - a[1]).map(([alias]) => alias);
  const enAliasCandidates = [...entity.enAliases.entries()].sort((a, b) => b[1] - a[1]).map(([alias]) => alias);
  entity.zhAliases = cleanZhAliasList(entity);
  entity.enAliases = cleanAliasList([entity.englishName, ...enAliasCandidates], entity, entity.englishName);
  entity.aliases = cleanAliasList([entity.name, entity.englishName, ...entity.zhAliases, ...entity.enAliases], entity);
  entity.matchAliases = cleanAliasList([entity.name, entity.englishName, ...entity.zhAliases, ...entity.enAliases], entity);
  entity.entries = [...entity.entriesByKey.values()].sort((a, b) => a.book.localeCompare(b.book) || a.order - b.order || String(a.id).localeCompare(String(b.id)));
  entity.entryCount = entity.entries.length;
  entity.firstSeen = entity.entries[0] ? `${entity.entries[0].book.toUpperCase()} ${entity.entries[0].id}` : "";
  entity.category = classifyEntity(entity);
  entity.intro = makeIntro(entity);
  delete entity.contexts;
  delete entity.entriesByKey;
  delete entity.contextText;
  return entity;
}

function shouldKeepEntity(entity) {
  if (explicitlyExcludedEntityIds.has(entity.id)) {
    return { keep: false, reason: "排除：用户明确要求删除该词条" };
  }
  if (looksLikePollutedName(entity)) {
    return { keep: false, reason: "排除：中文名像从上下文截出的脏名字" };
  }
  if (!primaryCategories.has(entity.category)) {
    return { keep: false, reason: `排除：${entity.category} 不在本轮范围，只保留人物/地点/派别` };
  }
  if (entity.entryCount < minimumKeptEntryCount) {
    return { keep: false, reason: `排除：只出现在 ${entity.entryCount} 个相关段落` };
  }
  return { keep: true, reason: `保留：${entity.category}，相关段落 ${entity.entryCount}` };
}

function makeAuditRecord(entity, keepDecision) {
  return {
    id: entity.id,
    keep: keepDecision.keep,
    reason: keepDecision.reason,
    category: entity.category,
    name: entity.name,
    englishName: entity.englishName,
    mentionCount: entity.mentionCount,
    entryCount: entity.entryCount,
    firstSeen: entity.firstSeen,
    classificationEvidence: entity.classificationEvidence || [],
    zhAliases: entity.zhAliases,
    enAliases: entity.enAliases,
    sampleEntries: entity.entries.slice(0, 3).map((entry) => ({
      ref: `${entry.book.toUpperCase()} ${entry.id}`,
      title: entry.title,
      snippet: entry.snippet,
    })),
  };
}

function cleanEntityForOutput(entity) {
  const clean = { ...entity };
  clean.entries = entity.entries.map((entry) => {
    const { _text, ...publicEntry } = entry;
    return publicEntry;
  });
  delete clean.classificationEvidence;
  return clean;
}

function toCsvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(entities) {
  const headers = ["id", "分类", "中文名", "英文名", "首次出现", "提及次数", "相关段落数", "中文别名", "英文别名", "简介", "详细介绍"];
  const rows = entities.map((entity) => [
    entity.id,
    entity.category,
    entity.name,
    entity.englishName,
    entity.firstSeen,
    entity.mentionCount,
    entity.entryCount,
    entity.zhAliases.join(" / "),
    entity.enAliases.join(" / "),
    entity.intro,
    entity.detail || entity.story,
  ]);
  return [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
}

function buildBrowserJs(payload) {
  const json = JSON.stringify(payload, null, 2)
    .replace(/</g, "\\u003C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `(function () {\n  window.STORY_ENTITY_INDEX = ${json};\n})();\n`;
}

async function writeCsvWithFallback(csv) {
  try {
    await fs.writeFile(outCsvPath, `\uFEFF${csv}\n`, "utf8");
    return outCsvPath;
  } catch (error) {
    if (error?.code !== "EBUSY" && error?.code !== "EPERM") throw error;
    const fallbackPath = path.join(rootDir, "story", "data", `entity-index.${Date.now()}.csv`);
    await fs.writeFile(fallbackPath, `\uFEFF${csv}\n`, "utf8");
    console.warn(`CSV is locked, wrote fallback ${path.relative(rootDir, fallbackPath)}`);
    return fallbackPath;
  }
}

async function main() {
  const data = await loadStoryData();
  const candidates = extractEntities(data);
  const audit = candidates.map((entity) => makeAuditRecord(entity, shouldKeepEntity(entity)))
    .sort((a, b) => Number(b.keep) - Number(a.keep)
      || categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
      || b.entryCount - a.entryCount
      || b.mentionCount - a.mentionCount
      || a.name.localeCompare(b.name, "zh-CN"));
  const keptCandidates = candidates
    .filter((entity) => shouldKeepEntity(entity).keep)
    .sort((a, b) => outputCategoryOrder.indexOf(a.category) - outputCategoryOrder.indexOf(b.category)
      || b.entryCount - a.entryCount
      || b.mentionCount - a.mentionCount
      || a.name.localeCompare(b.name, "zh-CN"));
  enrichEntityDetails(keptCandidates);
  const entities = keptCandidates.map(cleanEntityForOutput);
  const categoryCounts = Object.fromEntries(outputCategoryOrder.map((category) => [category, entities.filter((entity) => entity.category === category).length]));
  const candidateCategoryCounts = [...candidates.reduce((counts, entity) => {
    counts.set(entity.category, (counts.get(entity.category) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort((a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0]) || a[0].localeCompare(b[0], "zh-CN"));
  const payload = {
    generatedAt: new Date().toISOString(),
    generator: "tools/generate-story-entity-index.mjs",
    sourceBooks: [...sourceBooks],
    entityCount: entities.length,
    categoryCounts,
    entities,
  };
  const auditPayload = {
    generatedAt: payload.generatedAt,
    generator: payload.generator,
    sourceBooks: payload.sourceBooks,
    candidateCount: candidates.length,
    keptCount: entities.length,
    categoryCounts,
    candidateCategoryCounts: Object.fromEntries(candidateCategoryCounts),
    filters: {
      keptPrimaryCategories: [...primaryCategories],
      minimumKeptEntryCount,
      excludedCategories: "排除所有非人物/地点/派别，包括其他",
    },
    records: audit,
  };
  await fs.writeFile(outJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(outAuditPath, `${JSON.stringify(auditPayload, null, 2)}\n`, "utf8");
  const csvPath = await writeCsvWithFallback(buildCsv(entities));
  await fs.writeFile(outJsPath, buildBrowserJs(payload), "utf8");
  console.log(`Generated ${entities.length} entities from ${candidates.length} candidates`);
  console.log(JSON.stringify(categoryCounts, null, 2));
  console.log(`Wrote ${path.relative(rootDir, outJsonPath)}`);
  console.log(`Wrote ${path.relative(rootDir, outAuditPath)}`);
  console.log(`Wrote ${path.relative(rootDir, csvPath)}`);
  console.log(`Wrote ${path.relative(rootDir, outJsPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
