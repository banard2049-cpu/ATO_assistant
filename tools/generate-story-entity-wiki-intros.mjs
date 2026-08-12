import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexJsonPath = path.join(rootDir, "story", "data", "entity-index.json");
const indexJsPath = path.join(rootDir, "story", "data", "entity-index.js");
const indexCsvPath = path.join(rootDir, "story", "data", "entity-index.csv");
const cachePath = path.join(rootDir, "story", "data", "entity-wiki-intros.json");
const auditPath = path.join(rootDir, "story", "data", "entity-wiki-intros-audit.json");

const args = parseArgs(process.argv.slice(2));
const limit = args.limit ? Number(args.limit) : 0;
const concurrency = Number(args.concurrency || 4);
const refresh = Boolean(args.refresh);
const applyOnly = Boolean(args.applyOnly);
const onlyIds = new Set(splitCsv(args.ids));
const requestDelayMs = Number(args.requestDelayMs || args.requestDelay || 1100);
let lastRequestAt = 0;

const titleOverrides = new Map(Object.entries({
  aristotelians: "Aristotelianism",
  nietzschean: "Übermensch",
  primordials: "Greek primordial deities",
  theseus: "Theseus",
  jason: "Jason",
  helios: "Helios",
  minos: "Minos",
  typhon: "Typhon",
  poseidon: "Poseidon",
  icarus: "Icarus",
  scheherazade: "Scheherazade",
  daedalus: "Daedalus",
  "minoan-guide": "Acacallis (mythology)",
  minotaur: "Minotaur",
  ariadne: "Ariadne",
  "cyrene-the-tenacious": "Cyrene (mythology)",
  djinn: "Jinn",
  atlantis: "Atlantis",
  sparta: "Sparta",
  spartans: "Sparta",
  gytheion: "Gytheio",
  gyaros: "Gyaros",
  knossos: "Knossos",
  athens: "Athens",
  athenians: "Athens",
  "unknown-delos": "Delos",
  cradle: "Delos",
  "sacred-harbor": "Delos",
  crete: "Crete",
  cyclades: "Cyclades",
  hellas: "Ancient Greece",
  lakonia: "Laconia",
  rhodes: "Rhodes",
  persia: "Achaemenid Empire",
  sardis: "Sardis",
  carshemish: "Carchemish",
  zadracarta: "Zadracarta",
  persepolis: "Persepolis",
  kalhu: "Nimrud",
  bishapur: "Bishapur",
  ganzak: "Ganzak",
  "hanging-gardens": "Hanging Gardens of Babylon",
  thera: "Santorini",
  rhages: "Rhages",
  ashur: "Assur",
  hekatompylos: "Hecatompylos",
  elatea: "Elateia",
  anshan: "Anshan (Persia)",
  isfahan: "Isfahan",
  ios: "Ios",
  stoa: "Stoa",
  milos: "Milos",
  kephallonia: "Cephalonia",
  gerrha: "Gerrha",
  uruk: "Uruk",
  pharos: "Pharos",
  pasargadae: "Pasargadae",
  nineveh: "Nineveh",
  delos: "Delos",
  tower: "Tower of Babel",
  "old-irem": "Iram of the Pillars",
  susa: "Susa",
  apadana: "Apadana",
  thapsacus: "Thapsacus",
  "mount-parnassos": "Parnassus",
  tushpa: "Tushpa",
  nubia: "Nubia",
  asklepieion: "Asclepeion",
  hyrcania: "Hyrcania",
  lilaea: "Lilaea (ancient city)",
  propylon: "Propylaea",
  "excursion-propylon": "Propylaea",
  "minoan-dynasty": "Minoan civilization",
  "minoan-civilization": "Minoan civilization",
  minoans: "Minoan civilization",
  helots: "Helots",
  delphians: "Delphi",
  immortals: "Immortals (Achaemenid Empire)",
  centimanes: "Hecatoncheires",
  atlanteans: "Atlantis",
  "leleges-empire": "Leleges",
  cycladeans: "Cyclades",
  leleges: "Leleges",
  ecclesia: "Ecclesia (ancient Athens)",
  rhodian: "Rhodes",
  cretans: "Crete",
  krypteia: "Krypteia",
  nubians: "Nubians",
  dionysian: "Dionysian Mysteries",
  "nietzschean-empire": "Übermensch",
  poseidonites: "Poseidon",
  "the-poseidonites": "Poseidon",
  minotaurites: "Minotaur",
  "bronze-people": "Ages of Man",
  "hyperborean-apocrypha": "Hyperborea",
  "sun-seekers": "Hyperborea",
  labyrinthians: "Labyrinth",
  "maze-cult": "Labyrinth",
  sunheirs: "Helios",
  "spartan-empire": "Sparta",
  "rhodian-hegemony": "Rhodes",
  "cycladean-protectorate": "Cyclades",
  axiothea: "Axiothea of Phlius",
  odysseus: "Odysseus",
  alkibiades: "Alcibiades",
  xerxes: "Xerxes I",
  "god-king-xerxes": "Xerxes I",
  artemisia: "Artemisia I of Caria",
  artabanus: "Artabanus of Persia",
  pactyes: "Pactyes",
  ephialtes: "Ephialtes of Trachis",
  pasion: "Pasion",
  kroisos: "Croesus",
  cypselos: "Cypselus",
  old_spinner: "Clotho",
  "old-spinner": "Clotho",
  pirithous: "Pirithous",
  midas: "Midas",
  moirai: "Moirai",
  ares: "Ares",
  hades: "Hades",
  phaeton: "Phaethon",
  anemoi: "Anemoi",
  dionysus: "Dionysus",
  pandora: "Pandora",
  phaedra: "Phaedra (mythology)",
  cyrene: "Cyrene (mythology)",
  sisyphus: "Sisyphus",
  palamedes: "Palamedes (mythology)",
  amanirenas: "Amanirenas",
  datis: "Datis",
  kyknos: "Cycnus",
  deipyle: "Deipyle",
  cebriones: "Cebriones",
  tarchon: "Tarchon",
  hermes: "Hermes",
  "hermesian-pursuer": "Hermes",
  mitra: "Mithra",
  zeus: "Zeus",
  nymph: "Nymph",
  "mask-nymph": "Nymph",
  hephaestus: "Hephaestus",
  lykaon: "Lycaon (king of Arcadia)",
  pythoness: "Pythia",
  harpaia: "Harpy",
  antiphantes: "Antiphates",
  medea: "Medea",
  anaphe: "Anafi",
  demeter: "Demeter",
  amalthean_nymph: "Amalthea (mythology)",
  "amalthean-nymph": "Amalthea (mythology)",
  athena: "Athena",
  efigenia: "Iphigenia",
  hellenos: "Hellen",
  selena: "Selene",
  selene: "Selene",
  polyphemos: "Polyphemus",
  dodona: "Dodona",
  nemesis: "Nemesis",
  labyrinth: "Labyrinth",
  delphi: "Delphi",
  elysium: "Elysium",
  tartarus: "Tartarus",
  olympus: "Mount Olympus",
  hyperborean: "Hyperborea",
  hekaton: "Hecatoncheires",
  herakles: "Heracles",
  patroclus: "Patroclus",
  gegenees: "Gegenees",
  "greater-titan": "Titan (mythology)",
  thanatos: "Thanatos",
  olympians: "Twelve Olympians",
  sirens: "Siren (mythology)",
  cyclopes: "Cyclopes",
  aphrodite: "Aphrodite",
  dionysians: "Dionysus",
  tahmina: "Tahmina",
  aletheia: "Aletheia",
  apollo: "Apollo",
  "temple-of-apollo": "Apollo",
  "oracle-orkos": "Horkos",
  alektryon: "Alectryon (mythology)",
  "god-king": "Xerxes I",
  "king-xerxes": "Xerxes I",
  "princess-phaedra": "Phaedra (mythology)",
  pheidias: "Phidias",
  "heliast-pheidias": "Phidias",
  midascore: "Midas",
  "ur-fleece": "Golden Fleece",
  hemiolia: "Hellenistic-era warships",
  "babelian-lunacy": "Tower of Babel",
  "babelian-testament": "Tower of Babel",
  "panoptes-of-babel": "Tower of Babel",
  corinth: "Ancient Corinth",
  gortyna: "Gortyn",
  asopos: "Asopos",
  geropotamos: "Geropotamos",
  kirra: "Cirrha",
  "mount-olympus": "Mount Olympus",
  "holy-thronos-of-olympus": "Mount Olympus",
  napata: "Napata",
  adyton: "Adyton",
  "triskelion-junction": "Triskelion",
  trident: "Trident",
  "hyrcanian-wild": "Hyrcania",
  "promissory-apadana": "Apadana",
  "gear-agora": "Agora",
  "grand-agora": "Agora",
  "titan-stoa": "Stoa",
  "labyrinthian-temple": "Labyrinth",
  "conundrumed-polis": "Labyrinth",
  "the-gift-of-telchines": "Telchines",
  nostos: "Nostos",
  mausoleum: "Mausoleum",
  "argonaut-mausoleum": "Mausoleum",
  "sepulcher-acropolis": "Acropolis",
  "sepulchre-acropolis": "Acropolis",
  "horned-city": "Knossos",
  "city-of-the-bull": "Knossos",
}));

