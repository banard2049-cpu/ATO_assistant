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
const cachePath = path.join(rootDir, "story", "entity-ai-safe-intros.json");
const auditPath = path.join(rootDir, "story", "entity-ai-safe-intros-audit.json");
const defaultCodexBin = path.join(os.homedir(), "AppData", "Local", "OpenAI", "Codex", "bin", "f1c7ee7a13db5fed", "codex.exe");

const args = parseArgs(process.argv.slice(2));
const codexBin = args.codexBin || process.env.CODEX_BIN || defaultCodexBin;
const batchEntities = Number(args.batchEntities || 10);
const concurrency = Number(args.concurrency || 6);
const limit = args.limit ? Number(args.limit) : 0;
const retries = Number(args.retries || 2);
const refreshAll = Boolean(args.refreshAll);
const applyOnly = Boolean(args.applyOnly);
const onlyIds = new Set(splitCsv(args.ids));

const spoilerWords = [
  "结局",
  "牺牲自己",
  "背叛了",
  "真相显露",
  "真实身份",
  "揭示为",
  "原来是",
  "后来成为",
  "会成为",
  "被证明是",
  "杀死了",
  "被杀死",
  "击败了",
  "不再是",
];

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

function compact(value, length) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length).replace(/[\s,，。；;:：、]+$/u, "")}...`;
}

function hashEntity(entity) {
  const data = JSON.stringify({
    id: entity.id,
    name: entity.name,
    englishName: entity.englishName,
    category: entity.category,
    aliases: entity.aliases || [],
    detail: entity.detail || entity.story || "",
    entryCount: entity.entryCount,
  });
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function buildDossier(entity) {
  return {
    id: entity.id,
    name: entity.name,
    englishName: entity.englishName,
    category: entity.category,
    aliases: (entity.aliases || []).slice(0, 10),
    currentIntro: compact(entity.intro || "", 220),
    detailedStory: compact(entity.detail || entity.story || "", 950),
  };
}

function makePrompt(batch) {
  return [
    "你是故事书词条编辑。请为每个词条写一个适合读者点击人名/地名时先看到的短简介。",
    "",
    "要求：",
    "1. 只输出 JSON 数组，不要代码块，不要解释。",
    "2. intro 必须是中文自然句，第一处必须写成“中文名（English Name）”。",
    "3. 简介要不剧透：只写身份、性质、所属势力、出场气质或读者认识它所需的基础信息。",
    "4. 不要写死亡、背叛、真实身份揭露、结局、最终选择、后期反转、任务结果、谁击败谁等信息。",
    "5. 不要出现“剧透”“非剧透”“不会剧透”“根据上下文”“此词条”等元话语。",
    "6. 人物写 50-95 个汉字；地点和派别写 55-110 个汉字。要具体，但保守。",
    "7. 不要把简称或泛称当成主名；沿用输入里的 name 和 englishName。",
    "",
    "输出格式：",
    "[{\"id\":\"...\",\"intro\":\"...\"}]",
    "",
    "输入：",
    JSON.stringify(batch.map((item) => item.dossier)),
  ].join("\n");
}

function runCodex(prompt, label) {
  if (!fsSync.existsSync(codexBin)) throw new Error(`找不到 Codex CLI: ${codexBin}`);
  const outPath = path.join(os.tmpdir(), `entity-safe-intro-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
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
    ], { stdio: ["pipe", "pipe", "pipe"] });

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

function normalizeIntro(row, item) {
  let intro = String(row?.intro || "").replace(/\s+/g, " ").trim();
  intro = intro.replace(/^(简介[:：]\s*)/u, "");
  intro = intro.replace(/[。；;，,]+$/u, "。");
  if (!intro.endsWith("。")) intro += "。";

  const entity = item.entity;
  const expectedPrefix = `${entity.name}（${entity.englishName}）`;
  const asciiPrefix = `${entity.name} (${entity.englishName})`;
  if (intro.startsWith(asciiPrefix)) intro = `${expectedPrefix}${intro.slice(asciiPrefix.length)}`;
  if (!intro.startsWith(expectedPrefix)) {
    intro = `${expectedPrefix}${intro.replace(new RegExp(`^${escapeRegExp(entity.name)}[（(][^)）]+[)）]`, "u"), "")}`;
  }
  intro = intro.replace(/\b非剧透\b|\b剧透\b|不会剧透|根据上下文|此词条/gu, "");
  intro = intro.replace(/\s+/g, " ").trim();
  if (!intro.endsWith("。")) intro += "。";
  return intro;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateIntro(intro, item) {
  const entity = item.entity;
  const expectedPrefix = `${entity.name}（${entity.englishName}）`;
  if (!intro.startsWith(expectedPrefix)) return `缺少中文名（英文名）开头: ${intro}`;
  if (intro.length < 35) return `简介过短: ${intro}`;
  if (intro.length > 150) return `简介过长: ${intro}`;
  const hit = spoilerWords.find((word) => intro.includes(word));
  if (hit) return `疑似剧透词 ${hit}: ${intro}`;
  return "";
}

