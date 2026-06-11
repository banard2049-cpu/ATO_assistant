import fs from "node:fs/promises";
import path from "node:path";

const LOCAL_DATA_PATH = path.resolve("story/data.js");
const REMOTE_BOOK_FILES = {
  c4: path.resolve("tools/bgstorybook-c4.json"),
  c5: path.resolve("tools/bgstorybook-c5.json"),
};

function loadLocalStorybook(source) {
  const prefix = "window.STORYBOOK_DATA = ";
  if (!source.startsWith(prefix)) throw new Error("Unexpected story/data.js prefix");
  return JSON.parse(source.slice(prefix.length).replace(/;\s*$/, ""));
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[()?:!,.，。！；：、"'“”‘’]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[|/\\]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isNumberEntry(id) {
  return /^(?:\*?\d{3,5}|M\d{3})$/i.test(String(id || ""));
}

function isHubLayerEntry(chapter, entry, entryType) {
  if (entryType === "number" || !chapter.key.startsWith("hub-")) return false;
  return /^(?:α|Ω|\d{1,2}-\d{1,2})$/i.test(normalizeText(entry.id));
}

function toLocalBook(remoteBook) {
  let order = 0;
  const entries = [];

  remoteBook.chapters.forEach((chapter, chapterIndex) => {
    let currentEncounter = null;

    chapter.entries.forEach((entry, entryIndex) => {
      const entryType = isNumberEntry(entry.id) ? "number" : "heading";
      let encounterKey = null;
      let encounter = null;

      if (chapter.key === "main") {
        currentEncounter = null;
      } else if (chapter.key.startsWith("hub-")) {
        if (isHubLayerEntry(chapter, entry, entryType)) {
          encounterKey = slugify(entry.title || entry.id);
          encounter = entry.title || entry.id;
        }
      } else if (entryType === "heading") {
        encounterKey = slugify(entry.title || entry.id);
        encounter = entry.title || entry.id;
        currentEncounter = { key: encounterKey, title: encounter };
      } else if (currentEncounter) {
        encounterKey = currentEncounter.key;
        encounter = currentEncounter.title;
      }

      const localEntry = {
        key: `${remoteBook.id}-${chapterIndex}-${entryIndex}`,
        id: entry.id,
        title: entry.title,
        entryType,
        chapterKey: chapter.key,
        chapter: chapter.title,
        encounterKey,
        encounter,
        section: encounter || chapter.title,
        order,
        line: entryIndex + 1,
        text: entry.text,
        links: {},
      };
      if (entry.html) localEntry.html = entry.html;
      entries.push(localEntry);
      order += 1;
    });
  });

  return {
    id: remoteBook.id,
    title: remoteBook.title,
    source: remoteBook.source,
    entryCount: entries.length,
    chapters: remoteBook.chapters.map((chapter, index) => ({
      key: chapter.key,
      title: chapter.title,
      line: index + 1,
    })),
    entries,
  };
}

async function main() {
  const requested = process.argv.slice(2);
  const bookIds = requested.length ? requested : Object.keys(REMOTE_BOOK_FILES);
  const localSource = await fs.readFile(LOCAL_DATA_PATH, "utf8");
  const data = loadLocalStorybook(localSource);

  for (const bookId of bookIds) {
    const file = REMOTE_BOOK_FILES[bookId];
    if (!file) throw new Error(`Unknown book id: ${bookId}`);
    const remoteBook = JSON.parse(await fs.readFile(file, "utf8"));
    const localBook = toLocalBook(remoteBook);
    const existingIndex = data.books.findIndex((book) => book.id === bookId);

    if (existingIndex >= 0) {
      data.books[existingIndex] = localBook;
    } else {
      const previousCycleIndex = data.books.findIndex((book) => book.id === `c${Number(bookId.slice(1)) - 1}`);
      const insertIndex = previousCycleIndex >= 0 ? previousCycleIndex + 1 : data.books.length;
      data.books.splice(insertIndex, 0, localBook);
    }

    console.log(`${bookId}: ${localBook.chapters.length} chapters, ${localBook.entries.length} entries`);
  }

  data.generatedAt = new Date().toISOString();
  await fs.writeFile(LOCAL_DATA_PATH, `window.STORYBOOK_DATA = ${JSON.stringify(data)};\n`, "utf8");
  console.log(`updated ${LOCAL_DATA_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
