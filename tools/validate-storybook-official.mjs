import fs from "node:fs";

const prefix = "window.STORYBOOK_OFFICIAL_DATA = ";
const source = fs.readFileSync("story/data/storybook-official-data.js", "utf8");
const data = JSON.parse(source.slice(prefix.length).replace(/;\s*$/, ""));
const pdfByBook = {
  c1: "奥得赛·迷宫的真理.pdf",
  c2: "奥得赛·深渊凝视者.pdf",
  c3: "奥得赛·无情烈日.pdf",
};
for (const book of data.books.filter((item) => pdfByBook[item.id])) {
  for (const entry of book.entries) {
    if (!entry.officialSource || entry.officialSource.pdf !== pdfByBook[book.id]) {
      throw new Error(`${book.id}/${entry.id}: missing official source`);
    }
    if (entry.officialStatus === "ready" && (!entry.officialTitle || !entry.officialText)) {
      throw new Error(`${book.id}/${entry.id}: ready entry has no official content`);
    }
  }
  console.log(`${book.id}: ${book.entries.length} entries, official source metadata present`);
}
