import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexJsonPath = path.join(rootDir, "story", "data", "entity-index.json");
const indexJsPath = path.join(rootDir, "story", "data", "entity-index.js");
const indexCsvPath = path.join(rootDir, "story", "data", "entity-index.csv");
const aiCachePath = path.join(rootDir, "story", "data", "entity-ai-details.json");
const defaultCodexBin = path.join(os.homedir(), "AppData", "Local", "OpenAI", "Codex", "bin", "f1c7ee7a13db5fed", "codex.exe");

const args = parseArgs(process.argv.slice(2));
const codexBin = args.codexBin || process.env.CODEX_BIN || defaultCodexBin;
const maxContextChars = Number(args.maxContextChars || 75000);
const maxEntitiesPerBatch = Number(args.batchEntities || 8);
const retries = Number(args.retries || 2);
const limit = args.limit ? Number(args.limit) : 0;
const onlyIds = new Set(splitCsv(args.ids));
const refreshAll = Boolean(args.refreshAll);
const applyOnly = Boolean(args.applyOnly);
const dryRun = Boolean(args.dryRun);

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
    const text = await fs.readFile(filePath, "utf8");
    if (!text.trim() && fallback !== null) return fallback;
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

function hashEntity(entity) {
  const data = JSON.stringify({
    id: entity.id,
    name: entity.name,
    englishName: entity.englishName,
    category: entity.category,
    entryCount: entity.entryCount,
    entries: (entity.entries || []).map((entry) => ({
      book: entry.book,
      id: entry.id,
      title: entry.title,
      chapter: entry.chapter,
      snippet: entry.snippet,
    })),
  });
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function compact(value, length) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length).replace(/[，。；：、\s]+$/u, "")}...`;
}

function ref(entry) {
  return `${String(entry.book || "").toUpperCase()} ${entry.id || entry.key || ""}`.trim();
}

function pickContexts(entity) {
  const entries = entity.entries || [];
  const maxPerEntity = entity.entryCount > 80 ? 28 : entity.entryCount > 35 ? 22 : entity.entryCount > 12 ? 16 : 12;
  const important = entries.filter((entry) => /死|杀|背叛|真相|发现|请求|加入|离开|统治|战争|神庙|宝库|建造|摧毁|外交|选择|获得|失去|承认|揭示/u.test(entry.snippet || ""));
  const anchors = [
    entries[0],
    entries[Math.floor((entries.length - 1) * 0.25)],
    entries[Math.floor((entries.length - 1) * 0.5)],
    entries[Math.floor((entries.length - 1) * 0.75)],
    entries[entries.length - 1],
    ...important.slice(0, maxPerEntity),
  ].filter(Boolean);
  const seen = new Set();
  return anchors.filter((entry) => {
    const key = entry.key || `${entry.book}:${entry.id}:${entry.order}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxPerEntity);
}

function dossier(entity) {
  return {
    id: entity.id,
    name: entity.name,
    englishName: entity.englishName,
    category: entity.category,
    firstSeen: entity.firstSeen,
    entryCount: entity.entryCount,
    aliases: entity.aliases || [],
    chapters: [...new Set((entity.entries || []).map((entry) => entry.chapter).filter(Boolean))].slice(0, 10),
    currentSummary: compact(entity.detail || entity.story || entity.intro || "", 800),
    contexts: pickContexts(entity).map((entry) => ({
      ref: ref(entry),
      title: entry.title || "",
      chapter: entry.chapter || "",
      snippet: compact(entry.snippet || "", 420),
    })),
  };
}

function makePrompt(batch) {
  const input = batch.map((item) => item.dossier);
  return [
    "你是故事书实体小传作者。请阅读每个词条的上下文，为每个词条写“故事介绍”。",
    "",
    "要求：",
    "1. 只依据给出的上下文和当前摘要，不要编造。",
    "2. 输出中文自然段，不要列表，不要模板腔。",
    "3. 首次出现必须使用“中文名（英文名）”。",
    "4. 不要写“根据上下文”“相关文本显示”“此词条”“非剧透/剧透”等说明。",
    "5. 人物写身份、立场、经历、关键关系、在故事中的作用；地点写性质、功能、发生的事件、相关势力；派别写组织性质、主张、行动、关系和影响。",
    "6. 高频词条 260-480 字，中等词条 180-320 字，低频词条 120-220 字。",
    "7. 必须返回每个输入 id。",
    "",
    "只输出 JSON 数组，不要代码块，不要解释。格式：",
    "[{\"id\":\"...\",\"detail\":\"...\"}]",
    "",
    "输入：",
    JSON.stringify(input),
  ].join("\n");
}

function estimate(item) {
  return JSON.stringify(item.dossier).length;
}