const manualWikiEntries = new Map(Object.entries({
  hemiolia: {
    wikiTitle: "Hellenistic-era warships",
    wikiUrl: "https://en.wikipedia.org/wiki/Hellenistic-era_warships#Hemiolia",
    wikiLanguage: "zh",
    wikiIntro: "Hemiolia（希腊语：ἡμιολία）是希腊化时代出现的一种轻快战船，约在公元前4世纪初出现，常见于东地中海海盗活动，也被亚历山大大帝和罗马人用于军事运输。",
  },
}));

const blockedWikiIds = new Set([
  "cryptex",
  "thestor",
]);

const acceptedNeedles = [
  "mythology",
  "mythological",
  "greek myth",
  "ancient greek religion",
  "greek religion",
  "greek hero",
  "greek deity",
  "god in ancient greek",
  "goddess in ancient greek",
  "ancient greek",
  "ancient greece",
  "classical greece",
  "greek city-state",
  "city-state in ancient greece",
  "polis",
  "ancient city",
  "ancient greek city",
  "archaeological site",
  "bronze age",
  "minoans",
  "minoan",
  "mycenaean",
  "laconia",
  "attica",
  "crete",
  "delphi",
  "one thousand and one nights",
  "arabian nights",
  "folklore",
  "legendary",
  "legend",
  "philosophy",
  "philosopher",
  "plato",
  "platonic",
  "nietzsche",
  "zoroastrian",
  "persian mythology",
  "iranian mythology",
  "shahnameh",
  "mithra",
  "hindu",
  "vedic",
  "mesopotamian mythology",
  "achaemenid",
  "ancient persia",
  "persian empire",
  "ancient near east",
  "mesopotamia",
  "assyria",
  "babylonia",
  "ancient iran",
  "ancient egypt",
  "anatolia",
  "phoenicia",
  "ancient city of",
];

