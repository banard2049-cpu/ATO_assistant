import fs from "node:fs/promises";
import path from "node:path";

const LOCAL_DATA_PATH = path.resolve("story/data/storybook-data.js");
const REMOTE_DATA_PATH = path.resolve("tools/bgstorybook-c2.json");
const IGNORED_CHAPTER_KEYS = new Set(["battle"]);

function loadLocalStorybook(source) {
  const prefix = "window.STORYBOOK_DATA = ";
  if (!source.startsWith(prefix)) throw new Error("Unexpected story/data/storybook-data.js prefix");
  return JSON.parse(source.slice(prefix.length).replace(/;\s*$/, ""));
}

function isNumberEntry(id) {
  return /^\d{3,4}$/.test(String(id || ""));
}

function encounterKeyFor(chapter, entry, entryType) {
  if (entryType === "number") return null;
  if (chapter.key.startsWith("hub-") && !/^(?:α|Ω|\d{1,2}-\d{1,2})$/.test(String(entry.id || ""))) {
    return null;
  }
  return entry.id || entry.title;
}

function toLocalEntry(chapter, entry, order, chapterIndex, entryIndex) {
  const entryType = isNumberEntry(entry.id) ? "number" : "heading";
  const encounterKey = encounterKeyFor(chapter, entry, entryType);
  return {
    key: `c2-${chapterIndex}-${entryIndex}`,
    id: entry.id,
    title: entry.title,
    entryType,
    chapterKey: chapter.key,
    chapter: chapter.title,
    encounterKey,
    encounter: encounterKey ? entry.title : null,
    section: encounterKey ? entry.title : chapter.title,
    order,
    line: entryIndex + 1,
    text: entry.text,
    links: {},
  };
}

async function main() {
  const [localSource, remoteSource] = await Promise.all([
    fs.readFile(LOCAL_DATA_PATH, "utf8"),
    fs.readFile(REMOTE_DATA_PATH, "utf8"),
  ]);
  const data = loadLocalStorybook(localSource);
  const remoteBook = JSON.parse(remoteSource);
  const localBook = data.books.find((book) => book.id === "c2");
  if (!localBook) throw new Error("Local C2 book not found");

  const preservedChapters = localBook.chapters.filter((chapter) => IGNORED_CHAPTER_KEYS.has(chapter.key));
  const preservedEntries = localBook.entries.filter((entry) => IGNORED_CHAPTER_KEYS.has(entry.chapterKey));
  const remoteChapters = remoteBook.chapters.filter((chapter) => !IGNORED_CHAPTER_KEYS.has(chapter.key));

  let order = 0;
  const generatedEntries = [];
  remoteChapters.forEach((chapter, chapterIndex) => {
    chapter.entries.forEach((entry, entryIndex) => {
      generatedEntries.push(toLocalEntry(chapter, entry, order, chapterIndex, entryIndex));
      order += 1;
    });
  });

  const rewrittenPreservedEntries = preservedEntries.map((entry, index) => ({
    ...entry,
    order: order + index,
    key: entry.key || `c2-preserved-${index}`,
  }));

  localBook.title = remoteBook.title;
  localBook.source = remoteBook.source;
  localBook.chapters = [
    ...remoteChapters.map((chapter, index) => ({
      key: chapter.key,
      title: chapter.title,
      line: index + 1,
    })),
    ...preservedChapters.map((chapter, index) => ({
      ...chapter,
      line: remoteChapters.length + index + 1,
    })),
  ];
  localBook.entries = [...generatedEntries, ...rewrittenPreservedEntries];
  localBook.entryCount = localBook.entries.length;
  data.generatedAt = new Date().toISOString();

  await fs.writeFile(LOCAL_DATA_PATH, `window.STORYBOOK_DATA = ${JSON.stringify(data)};\n`, "utf8");

  console.log(`updated ${LOCAL_DATA_PATH}`);
  console.log(`C2 chapters: ${localBook.chapters.length}`);
  console.log(`C2 entries: ${localBook.entries.length}`);
  console.log(`preserved chapters: ${preservedChapters.map((chapter) => chapter.key).join(", ") || "none"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
