import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexJsonPath = path.join(rootDir, "story", "data", "entity-index.json");
const indexJsPath = path.join(rootDir, "story", "data", "entity-index.js");
const indexCsvPath = path.join(rootDir, "story", "data", "entity-index.csv");
const cachePath = path.join(rootDir, "story", "entity-ai-fast-details.json");
const auditPath = path.join(rootDir, "story", "entity-ai-fast-audit.json");
const defaultCodexBin = path.join(os.homedir(), "AppData", "Local", "OpenAI", "Codex", "bin", "f1c7ee7a13db5fed", "codex.exe");

const args = parseArgs(process.argv.slice(2));
const codexBin = args.codexBin || process.env.CODEX_BIN || defaultCodexBin;
const batchEntities = Number(args.batchEntities || 8);
const concurrency = Number(args.concurrency || 6);
const limit = args.limit ? Number(args.limit) : 0;
const retries = Number(args.retries || 2);
const refreshAll = Boolean(args.refreshAll);
const applyOnly = Boolean(args.applyOnly);
const dryRun = Boolean(args.dryRun);
const onlyIds = new Set(splitCsv(args.ids));

const validCategories = new Set(["人物", "地点", "派别"]);
const hardSkipIds = new Set(["argo", "argonauts", "titans"]);

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
      text: entry.text,
    })),
  });
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function compact(value, length) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length).replace(/[\s,，。；;:：、]+$/u, "")}...`;
}

function ref(entry) {
  return `${String(entry.book || "").toUpperCase()} ${entry.id || entry.key || ""}`.trim();
}

function scoreEntry(entry) {
  const text = `${entry.title || ""} ${entry.chapter || ""} ${entry.snippet || entry.text || ""}`;
  let score = 0;
  if (/[“”"]/.test(text)) score += 2;
  if (/说|问|回答|请求|命令|率领|背叛|杀|死|战斗|统治|献祭|逃|加入|离开|发现|揭示|真相|神庙|城市|岛|王国|军队|信徒|追随者|联盟|帝国|保护国/u.test(text)) score += 4;
  if (/获得|失去|检查|外交|指示物|命运|阶段|返回|标记|归档|卡牌|资源/u.test(text)) score -= 1;
  return score;
}

function pickContexts(entity) {
  const entries = entity.entries || [];
  if (!entries.length) return [];
  const maxPerEntity = entity.entryCount > 80 ? 12 : entity.entryCount > 35 ? 10 : entity.entryCount > 12 ? 8 : 6;
  const anchors = [
    entries[0],
    entries[Math.floor((entries.length - 1) * 0.25)],
    entries[Math.floor((entries.length - 1) * 0.5)],
    entries[Math.floor((entries.length - 1) * 0.75)],
    entries[entries.length - 1],
  ].filter(Boolean);
  const ranked = [...entries].sort((a, b) => scoreEntry(b) - scoreEntry(a)).slice(0, maxPerEntity * 2);
  const seen = new Set();
  return [...anchors, ...ranked].filter((entry) => {
    const key = entry.key || `${entry.book}:${entry.id}:${entry.order}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxPerEntity);
}

function buildDossier(entity) {
  const summary = String(entity.detail || entity.story || entity.intro || "");
  const existingSummary = /^【定位】|词条|全部相关内容共有|代表段落/.test(summary)
    ? compact(entity.intro || "", 360)
    : compact(summary, 700);
  return {
    id: entity.id,
    currentName: entity.name,
    currentEnglishName: entity.englishName,
    currentCategory: entity.category,
    entryCount: entity.entryCount,
    firstSeen: entity.firstSeen,
    aliases: entity.aliases || [],
    existingSummary,
    contexts: pickContexts(entity).map((entry) => ({
      ref: ref(entry),
      title: compact(entry.title || "", 80),
      chapter: compact(entry.chapter || "", 120),
      text: compact(entry.snippet || entry.text || "", 520),
    })),
  };
}