const rejectNeedles = [
  "may refer to",
  "given name",
  "surname",
  "disambiguation",
  "list of",
];

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

function hashEntity(entity) {
  return createHash("sha256").update(JSON.stringify({
    id: entity.id,
    name: entity.name,
    englishName: entity.englishName,
    category: entity.category,
    aliases: entity.aliases || [],
  })).digest("hex").slice(0, 16);
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
  const headers = ["id", "分类", "中文名", "英文名", "首次出现", "提及次数", "相关段落数", "中文别名", "英文别名", "简介", "神话来源介绍", "神话来源链接", "详细介绍"];
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
    entity.wikiIntro || "",
    entity.wikiUrl || "",
    entity.detail || entity.story,
  ]);
  return [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
}

function wikiApiUrl(lang, params) {
  const search = new URLSearchParams({
    format: "json",
    utf8: "1",
    redirects: "1",
    ...params,
  });
  return `https://${lang}.wikipedia.org/w/api.php?${search}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleWikipediaRequest() {
  if (!requestDelayMs) return;
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + requestDelayMs - now);
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();
}

function powershellJson(url) {
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()",
    "$headers = @{ 'User-Agent' = 'ATO entity wiki updater/1.0 (local storybook tool)' }",
    `$uri = ${JSON.stringify(url)}`,
    "try {",
    "  $result = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 25",
    "  $result | ConvertTo-Json -Depth 60 -Compress",
    "} catch {",
    "  Write-Error $_.Exception.Message",
    "  exit 1",
    "}",
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Wikipedia request timed out: ${url}`));
    }, 35000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || stdout || `PowerShell exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Cannot parse Wikipedia JSON: ${stdout.slice(0, 500)}\n${error.message}`));
      }
    });
  });
}

