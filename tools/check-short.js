const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("record/index.html", "utf-8");
const sbRaw = fs.readFileSync("story/data/storybook-data.js", "utf-8");

const notesStart = html.indexOf("const choiceMatrixNotes = {");
const notesEnd = html.indexOf("\n    };", notesStart);
const notesBlock = html.slice(notesStart + "const choiceMatrixNotes = ".length, notesEnd + 6);
const choiceMatrixNotes = new Function("return " + notesBlock)();

const sbCtx = { window: {} };
vm.createContext(sbCtx);
vm.runInContext(sbRaw, sbCtx);
const storybook = sbCtx.window.STORYBOOK_DATA;

const bookEntryMap = {};
const bookChapterEntries = {};
for (const book of storybook.books) {
  const entryMap = new Map();
  const chapterMap = {};
  for (const entry of book.entries) {
    entryMap.set(entry.id, entry);
    if (!chapterMap[entry.chapterKey]) chapterMap[entry.chapterKey] = [];
    chapterMap[entry.chapterKey].push(entry);
  }
  bookEntryMap[book.id] = entryMap;
  bookChapterEntries[book.id] = chapterMap;
}

function parseNote(note) {
  const bookMatch = note.match(/C(\d)\s*\|/);
  if (!bookMatch) return null;
  const bookId = "c" + bookMatch[1];
  const segments = note.split(">");
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].trim();
    const m = seg.match(/^(\S+)\s+line\s+(\d+)/);
    if (m) return { bookId, entryId: m[1] };
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SHORT = 200;
let shortCount = 0, foundParent = 0, noParent = 0;
const exFound = [], exNot = [];

for (const [code, notes] of Object.entries(choiceMatrixNotes)) {
  for (const note of notes) {
    const parsed = parseNote(note);
    if (!parsed) continue;
    const entryMap = bookEntryMap[parsed.bookId];
    if (!entryMap) continue;
    const entry = entryMap.get(parsed.entryId);
    if (!entry) continue;
    if (entry.text.length >= SHORT) continue;

    shortCount++;
    const chapterEntries = bookChapterEntries[parsed.bookId][entry.chapterKey] || [];
    const refPattern = new RegExp("(?:请参阅|参见|返回|前往|查看|See|Go to|Return to)[^0-9M]{0,16}" + escapeRegex(parsed.entryId) + "\\b");

    let parent = null;
    for (const c of chapterEntries) {
      if (c.id === parsed.entryId) continue;
      if (refPattern.test(c.text)) {
        if (!parent || c.text.length > parent.text.length) parent = c;
      }
    }

    if (parent) {
      foundParent++;
      if (exFound.length < 3) exFound.push({ code, entryId: parsed.entryId, parentId: parent.id, entryLen: entry.text.length, parentLen: parent.text.length, chapter: entry.chapterKey });
    } else {
      noParent++;
      // 扩大搜索到整本书
      let bookParent = null;
      const allEntries = [];
      for (const arr of Object.values(bookChapterEntries[parsed.bookId] || {})) allEntries.push(...arr);
      for (const c of allEntries) {
        if (c.id === parsed.entryId) continue;
        if (c.chapterKey === entry.chapterKey) continue; // 已搜过
        if (refPattern.test(c.text)) {
          if (!bookParent || c.text.length > bookParent.text.length) bookParent = c;
        }
      }
      if (exNot.length < 5) exNot.push({ code, entryId: parsed.entryId, len: entry.text.length, chapter: entry.chapterKey, crossChapterParent: bookParent ? bookParent.id + "@" + bookParent.chapterKey : "NONE", text: entry.text.slice(0, 100) });
    }
  }
}

console.log("短段落总数:", shortCount);
console.log("找到上游:", foundParent);
console.log("未找到上游:", noParent);
console.log("\n找到上游示例:");
exFound.forEach(e => console.log(" ", JSON.stringify(e)));
console.log("\n未找到上游示例:");
exNot.forEach(e => console.log(" ", JSON.stringify(e)));