function makePrompt(batch) {
  return [
    "你是故事书人物/地点/派别词条编辑。请根据输入的上下文，先判断每个词条是否应该保留，再给保留词条写详细介绍。",
    "",
    "保留条件：",
    "1. 只保留真实的人物、神明、怪物、重要地点、城市、建筑、区域、组织、派别、族群、军队、宗教团体或政治势力。",
    "2. 如果是规则状态、资源、卡牌、装备、抽象概念、普通称谓、职业、动作、事件名、章节名、误抓短语、过短且无独立故事作用的词，decision 必须是 skip。",
    "3. 如果当前分类错了，请改成 人物、地点、派别 三者之一；不能归入这三类就 skip。",
    "4. 低频词条只有在上下文明显把它当作具体人物/地点/派别时才保留。",
    "5. 不要保留阿尔戈英雄、阿尔戈号、泰坦这三个总称本身；但具体人物、具体地点或具体组织可以保留。",
    "",
    "详细介绍要求：",
    "1. 主要依据输入上下文；existingSummary 只能作为名称线索，不要相信其中的旧分类或模板判断。",
    "2. 用中文自然段，不要列表，不要【定位】这类模板标题，不要说“根据上下文/此词条/非剧透/剧透”。",
    "3. 第一处必须写成“中文名（English Name）”。如果没有英文名，用输入里的 currentEnglishName。",
    "4. 人物写身份、立场、经历、关键关系、故事作用；地点写性质、功能、发生事件、相关势力；派别写组织性质、主张、行动、关系和影响。",
    "5. 高频或重要词条写 450-750 字；中低频但有效词条写 260-520 字。要具体，不要空话。",
    "",
    "只输出 JSON 数组，不要代码块，不要解释。格式：",
    "[",
    "  {\"id\":\"...\",\"decision\":\"keep\",\"category\":\"人物|地点|派别\",\"name\":\"中文名\",\"englishName\":\"English Name\",\"aliases\":[\"别名\"],\"detail\":\"详细介绍文本\"},",
    "  {\"id\":\"...\",\"decision\":\"skip\",\"reason\":\"为什么不是人物/地点/派别\"}",
    "]",
    "",
    "输入：",
    JSON.stringify(batch.map((item) => item.dossier)),
  ].join("\n");
}