async function fetchJson(url, retries = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await throttleWikipediaRequest();
      return await powershellJson(url);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || "");
      const isRateLimited = /429|too many requests/i.test(message);
      if (attempt < retries) {
        await sleep(isRateLimited ? 12000 * attempt : 900 * attempt);
      }
    }
  }
  throw lastError;
}

function firstPage(data) {
  const pages = data?.query?.pages;
  if (!pages) return null;
  return Object.values(pages)[0] || null;
}

async function getPage(lang, title) {
  const data = await fetchJson(wikiApiUrl(lang, {
    action: "query",
    prop: "extracts|info|langlinks|categories",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    lllang: "zh",
    cllimit: "80",
    titles: title,
  }));
  const page = firstPage(data);
  if (!page || page.missing !== undefined) return null;
  return page;
}

async function searchTitles(query) {
  const data = await fetchJson(wikiApiUrl("en", {
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "5",
  }));
  return (data?.query?.search || []).map((item) => item.title).filter(Boolean);
}

function pageText(page) {
  const categories = Array.isArray(page?.categories)
    ? page.categories.map((item) => item.title || "").join(" ")
    : "";
  return `${page?.title || ""} ${page?.extract || ""} ${categories}`.toLowerCase();
}

function normalizeWikiTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function pageTitleMatchesEntity(page, entity, forced = false) {
  if (forced) return true;
  const title = normalizeWikiTitle(page?.title);
  if (!title) return false;
  const aliases = [entity.englishName, ...(entity.enAliases || []), ...(entity.aliases || [])]
    .map(normalizeWikiTitle)
    .filter(Boolean);
  if (aliases.some((alias) => title === alias)) return true;
  return aliases.some((alias) => alias.length >= 5 && (title.startsWith(`${alias} `) || title.endsWith(` ${alias}`)));
}

function isAcceptedPage(page, forced = false) {
  const text = pageText(page);
  const title = String(page?.title || "").toLowerCase();
  if (!page?.extract || title.includes("(disambiguation)")) return false;
  if (rejectNeedles.some((needle) => text.includes(needle))) return false;
  if (forced) return true;
  return acceptedNeedles.some((needle) => text.includes(needle));
}

function compactIntro(text, maxLength = 220) {
  let intro = String(text || "").replace(/\s+/g, " ").trim();
  intro = intro.replace(/\[[^\]]+\]/g, "").trim();
  if (intro.length <= maxLength) return intro;
  const cut = intro.slice(0, maxLength);
  const punctuation = Math.max(
    cut.lastIndexOf("。"),
    cut.lastIndexOf("；"),
    cut.lastIndexOf("，"),
    cut.lastIndexOf("."),
    cut.lastIndexOf(";"),
    cut.lastIndexOf(","),
  );
  return `${cut.slice(0, punctuation > 90 ? punctuation + 1 : maxLength).replace(/[，。；;,\s]+$/u, "")}。`;
}

function zhTitleFromPage(page) {
  const links = page?.langlinks;
  if (!links) return "";
  const list = Array.isArray(links) ? links : [links];
  const zh = list.find((item) => item.lang === "zh");
  return zh?.["*"] || "";
}

