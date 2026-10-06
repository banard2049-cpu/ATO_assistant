#!/usr/bin/env node
// 把交付来的 window.STORYBOOK_OFFICIAL_DATA 并入 story/data/storybook-official-data.js。
//
// 交付件（例如 storybook-official-data-c1-c5-20261006.js）是官方故事书正文的唯一来源，
// 工具只做三件事：核对旧书未被改动、核对新书与民间数据的条目键一一对应、在
// officialVersion 里留一条导入记录。条目正文原样搬运，不代填 officialSource /
// officialStatus / officialScan 这类需要原书图像才能成立的校对溯源字段。
//
// 用法：
//   node tools/import-storybook-official.mjs --source <交付文件> [--dry-run]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PREFIX = "window.STORYBOOK_OFFICIAL_DATA = ";
const FAN_PREFIX = "window.STORYBOOK_DATA = ";
const TARGET = path.resolve("story/data/storybook-official-data.js");
const FAN_DATA = path.resolve("story/data/storybook-data.js");

function parseArgs(argv) {
  const args = { source: "", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--source") args.source = argv[++i] || "";
    else if (item === "--dry-run") args.dryRun = true;
    else throw new Error(`未知参数：${item}`);
  }
  if (!args.source) throw new Error("缺少 --source <交付的 storybook-official-data 文件>");
  return args;
}

function loadWindow(file, prefix, label) {
  const raw = fs.readFileSync(file, "utf8");
  if (!raw.startsWith(prefix)) throw new Error(`${label}：前缀不是 ${prefix}`);
  return { raw, data: JSON.parse(raw.slice(prefix.length).replace(/;\s*$/, "")) };
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function entryStats(book) {
  const textEmpty = book.entries.filter((entry) => !String(entry.officialText || "").trim()).length;
  return {
    entries: book.entries.length,
    chapters: (book.chapters || []).length,
    emptyOfficialText: textEmpty,
    carriedFields: [...new Set(book.entries.flatMap((entry) => Object.keys(entry)))]
      .filter((field) => !["key", "id"].includes(field)),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = path.resolve(args.source);
  const incoming = loadWindow(sourceFile, PREFIX, "交付件");
  const current = loadWindow(TARGET, PREFIX, "现有官方数据");
  const fan = loadWindow(FAN_DATA, FAN_PREFIX, "民间数据");

  if (!Array.isArray(incoming.data.books) || !incoming.data.books.length) {
    throw new Error("交付件里没有 books");
  }

  const currentBooks = new Map(current.data.books.map((book) => [book.id, book]));
  const fanBooks = new Map(fan.data.books.map((book) => [book.id, book]));
  const addedBooks = [];
  const unchangedBooks = [];

  for (const book of incoming.data.books) {
    const existing = currentBooks.get(book.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(book)) {
        throw new Error(`已经存在的 ${book.id} 在交付件里被改动了；本工具不覆盖旧书，请人工确认`);
      }
      unchangedBooks.push(book.id);
      continue;
    }
    const fanBook = fanBooks.get(book.id);
    if (!fanBook) throw new Error(`民间数据里没有 ${book.id}，无法核对条目键`);
    const fanKeys = new Set(fanBook.entries.map((entry) => entry.key));
    const newKeys = new Set(book.entries.map((entry) => entry.key));
    const missing = [...fanKeys].filter((key) => !newKeys.has(key));
    const extra = [...newKeys].filter((key) => !fanKeys.has(key));
    if (missing.length || extra.length) {
      throw new Error(
        `${book.id} 与民间数据的条目键不一致：民间多 ${missing.length} 条（${missing.slice(0, 5).join(",")}），`
        + `官方多 ${extra.length} 条（${extra.slice(0, 5).join(",")}）`,
      );
    }
    const untitled = book.entries.filter((entry) => !String(entry.officialTitle || "").trim()).length;
    if (untitled) throw new Error(`${book.id} 有 ${untitled} 条没有 officialTitle`);
    addedBooks.push(book);
  }

  if (!addedBooks.length) {
    console.log("交付件没有带来新的故事集，数据文件保持不变。");
    return;
  }

  const importedAt = new Date().toISOString();
  const record = {
    at: importedAt,
    sourceFile: path.basename(sourceFile),
    inputSha256: sha256(sourceFile),
    books: Object.fromEntries(addedBooks.map((book) => {
      const stats = entryStats(book);
      return [book.id, {
        entries: stats.entries,
        chapters: stats.chapters,
        firstKey: book.entries[0]?.key || "",
        emptyOfficialText: stats.emptyOfficialText,
      }];
    })),
    fanKeyCoverage: "条目键与 story/data/storybook-data.js 一一对应（新增 0、缺失 0）",
    carriedFields: [...new Set(addedBooks.flatMap((book) => entryStats(book).carriedFields))],
    unverified: "交付件只带 officialTitle/officialText，没有 officialSource/officialStatus/officialScan/officialReview 等校对溯源字段，也没有原书扫描图；本轮不代填。",
    scope: "只并入官方层正文；C1-C3 与上一版逐字节一致。",
  };
  const supplement = addedBooks
    .flatMap((book) => book.entries.map((entry) => entry.supplementSource).filter(Boolean));
  if (supplement.length) record.supplementSource = [...new Set(supplement)].join("、");

  const merged = {
    books: incoming.data.books,
    officialVersion: {
      ...current.data.officialVersion,
      officialTextImports: [...(current.data.officialVersion?.officialTextImports || []), record],
    },
  };

  const payload = PREFIX + JSON.stringify(merged) + ";\n";
  const summary = [
    `交付件：${sourceFile}`,
    `输入 SHA-256：${record.inputSha256}`,
    `未改动的故事集：${unchangedBooks.join("、") || "（无）"}`,
    ...addedBooks.map((book) => {
      const stats = entryStats(book);
      return `并入 ${book.id}：${stats.entries} 条 / ${stats.chapters} 章，官方正文为空 ${stats.emptyOfficialText} 条`;
    }),
    `输出：${TARGET}`,
  ].join("\n");
  console.log(summary);

  if (args.dryRun) {
    console.log("\n--dry-run：没有写盘。");
    return;
  }

  const backup = `${TARGET}.backup.${Date.now()}`;
  fs.copyFileSync(TARGET, backup);
  fs.writeFileSync(TARGET, payload);
  console.log(`\n已备份旧文件：${backup}`);
  console.log(`已写入：${(Buffer.byteLength(payload) / 1024 / 1024).toFixed(2)} MiB`);
}

main();