function normalizeRows(parsed, batch) {
  const ids = new Set(batch.map((item) => item.entity.id));
  const rows = Array.isArray(parsed) ? parsed : parsed?.results || parsed?.items || [];
  const normalized = [];
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    if (!ids.has(id)) continue;
    const item = batch.find((candidate) => candidate.entity.id === id);
    const intro = normalizeIntro(row, item);
    const error = validateIntro(intro, item);
    if (error) throw new Error(error);
    normalized.push({ id, intro });
  }
  const got = new Set(normalized.map((row) => row.id));
  const missing = [...ids].filter((id) => !got.has(id));
  if (missing.length) throw new Error(`AI 输出缺少: ${missing.join(", ")}`);
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
        cache.intros[row.id] = {
          ...row,
          sourceHash: item.sourceHash,
          name: item.entity.name,
          englishName: item.entity.englishName,
          category: item.entity.category,
          entryCount: item.entity.entryCount,
          generatedAt: now,
        };
      }
      await saveCache(cache);
      console.log(`Intro OK: ${label}`);
      return;
    } catch (error) {
      console.warn(`Intro failed ${attempt}/${retries}: ${label}`);
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
      console.log(`Running intro batch ${batchIndex + 1}/${batches.length} [worker ${workerIndex}]: ${batch.map((item) => item.entity.id).join(", ")}`);
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

async function applyIntros(index, cache) {
  const applied = [];
  const pending = [];
  const warnings = [];
  for (const entity of index.entities || []) {
    const sourceHash = hashEntity(entity);
    const row = cache.intros?.[entity.id];
    if (!row || row.sourceHash !== sourceHash) {
      pending.push(entity.id);
      continue;
    }
    const warning = validateIntro(row.intro, { entity });
    if (warning) {
      warnings.push({ id: entity.id, warning });
      pending.push(entity.id);
      continue;
    }
    entity.intro = row.intro;
    entity.safeIntroGeneratedAt = row.generatedAt;
    applied.push(entity.id);
  }

  index.safeIntroGenerator = "tools/generate-story-entity-safe-intros.mjs";
  index.safeIntroGeneratedAt = new Date().toISOString();
  index.safeIntroCount = applied.length;
  index.pendingSafeIntroCount = pending.length;
  index.generatedAt = new Date().toISOString();

  await saveJsonAtomic(indexJsonPath, index);
  await fs.writeFile(indexJsPath, buildBrowserJs(index), "utf8");
  await fs.writeFile(indexCsvPath, `\uFEFF${buildCsv(index.entities)}\n`, "utf8");
  await saveJsonAtomic(auditPath, {
    generatedAt: new Date().toISOString(),
    generatedBy: "tools/generate-story-entity-safe-intros.mjs",
    appliedCount: applied.length,
    pendingCount: pending.length,
    pendingIds: pending,
    warnings,
  });
  console.log(`Applied safe intros ${applied.length}, pending ${pending.length}`);
}

async function main() {
  const index = await readJson(indexJsonPath);
  const cache = await readJson(cachePath, {
    generatedBy: "tools/generate-story-entity-safe-intros.mjs",
    intros: {},
  });
  cache.intros ||= {};

  const allItems = (index.entities || [])
    .filter((entity) => !onlyIds.size || onlyIds.has(entity.id))
    .map((entity) => ({
      entity,
      sourceHash: hashEntity(entity),
      dossier: buildDossier(entity),
    }));

  const pending = allItems.filter((item) => {
    const cached = cache.intros[item.entity.id];
    return refreshAll || !cached || cached.sourceHash !== item.sourceHash;
  });
  const selected = limit ? pending.slice(0, limit) : pending;

  console.log(`Entities ${allItems.length}, pending ${pending.length}, selected ${selected.length}`);
  if (!applyOnly && selected.length) {
    await runPool(makeBatches(selected), cache);
  }

  const freshIndex = await readJson(indexJsonPath);
  const freshCache = await readJson(cachePath, cache);
  await applyIntros(freshIndex, freshCache);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
