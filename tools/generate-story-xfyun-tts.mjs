import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultDataPath = path.join(rootDir, "story", "data", "storybook-official-data.js");
// 官方条目自身没有 chapterKey，和 App 一样用民间数据按 entry.key 反查章节归属。
const defaultFanDataPath = path.join(rootDir, "story", "data", "storybook-data.js");
// App 里 buildVersionData 对少量官方独有段落手工指定章节。
const OFFICIAL_ONLY_CHAPTERS = {
  "c1-7-official-0002": "hub-05-uneasy-rests-the-head",
  "c2-3-official-0038": "hub-02-the-other-thermopylae",
  "c3-7-official-0027": "hub-05-cant-go-back",
};
const defaultOutDir = path.join(rootDir, "story", "audio-packs", "audio-lingbosong");
const defaultConfigPath = path.join(rootDir, "tools", "xfyun-long-tts.config.json");
const exampleConfigPath = path.join(rootDir, "tools", "xfyun-long-tts.config.example.json");

// 引擎差异：
//   online = 在线语音合成（流式版）wss://tts-api.xfyun.cn/v2/tts，单次 <8000 字节
//   long   = 长文本语音合成       https://api-dx.xf-yun.com/v1/private/dts_create
const ENGINES = {
  online: {
    host: "tts-api.xfyun.cn",
    scheme: "wss",
    path: "/v2/tts",
    // WebSocket 握手是 GET，签名里的请求行必须一致，否则鉴权失败。
    method: "GET",
    // 单次调用文本需小于 8000 字节（约 2000 汉字），留出余量。
    maxBytes: 6000,
  },
  long: {
    host: "api-dx.xf-yun.com",
    scheme: "https",
    path: "/v1/private/dts_create",
    method: "POST",
    maxBytes: 0,
  },
};

const defaults = {
  engine: "",
  book: "all",
  chapter: "",
  entry: "",
  outDir: defaultOutDir,
  dataPath: defaultDataPath,
  fanDataPath: defaultFanDataPath,
  configPath: defaultConfigPath,
  dryRun: false,
  doctor: false,
  rebuildManifest: false,
  force: false,
  noSplit: false,
  includeBattle: false,
  limit: 0,
  maxChars: 2000,
  delayMs: 400,
  pollIntervalMs: 2000,
  pollTimeoutMs: 180000,
  concurrency: 1,
  retries: 2,
  retryDelayMs: 4000,
  host: "",
  vcn: "x4_lingbosong_bad_talk",
  voiceLabel: "聆伯松-反派老人",
  language: "zh",
  speed: 50,
  volume: 50,
  pitch: 50,
  encoding: "lame",
  sampleRate: 16000,
  appId: process.env.XFYUN_APP_ID || "",
  apiKey: process.env.XFYUN_API_KEY || "",
  apiSecret: process.env.XFYUN_API_SECRET || "",
};

