import fs from "node:fs";

const prefix = "window.STORYBOOK_OFFICIAL_DATA = ";
const source = fs.readFileSync("story/data/storybook-official-data.js", "utf8");
const data = JSON.parse(source.slice(prefix.length).replace(/;\s*$/, ""));
const fanPrefix = "window.STORYBOOK_DATA = ";
const fanSource = fs.readFileSync("story/data/storybook-data.js", "utf8");
const fan = JSON.parse(fanSource.slice(fanPrefix.length).replace(/;\s*$/, ""));

// C1-C3 是逐条对着原书图像校过的：正文要么来自故事书 PDF，要么来自官方剧情/末日卡面
// （officialSource.type = official-card-image），两条来源都算合格。C4-C5 是 2026-10-06
// 交付件整体并入的官方正文（officialVersion.officialTextImports），交付件没有
// officialSource/officialStatus 这类字段，所以只核对条目键、标题与正文。
const pdfByBook = {
  c1: "奥得赛·迷宫的真理.pdf",
  c2: "奥得赛·深渊凝视者.pdf",
  c3: "奥得赛·无情烈日.pdf",
};

// 交付件里官方与民间都没有正文的条目（例如「回忆突破」的标题条目）：允许 officialText 为空。
function allowsEmptyOfficialText(fanBook, entry) {
  const fanEntry = fanBook?.entries.find((item) => item.key === entry.key);
  return !String(fanEntry?.text || "").trim();
}

for (const book of data.books) {
  if (pdfByBook[book.id]) {
    const sources = { pdf: 0, "official-card-image": 0 };
    for (const entry of book.entries) {
      const origin = entry.officialSource;
      if (!origin) throw new Error(`${book.id}/${entry.key}: missing official source`);
      if (origin.pdf === pdfByBook[book.id]) sources.pdf += 1;
      else if (origin.type === "official-card-image") sources["official-card-image"] += 1;
      else throw new Error(`${book.id}/${entry.key}: 来源既不是 ${pdfByBook[book.id]} 也不是官方卡面：${origin.pdf || origin.type || "unknown"}`);
      if (!entry.officialTitle && String(entry.officialText || "").trim()) {
        throw new Error(`${book.id}/${entry.key}: 有官方正文却没有 officialTitle`);
      }
      if (!String(entry.officialText || "").trim() && !entry.officialStatus) {
        throw new Error(`${book.id}/${entry.key}: 没有官方正文，也没有 officialStatus 说明原因`);
      }
      if (entry.officialStatus === "ready" && (!entry.officialTitle || !entry.officialText)) {
        throw new Error(`${book.id}/${entry.key}: ready entry has no official content`);
      }
    }
    console.log(
      `${book.id}: ${book.entries.length} entries (故事书 PDF ${sources.pdf} / 官方卡面 ${sources["official-card-image"]}), official source metadata present`,
    );
    continue;
  }

  const fanBook = fan.books.find((item) => item.id === book.id);
  if (!fanBook) throw new Error(`${book.id}: 民间数据里没有这本书，无法核对条目`);
  const fanKeys = new Set(fanBook.entries.map((entry) => entry.key));
  const keys = new Set();
  for (const entry of book.entries) {
    if (!entry.officialTitle) throw new Error(`${book.id}/${entry.key}: missing official title`);
    if (keys.has(entry.key)) throw new Error(`${book.id}/${entry.key}: duplicate entry key`);
    keys.add(entry.key);
    if (!fanKeys.has(entry.key)) throw new Error(`${book.id}/${entry.key}: 民间数据里没有这个条目键`);
    if (!String(entry.officialText || "").trim() && !allowsEmptyOfficialText(fanBook, entry)) {
      throw new Error(`${book.id}/${entry.key}: official text is empty but the fan entry has a body`);
    }
  }
  for (const fanEntry of fanBook.entries) {
    if (!keys.has(fanEntry.key)) throw new Error(`${book.id}/${fanEntry.key}: 官方数据缺少这个条目键`);
  }
  const empty = book.entries.filter((entry) => !String(entry.officialText || "").trim()).length;
  console.log(
    `${book.id}: ${book.entries.length} entries, key-for-key with the fan index, `
    + `${empty} heading-only entries without official body`,
  );
}

const imports = data.officialVersion?.officialTextImports || [];
if (!imports.length) throw new Error("officialVersion.officialTextImports: missing import provenance");
for (const record of imports) {
  if (!record.inputSha256 || !record.books) throw new Error("officialVersion.officialTextImports: 导入记录缺少 inputSha256 / books");
}
console.log(`officialVersion.officialTextImports: ${imports.length} 条导入记录`);
