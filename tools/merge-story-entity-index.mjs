import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexJsonPath = path.join(rootDir, "story", "data", "entity-index.json");
const indexJsPath = path.join(rootDir, "story", "data", "entity-index.js");
const indexCsvPath = path.join(rootDir, "story", "data", "entity-index.csv");
const auditPath = path.join(rootDir, "story", "data", "entity-index-merge-audit.json");
const backupIndexPath = path.join(rootDir, "story", "backup-before-fast-ai-20260614-045144", "entity-index.json");
const fastDetailsPath = path.join(rootDir, "story", "entity-ai-fast-details.json");
const c2StorybookPath = path.join(rootDir, "tools", "bgstorybook-c2.json");
const storyDataPath = path.join(rootDir, "story", "data", "storybook-data.js");

const mergeGroups = [
  ["minos", ["king"]],
  ["virtuary", ["the-virtuary", "truthsayer", "teacher"]],
  ["minoan-guide", ["acacallis"]],
  ["liaison", ["the-liaison"]],
  ["sona", ["high-acquisitor"]],
  ["hermesian-pursuer", ["hermesian"]],
  ["titanokinigos", ["titanaktisos"]],
  ["scarred-veteran", ["veteran"]],
  ["adyton", ["inner-hallow"]],
  ["labyrinth", ["maze"]],
  ["cyclades", ["the-cyclades"]],
  ["lakonia", ["lakonian"]],
  ["kephallonia", ["kephallonian"]],
  ["mnestis-theatre", ["theatre"]],
  ["dark-below", ["the-dark-below"]],
  ["hekatompylos", ["hekatompyios"]],
  ["graveyard-of-the-frail", ["graveyard"]],
  ["aristotelians", ["expeditionary-force"]],
  ["silver-ones", ["the-silver-ones"]],
  ["ephor", ["amanestis"]],
  ["cyclopes", ["cyclopean", "cyclonuses", "cyclonus"]],
  ["hyperborean", ["hyperboreans"]],
  ["vanguard", ["the-vanguard"]],
  ["nubians", ["nubian"]],
];

const canonicalOverrides = new Map([
  ["minoan-guide", { name: "阿卡卡利斯", englishName: "Acacallis", category: "人物" }],
  ["virtuary", { name: "维尔塔里", englishName: "Virtuary", category: "人物" }],
  ["minos", { name: "米诺斯", englishName: "Minos", category: "人物" }],
  ["selena", { name: "塞勒涅", englishName: "Selena", category: "人物" }],
  ["adyton", { name: "内殿", englishName: "Adyton", category: "地点" }],
  ["labyrinth", { name: "迷宫", englishName: "Labyrinth", category: "地点" }],
  ["cyclades", { name: "基克拉泽斯群岛", englishName: "Cyclades", category: "地点" }],
  ["lakonia", { name: "拉科尼亚", englishName: "Lakonia", category: "地点" }],
  ["kephallonia", { name: "凯法利尼亚岛", englishName: "Kephallonia", category: "地点" }],
  ["mnestis-theatre", { name: "忆识剧场", englishName: "Mnestis Theatre", category: "地点" }],
  ["dark-below", { name: "黑暗深渊", englishName: "Dark Below", category: "地点" }],
  ["hekatompylos", { name: "赫卡托姆皮洛斯", englishName: "Hekatompylos", category: "地点" }],
  ["aristotelians", { name: "亚里士多德远征军", englishName: "Aristotelians", category: "派别" }],
  ["cyclopes", { name: "独眼巨人", englishName: "Cyclopes", category: "派别" }],
  ["hyperborean", { name: "冻土人", englishName: "Hyperboreans", category: "派别" }],
  ["vanguard", { name: "弃民先锋", englishName: "Vanguard", category: "派别" }],
  ["nubians", { name: "努比亚人", englishName: "Nubians", category: "派别" }],
]);

const restoreFreshIds = new Set(["selene", "selena"]);

const aliasBlocklist = new Set([
  "国王",
  "King",
  "导师",
  "Teacher",
  "老兵",
  "Veteran",
  "剧场",
  "Theatre",
  "远征军",
  "Expeditionary Force",
  "内殿",
  "Inner Hallow",
  "迷宫",
  "Maze",
  "先锋",
  "Vanguard",
  "帝国",
  "Empire",
  "努比亚",
  "Nubian",
  "罗德",
  "Rhodian",
  "The Virtuary",
  "The Liaison",
  "The Vanguard",
]);

