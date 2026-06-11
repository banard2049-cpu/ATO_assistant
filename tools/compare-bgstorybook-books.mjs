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

function comparableText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function isNumberEntry(id) {
  return /^(?:\*?\d{3,5}|M\d{3})$/i.test(String(id || ""));
}

function compareBook(remoteBook, localBook) {
  const issues = [];
  const localEntriesByChapter = new Map();
  for (const entry of localBook?.entries || []) {
    if (!localEntriesByChapter.has(entry.chapterKey)) localEntriesByChapter.set(entry.chapterKey, []);
    localEntriesByChapter.get(entry.chapterKey).push(entry);
  }

  if (!localBook) {
    issues.push({ type: "missing-book", book: remoteBook.id });
    return issues;
  }
  if (remoteBook.chapters.length !== localBook.chapters.length) {
    issues.push({ type: "chapter-count", remote: remoteBook.chapters.length, local: localBook.chapters.length });
  }
  if (remoteBook.entryCount !== localBook.entries.length) {
    issues.push({ type: "entry-count", remote: remoteBook.entryCount, local: localBook.entries.length });
  }

  remoteBook.chapters.forEach((remoteChapter, chapterIndex) => {
    const localChapter = localBook.chapters[chapterIndex];
    if (!localChapter || localChapter.key !== remoteChapter.key) {
      issues.push({
        type: "chapter-key",
        index: chapterIndex,
        remote: remoteChapter.key,
        local: localChapter?.key ?? null,
      });
      return;
    }
    if (localChapter.title !== remoteChapter.title) {
      issues.push({ type: "chapter-title", chapter: remoteChapter.key, remote: remoteChapter.title, local: localChapter.title });
    }

    const localEntries = localEntriesByChapter.get(remoteChapter.key) || [];
    if (localEntries.length !== remoteChapter.entries.length) {
      issues.push({
        type: "chapter-entry-count",
        chapter: remoteChapter.key,
        remote: remoteChapter.entries.length,
        local: localEntries.length,
      });
    }

    remoteChapter.entries.forEach((remoteEntry, entryIndex) => {
      const localEntry = localEntries[entryIndex];
      if (!localEntry) {
        issues.push({ type: "missing-entry", chapter: remoteChapter.key, index: entryIndex, remoteId: remoteEntry.id });
        return;
      }
      for (const field of ["id", "title"]) {
        if (localEntry[field] !== remoteEntry[field]) {
          issues.push({
            type: `entry-${field}`,
            chapter: remoteChapter.key,
            index: entryIndex,
            remote: remoteEntry[field],
            local: localEntry[field],
          });
        }
      }
      if (comparableText(localEntry.text) !== comparableText(remoteEntry.text)) {
        issues.push({ type: "entry-text", chapter: remoteChapter.key, index: entryIndex, id: remoteEntry.id });
      }
      if (comparableText(localEntry.html) !== comparableText(remoteEntry.html)) {
        issues.push({ type: "entry-html", chapter: remoteChapter.key, index: entryIndex, id: remoteEntry.id });
      }
      if (remoteChapter.key.startsWith("hub-") && isNumberEntry(localEntry.id) && localEntry.encounterKey) {
        issues.push({
          type: "bad-hub-number-encounter",
          chapter: remoteChapter.key,
          index: entryIndex,
          id: localEntry.id,
          encounterKey: localEntry.encounterKey,
        });
      }
    });
  });

  return issues;
}

async function main() {
  const requested = process.argv.slice(2);
  const bookIds = requested.length ? requested : Object.keys(REMOTE_BOOK_FILES);
  const data = loadLocalStorybook(await fs.readFile(LOCAL_DATA_PATH, "utf8"));

  for (const bookId of bookIds) {
    const remoteBook = JSON.parse(await fs.readFile(REMOTE_BOOK_FILES[bookId], "utf8"));
    const localBook = data.books.find((book) => book.id === bookId);
    const issues = compareBook(remoteBook, localBook);
    const outPath = path.resolve(`tools/${bookId}-storybook-diff.json`);
    await fs.writeFile(outPath, `${JSON.stringify({ bookId, issueCount: issues.length, issues }, null, 2)}\n`, "utf8");
    console.log(`${bookId}: ${issues.length} issues (${outPath})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