function runCodex(prompt, label) {
  if (!fsSync.existsSync(codexBin)) throw new Error(`找不到 Codex CLI: ${codexBin}`);
  const outPath = path.join(os.tmpdir(), `entity-fast-ai-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  return new Promise((resolve, reject) => {
    const child = spawn(codexBin, [
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
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      let raw = stdout;
      try {
        if (fsSync.existsSync(outPath)) raw = fsSync.readFileSync(outPath, "utf8");
      } catch {}
      try {
        fsSync.unlinkSync(outPath);
      } catch {}
      if (code !== 0) {
        reject(new Error(`Codex batch failed (${label}): ${stderr || stdout}`));
      } else {
        resolve(raw);
      }
    });
    child.stdin.end(Buffer.from(prompt, "utf8"));
  });
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
  throw new Error(`无法解析 AI 输出: ${text.slice(0, 500)}`);
}

function normalizeRows(parsed, batch) {
  const ids = new Set(batch.map((item) => item.entity.id));
  const rows = Array.isArray(parsed) ? parsed : parsed?.results || parsed?.items || [];
  const normalized = [];
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    if (!ids.has(id)) continue;
    const decision = String(row?.decision || "").trim().toLowerCase();
    if (decision === "skip") {
      normalized.push({
        id,
        decision: "skip",
        reason: compact(row?.reason || "AI 判断不是人物、地点或派别", 220),
      });
      continue;
    }
    const category = String(row?.category || "").trim();
    const detail = String(row?.detail || "").replace(/\r\n/g, "\n").trim();
    const name = String(row?.name || "").trim();
    const englishName = String(row?.englishName || "").trim();
    if (decision === "keep" && validCategories.has(category) && name && englishName && detail.length >= 120) {
      normalized.push({
        id,
        decision: "keep",
        category,
        name,
        englishName,
        aliases: Array.isArray(row?.aliases) ? row.aliases.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [],
        detail,
      });
    }
  }
  const got = new Set(normalized.map((row) => row.id));
  const missing = [...ids].filter((id) => !got.has(id));
  if (missing.length) throw new Error(`AI 输出缺少或无效: ${missing.join(", ")}`);
  return normalized;
}

async function saveJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function saveCache(cache) {
  cache.updatedAt = new Date().toISOString();
  await saveJsonAtomic(cachePath, cache);
}

function makeBatches(items) {
  const batches = [];
  for (let index = 0; index < items.length; index += batchEntities) {
    batches.push(items.slice(index, index + batchEntities));
  }
  return batches;
}

async function generateBatch(batch, cache) {
  const label = batch.map((item) => item.entity.id).join(",");
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const raw = await runCodex(makePrompt(batch), label);
      const rows = normalizeRows(parseJson(raw), batch);
      const now = new Date().toISOString();
      for (const row of rows) {
        const item = batch.find((candidate) => candidate.entity.id === row.id);
        cache.decisions[row.id] = {
          ...row,
          sourceHash: item.sourceHash,
          originalName: item.entity.name,
          originalEnglishName: item.entity.englishName,
          originalCategory: item.entity.category,
          entryCount: item.entity.entryCount,
          generatedAt: now,
        };
      }
      await saveCache(cache);
      const kept = rows.filter((row) => row.decision === "keep").length;
      const skipped = rows.length - kept;
      console.log(`AI OK: ${label} (keep ${kept}, skip ${skipped})`);
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

async function runPool(batches, cache) {
  let next = 0;
  let done = 0;
  async function worker(workerIndex) {
    while (next < batches.length) {
      const batchIndex = next;
      next += 1;
      const batch = batches[batchIndex];
      console.log(`Running batch ${batchIndex + 1}/${batches.length} [worker ${workerIndex}]: ${batch.map((item) => item.entity.id).join(", ")}`);
      await generateBatch(batch, cache);
      done += 1;
      console.log(`Progress ${done}/${batches.length}`);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, batches.length) }, (_, index) => worker(index + 1));
  await Promise.all(workers);
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

async function applyDecisions(index, cache) {
  const skipped = [];
  const pending = [];
  const kept = [];
  for (const entity of index.entities || []) {
    const decision = cache.decisions?.[entity.id];
    const sourceHash = hashEntity(entity);
    if (!decision || decision.sourceHash !== sourceHash) {
      pending.push(entity.id);
      kept.push(entity);
      continue;
    }
    if (decision.decision !== "keep") {
      skipped.push({
        id: entity.id,
        name: entity.name,
        englishName: entity.englishName,
        category: entity.category,
        entryCount: entity.entryCount,
        reason: decision.reason || "",
      });
      continue;
    }
    entity.name = decision.name;
    entity.englishName = decision.englishName;
    entity.category = decision.category;
    entity.detail = decision.detail;
    entity.story = decision.detail;
    entity.aiDetailGeneratedAt = decision.generatedAt;
    const aliases = new Set([...(entity.aliases || []), decision.name, decision.englishName, ...(decision.aliases || [])].filter(Boolean));
    entity.aliases = [...aliases];
    entity.zhAliases = [...new Set([...(entity.zhAliases || []), decision.name, ...(decision.aliases || []).filter((alias) => /[\u4e00-\u9fff]/u.test(alias))])];
    entity.enAliases = [...new Set([...(entity.enAliases || []), decision.englishName, ...(decision.aliases || []).filter((alias) => !/[\u4e00-\u9fff]/u.test(alias))])];
    kept.push(entity);
  }

  index.entities = kept;
  index.entityCount = kept.length;
  index.categoryCounts = kept.reduce((counts, entity) => {
    counts[entity.category] = (counts[entity.category] || 0) + 1;
    return counts;
  }, {});
  index.generatedAt = new Date().toISOString();
  index.aiDetailGenerator = "tools/generate-story-entity-fast-ai-details.mjs";
  index.aiDetailCount = kept.filter((entity) => entity.detail || entity.story).length;
  index.skippedEntityCount = skipped.length;
  index.pendingAiDetailCount = pending.length;

  await saveJsonAtomic(indexJsonPath, index);
  await fs.writeFile(indexJsPath, buildBrowserJs(index), "utf8");
  const csvPath = await writeCsv(buildCsv(index.entities));
  await saveJsonAtomic(auditPath, {
    generatedAt: new Date().toISOString(),
    generatedBy: "tools/generate-story-entity-fast-ai-details.mjs",
    kept: kept.length,
    skipped: skipped.length,
    pending: pending.length,
    skippedEntities: skipped,
    pendingIds: pending,
  });
  console.log(`Applied keep ${kept.length}, skipped ${skipped.length}, pending ${pending.length}`);
  console.log(`Wrote ${path.relative(rootDir, indexJsonPath)}`);
  console.log(`Wrote ${path.relative(rootDir, indexJsPath)}`);
  console.log(`Wrote ${path.relative(rootDir, csvPath)}`);
  console.log(`Wrote ${path.relative(rootDir, auditPath)}`);
}

async function main() {
  const index = await readJson(indexJsonPath);
  const cache = await readJson(cachePath, {
    generatedBy: "tools/generate-story-entity-fast-ai-details.mjs",
    decisions: {},
  });
  cache.decisions ||= {};

  if (!applyOnly) {
    let items = (index.entities || []).map((entity) => ({
      entity,
      sourceHash: hashEntity(entity),
      dossier: buildDossier(entity),
    })).filter((item) => !hardSkipIds.has(item.entity.id));
    if (onlyIds.size) items = items.filter((item) => onlyIds.has(item.entity.id));
    items = items.filter((item) => {
      if (refreshAll) return true;
      const cached = cache.decisions[item.entity.id];
      return !cached || cached.sourceHash !== item.sourceHash || (cached.decision === "keep" && !cached.detail);
    });
    if (limit > 0) items = items.slice(0, limit);
    const batches = makeBatches(items);
    console.log(`Need AI checks/details: ${items.length}`);
    console.log(`Batches: ${batches.length}, batchEntities=${batchEntities}, concurrency=${concurrency}`);
    if (dryRun) {
      batches.slice(0, 30).forEach((batch, index) => console.log(`#${index + 1}: ${batch.map((item) => item.entity.id).join(", ")}`));
      return;
    }
    await runPool(batches, cache);
  }

  const freshIndex = await readJson(indexJsonPath);
  const freshCache = await readJson(cachePath, cache);
  await applyDecisions(freshIndex, freshCache);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