const idBlocklist = new Set(["argo", "argonauts", "titans"]);

const perEntityAliasBlocklist = new Map([
  ["spartans", new Set(["斯巴达"])],
  ["odysseus", new Set(["老祭司", "Old Priest"])],
]);

const spartanEmpireIntro = "斯巴达帝国（Spartan Empire）是尼采超人统治下的斯巴达军事政权，代表拉科尼亚一带以强者崇拜和严苛军纪组织起来的敌对势力。";

const spartanEmpireDetail = [
  "斯巴达帝国（Spartan Empire）是尼采超人控制下的斯巴达政治军事政权，也是拉科尼亚战争中最直接压迫阿尔戈英雄与当地民众的敌对势力。它不是单纯的地点“斯巴达”，也不等同于作为族群或军队的“斯巴达人”，而是以尼采超人为核心、以帝国纹章、重装战士、奴役制度和强者崇拜维系起来的统治结构。阿尔戈号第一次抵达吉西昂时，神秘讯息与阿尔戈号钥匙已经显示出这套政权的手腕：它能接触到阿尔戈号工厂的珍贵造物，也能用军事代表团和被锁链束缚的独眼巨人展示威慑。",
  "这个帝国的外在形象由身披青铜盔甲的斯巴达战士、白红纹样的胸甲和严格服从的军纪构成，内在则由尼采超人的理念支配。它把力量视为政治合法性的来源，将弱者、奴隶和被征服者置于持续恐惧之中。希洛人、独眼巨人和拉科尼亚各地的平民都在它的军事机器下承受压力，凡人神庙、人之神殿、运河工程、农场、矿山和军械体系则构成了它维持统治的空间网络。",
  "斯巴达帝国在故事中的意义，是把尼采超人的个人暴政扩展为一整个可运转的国家机器。它既拥有斯巴达人的强悍军事传统，又被尼采超人的强者神话重新塑形，因此阿尔戈英雄面对的不是一名暴君或一支部队，而是一套能让士兵、官员和受压迫者都被卷入其中的制度。它与斯巴达、斯巴达人、尼采超人帝国等条目相邻，但应保持独立：斯巴达是地理与政治舞台，斯巴达人是族群和军队，尼采超人帝国是更宽泛的帝国势力，而斯巴达帝国特指拉科尼亚战线中以斯巴达为核心的政权形态。"
].join("\n\n");