function usage() {
  return `
Usage:
  node tools/generate-story-xfyun-tts.mjs
  node tools/generate-story-xfyun-tts.mjs --engine online --entry c1-15-0
  node tools/generate-story-xfyun-tts.mjs --doctor
  copy tools\\xfyun-long-tts.config.example.json tools\\xfyun-long-tts.config.json
  # then fill appId / apiKey / apiSecret

Reads official story text from story/data/storybook-official-data.js and writes
MP3 chunks (one file per ≤limit segment) plus manifest.json / manifest.js.

Engines (--engine):
  online  在线语音合成（流式版）wss://tts-api.xfyun.cn/v2/tts   [默认]
          单次文本需 <8000 字节（约 2000 汉字），脚本自动按字节切分。
  long    长文本语音合成 https://api-dx.xf-yun.com/v1/private/dts_create
          先 dts_create 再轮询 dts_query 取音频链接。

Voice default: 聆伯松-反派老人 (vcn=x4_lingbosong_bad_talk).
该发音人需在控制台对应服务里开通，未开通会返回 11200。

Credentials (first match wins):
  --app-id / --api-key / --api-secret
  env XFYUN_APP_ID, XFYUN_API_KEY, XFYUN_API_SECRET
  tools/xfyun-long-tts.config.json  (copy from the example file)

Options:
  --engine <online|long>  Default: online
  --book <id|all>       Story book id. Default: all
  --chapter <key>       Limit to one chapterKey.
  --entry <key|id>      Limit to one entry key or paragraph id.
  --out <dir>           Output dir. Default: story/audio-packs/audio-lingbosong
  --data <js>           Official storybook JS. Default: story/data/storybook-official-data.js
  --fan <js>            民间故事书 JS，用于按 entry.key 反查 chapterKey（判定战斗模块）。
                        Default: story/data/storybook-data.js
  --include-battle      生成战斗模块（默认跳过）。
  --config <json>       Local xfyun credential JSON.
  --app-id <id>
  --api-key <key>
  --api-secret <secret>
  --vcn <vcn>           Default: x4_lingbosong_bad_talk
  --host <host>         覆盖服务域名（一般不用改）。
  --speed <0-100>       Default: 50
  --volume <0-100>      Default: 50
  --pitch <0-100>       Default: 50
  --max-chars <n>       Max chars per request chunk. Default: 2000
  --delay-ms <n>        Wait after each finished chunk. Default: 400
  --concurrency <n>     Parallel synthesis jobs. Default: 1
  --retries <n>         Retry failed requests. Default: 2
  --no-split            One file per entry (only safe for short entries).
  --poll-interval-ms <n>   long 引擎轮询间隔。Default: 2000
  --poll-timeout-ms <n>    long 引擎轮询超时。Default: 180000
  --limit <n>           Generate first n matching entries.
  --doctor              Check credentials / service / voice without writing audio.
  --rebuild-manifest    Only scan already-generated audio files and rewrite manifest.json /
                        manifest.js. No API calls, no quota used. Entries whose chunks are
                        not all present are left out.
  --skip-battle         Skip battle chapters.
  --force               Regenerate existing audio files.
  --dry-run             Only print the plan.
`;
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";
    if (arg === "--help" || arg === "-h") {
      console.log(usage().trim());
      process.exit(0);
    } else if (arg === "--engine") args.engine = next();
    else if (arg === "--book") args.book = next();
    else if (arg === "--chapter") args.chapter = next();
    else if (arg === "--entry") args.entry = next();
    else if (arg === "--out") args.outDir = path.resolve(rootDir, next());
    else if (arg === "--data") args.dataPath = path.resolve(rootDir, next());
    else if (arg === "--fan") args.fanDataPath = path.resolve(rootDir, next());
    else if (arg === "--config") args.configPath = path.resolve(rootDir, next());
    else if (arg === "--host") args.host = next();
    else if (arg === "--app-id") args.appId = next();
    else if (arg === "--api-key") args.apiKey = next();
    else if (arg === "--api-secret") args.apiSecret = next();
    else if (arg === "--vcn") args.vcn = next();
    else if (arg === "--speed") args.speed = Number(next());
    else if (arg === "--volume") args.volume = Number(next());
    else if (arg === "--pitch") args.pitch = Number(next());
    else if (arg === "--max-chars") args.maxChars = Number(next()) || defaults.maxChars;
    else if (arg === "--delay-ms") args.delayMs = Number(next()) || 0;
    else if (arg === "--poll-interval-ms") args.pollIntervalMs = Number(next()) || defaults.pollIntervalMs;
    else if (arg === "--poll-timeout-ms") args.pollTimeoutMs = Number(next()) || defaults.pollTimeoutMs;
    else if (arg === "--concurrency") args.concurrency = Math.max(1, Number(next()) || 1);
    else if (arg === "--retries") args.retries = Number(next());
    else if (arg === "--retry-delay-ms") args.retryDelayMs = Number(next()) || defaults.retryDelayMs;
    else if (arg === "--limit") args.limit = Number(next()) || 0;
    else if (arg === "--include-battle") args.includeBattle = true;
    else if (arg === "--skip-battle") args.includeBattle = false;
    else if (arg === "--doctor") args.doctor = true;
    else if (arg === "--rebuild-manifest" || arg === "--manifest-only") args.rebuildManifest = true;
    else if (arg === "--split") args.noSplit = false;
    else if (arg === "--no-split") args.noSplit = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown option: ${arg}\n${usage()}`);
  }
  return args;
}

async function loadJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function loadConfig(args) {
  const config = (await loadJsonIfExists(args.configPath)) || {};
  const engine = args.engine || config.engine || "online";
  if (!ENGINES[engine]) {
    throw new Error(`Unknown engine: ${engine}. Use "online" or "long".`);
  }
  const spec = ENGINES[engine];
  if (!args.host && config.host && config.host !== spec.host) {
    console.log(`提示：配置里 host=${config.host} 与 ${engine} 引擎默认域名 ${spec.host} 不一致，已改用 ${spec.host}（如需强制用 --host）。`);
  }
  return {
    ...args,
    engine,
    spec,
    host: args.host || spec.host,
    appId: args.appId || config.appId || config.app_id || "",
    apiKey: args.apiKey || config.apiKey || config.api_key || "",
    apiSecret: args.apiSecret || config.apiSecret || config.api_secret || "",
    vcn: config.vcn || args.vcn,
    voiceLabel: config.voiceLabel || args.voiceLabel,
    encoding: config.encoding || args.encoding,
    sampleRate: Number(config.sampleRate || args.sampleRate),
    speed: Number(config.speed ?? args.speed),
    volume: Number(config.volume ?? args.volume),
    pitch: Number(config.pitch ?? args.pitch),
  };
}

async function loadWindowData(dataPath, globalName) {
  const raw = await fs.readFile(dataPath, "utf8");
  const jsonText = raw
    .replace(new RegExp(`^\\uFEFF?window\\.${globalName}\\s*=\\s*`), "")
    .replace(/;\s*$/, "");
  return JSON.parse(jsonText);
}

// 与 App 的 buildVersionData 一致：官方条目自身没有 chapterKey，按 entry.key 回查民间数据。
async function loadChapterKeyMap(fanDataPath) {
  try {
    const fan = await loadWindowData(fanDataPath, "STORYBOOK_DATA");
    const map = new Map();
    for (const book of fan.books || []) {
      for (const entry of book.entries || []) {
        if (entry.key && entry.chapterKey) map.set(entry.key, entry.chapterKey);
      }
    }
    return map;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      console.log(`提示：找不到民间数据 ${path.relative(rootDir, fanDataPath)}，无法判定战斗模块，将全部生成。`);
      return new Map();
    }
    throw error;
  }
}

function resolveChapterKey(entry, chapterKeyMap) {
  return entry.chapterKey || OFFICIAL_ONLY_CHAPTERS[entry.key] || chapterKeyMap.get(entry.key) || "";
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

// 在线语音合成按 UTF-8 字节限长，长文本按字符限长。useBytes=true 时全部走字节口径。
function textSize(text, useBytes) {
  return useBytes ? Buffer.byteLength(text, "utf8") : text.length;
}

function sliceBySize(text, size, useBytes) {
  if (!useBytes) return text.slice(0, size);
  let bytes = 0;
  let end = 0;
  for (const char of text) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > size) break;
    bytes += charBytes;
    end += char.length;
  }
  return text.slice(0, end);
}

function splitLongPart(part, limit, useBytes) {
  if (textSize(part, useBytes) <= limit) return [part];
  const chunks = [];
  let rest = part;
  while (textSize(rest, useBytes) > limit) {
    const windowText = sliceBySize(rest, limit, useBytes);
    const breakAt = Math.max(
      windowText.lastIndexOf("。"),
      windowText.lastIndexOf("！"),
      windowText.lastIndexOf("？"),
      windowText.lastIndexOf("；"),
      windowText.lastIndexOf("，"),
      windowText.lastIndexOf("\n")
    );
    const minimum = Math.floor(windowText.length * 0.45);
    const cut = breakAt > minimum ? breakAt + 1 : windowText.length;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// maxBytes > 0 时按字节限制（在线语音合成），否则按字符限制（长文本语音合成）。
function createSpeechChunks(text, maxChars, maxBytes = 0) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || !hasChinese(normalized)) return [];
  const useBytes = maxBytes > 0;
  const limit = useBytes ? maxBytes : maxChars;
  const fits = (candidate) => textSize(candidate, useBytes) <= limit;
  const sentenceParts = normalized.match(/[^。！？；]+[。！？；]?/g) || [normalized];
  const chunks = [];
  let current = "";
  for (const sentence of sentenceParts.flatMap((part) => splitLongPart(part.trim(), limit, useBytes))) {
    if (!sentence || !hasChinese(sentence)) continue;
    const next = current ? `${current}${sentence}` : sentence;
    if (current && !fits(next)) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.flatMap((chunk) => splitLongPart(chunk, limit, useBytes)).filter(hasChinese);
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function rfc1123Date(date = new Date()) {
  return date.toUTCString();
}

function assembleAuthUrl(host, pathName, apiKey, apiSecret, schemeName = "https", method = "POST") {
  const date = rfc1123Date();
  const signatureOrigin = `host: ${host}\ndate: ${date}\n${method} ${pathName} HTTP/1.1`;
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(signatureOrigin)
    .digest("base64");
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin, "utf8").toString("base64");
  const query = new URLSearchParams({
    host,
    date,
    authorization,
  });
  const scheme = schemeName || "https";
  return `${scheme}://${host}${pathName}?${query.toString()}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function audioExtension(encoding) {
  return String(encoding || "lame").toLowerCase() === "lame" ? "mp3" : "pcm";
}

