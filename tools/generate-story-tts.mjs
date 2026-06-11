import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(rootDir, "story", "data.js");
const defaultOutDir = path.join(rootDir, "story", "audio");

const defaults = {
  book: "c2",
  chapter: "",
  entry: "",
  outDir: defaultOutDir,
  configPath: "",
  dryRun: false,
  force: false,
  includeBattle: false,
  limit: 0,
  maxChars: 450,
  delayMs: 500,
  retries: 2,
  retryDelayMs: 15000,
  banRetryMs: 3600000,
  baseUrl: "https://api.xiaomimimo.com/v1",
  model: "mimo-v2.5-tts",
  voice: "mimo_default",
  audioFormat: "mp3",
  userMessage: "用沉稳、清晰、略带史诗感的中文旁白朗读。",
  timeout: 120000,
};

function usage() {
  return `
Usage:
  node tools/generate-story-tts.mjs --book c2 --config story-tts-engine-config.json
  $env:MIMO_API_KEY="sk-..."; node tools/generate-story-tts.mjs --book c2

Options:
  --book <id|all>       Story book id. Default: c2
  --chapter <key>       Limit to one chapterKey.
  --entry <key|id>      Limit to one entry key or paragraph id.
  --out <dir>           Output dir. Default: story/audio
  --config <json>       Browser-exported TTS config JSON.
  --api-key <key>       MIMO API key. Env MIMO_API_KEY is preferred.
  --voice <voice>       MIMO voice. Default: mimo_default
  --model <model>       MIMO model. Default: mimo-v2.5-tts
  --format <format>     Audio format. Default: mp3
  --max-chars <n>       Max chars per API request chunk. Default: 450
  --delay-ms <n>        Wait after each new API request. Default: 500
  --retries <n>         Retry rounds after all keys fail. Default: 2
  --retry-delay-ms <n>  Wait before a retry round. Default: 15000
  --ban-retry-ms <n>    Wait and retry same chunk after all keys fail. Default: 3600000
  --limit <n>           Generate first n matching entries.
  --include-battle      Include battle chapters. Default: skipped.
  --force               Regenerate existing audio files.
  --dry-run             Only print the plan; do not call MIMO or write audio.
`;
}