function makeBatches(items) {
  const batches = [];
  let current = [];
  let chars = 0;
  for (const item of items) {
    const size = estimate(item);
    if (current.length && (current.length >= maxEntitiesPerBatch || chars + size > maxContextChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

function runCodex(prompt, label) {
  if (!fsSync.existsSync(codexBin)) throw new Error(`找不到 Codex CLI：${codexBin}`);
  const outPath = path.join(os.tmpdir(), `entity-ai-${process.pid}-${Date.now()}.json`);
  const result = spawnSync(codexBin, [
    "exec",
    "--cd",
    rootDir,
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--ignore-rules",
    "-c",
    "approval_policy=\"never\"",
    "--output-last-message",
    outPath,
    "-",
  ], {
    input: Buffer.from(prompt, "utf8"),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  });
  const raw = fsSync.existsSync(outPath) ? fsSync.readFileSync(outPath, "utf8") : result.stdout;
  try {
    fsSync.unlinkSync(outPath);
  } catch {}
  if (result.status !== 0) throw new Error(`Codex batch ${label} failed: ${result.stderr || result.stdout}`);
  return raw;
}

function parseJson(raw) {
  const text = String(raw || "").trim();
  try {
    return JSON.parse(text);
  } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    try {
      return JSON.parse(fenced);
    } catch {}
  }
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error(`无法解析 AI 输出：${text.slice(0, 500)}`);
}

function normalizeRows(parsed, ids) {
  const rows = Array.isArray(parsed) ? parsed : parsed?.results || parsed?.items || [];
  const map = new Map();
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    const detail = String(row?.detail || "").replace(/\r\n/g, "\n").trim();
    if (id && detail) map.set(id, detail);
  }
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) throw new Error(`AI 输出缺少：${missing.join(", ")}`);
  return map;
}

async function saveCache(cache) {
  const tmpPath = `${aiCachePath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, aiCachePath);
}

async function generateBatch(batch, cache) {
  const ids = batch.map((item) => item.entity.id);
  const label = ids.join(",");
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const raw = runCodex(makePrompt(batch), label);
      const rows = normalizeRows(parseJson(raw), ids);
      const now = new Date().toISOString();
      for (const item of batch) {
        cache.details[item.entity.id] = {
          id: item.entity.id,
          name: item.entity.name,
          englishName: item.entity.englishName,
          category: item.entity.category,
          sourceHash: item.sourceHash,
          generatedAt: now,
          detail: rows.get(item.entity.id),
        };
      }
      await saveCache(cache);
      console.log(`AI OK: ${label}`);
      return;
    } catch (error) {
      console.warn(`AI failed ${attempt}/${retries}: ${label}`);
      console.warn(error.message);
      if (attempt === retries && batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        await generateBatch(batch.slice(0, mid), cache);
        await generateBatch(batch.slice(mid), cache);
        return;
      }
      if (attempt === retries) throw error;
    }
  }
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

function buildBrowserJs(payload) {
  const json = JSON.stringify(payload, null, 2)
    .replace(/</g, "\\u003C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `(function () {\n  window.STORY_ENTITY_INDEX = ${json};\n})();\n`;
}

async function writeCsv(csv) {
  try {
    await fs.writeFile(indexCsvPath, `\uFEFF${csv}\n`, "utf8");
    return indexCsvPath;
  } catch (error) {
    if (error?.code !== "EBUSY" && error?.code !== "EPERM") throw error;
    const fallback = path.join(rootDir, "story", "data", `entity-index.${Date.now()}.csv`);
    await fs.writeFile(fallback, `\uFEFF${csv}\n`, "utf8");
    return fallback;
  }
}

async function applyDetails(index, cache) {
  let applied = 0;
  for (const entity of index.entities) {
    const sourceHash = hashEntity(entity);
    const cached = cache.details?.[entity.id];
    if (!cached || cached.sourceHash !== sourceHash || !cached.detail) continue;
    entity.detail = cached.detail;
    entity.story = cached.detail;
    entity.aiDetailGeneratedAt = cached.generatedAt;
    applied += 1;
  }
  index.generatedAt = new Date().toISOString();
  index.aiDetailGenerator = "tools/generate-story-entity-ai-details.mjs";
  index.aiDetailCount = applied;
  await fs.writeFile(indexJsonPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await fs.writeFile(indexJsPath, buildBrowserJs(index), "utf8");
  const csvPath = await writeCsv(buildCsv(index.entities));
  console.log(`Applied ${applied}/${index.entities.length} AI details`);
  console.log(`Wrote ${path.relative(rootDir, indexJsonPath)}`);
  console.log(`Wrote ${path.relative(rootDir, indexJsPath)}`);
  console.log(`Wrote ${path.relative(rootDir, csvPath)}`);
}

async function main() {
  const index = await readJson(indexJsonPath);
  const cache = await readJson(aiCachePath, { generatedBy: "tools/generate-story-entity-ai-details.mjs", details: {} });
  cache.details ||= {};
  for (const entity of index.entities) {
    if (!entity.aiDetailGeneratedAt || !entity.detail) continue;
    cache.details[entity.id] ||= {
      id: entity.id,
      name: entity.name,
      englishName: entity.englishName,
      category: entity.category,
      sourceHash: hashEntity(entity),
      generatedAt: entity.aiDetailGeneratedAt,
      detail: entity.detail,
    };
  }
  await saveCache(cache);

  if (!applyOnly) {
    let items = index.entities.map((entity) => ({
      entity,
      sourceHash: hashEntity(entity),
      dossier: dossier(entity),
    }));
    if (onlyIds.size) items = items.filter((item) => onlyIds.has(item.entity.id));
    items = items.filter((item) => {
      if (refreshAll) return true;
      const cached = cache.details[item.entity.id];
      return !cached || cached.sourceHash !== item.sourceHash || !cached.detail;
    });
    if (limit > 0) items = items.slice(0, limit);
    console.log(`Need AI details: ${items.length}`);
    const batches = makeBatches(items);
    console.log(`Batches: ${batches.length}`);
    if (dryRun) {
      batches.slice(0, 20).forEach((batch, index) => console.log(`#${index + 1}: ${batch.map((item) => item.entity.id).join(", ")}`));
      return;
    }
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      console.log(`Running batch ${index + 1}/${batches.length}: ${batch.map((item) => item.entity.id).join(", ")}`);
      await generateBatch(batch, cache);
    }
  }

  await applyDetails(index, cache);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