function officialEntryText(entry) {
  return String(entry?.officialText || "").trim();
}

function selectEntries(data, args, chapterKeyMap) {
  const books = args.book === "all"
    ? data.books
    : data.books.filter((book) => book.id === args.book);
  if (!books.length) throw new Error(`No matching book: ${args.book}`);

  const entries = [];
  for (const book of books) {
    for (const entry of book.entries || []) {
      const chapterKey = resolveChapterKey(entry, chapterKeyMap);
      if (!args.includeBattle && chapterKey === "battle") continue;
      if (args.chapter && chapterKey !== args.chapter) continue;
      if (args.entry && entry.key !== args.entry && entry.id !== args.entry) continue;
      entries.push({ book, entry, chapterKey });
      if (args.limit && entries.length >= args.limit) return entries;
    }
  }
  return entries;
}

function countBattleEntries(data, chapterKeyMap) {
  let total = 0;
  for (const book of data.books || []) {
    for (const entry of book.entries || []) {
      if (!(entry.officialText || "").trim()) continue;
      if (resolveChapterKey(entry, chapterKeyMap) === "battle") total += 1;
    }
  }
  return total;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function postJson(url, body, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
    }
    // 讯飞把业务错误码放在 body 里，HTTP 状态可能是 500，交给 requireHeaderOk 统一解释。
    if (data && typeof data === "object" && data.header) return data;
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const XFYUN_CODE_HINTS = {
  "10110": "无授权许可（no license）。请确认该应用已开通长文本语音合成服务。",
  "10114": "请求超时/时间偏差过大。签名中的 date 只允许与服务器相差 300 秒内，请校准系统时间。",
  "10165": "任务不存在或已过期，请重新创建任务。",
  "11200":
    "服务或发音人未授权（no vcn auth）。请在讯飞控制台依次确认："
    + "1) 已领取/购买“长文本语音合成”免费额度或套餐；"
    + "2) 在该服务的发音人列表里单独开通当前 vcn（如 x4_lingbosong 聆伯松）的权限；"
    + "3) appId 与 APIKey/APISecret 属于同一个应用。"
    + "可用 --doctor 诊断，并可加 --vcn x4_pengfei 对比是否只是该发音人未开通。",
  "11201": "服务单日调用次数超过限制，请次日再试或提升配额。",
};

function requireHeaderOk(data, action) {
  const header = data?.header || {};
  if (Number(header.code) !== 0) {
    const code = String(header.code);
    const hint = XFYUN_CODE_HINTS[code];
    const message = `${action} failed: code=${code} message=${header.message || ""} sid=${header.sid || ""}`;
    const error = new Error(hint ? `${message}\n  提示：${hint}` : message);
    error.xfyunCode = code;
    error.nonRetryable = code === "11200" || code === "11201" || code === "10110";
    throw error;
  }
  return header;
}

function createTaskBody(text, args) {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  return {
    header: {
      app_id: args.appId,
    },
    parameter: {
      dts: {
        vcn: args.vcn,
        language: args.language,
        speed: Number(args.speed),
        volume: Number(args.volume),
        pitch: Number(args.pitch),
        rhy: 0,
        audio: {
          encoding: args.encoding,
          sample_rate: Number(args.sampleRate),
          channels: 1,
          bit_depth: 16,
          frame_size: 0,
        },
        pybuf: {
          encoding: "utf8",
          compress: "raw",
          format: "plain",
        },
      },
    },
    payload: {
      text: {
        encoding: "utf8",
        compress: "raw",
        format: "plain",
        text: encoded,
      },
    },
  };
}

async function withRetries(label, args, fn) {
  const rounds = Math.max(0, Number(args.retries || 0));
  let lastError;
  for (let attempt = 0; attempt <= rounds; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const message = String(error.message || error);
      // 授权类错误重试没有意义，直接抛出完整提示。
      if (error && error.nonRetryable) throw error;
      if (attempt >= rounds) break;
      console.log(`${label}: ${message}; retry ${attempt + 1}/${rounds} after ${args.retryDelayMs} ms`);
      await sleep(Number(args.retryDelayMs || defaults.retryDelayMs));
    }
  }
  throw lastError;
}