const manualEntitySpecs = [
  {
    id: "old-priest",
    name: "老祭司",
    englishName: "Old Priest",
    category: "人物",
    aliases: ["老祭司", "Old Priest"],
    matchAliases: ["老祭司", "Old Priest"],
    sourceTerms: ["Old Priest"],
    intro: "老祭司（Old Priest）是阿尔戈号上年迈而博学的随行者，常以经验、警告和温和幽默引导阿尔戈英雄理解陌生世界。",
    detail: [
      "老祭司（Old Priest）是阿尔戈英雄苏醒后最早照顾并指引他们的人之一，也是阿尔戈号上最稳定的智者声音。他熟悉克里特、阿尔戈号、旧世界传说和许多危险征兆，常在队伍面对陌生城邦、迷宫异象、神明遗迹或船上危机时提供解释。他的语气有时庄重，有时带着干涩幽默；他会提醒众人不要被恐惧吞没，也会用神话、历史和亲身经验把眼前的灾难放进更大的世界图景中。",
      "在早期故事里，老祭司承担的是读者和阿尔戈英雄的向导角色。他指出克诺索斯灯火衰微的含义，解释米诺斯王国、代达罗斯宝库、迷宫和诸神遗产的背景；在阿尔戈号遭遇灾害、怪物追击或迷宫力量时，他能从细节中判断危险的性质。许多日常事件也通过他显出阿尔戈号作为共同体的一面：他会生病、抱怨、怀旧、写日记，也会与船员争论选择的代价。",
      "随着故事推进，老祭司不只是背景说明者，而成为贯穿多次循环和重大决策的关键人物。他的知识与过往牵连很深，既能给阿尔戈英雄带来希望，也让他们意识到前人的错误仍在影响现在。为了保持阅读体验，点击“老祭司”时应首先理解为这位同行长者和精神导师；至于他与更深层身份、旧日航程和终局计划的关系，应在读到相应章节后再展开。"
    ].join("\n\n"),
  },
  {
    id: "ur-fleece",
    name: "乌尔-弗里斯",
    englishName: "Ur-Fleece",
    category: "人物",
    aliases: ["乌尔-弗里斯", "Ur-Fleece"],
    matchAliases: ["乌尔-弗里斯", "Ur-Fleece"],
    intro: "乌尔-弗里斯（Ur-Fleece）是循环后期出现的深海级威胁，带有黑暗、熵灭和不可逃避的压迫感，是阿尔戈号面临的终极敌影之一。",
    detail: [
      "乌尔-弗里斯（Ur-Fleece）是循环后期围绕基克拉泽斯群岛、塞拉岛灾难和深海黑暗反复出现的强大存在。它的出场往往伴随无光、窒息、重压、时间凝滞和感官被放大的描写，像是从海底与熵灭本身伸出的巨大阴影。对阿尔戈英雄来说，它不是普通怪物，而是会追踪、压迫并不断撕扯希望的终极威胁之一。",
      "它与神浆灾害、塞拉岛、三叉戟钻井平台、维尔塔里、真相机器和循环后期的多方选择紧密相关。故事中多次强调，乌尔-弗里斯带来的不是一次性战斗压力，而是一种持续存在的世界性危机：它可能从深海、天空或记忆的裂口中逼近，让阿尔戈号无论航向何处都难以真正摆脱。",
      "乌尔-弗里斯在叙事中的作用，是把阿尔戈英雄过去的行动、奥德修斯留下的愿望、塞拉岛的后果以及各派系对真相和力量的理解压缩到同一个敌影中。它代表的不是单纯的野兽威胁，而是“为了目标可以走多远”的问题所制造出的黑暗回响。正因为如此，它应作为独立的重要存在保留，而不能被并入泛称的怪物、灾祸或某个地点。"
    ].join("\n\n"),
  },
  {
    id: "cryptex",
    name: "密码箱",
    englishName: "Cryptex",
    category: "其他",
    aliases: ["密码箱", "密码筒", "Cryptex", "Black Blood Cryptex", "黑血密码筒", "Future Cryptex", "未来密码筒"],
    matchAliases: ["密码箱", "密码筒", "Cryptex", "Black Blood Cryptex", "黑血密码筒", "Future Cryptex", "未来密码筒"],
    intro: "密码箱（Cryptex）是与泰坦驾驶、敌方追猎者和记忆技术相连的密封装置，常以金属舱体、生命维持和危险秘密的形象出现。",
    detail: [
      "密码箱（Cryptex）是故事中反复出现的关键技术装置，常被译作密码筒或以黑血密码筒、未来密码筒等形式出现。它通常不是普通箱子，而是一种由奇异金属、半透明窗格、代码纹路和内部液体构成的密封舱体，能与泰坦、驾驶员、追猎者或记忆技术发生联系。它的外观带有强烈的机械与生物混合感，既像容器，也像维持生命和隐藏真相的牢笼。",
      "早期的黑血密码筒与赫尔墨斯追踪者相关，阿尔戈英雄通过受损的装置窥见敌人内部的秘密，意识到看似怪物般的威胁背后可能存在凡人操控、召唤器和更复杂的技术体系。后续故事里，密码箱继续与抗力植入物、未来科技、涅墨西斯号培育的泰坦以及循环后期的深海战斗相连，成为理解泰坦并非单纯巨兽的重要线索。",
      "在叙事功能上，密码箱连接了身体、机器、记忆和身份。它让阿尔戈英雄不断面对一个问题：他们与敌人使用的技术是否同源，泰坦内部究竟承载着什么，而所谓驾驶、同步和保护是否也可能是一种囚禁。由于它出现频繁且承载大量设定信息，虽然不是人物、地点或派别，也应作为高频关键物件保留。"
    ].join("\n\n"),
  },
  {
    id: "hemiolia",
    name: "赫米奥拉",
    englishName: "Hemiolia",
    category: "其他",
    aliases: ["赫米奥拉", "Hemiolia", "赫米奥拉战舰", "赫米奥拉船"],
    matchAliases: ["赫米奥拉", "Hemiolia", "赫米奥拉战舰", "赫米奥拉船"],
    intro: "赫米奥拉（Hemiolia）是阿尔戈号常用的轻型侦察与接应船，负责护航、潜行、登陆和撤离，常出现在危险海域行动中。",
    detail: [
      "赫米奥拉（Hemiolia）是阿尔戈号及其盟友经常使用的轻型船只类型，常承担侦察、护航、引航、登陆、撤离和隐蔽接近等任务。它不像阿尔戈号那样是巨型城市船，也不像三列桨战舰那样主要作为正面战舰出现，而是更灵活、更低调，适合在岛屿、河口、浓雾、海湾和敌方封锁线附近执行高风险行动。",
      "在克里特与后续航程中，赫米奥拉侦察队会先行寻找目标、护送难民船、帮助阿尔戈号通过危险水道，或在主舰无法直接靠近时作为登陆工具。到循环后期，它又参与三叉戟钻井平台等高度危险的渗透行动，承载装药、船员和撤离希望。许多关键段落里，赫米奥拉的存在意味着阿尔戈英雄暂时离开主舰，以更小规模、更脆弱但更机动的方式进入危险中心。",
      "赫米奥拉在故事中的作用不是某一艘独立命名船，而是一类对阿尔戈号行动模式非常重要的船。它连接了侦察、海战、救援和潜入等玩法与叙事场景。由于出现次数高，且读者经常会在关键行动中看到它，虽然它不是人物、地点或派别，也应作为高频关键物件保留。"
    ].join("\n\n"),
  },
];

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function isZh(value) {
  return /[\u4e00-\u9fff]/u.test(String(value || ""));
}

