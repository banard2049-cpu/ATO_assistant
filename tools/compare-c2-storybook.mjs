import fs from "node:fs/promises";
import path from "node:path";

const LOCAL_DATA_PATH = path.resolve("story/data.js");
const REMOTE_DATA_PATH = path.resolve("tools/bgstorybook-c2.json");
const REPORT_PATH = path.resolve("tools/c2-storybook-diff.json");
const IGNORED_CHAPTER_KEYS = new Set(["battle"]);

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTitle(value) {
  return normalizeText(value)
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function loadLocalStorybook(source) {
  const prefix = "window.STORYBOOK_DATA = ";
  if (!source.startsWith(prefix)) throw new Error("Unexpected story/data.js prefix");
  const json = source.slice(prefix.length).replace(/;\s*$/, "");
  return JSON.parse(json);
}

function byKey(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function first(map, key) {
  return map.get(key)?.[0] || null;
}

function compareChapter(remoteChapter, localBook) {
  const localEntries = localBook.entries.filter((entry) => entry.chapterKey === remoteChapter.key);
  const localById = byKey(localEntries, (entry) => entry.id);
  const remoteById = byKey(remoteChapter.entries, (entry) => entry.id);
  const ids = [...new Set([...remoteById.keys(), ...localById.keys()])].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  const missingLocal = [];
  const extraLocal = [];
  const titleDiffs = [];
  const textDiffs = [];
  const duplicateIds = [];

  ids.forEach((id) => {
    const remoteItems = remoteById.get(id) || [];
    const localItems = localById.get(id) || [];
    if (remoteItems.length > 1 || localItems.length > 1) {
      duplicateIds.push({ id, remote: remoteItems.length, local: localItems.length });
    }
    const remote = remoteItems[0] || null;
    const local = localItems[0] || null;
    if (remote && !local) {
      missingLocal.push({ id, remoteTitle: remote.title });
      return;
    }
    if (!remote && local) {
      extraLocal.push({ id, localTitle: local.title });
      return;
    }
    if (!remote || !local) return;

    const remoteTitle = normalizeTitle(remote.title);
    const localTitle = normalizeTitle(local.title);
    if (remoteTitle !== localTitle) {
      titleDiffs.push({ id, remoteTitle, localTitle });
    }

    const remoteText = normalizeText(remote.text);
    const localText = normalizeText(local.text);
    if (remoteText !== localText) {
      textDiffs.push({
        id,
        remoteLength: remoteText.length,
        localLength: localText.length,
        remoteStart: remoteText.slice(0, 120),
        localStart: localText.slice(0, 120),
      });
    }
  });

  return {
    key: remoteChapter.key,
    remoteTitle: remoteChapter.title,
    localTitle: localBook.chapters.find((chapter) => chapter.key === remoteChapter.key)?.title || "",
    remoteEntryCount: remoteChapter.entryCount,
    localEntryCount: localEntries.length,
    missingLocal,
    extraLocal,
    duplicateIds,
    titleDiffCount: titleDiffs.length,
    textDiffCount: textDiffs.length,
    titleDiffs: titleDiffs.slice(0, 40),
    textDiffs: textDiffs.slice(0, 40),
  };
}

async function main() {
  const [localSource, remoteSource] = await Promise.all([
    fs.readFile(LOCAL_DATA_PATH, "utf8"),
    fs.readFile(REMOTE_DATA_PATH, "utf8"),
  ]);
  const localData = loadLocalStorybook(localSource);
  const localBook = localData.books.find((book) => book.id === "c2");
  if (!localBook) throw new Error("Local C2 book not found");
  const remoteBook = JSON.parse(remoteSource);

  const localChapterKeys = new Set(localBook.chapters.map((chapter) => chapter.key).filter((key) => !IGNORED_CHAPTER_KEYS.has(key)));
  const remoteChapters = remoteBook.chapters.filter((chapter) => !IGNORED_CHAPTER_KEYS.has(chapter.key));
  const remoteChapterKeys = new Set(remoteChapters.map((chapter) => chapter.key));

  const report = {
    generatedAt: new Date().toISOString(),
    remote: {
      title: remoteBook.title,
      source: remoteBook.source,
      chapterCount: remoteChapters.length,
      entryCount: remoteChapters.reduce((sum, chapter) => sum + chapter.entryCount, 0),
    },
    local: {
      title: localBook.title,
      chapterCount: [...localChapterKeys].length,
      entryCount: localBook.entries.filter((entry) => !IGNORED_CHAPTER_KEYS.has(entry.chapterKey)).length,
    },
    ignoredChapters: [...IGNORED_CHAPTER_KEYS],
    missingLocalChapters: [...remoteChapterKeys].filter((key) => !localChapterKeys.has(key)),
    extraLocalChapters: [...localChapterKeys].filter((key) => !remoteChapterKeys.has(key)),
    chapters: remoteChapters.map((chapter) => compareChapter(chapter, localBook)),
  };

  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`wrote ${REPORT_PATH}`);
  console.log(`remote ${report.remote.chapterCount}/${report.remote.entryCount}; local ${report.local.chapterCount}/${report.local.entryCount}`);
  console.log(`missing chapters: ${report.missingLocalChapters.join(", ") || "none"}`);
  report.chapters.forEach((chapter) => {
    console.log([
      chapter.key,
      `remote=${chapter.remoteEntryCount}`,
      `local=${chapter.localEntryCount}`,
      `missing=${chapter.missingLocal.length}`,
      `extra=${chapter.extraLocal.length}`,
      `titleDiff=${chapter.titleDiffCount}`,
      `textDiff=${chapter.textDiffCount}`,
    ].join(" | "));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