async function resolveEntity(entity) {
  if (blockedWikiIds.has(entity.id)) {
    return {
      id: entity.id,
      status: "skipped",
      reason: "blocked because no suitable source page was found",
      sourceHash: hashEntity(entity),
      generatedAt: new Date().toISOString(),
    };
  }

  const manual = manualWikiEntries.get(entity.id);
  if (manual) {
    return {
      id: entity.id,
      status: "matched",
      wikiTitle: manual.wikiTitle,
      wikiIntro: manual.wikiIntro,
      wikiUrl: manual.wikiUrl,
      wikiLanguage: manual.wikiLanguage || "zh",
      wikiSourceTitle: manual.wikiTitle,
      sourceHash: hashEntity(entity),
      generatedAt: new Date().toISOString(),
    };
  }

  const forcedTitle = titleOverrides.get(entity.id);
  const searchName = entity.englishName || entity.name;
  const isPlace = entity.category === "地点";
  const isFaction = entity.category === "派别";
  const sourceQueries = isPlace
    ? [
        `${searchName} ancient Greece`,
        `${searchName} Greek mythology`,
        `${searchName} archaeology`,
        `${searchName} ancient city`,
        `${searchName} mythology`,
        `${searchName} literature`,
        searchName,
      ]
    : isFaction
      ? [
          `${searchName} ancient Greece`,
          `${searchName} Greek mythology`,
          `${searchName} mythology`,
          `${searchName} philosophy`,
          `${searchName} literature`,
          searchName,
        ]
      : [
          `${searchName} Greek mythology`,
          `${searchName} mythology`,
          `${searchName} ancient Greece`,
          `${searchName} philosophy`,
          `${searchName} literature`,
          searchName,
        ];
  const queries = forcedTitle
    ? [{ title: forcedTitle, forced: true }]
    : sourceQueries.map((query) => ({ query }));

  const tried = [];
  for (const item of queries) {
    const titles = item.title ? [item.title] : await searchTitles(item.query);
    if (item.query) tried.push(item.query);
    for (const title of titles) {
      if (!title || tried.includes(`title:${title}`)) continue;
      tried.push(`title:${title}`);
      const enPage = await getPage("en", title);
      if (!pageTitleMatchesEntity(enPage, entity, Boolean(item.forced))) continue;
      if (!isAcceptedPage(enPage, Boolean(item.forced))) continue;
      const zhTitle = zhTitleFromPage(enPage);
      const zhPage = zhTitle ? await getPage("zh", zhTitle) : null;
      const sourcePage = zhPage?.extract ? zhPage : enPage;
      const intro = compactIntro(sourcePage.extract);
      if (!intro) continue;
      return {
        id: entity.id,
        status: "matched",
        wikiTitle: sourcePage.title || enPage.title,
        wikiIntro: intro,
        wikiUrl: sourcePage.fullurl || enPage.fullurl || "",
        wikiLanguage: zhPage?.extract ? "zh" : "en",
        wikiSourceTitle: enPage.title,
        sourceHash: hashEntity(entity),
        generatedAt: new Date().toISOString(),
      };
    }
  }

  return {
    id: entity.id,
    status: "skipped",
    reason: "no accepted mythology/history/philosophy/literature Wikipedia page",
    sourceHash: hashEntity(entity),
    generatedAt: new Date().toISOString(),
    tried,
  };
}

function shouldConsider(entity) {
  if (blockedWikiIds.has(entity.id)) return false;
  if (onlyIds.size) return onlyIds.has(entity.id);
  if (titleOverrides.has(entity.id)) return true;
  if (entity.category === "人物") return true;
  if (entity.category === "地点") return true;
  if (entity.category === "派别") return true;
  const text = `${entity.name} ${entity.englishName} ${(entity.aliases || []).join(" ")}`.toLowerCase();
  return /\b(god|goddess|myth|nymph|sirens|cyclopes|olympian|djinn|jinn|atlantis|elysium|tartarus|olympus|hyperborean|ancient|city-state|polis)\b/.test(text);
}