function entryKey(entry) {
  return entry?.key || `${entry?.book || ""}:${entry?.id || ""}:${entry?.order || ""}:${entry?.line || ""}`;
}

function combineEntries(groups) {
  const seen = new Set();
  const entries = [];
  for (const entity of groups) {
    for (const entry of entity.entries || []) {
      const key = entryKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }
  entries.sort((a, b) => {
    const book = String(a.book || "").localeCompare(String(b.book || ""));
    if (book) return book;
    return Number(a.order || 0) - Number(b.order || 0);
  });
  return entries;
}

function chooseDetail(primary, parts) {
  const byLength = [...parts]
    .map((entity) => String(entity.detail || entity.story || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const primaryDetail = String(primary.detail || primary.story || "").trim();
  return primaryDetail.length >= 220 ? primaryDetail : byLength[0] || primaryDetail;
}

function mergeEntity(primary, extras) {
  const members = [primary, ...extras];
  const override = canonicalOverrides.get(primary.id) || {};
  const entries = combineEntries(members);
  const aliases = unique(members.flatMap((entity) => [
    entity.name,
    entity.englishName,
    ...(entity.aliases || []),
  ]));
  const zhAliases = unique(members.flatMap((entity) => [
    ...(entity.zhAliases || []),
    ...(entity.aliases || []).filter(isZh),
    entity.name,
  ]));
  const enAliases = unique(members.flatMap((entity) => [
    ...(entity.enAliases || []),
    ...(entity.aliases || []).filter((alias) => !isZh(alias)),
    entity.englishName,
  ]));
  const matchAliases = unique(members.flatMap((entity) => [
    ...(entity.matchAliases || []),
    entity.name,
    entity.englishName,
  ])).filter((alias) => !aliasBlocklist.has(alias));
  return {
    ...primary,
    ...override,
    aliases,
    zhAliases,
    enAliases,
    matchAliases,
    entries,
    entryCount: entries.length,
    mentionCount: members.reduce((sum, entity) => sum + Number(entity.mentionCount || 0), 0),
    detail: chooseDetail(primary, members),
    story: chooseDetail(primary, members),
    mergedFrom: unique([
      ...(primary.mergedFrom || []),
      ...extras.flatMap((entity) => [entity.id, ...(entity.mergedFrom || [])]),
    ]),
  };
}

function restoreEntityFromBackup(id, backupIndex, fastDetails) {
  const source = (backupIndex.entities || []).find((entity) => entity.id === id);
  if (!source) return null;
  const entity = JSON.parse(JSON.stringify(source));
  const decision = fastDetails.decisions?.[id];
  if (decision?.decision === "keep") {
    entity.name = decision.name || entity.name;
    entity.englishName = decision.englishName || entity.englishName;
    entity.category = decision.category || entity.category;
    entity.detail = decision.detail || entity.detail || entity.story || "";
    entity.story = entity.detail;
    entity.aiDetailGeneratedAt = decision.generatedAt;
    entity.aliases = unique([entity.name, entity.englishName, ...(entity.aliases || []), ...(decision.aliases || [])]);
  } else {
    entity.aliases = unique([entity.name, entity.englishName, ...(entity.aliases || [])]);
    entity.story = entity.detail || entity.story || "";
  }
  entity.zhAliases = unique([entity.name, ...(entity.zhAliases || []), ...(entity.aliases || []).filter(isZh)]);
  entity.enAliases = unique([entity.englishName, ...(entity.enAliases || []), ...(entity.aliases || []).filter((alias) => !isZh(alias))]);
  entity.matchAliases = unique([...(entity.matchAliases || []), entity.name, entity.englishName])
    .filter((alias) => alias && !aliasBlocklist.has(alias));
  entity.entryCount = (entity.entries || []).length || entity.entryCount || 0;
  delete entity.mergedFrom;
  return entity;
}

function compactSnippet(text, marker, length = 430) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const index = marker ? clean.indexOf(marker) : -1;
  if (clean.length <= length) return clean;
  if (index < 0) return `${clean.slice(0, length).replace(/[\s,，。；;:：、]+$/u, "")}...`;
  const start = Math.max(0, index - Math.floor(length * 0.42));
  const end = Math.min(clean.length, start + length);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < clean.length ? "..." : "";
  return `${prefix}${clean.slice(start, end).replace(/[\s,，。；;:：、]+$/u, "")}${suffix}`;
}

function findStorybookEntry(storybook, entryId) {
  for (const [chapterIndex, chapter] of (storybook.chapters || []).entries()) {
    const entryIndex = (chapter.entries || []).findIndex((entry) => String(entry.id) === String(entryId));
    if (entryIndex < 0) continue;
    const entry = chapter.entries[entryIndex];
    return {
      book: "c2",
      key: `c2-${chapterIndex}-${entryIndex}`,
      id: entry.id,
      title: entry.title || entry.id,
      chapter: chapter.title || "",
      encounter: "",
      order: entry.order ?? entryIndex,
      snippet: compactSnippet(`${entry.title || entry.id} ${entry.text || ""}`, "斯巴达帝国"),
    };
  }
  return null;
}

function readBrowserDataScript(text) {
  return JSON.parse(String(text || "")
    .replace(/^\s*window\.STORYBOOK_DATA\s*=\s*/, "")
    .replace(/;\s*$/, ""));
}

function firstSeenFromEntry(entry) {
  const book = String(entry.book || "").toUpperCase();
  return `${book} ${entry.id || ""}`.trim();
}

function countTerm(text, term, caseInsensitive = false) {
  if (!term) return 0;
  const haystack = caseInsensitive ? String(text || "").toLowerCase() : String(text || "");
  const needle = caseInsensitive ? String(term).toLowerCase() : String(term);
  return haystack.split(needle).length - 1;
}

function collectStoryDataEntries(storyData, spec) {
  const entries = [];
  let mentionCount = 0;
  const sourceTerms = spec.sourceTerms || [spec.name, spec.englishName].filter(Boolean);

  for (const book of storyData.books || []) {
    for (const entry of book.entries || []) {
      const text = `${entry.title || ""}\n${entry.text || ""}`;
      let hits = 0;
      for (const term of sourceTerms) hits += countTerm(text, term, !isZh(term));
      if (!hits) continue;
      mentionCount += hits;
      entries.push({
        book: book.id,
        key: entry.key,
        id: entry.id,
        title: entry.title || entry.id,
        chapter: entry.chapter || "",
        encounter: entry.encounter || "",
        order: entry.order || 0,
        snippet: compactSnippet(`${entry.title || entry.id} ${entry.text || ""}`, spec.name),
      });
    }
  }

  return { entries, mentionCount };
}

function buildManualEntity(spec, storyData, existingEntity = null) {
  const { entries, mentionCount } = collectStoryDataEntries(storyData, spec);
  return {
    ...(existingEntity || {}),
    id: spec.id,
    name: spec.name,
    englishName: spec.englishName,
    zhAliases: unique([spec.name, ...(spec.aliases || []).filter(isZh)]),
    enAliases: unique([spec.englishName, ...(spec.aliases || []).filter((alias) => !isZh(alias))]),
    mentionCount,
    aliases: unique([spec.name, spec.englishName, ...(spec.aliases || [])]),
    matchAliases: unique([...(spec.matchAliases || []), spec.name, spec.englishName]),
    entries,
    entryCount: entries.length,
    firstSeen: entries[0] ? firstSeenFromEntry(entries[0]) : existingEntity?.firstSeen || "",
    category: spec.category,
    intro: existingEntity?.intro && !String(existingEntity.intro).includes("首次见于") ? existingEntity.intro : spec.intro,
    detail: spec.detail,
    story: spec.detail,
    aiDetailGeneratedAt: existingEntity?.aiDetailGeneratedAt || new Date().toISOString(),
    manualException: "Manually confirmed high-value clickable storybook term.",
  };
}

function buildSpartanEmpireEntity(storybook, existingEntity = null) {
  const entries = ["0001", "0230"].map((id) => findStorybookEntry(storybook, id)).filter(Boolean);
  return {
    ...(existingEntity || {}),
    id: "spartan-empire",
    name: "斯巴达帝国",
    englishName: "Spartan Empire",
    zhAliases: ["斯巴达帝国"],
    enAliases: ["Spartan Empire"],
    mentionCount: 2,
    aliases: ["斯巴达帝国", "Spartan Empire"],
    matchAliases: ["斯巴达帝国", "Spartan Empire"],
    entries,
    entryCount: entries.length,
    firstSeen: "C2 0001",
    category: "派别",
    intro: existingEntity?.intro && !String(existingEntity.intro).includes("首次见于") ? existingEntity.intro : spartanEmpireIntro,
    detail: spartanEmpireDetail,
    story: spartanEmpireDetail,
    aiDetailGeneratedAt: existingEntity?.aiDetailGeneratedAt || new Date().toISOString(),
    manualException: "Appears twice, but must remain separate from Sparta and Spartans.",
  };
}

function cleanEntityAliases(entity) {
  const blocked = perEntityAliasBlocklist.get(entity.id) || new Set();
  const aliases = unique([entity.name, entity.englishName, ...(entity.aliases || [])])
    .filter((alias) => !blocked.has(alias));
  const zhAliases = unique([entity.name, ...(entity.zhAliases || []), ...aliases.filter(isZh)])
    .filter((alias) => !blocked.has(alias));
  const enAliases = unique([entity.englishName, ...(entity.enAliases || []), ...aliases.filter((alias) => !isZh(alias))])
    .filter((alias) => !blocked.has(alias));
  const matchAliases = unique([...(entity.matchAliases || []), entity.name, entity.englishName])
    .filter((alias) => alias && !aliasBlocklist.has(alias) && !blocked.has(alias));
  return {
    ...entity,
    aliases,
    zhAliases,
    enAliases,
    matchAliases,
    story: entity.detail || entity.story || "",
  };
}

function buildBrowserJs(payload) {
  const json = JSON.stringify(payload, null, 2)
    .replace(/</g, "\\u003C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `(function () {\n  window.STORY_ENTITY_INDEX = ${json};\n})();\n`;
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
    (entity.zhAliases || []).join(" / "),
    (entity.enAliases || []).join(" / "),
    entity.intro,
    entity.detail || entity.story,
  ]);
  return [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
}

async function saveJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const index = JSON.parse(await fs.readFile(indexJsonPath, "utf8"));
  const entities = index.entities || [];
  const c2Storybook = JSON.parse(await fs.readFile(c2StorybookPath, "utf8"));
  const storyData = readBrowserDataScript(await fs.readFile(storyDataPath, "utf8"));
  const restored = [];
  const manualEntities = [];
  const existingIds = new Set(entities.map((entity) => entity.id));
  if (restoreFreshIds.size && fsSync.existsSync(backupIndexPath) && fsSync.existsSync(fastDetailsPath)) {
    const backupIndex = JSON.parse(await fs.readFile(backupIndexPath, "utf8"));
    const fastDetails = JSON.parse(await fs.readFile(fastDetailsPath, "utf8"));
    for (const id of restoreFreshIds) {
      const restoredEntity = restoreEntityFromBackup(id, backupIndex, fastDetails);
      if (!restoredEntity) continue;
      const existingIndex = entities.findIndex((entity) => entity.id === id);
      if (existingIndex >= 0) {
        entities[existingIndex] = restoredEntity;
      } else {
        entities.push(restoredEntity);
      }
      existingIds.add(id);
      restored.push(id);
    }
  }
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const removeIds = new Set(idBlocklist);
  const merges = [];

  for (const [targetId, sourceIds] of mergeGroups) {
    const target = byId.get(targetId);
    if (!target) continue;
    const sources = sourceIds.map((id) => byId.get(id)).filter(Boolean);
    if (!sources.length) continue;
    byId.set(targetId, mergeEntity(target, sources));
    for (const source of sources) removeIds.add(source.id);
    merges.push({ targetId, sourceIds: sources.map((source) => source.id) });
  }

  let mergedEntities = entities
    .filter((entity) => !removeIds.has(entity.id))
    .map((entity) => byId.get(entity.id) || entity);

  const spartanEmpireIndex = mergedEntities.findIndex((entity) => entity.id === "spartan-empire");
  const spartanEmpireEntity = buildSpartanEmpireEntity(c2Storybook, spartanEmpireIndex >= 0 ? mergedEntities[spartanEmpireIndex] : null);
  if (spartanEmpireIndex >= 0) {
    mergedEntities[spartanEmpireIndex] = spartanEmpireEntity;
  } else {
    const spartaIndex = mergedEntities.findIndex((entity) => entity.id === "sparta");
    mergedEntities.splice(spartaIndex >= 0 ? spartaIndex + 1 : mergedEntities.length, 0, spartanEmpireEntity);
  }
  manualEntities.push("spartan-empire");

  for (const spec of manualEntitySpecs) {
    const existingIndex = mergedEntities.findIndex((entity) => entity.id === spec.id);
    const entity = buildManualEntity(spec, storyData, existingIndex >= 0 ? mergedEntities[existingIndex] : null);
    if (existingIndex >= 0) {
      mergedEntities[existingIndex] = entity;
    } else {
      mergedEntities.push(entity);
    }
    manualEntities.push(spec.id);
  }

  mergedEntities = mergedEntities.map(cleanEntityAliases);

  index.entities = mergedEntities;
  index.entityCount = mergedEntities.length;
  index.categoryCounts = mergedEntities.reduce((counts, entity) => {
    counts[entity.category] = (counts[entity.category] || 0) + 1;
    return counts;
  }, {});
  index.aiDetailCount = mergedEntities.filter((entity) => entity.detail || entity.story).length;
  index.pendingAiDetailCount = mergedEntities.filter((entity) => !(entity.detail || entity.story)).length;
  index.generatedAt = new Date().toISOString();
  index.mergeCleanup = {
    generatedAt: index.generatedAt,
    mergedGroups: merges.length,
    removedIds: [...removeIds],
    restoredIds: restored,
    manualEntityIds: manualEntities,
  };

  await saveJson(indexJsonPath, index);
  await fs.writeFile(indexJsPath, buildBrowserJs(index), "utf8");
  await fs.writeFile(indexCsvPath, `\uFEFF${buildCsv(index.entities)}\n`, "utf8");
  await saveJson(auditPath, {
    generatedAt: index.generatedAt,
    generatedBy: "tools/merge-story-entity-index.mjs",
    beforeCount: entities.length,
    afterCount: mergedEntities.length,
    merges,
    removedIds: [...removeIds],
    restoredIds: restored,
    manualEntityIds: manualEntities,
    categoryCounts: index.categoryCounts,
  });

  console.log(JSON.stringify({
    beforeCount: entities.length,
    afterCount: mergedEntities.length,
    mergedGroups: merges.length,
    categoryCounts: index.categoryCounts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