async function createTask(text, args) {
  return withRetries("create", args, async () => {
    const url = assembleAuthUrl(args.host, "/v1/private/dts_create", args.apiKey, args.apiSecret, "https", "POST");
    const data = await postJson(url, createTaskBody(text, args), 30000);
    const header = requireHeaderOk(data, "create");
    if (!header.task_id) throw new Error("create succeeded but task_id is empty");
    return header.task_id;
  });
}

function decodeAudioUrl(encoded) {
  const raw = String(encoded || "").trim();
  if (!raw) return "";
  const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
  if (/^https?:\/\//i.test(decoded)) return decoded;
  if (/^https?:\/\//i.test(raw)) return raw;
  throw new Error(`Unexpected audio payload: ${decoded.slice(0, 80) || raw.slice(0, 80)}`);
}

async function queryUntilReady(taskId, args) {
  const started = Date.now();
  let lastStatus = "";
  while (Date.now() - started < Number(args.pollTimeoutMs || defaults.pollTimeoutMs)) {
    await sleep(Number(args.pollIntervalMs || defaults.pollIntervalMs));
    const result = await withRetries(`query ${taskId}`, args, async () => {
      const url = assembleAuthUrl(args.host, "/v1/private/dts_query", args.apiKey, args.apiSecret, "https", "POST");
      const data = await postJson(url, {
        header: {
          app_id: args.appId,
          task_id: taskId,
        },
      }, 30000);
      requireHeaderOk(data, "query");
      return data;
    });
    const status = String(result?.header?.task_status || "");
    lastStatus = status;
    if (status === "5") {
      const encoded = result?.payload?.audio?.audio;
      return decodeAudioUrl(encoded);
    }
    if (status === "2" || status === "4") {
      throw new Error(`task ${taskId} failed with status ${status}`);
    }
  }
  throw new Error(`task ${taskId} timed out after ${args.pollTimeoutMs} ms (last status=${lastStatus || "unknown"})`);
}

async function downloadAudio(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`download HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

function decodeOnlineFrame(raw) {
  const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`无法解析服务端返回帧：${text.slice(0, 160)}`);
  }
}

// 在线语音合成（流式版）：一次性把文本发过去，服务端分帧回传音频。
function synthesizeOnlineOnce(text, args, label) {
  return new Promise((resolve, reject) => {
    const url = assembleAuthUrl(
      args.host,
      args.spec.path,
      args.apiKey,
      args.apiSecret,
      args.spec.scheme,
      args.spec.method
    );
    const business = {
      aue: "lame",
      sfl: 1,
      auf: `audio/L16;rate=${Number(args.sampleRate) || 16000}`,
      vcn: args.vcn,
      tte: "UTF8",
      speed: Number(args.speed),
      volume: Number(args.volume),
      pitch: Number(args.pitch),
    };
    const payload = {
      common: { app_id: args.appId },
      business,
      data: {
        status: 2,
        text: Buffer.from(text, "utf8").toString("base64"),
      },
    };

    const socket = new WebSocket(url);
    const pieces = [];
    let settled = false;
    const timer = setTimeout(() => {
      done(new Error(`${label}: websocket 超时（60s 未收到结束帧）`));
    }, 60000);

    function done(error, buffer) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignore
      }
      if (error) reject(error);
      else resolve(buffer);
    }

    socket.onopen = () => {
      socket.send(JSON.stringify(payload));
    };

    socket.onmessage = (event) => {
      let frame;
      try {
        frame = decodeOnlineFrame(event.data);
      } catch (error) {
        done(error);
        return;
      }
      if (Number(frame.code) !== 0) {
        const error = new Error(
          `${label}: code=${frame.code} message=${frame.message || ""} sid=${frame.sid || ""}`
        );
        error.xfyunCode = String(frame.code);
        error.nonRetryable = ["11200", "11201", "10110"].includes(error.xfyunCode);
        done(error);
        return;
      }
      const audio = frame?.data?.audio;
      if (typeof audio === "string" && audio.length) {
        pieces.push(Buffer.from(audio, "base64"));
      }
      if (Number(frame?.data?.status) === 2) {
        done(null, Buffer.concat(pieces));
      }
    };

    socket.onerror = () => {
      done(new Error(`${label}: websocket 连接错误（检查网络或鉴权参数）`));
    };

    socket.onclose = (event) => {
      if (settled) return;
      const detail = pieces.length ? `已收到 ${pieces.length} 帧` : "未收到音频帧";
      done(new Error(`${label}: websocket 提前关闭 code=${event.code} ${event.reason || ""}（${detail}）`));
    };
  });
}

async function synthesizeOnline(text, args, label) {
  const bytes = await withRetries(`synth ${label}`, args, () => synthesizeOnlineOnce(text, args, label));
  if (!bytes.length) throw new Error(`${label}: 服务端未返回音频数据`);
  return bytes;
}

async function synthesizeChunk(text, args, label) {
  if (args.engine === "online") {
    return synthesizeOnline(text, args, label);
  }
  const taskId = await createTask(text, args);
  console.log(`${label}: task ${taskId}`);
  const audioUrl = await queryUntilReady(taskId, args);
  const bytes = await withRetries(`download ${label}`, args, () => downloadAudio(audioUrl));
  if (!bytes.length) throw new Error(`${label}: empty audio download`);
  return bytes;
}

async function mapPool(items, concurrency, worker) {
  const pending = items.map((item, index) => ({ item, index }));
  const results = new Array(items.length);
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (pending.length) {
      const next = pending.shift();
      if (!next) return;
      results[next.index] = await worker(next.item, next.index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function readManifest(outDir) {
  const manifestPath = path.join(outDir, "manifest.json");
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    return {
      generatedAt: "",
      generator: "tools/generate-story-xfyun-tts.mjs",
      version: 1,
      official: true,
      source: "storybook-official-data",
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

function assertCredentials(args) {
  if (args.appId && args.apiKey && args.apiSecret) return;
  throw new Error(
    [
      "Missing 讯飞 credentials.",
      `Copy ${path.relative(rootDir, exampleConfigPath)} to ${path.relative(rootDir, defaultConfigPath)}`,
      "and fill appId / apiKey / apiSecret, or set XFYUN_APP_ID, XFYUN_API_KEY, XFYUN_API_SECRET.",
    ].join("\n")
  );
}

async function probeVoice(args, vcn) {
  const probeArgs = { ...args, vcn, retries: 0 };
  const text = "这是一句用于检查接口授权的测试文本。";
  try {
    const bytes = await synthesizeChunk(text, probeArgs, "doctor");
    return { ok: true, bytes: bytes.length };
  } catch (error) {
    return { ok: false, code: error?.xfyunCode || "", message: String(error.message || error) };
  }
}

async function runDoctor(args) {
  console.log("讯飞语音合成 · 授权诊断");
  console.log(`engine    : ${args.engine}`);
  console.log(`host      : ${args.host}`);
  console.log(`appId     : ${args.appId || "(未配置)"}`);
  console.log(`apiKey    : ${args.apiKey ? `已配置(${args.apiKey.length} 位)` : "(未配置)"}`);
  console.log(`apiSecret : ${args.apiSecret ? `已配置(${args.apiSecret.length} 位)` : "(未配置)"}`);
  console.log(`vcn       : ${args.vcn} (${args.voiceLabel})`);
  console.log("");

  try {
    assertCredentials(args);
  } catch (error) {
    throw new Error(String(error.message || error));
  }

  if (args.apiKey && args.apiSecret && args.apiKey === args.apiSecret) {
    console.log("⚠ apiKey 与 apiSecret 相同。讯飞这两个值是不同的 32 位字符串，请核对控制台。\n");
  }

  console.log("正在真实合成一小段文本（会消耗 1 次调用额度）……");
  const target = await probeVoice(args, args.vcn);
  if (target.ok) {
    console.log(`✅ ${args.vcn} 可用，已成功合成 ${target.bytes} 字节音频。可以直接开始生成。`);
    return;
  }

  console.log(`❌ 发音人 ${args.vcn} 合成失败：${target.message.split("\n")[0]}`);
  if (target.message.includes("提示：")) {
    console.log(target.message.slice(target.message.indexOf("提示：")));
  }

  if (target.code === "11200" || target.code === "10110") {
    console.log("\n换一个官方示例音色再测一次，以区分“服务未开通”和“该发音人未授权”……");
    const fallback = args.engine === "online" ? "x4_xiaoyan" : "x4_pengfei";
    const probe = await probeVoice(args, fallback);
    if (probe.ok) {
      console.log(`→ ${fallback} 可用，说明服务本身已开通，只是 ${args.vcn} 这个发音人没有权限。`);
      console.log(`  请到控制台该服务的发音人列表为 ${args.vcn} 开通，或改用已开通的 vcn。`);
    } else {
      console.log(`→ ${fallback} 同样失败（${probe.message.split("\n")[0]}），说明服务整体未开通或额度未领取。`);
      const productUrl = args.engine === "online"
        ? "https://www.xfyun.cn/services/online_tts"
        : "https://www.xfyun.cn/services/online_tts_long";
      console.log(`  请到 ${productUrl} 领取免费额度或购买套餐后再试。`);
    }
  }
  throw new Error("授权诊断未通过，详见上方日志。");
}

function manifestConfig(args) {
  return {
    engine: args.engine,
    host: args.host,
    vcn: args.vcn,
    voiceLabel: args.voiceLabel,
    encoding: args.encoding,
    sampleRate: args.sampleRate,
    speed: args.speed,
    volume: args.volume,
    pitch: args.pitch,
    skipEnglish: true,
    maxChars: args.maxChars,
    noSplit: args.noSplit,
  };
}

function chunkFileName(index, ext) {
  return `${String(index + 1).padStart(3, "0")}.${ext}`;
}

// 只扫描磁盘上已有的音频，重建 manifest；不调用接口、不消耗额度。
async function rebuildManifest(args, plan, ext) {
  const manifest = await readManifest(args.outDir);
  manifest.official = true;
  manifest.source = "storybook-official-data";
  manifest.generator = "tools/generate-story-xfyun-tts.mjs";
  manifest.config = manifestConfig(args);
  // 以当前计划为准整体重建，避免残留已不再生成的条目（例如战斗模块）。
  manifest.entries = {};

  let complete = 0;
  let incomplete = 0;
  let files = 0;

  for (const { book, entry, cleanText, chunks, chapterKey } of plan) {
    const records = [];
    let allPresent = true;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const fileName = chunkFileName(chunkIndex, ext);
      const filePath = path.join(args.outDir, entry.key, fileName);
      if (!(await fileExists(filePath))) {
        allPresent = false;
        break;
      }
      const stats = await fs.stat(filePath);
      records.push({
        index: chunkIndex + 1,
        path: `${entry.key}/${fileName}`,
        chars: chunks[chunkIndex].length,
        hash: sha1(chunks[chunkIndex]),
        bytes: stats.size,
      });
    }
    if (!allPresent || !records.length) {
      incomplete += 1;
      continue;
    }
    files += records.length;
    complete += 1;
    manifest.entries[entry.key] = {
      bookId: book.id,
      entryKey: entry.key,
      id: entry.id,
      title: entry.officialTitle || entry.title || "",
      chapterKey: chapterKey || "",
      encounterKey: entry.encounterKey || "",
      official: true,
      textHash: sha1(cleanText),
      chunks: records,
    };
  }

  await writeManifest(args.outDir, manifest);
  console.log(`Rebuilt manifest from existing audio: ${complete} entries / ${files} files recorded.`);
  console.log(`Entries still missing audio (left out): ${incomplete} of ${plan.length}.`);
  console.log(`Manifest: ${path.relative(rootDir, path.join(args.outDir, "manifest.json")).replace(/\\/g, "/")}`);
}

export async function main(argv = process.argv.slice(2), runtime = {}) {
  const parsedArgs = parseArgs(argv);
  const args = await loadConfig(parsedArgs);
  // 供本地工具包注入取消信号；命令行使用时为 undefined。
  args.signal = runtime.signal;
  if (args.doctor) {
    await runDoctor(args);
    return;
  }
  const data = await loadWindowData(args.dataPath, "STORYBOOK_OFFICIAL_DATA");
  const chapterKeyMap = await loadChapterKeyMap(args.fanDataPath);
  const selected = selectEntries(data, args, chapterKeyMap);
  const ext = audioExtension(args.encoding);
  const plan = [];
  const skippedNoChinese = [];
  let battleCount = 0;

  for (const { book, entry, chapterKey } of selected) {
    const cleanText = cleanSpeechText(officialEntryText(entry));
    const chunks = args.noSplit
      ? (cleanText ? [cleanText] : [])
      : createSpeechChunks(cleanText, args.maxChars, args.spec.maxBytes);
    if (!chunks.length) {
      if (chapterKey === "battle") battleCount += 1;
      skippedNoChinese.push({ book, entry });
      continue;
    }
    plan.push({ book, entry, cleanText, chunks, chapterKey });
  }

  const chunkCount = plan.reduce((sum, item) => sum + item.chunks.length, 0);
  console.log(`Engine: ${args.engine} (${args.host})`);
  console.log(`Selected entries: ${selected.length}${args.includeBattle ? "" : "（已排除战斗模块）"}`);
  console.log(`Will generate: ${plan.length} entries / ${chunkCount} audio chunks`);
  console.log(`Skipped empty/no-Chinese: ${skippedNoChinese.length - battleCount}`);
  if (!args.includeBattle) {
    console.log(`Skipped battle module: ${battleCount > 0 ? battleCount : countBattleEntries(data, chapterKeyMap)}`);
  }
  console.log(`Output: ${path.relative(rootDir, args.outDir).replace(/\\/g, "/")}`);
  console.log(`XFYUN: ${args.vcn} (${args.voiceLabel}) / ${ext} / concurrency=${args.concurrency}`);
  if (args.engine === "online" && chunkCount > 500) {
    console.log("");
    console.log(`⚠ 在线语音合成每个分片算 1 次调用，本批共 ${chunkCount} 次；新应用默认每日 500 次，`);
    console.log("  超出会报 11201。可用 --limit / --book / --entry 分批跑，脚本会跳过已生成的文件。");
  }

  if (args.dryRun) {
    for (const item of plan.slice(0, 20)) {
      console.log(`[dry-run] ${item.book.id} ${item.entry.key} ${item.entry.id || ""}: ${item.chunks.length} chunk(s), ${item.cleanText.length} chars`);
    }
    if (plan.length > 20) console.log(`[dry-run] ... ${plan.length - 20} more entries`);
    return;
  }

  if (args.rebuildManifest) {
    await rebuildManifest(args, plan, ext);
    return;
  }

  assertCredentials(args);
  const manifest = await readManifest(args.outDir);
  manifest.official = true;
  manifest.source = "storybook-official-data";
  manifest.generator = "tools/generate-story-xfyun-tts.mjs";
  manifest.config = manifestConfig(args);

  const jobs = [];
  for (const item of plan) {
    const { book, entry, cleanText, chunks, chapterKey } = item;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      jobs.push({
        book,
        entry,
        cleanText,
        chapterKey,
        chunk: chunks[chunkIndex],
        chunkIndex,
        chunkCount: chunks.length,
      });
    }
  }

  let written = 0;
  let reused = 0;
  const entryChunks = new Map();

  await mapPool(jobs, args.concurrency, async (job) => {
    const { book, entry, cleanText, chapterKey, chunk, chunkIndex, chunkCount } = job;
    const entryDir = path.join(args.outDir, entry.key);
    await fs.mkdir(entryDir, { recursive: true });
    const fileName = `${String(chunkIndex + 1).padStart(3, "0")}.${ext}`;
    const filePath = path.join(entryDir, fileName);
    const relPath = `${entry.key}/${fileName}`;
    const label = `${entry.key}/${fileName}`;
    const exists = await fileExists(filePath);
    if (exists && !args.force) {
      reused += 1;
      console.log(`[reuse] ${label}`);
    } else {
      if (args.signal?.aborted) throw new Error("生成已取消");
      console.log(`[synth ${chunkIndex + 1}/${chunkCount}] ${book.id} ${label} (${chunk.length} chars)`);
      const bytes = await synthesizeChunk(chunk, args, label);
      await fs.writeFile(filePath, bytes);
      written += 1;
      if (Number(args.delayMs || 0) > 0) await sleep(Number(args.delayMs));
    }
    const stats = await fs.stat(filePath);
    const record = {
      index: chunkIndex + 1,
      path: relPath,
      chars: chunk.length,
      hash: sha1(chunk),
      bytes: stats.size,
    };
    const current = entryChunks.get(entry.key) || [];
    current.push({ book, entry, cleanText, chapterKey, record });
    entryChunks.set(entry.key, current);
  });

  for (const [entryKey, parts] of entryChunks) {
    parts.sort((a, b) => a.record.index - b.record.index);
    const { book, entry, cleanText, chapterKey } = parts[0];
    manifest.entries[entryKey] = {
      bookId: book.id,
      entryKey: entry.key,
      id: entry.id,
      title: entry.officialTitle || entry.title || "",
      chapterKey: chapterKey || "",
      encounterKey: entry.encounterKey || "",
      official: true,
      textHash: sha1(cleanText),
      chunks: parts.map((part) => part.record),
    };
  }
  await writeManifest(args.outDir, manifest);

  console.log(`Done. Wrote ${written} chunks, reused ${reused} existing chunks.`);
  console.log(`Manifest: ${path.relative(rootDir, path.join(args.outDir, "manifest.json")).replace(/\\/g, "/")}`);
}

// 直接运行本文件时走命令行；被工具包 import 时只导出函数。
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