function parseArgs(argv) {
  const args = { ...defaults, apiKey: process.env.MIMO_API_KEY || process.env.STORY_TTS_API_KEY || "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";
    if (arg === "--help" || arg === "-h") {
      console.log(usage().trim());
      process.exit(0);
    } else if (arg === "--book") args.book = next();
    else if (arg === "--chapter") args.chapter = next();
    else if (arg === "--entry") args.entry = next();
    else if (arg === "--out") args.outDir = path.resolve(rootDir, next());
    else if (arg === "--config") args.configPath = path.resolve(rootDir, next());
    else if (arg === "--api-key") args.apiKey = next();
    else if (arg === "--voice") args.voice = next();
    else if (arg === "--model") args.model = next();
    else if (arg === "--format") args.audioFormat = next();
    else if (arg === "--prompt") args.userMessage = next();
    else if (arg === "--max-chars") args.maxChars = Number(next()) || defaults.maxChars;
    else if (arg === "--delay-ms") args.delayMs = Number(next()) || defaults.delayMs;
    else if (arg === "--retries") args.retries = Number(next());
    else if (arg === "--retry-delay-ms") args.retryDelayMs = Number(next()) || defaults.retryDelayMs;
    else if (arg === "--ban-retry-ms") args.banRetryMs = Number(next()) || defaults.banRetryMs;
    else if (arg === "--limit") args.limit = Number(next()) || 0;
    else if (arg === "--include-battle") args.includeBattle = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

async function loadConfig(args) {
  if (!args.configPath) return args;
  const raw = await fs.readFile(args.configPath, "utf8");
  const config = JSON.parse(raw);
  const cloud = config.cloud || config;
  return {
    ...args,
    baseUrl: cloud.baseUrl || args.baseUrl,
    apiKey: args.apiKey || cloud.apiKey || "",
    model: cloud.voiceCloneDataUrl && cloud.voiceCloneModel
      ? cloud.voiceCloneModel
      : (cloud.builtInModel || cloud.model || args.model),
    voice: cloud.voiceCloneDataUrl || cloud.voice || args.voice,
    audioFormat: cloud.audioFormat || args.audioFormat,
    userMessage: cloud.userMessage || args.userMessage,
    timeout: Number(cloud.timeout || args.timeout),
  };
}

async function loadStoryData() {
  const raw = await fs.readFile(dataPath, "utf8");
  const jsonText = raw
    .replace(/^\uFEFF?window\.STORYBOOK_DATA\s*=\s*/, "")
    .replace(/;\s*$/, "");
  return JSON.parse(jsonText);
}

function hasChinese(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function cleanSpeechText(text) {
  const withoutHtml = String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const cleanedLines = withoutHtml
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => hasChinese(line))
    .map((line) => line
      .replace(/\([^()\u3400-\u9fff]*[A-Za-z][^()\u3400-\u9fff]*\)/g, " ")
      .replace(/（[^（）\u3400-\u9fff]*[A-Za-z][^（）\u3400-\u9fff]*）/g, " ")
      .replace(/\[[^\[\]\u3400-\u9fff]*[A-Za-z][^\[\]\u3400-\u9fff]*\]/g, " ")
      .replace(/【[^【】\u3400-\u9fff]*[A-Za-z][^【】\u3400-\u9fff]*】/g, " ")
      .replace(/[A-Za-z][A-Za-z0-9'’._-]*/g, " ")
      .replace(/\s+/g, " ")
      .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2")
      .trim())
    .filter((line) => hasChinese(line));

  return cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitLongPart(part, maxChars) {
  if (part.length <= maxChars) return [part];
  const chunks = [];
  let rest = part;
  while (rest.length > maxChars) {
    const windowText = rest.slice(0, maxChars + 1);
    const breakAt = Math.max(
      windowText.lastIndexOf("。"),
      windowText.lastIndexOf("！"),
      windowText.lastIndexOf("？"),
      windowText.lastIndexOf("；"),
      windowText.lastIndexOf("，"),
      windowText.lastIndexOf("\n")
    );
    const cut = breakAt > Math.floor(maxChars * 0.45) ? breakAt + 1 : maxChars;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function createSpeechChunks(text, maxChars) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || !hasChinese(normalized)) return [];
  const sentenceParts = normalized.match(/[^。！？；]+[。！？；]?/g) || [normalized];
  const chunks = [];
  let current = "";
  for (const sentence of sentenceParts.flatMap((part) => splitLongPart(part.trim(), maxChars))) {
    if (!sentence || !hasChinese(sentence)) continue;
    const next = current ? `${current}${sentence}` : sentence;
    if (current && next.length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.flatMap((chunk) => splitLongPart(chunk, maxChars)).filter(hasChinese);
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function normalizeBaseUrl(url) {
  const trimmed = String(url || "").trim().replace(/\/+$/, "");
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function splitApiKeys(apiKey) {
  return String(apiKey || "")
    .split(/[\n,;]+/)
    .map((key) => key.trim())
    .filter(Boolean);
}

let keyCursor = 0;

function rotatedKeys(keys) {
  return keys.map((_, offset) => {
    const originalIndex = (keyCursor + offset) % keys.length;
    return {
      key: keys[originalIndex],
      label: originalIndex + 1,
      originalIndex,
    };
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function audioExtension(format) {
  return String(format || "mp3").replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp3";
}

function selectEntries(data, args) {
  const books = args.book === "all"
    ? data.books
    : data.books.filter((book) => book.id === args.book);
  if (!books.length) throw new Error(`No matching book: ${args.book}`);

  const entries = [];
  for (const book of books) {
    for (const entry of book.entries) {
      if (!args.includeBattle && entry.chapterKey === "battle") continue;
      if (args.chapter && entry.chapterKey !== args.chapter) continue;
      if (args.entry && entry.key !== args.entry && entry.id !== args.entry) continue;
      entries.push({ book, entry });
      if (args.limit && entries.length >= args.limit) return entries;
    }
  }
  return entries;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function requestMimoAudio(text, args) {
  const keys = splitApiKeys(args.apiKey);
  if (!keys.length) throw new Error("Missing MIMO API key. Set MIMO_API_KEY or pass --config/--api-key.");

  const endpoint = `${normalizeBaseUrl(args.baseUrl)}/chat/completions`;
  const audio = { format: args.audioFormat || "mp3" };
  if (args.voice) audio.voice = args.voice;
  const payload = {
    model: args.model,
    messages: [
      ...(args.userMessage ? [{ role: "user", content: args.userMessage }] : []),
      { role: "assistant", content: text },
    ],
    audio,
  };

  const errors = [];
  const retryRounds = Math.max(0, Number(args.retries || 0));
  for (let attempt = 0; attempt <= retryRounds; attempt += 1) {
    if (attempt > 0) {
      console.log(`Retry round ${attempt}/${retryRounds}; waiting ${args.retryDelayMs} ms`);
      await sleep(Number(args.retryDelayMs || defaults.retryDelayMs));
    }

    for (const item of rotatedKeys(keys)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Number(args.timeout || 120000));
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": item.key,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) {
          errors.push(`Attempt ${attempt + 1} key ${item.label}: HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
          continue;
        }
        const data = await response.json();
        const audioBase64 = data?.choices?.[0]?.message?.audio?.data;
        if (!audioBase64) throw new Error("MIMO response did not include choices[0].message.audio.data");
        keyCursor = (item.originalIndex + 1) % keys.length;
        return Buffer.from(audioBase64, "base64");
      } catch (error) {
        errors.push(`Attempt ${attempt + 1} key ${item.label}: ${error.name === "AbortError" ? "timeout" : String(error.message || error)}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw new Error(errors.join(" | "));
}

async function requestMimoAudioWithBanWait(text, args, label) {
  while (true) {
    try {
      return await requestMimoAudio(text, args);
    } catch (error) {
      const waitMs = Math.max(60000, Number(args.banRetryMs || defaults.banRetryMs));
      const message = String(error.message || error);
      console.error(`All keys failed for ${label}: ${message}`);
      console.log(`All keys failed for ${label}; waiting ${waitMs} ms before retrying same chunk.`);
      await sleep(waitMs);
    }
  }
}

async function readManifest(outDir) {
  const manifestPath = path.join(outDir, "manifest.json");
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    return {
      generatedAt: "",
      generator: "tools/generate-story-tts.mjs",
      version: 1,
      entries: {},
    };
  }
}

async function writeManifest(outDir, manifest) {
  manifest.generatedAt = new Date().toISOString();
  const manifestPath = path.join(outDir, "manifest.json");
  const manifestScriptPath = path.join(outDir, "manifest.js");
  const manifestJson = JSON.stringify(manifest, null, 2);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(manifestPath, `${manifestJson}\n`, "utf8");
  await fs.writeFile(manifestScriptPath, `window.STORY_AUDIO_MANIFEST = ${manifestJson};\n`, "utf8");
}

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  const args = await loadConfig(parsedArgs);
  const data = await loadStoryData();
  const selected = selectEntries(data, args);
  const ext = audioExtension(args.audioFormat);
  const plan = [];
  const skippedNoChinese = [];

  for (const { book, entry } of selected) {
    const cleanText = cleanSpeechText(entry.text);
    const chunks = createSpeechChunks(cleanText, args.maxChars);
    if (!chunks.length) {
      skippedNoChinese.push({ book, entry });
      continue;
    }
    plan.push({ book, entry, cleanText, chunks });
  }

  const chunkCount = plan.reduce((sum, item) => sum + item.chunks.length, 0);
  console.log(`Selected entries: ${selected.length}`);
  console.log(`Will generate: ${plan.length} entries / ${chunkCount} audio chunks`);
  console.log(`Skipped no-Chinese/English-only: ${skippedNoChinese.length}`);
  console.log(`Output: ${path.relative(rootDir, args.outDir).replace(/\\/g, "/")}`);
  console.log(`MIMO: ${args.model} / ${args.voice || "(dynamic voice)"} / ${ext}`);

  if (args.dryRun) {
    for (const item of plan.slice(0, 20)) {
      console.log(`[dry-run] ${item.book.id} ${item.entry.key} ${item.entry.id}: ${item.chunks.length} chunks`);
    }
    if (plan.length > 20) console.log(`[dry-run] ... ${plan.length - 20} more entries`);
    for (const item of skippedNoChinese.slice(0, 20)) {
      console.log(`[skip] ${item.book.id} ${item.entry.key} ${item.entry.id}: no Chinese after cleanup`);
    }
    if (skippedNoChinese.length > 20) console.log(`[skip] ... ${skippedNoChinese.length - 20} more entries`);
    return;
  }

  const manifest = await readManifest(args.outDir);
  manifest.config = {
    baseUrl: normalizeBaseUrl(args.baseUrl),
    model: args.model,
    voice: args.voice ? "configured" : "",
    audioFormat: ext,
    skipEnglish: true,
    maxChars: args.maxChars,
  };

  let written = 0;
  let reused = 0;
  for (let entryIndex = 0; entryIndex < plan.length; entryIndex += 1) {
    const { book, entry, cleanText, chunks } = plan[entryIndex];
    const entryDir = path.join(args.outDir, entry.key);
    await fs.mkdir(entryDir, { recursive: true });
    const manifestChunks = [];
    console.log(`[${entryIndex + 1}/${plan.length}] ${book.id} ${entry.key} ${entry.id} -> ${chunks.length} chunks`);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      const fileName = `${String(chunkIndex + 1).padStart(3, "0")}.${ext}`;
      const filePath = path.join(entryDir, fileName);
      const relPath = `${entry.key}/${fileName}`;
      const exists = await fileExists(filePath);
      if (exists && !args.force) {
        reused += 1;
      } else {
        const chunkLabel = `${entry.key}/${fileName}`;
        const bytes = await requestMimoAudioWithBanWait(chunk, args, chunkLabel);
        await fs.writeFile(filePath, bytes);
        written += 1;
        if (Number(args.delayMs || 0) > 0) {
          await sleep(Number(args.delayMs));
        }
      }
      const stats = await fs.stat(filePath);
      manifestChunks.push({
        index: chunkIndex + 1,
        path: relPath,
        chars: chunk.length,
        hash: sha1(chunk),
        bytes: stats.size,
      });
    }

    manifest.entries[entry.key] = {
      bookId: book.id,
      entryKey: entry.key,
      id: entry.id,
      title: entry.title,
      chapterKey: entry.chapterKey,
      encounterKey: entry.encounterKey || "",
      textHash: sha1(cleanText),
      chunks: manifestChunks,
    };
    await writeManifest(args.outDir, manifest);
  }

  console.log(`Done. Wrote ${written} chunks, reused ${reused} existing chunks.`);
  console.log(`Manifest: ${path.relative(rootDir, path.join(args.outDir, "manifest.json")).replace(/\\/g, "/")}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