async function runPool(items, cache) {
  let next = 0;
  let done = 0;
  async function worker(workerIndex) {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      try {
        console.log(`Wiki ${done + 1}/${items.length} [worker ${workerIndex}]: ${item.entity.id}`);
        const row = await resolveEntity(item.entity);
        cache.entries[item.entity.id] = row;
        await saveJsonAtomic(cachePath, cache);
        console.log(row.status === "matched"
          ? `Wiki OK: ${item.entity.id} -> ${row.wikiTitle}`
          : `Wiki skipped: ${item.entity.id}`);
      } catch (error) {
        const existing = cache.entries[item.entity.id];
        if (existing?.status === "matched" && existing.sourceHash === item.sourceHash) {
          console.warn(`Wiki error: ${item.entity.id}: ${error.message} (kept previous match)`);
        } else {
          cache.entries[item.entity.id] = {
            id: item.entity.id,
            status: "error",
            error: error.message,
            sourceHash: item.sourceHash,
            generatedAt: new Date().toISOString(),
          };
        }
        await saveJsonAtomic(cachePath, cache);
        if (!(existing?.status === "matched" && existing.sourceHash === item.sourceHash)) {
          console.warn(`Wiki error: ${item.entity.id}: ${error.message}`);
        }
      } finally {
        done += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, (_, index) => worker(index + 1)));
}

async function saveJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function applyWiki(index, cache) {
  const applied = [];
  const skipped = [];
  const pending = [];
  for (const entity of index.entities || []) {
    const row = cache.entries?.[entity.id];
    const currentHash = hashEntity(entity);
    if (!row || row.sourceHash !== currentHash) {
      if (shouldConsider(entity)) pending.push(entity.id);
      continue;
    }
    if (row.status !== "matched") {
      delete entity.wikiIntro;
      delete entity.wikiTitle;
      delete entity.wikiUrl;
      delete entity.wikiLanguage;
      skipped.push(entity.id);
      continue;
    }
    entity.wikiIntro = row.wikiIntro;
    entity.wikiTitle = row.wikiTitle;
    entity.wikiUrl = row.wikiUrl;
    entity.wikiLanguage = row.wikiLanguage;
    entity.wikiGeneratedAt = row.generatedAt;
    applied.push(entity.id);
  }

  index.wikiIntroGenerator = "tools/generate-story-entity-wiki-intros.mjs";
  index.wikiIntroGeneratedAt = new Date().toISOString();
  index.wikiIntroCount = (index.entities || []).filter((entity) => entity.wikiIntro).length;
  index.pendingWikiIntroCount = pending.length;
  index.generatedAt = new Date().toISOString();

  await saveJsonAtomic(indexJsonPath, index);
  await fs.writeFile(indexJsPath, buildBrowserJs(index), "utf8");
  await fs.writeFile(indexCsvPath, `\uFEFF${buildCsv(index.entities)}\n`, "utf8");
  await saveJsonAtomic(auditPath, {
    generatedAt: new Date().toISOString(),
    generatedBy: "tools/generate-story-entity-wiki-intros.mjs",
    appliedCount: applied.length,
    skippedCount: skipped.length,
    pendingCount: pending.length,
    appliedIds: applied,
    pendingIds: pending,
  });
  console.log(`Applied wiki intros ${applied.length}, skipped ${skipped.length}, pending ${pending.length}`);
}

async function main() {
  if (!fsSync.existsSync(indexJsonPath)) throw new Error(`Missing ${indexJsonPath}`);
  const index = await readJson(indexJsonPath);
  const cache = await readJson(cachePath, {
    generatedBy: "tools/generate-story-entity-wiki-intros.mjs",
    entries: {},
  });
  cache.entries ||= {};

  const candidates = (index.entities || [])
    .filter(shouldConsider)
    .map((entity) => ({ entity, sourceHash: hashEntity(entity) }))
    .filter((item) => {
      const cached = cache.entries[item.entity.id];
      return refresh || !cached || cached.sourceHash !== item.sourceHash || cached.status === "error";
    });
  const selected = limit ? candidates.slice(0, limit) : candidates;
  console.log(`Wiki candidates ${candidates.length}, selected ${selected.length}`);

  if (!applyOnly && selected.length) await runPool(selected, cache);

  const freshIndex = await readJson(indexJsonPath);
  const freshCache = await readJson(cachePath, cache);
  await applyWiki(freshIndex, freshCache);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
