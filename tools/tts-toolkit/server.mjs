// ATO 故事书语音工具包 —— 本地服务
// 只监听 127.0.0.1，密钥不出本机。生成逻辑复用 tools/generate-story-xfyun-tts.mjs。
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main as runGenerator } from "../generate-story-xfyun-tts.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const publicDir = path.join(here, "public");
const configPath = path.join(rootDir, "tools", "xfyun-long-tts.config.json");
const storyDataDir = path.join(rootDir, "story", "data");
const defaultOutDir = path.join(rootDir, "story", "audio-packs", "audio-lingbosong");

const DEFAULT_CONFIG = {
  engine: "online",
  appId: "",
  apiKey: "",
  apiSecret: "",
  vcn: "x4_lingbosong_bad_talk",
  voiceLabel: "聆伯松-反派老人",
  encoding: "lame",
  sampleRate: 16000,
  speed: 50,
  volume: 50,
  pitch: 50,
};

const VOICES = [
  { vcn: "x4_lingbosong_bad_talk", label: "聆伯松-反派老人（在线）" },
  { vcn: "x4_lingbosong", label: "聆伯松-老年男声" },
  { vcn: "x4_xiaoyan", label: "讯飞小燕（在线）" },
  { vcn: "x4_pengfei", label: "小鹏（在线）" },
  { vcn: "x4_yeting", label: "希涵" },
  { vcn: "x4_guanshan", label: "关山-专题" },
  { vcn: "x4_qianxue", label: "千雪" },
  { vcn: "x4_xiuying", label: "秀英-老年女声" },
  { vcn: "x4_mingge", label: "明哥" },
  { vcn: "x4_doudou", label: "豆豆" },
  { vcn: "x4_xiaoguo", label: "小果" },
  { vcn: "x4_xiaozhong", label: "小忠" },
  { vcn: "x4_yezi", label: "小露" },
  { vcn: "x4_chaoge", label: "超哥" },
  { vcn: "x4_feidie", label: "飞碟哥" },
  { vcn: "x4_lingfeihao_upbeatads", label: "聆飞皓-广告" },
  { vcn: "x4_wangqianqian", label: "嘉欣" },
  { vcn: "x4_lingxiaozhen_eclives", label: "聆小臻" },
];

// ---------- 状态 ----------

let job = null; // { controller, startedAt, argv, running, error }
const logBuffer = [];
let logSeq = 0;

function log(line) {
  logSeq += 1;
  logBuffer.push({ seq: logSeq, line: String(line) });
  if (logBuffer.length > 5000) logBuffer.splice(0, logBuffer.length - 5000);
}

// 捕获生成器内部的 console 输出到日志缓冲。
async function captureLogs(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...parts) => {
    originalLog(...parts);
    log(parts.map((part) => (typeof part === "string" ? part : String(part))).join(" "));
  };
  console.error = (...parts) => {
    originalError(...parts);
    log(parts.map((part) => (typeof part === "string" ? part : String(part))).join(" "));
  };
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function readConfig() {
  try {
    const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function writeConfig(patch) {
  const current = await readConfig();
  const next = { ...current };
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const value = patch[key];
    if (value === undefined || value === null) continue;
    // 密钥留空表示沿用原值，避免把掩码写回去。
    if ((key === "apiKey" || key === "apiSecret" || key === "appId") && String(value).trim() === "") continue;
    next[key] = key === "speed" || key === "volume" || key === "pitch" || key === "sampleRate"
      ? Number(value)
      : String(value).trim();
  }
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "••••";
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

// 只允许访问项目目录内的文件，避免接口被用来读任意路径。
function insideProject(target) {
  const resolved = path.resolve(target);
  return resolved === rootDir || resolved.startsWith(rootDir + path.sep);
}

async function isStorybookData(full) {
  try {
    const handle = await fs.open(full, "r");
    try {
      const buffer = Buffer.alloc(200);
      const { bytesRead } = await handle.read(buffer, 0, 200, 0);
      return /window\.STORYBOOK_[A-Z_]*\s*=/.test(buffer.subarray(0, bytesRead).toString("utf8"));
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

async function listStoryFiles() {
  const found = [];
  const dirs = [storyDataDir, path.join(rootDir, "tools"), rootDir];
  const seen = new Set();
  for (const dir of dirs) {
    let names = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".js") || seen.has(name)) continue;
      const full = path.join(dir, name);
      let size = 0;
      try {
        const stats = await fs.stat(full);
        if (!stats.isFile()) continue;
        size = stats.size;
      } catch {
        continue;
      }
      if (size < 1024) continue;
      // 只列出确实是故事书数据的文件，避免混入无关脚本。
      if (!(await isStorybookData(full))) continue;
      seen.add(name);
      found.push({
        path: path.relative(rootDir, full).replace(/\\/g, "/"),
        size,
      });
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

async function countGenerated(outDir) {
  let files = 0;
  let bytes = 0;
  try {
    const entries = await fs.readdir(outDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let names = [];
      try {
        names = await fs.readdir(path.join(outDir, entry.name));
      } catch {
        continue;
      }
      for (const name of names) {
        if (!name.toLowerCase().endsWith(".mp3")) continue;
        files += 1;
        try {
          bytes += (await fs.stat(path.join(outDir, entry.name, name))).size;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // 目录还不存在
  }
  return { files, bytes };
}

// ---------- 请求处理 ----------

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail("请求体不是合法 JSON");
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function serveStatic(res, fileName) {
  const full = path.join(publicDir, fileName);
  if (!insideProject(full)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const data = await fs.readFile(full);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(full)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}

// 把界面选项翻译成生成器的命令行参数。
function buildArgv(options) {
  const argv = [];
  const dataPath = String(options.dataPath || "").trim();
  if (dataPath) {
    const full = insideProject(dataPath) ? path.resolve(rootDir, dataPath) : "";
    if (!full) fail("数据文件必须位于项目目录内");
    argv.push("--data", full);
  }
  const fanPath = String(options.fanDataPath || "").trim();
  if (fanPath) {
    const full = insideProject(fanPath) ? path.resolve(rootDir, fanPath) : "";
    if (!full) fail("民间数据文件必须位于项目目录内");
    argv.push("--fan", full);
  }
  if (options.book && options.book !== "all") argv.push("--book", String(options.book));
  else argv.push("--book", "all");
  if (options.chapter) argv.push("--chapter", String(options.chapter));
  if (options.entry) argv.push("--entry", String(options.entry));
  if (options.limit) argv.push("--limit", String(Number(options.limit)));
  if (options.engine) argv.push("--engine", String(options.engine));
  if (options.vcn) argv.push("--vcn", String(options.vcn));
  if (options.outDir) {
    const full = insideProject(options.outDir) ? path.resolve(rootDir, options.outDir) : "";
    if (!full) fail("输出目录必须位于项目目录内");
    argv.push("--out", full);
  }
  if (options.includeBattle) argv.push("--include-battle");
  if (options.force) argv.push("--force");
  if (options.dryRun) argv.push("--dry-run");
  return argv;
}

async function handleGenerate(options) {
  if (job?.running) throw new Error("已有生成任务在运行，请先停止或等待完成。");
  const argv = buildArgv(options);
  const controller = new AbortController();
  job = { running: true, startedAt: Date.now(), argv, error: "", controller };
  logBuffer.length = 0;
  logSeq = 0;
  log(`$ node tools/generate-story-xfyun-tts.mjs ${argv.join(" ")}`);

  captureLogs(() => runGenerator(argv, { signal: controller.signal }))
    .then(() => {
      job.running = false;
      if (controller.signal.aborted) log("任务已停止。");
      else log("任务完成。");
    })
    .catch((error) => {
      job.running = false;
      job.error = String(error?.message || error);
      log(`❌ ${job.error}`);
    });

  return { started: true };
}

async function handleRequest(req, res, url) {
  const route = url.pathname;

  if (req.method === "GET" && (route === "/" || route === "/index.html")) {
    return serveStatic(res, "index.html");
  }
  if (req.method === "GET" && (route === "/app.js" || route === "/styles.css")) {
    return serveStatic(res, route.slice(1));
  }

  if (req.method === "GET" && route === "/api/state") {
    const config = await readConfig();
    const outDir = defaultOutDir;
    const progress = await countGenerated(outDir);
    return sendJson(res, 200, {
      config: {
        ...config,
        apiKey: "",
        apiSecret: "",
        hasApiKey: Boolean(config.apiKey),
        hasApiSecret: Boolean(config.apiSecret),
        apiKeyMasked: maskSecret(config.apiKey),
        apiSecretMasked: maskSecret(config.apiSecret),
      },
      voices: VOICES,
      storyFiles: await listStoryFiles(),
      outDir: path.relative(rootDir, outDir).replace(/\\/g, "/"),
      generated: progress,
      running: Boolean(job?.running),
      jobError: job?.error || "",
    });
  }

  if (req.method === "POST" && route === "/api/save-config") {
    const body = await readBody(req);
    const saved = await writeConfig(body || {});
    log(`配置已保存：engine=${saved.engine} vcn=${saved.vcn}`);
    return sendJson(res, 200, {
      ok: true,
      config: { vcn: saved.vcn, engine: saved.engine },
    });
  }

  if (req.method === "POST" && route === "/api/test") {
    const body = await readBody(req);
    const argv = buildArgv({ ...body, doctor: true });
    argv.push("--doctor");
    const result = { ok: true, logs: [] };
    const mark = logSeq;
    try {
      await captureLogs(() => runGenerator(argv));
    } catch (error) {
      result.ok = false;
      result.error = String(error?.message || error);
    }
    result.logs = logBuffer.filter((item) => item.seq > mark).map((item) => item.line);
    result.seq = logSeq;
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && route === "/api/plan") {
    const body = await readBody(req);
    const argv = buildArgv({ ...body, dryRun: true });
    const result = { ok: true, logs: [] };
    const mark = logSeq;
    try {
      await captureLogs(() => runGenerator(argv));
    } catch (error) {
      result.ok = false;
      result.error = String(error?.message || error);
    }
    result.logs = logBuffer.filter((item) => item.seq > mark).map((item) => item.line);
    result.seq = logSeq;
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && route === "/api/start") {
    const body = await readBody(req);
    const result = await handleGenerate(body || {});
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && route === "/api/stop") {
    if (job?.running) {
      job.controller.abort();
      log("已请求停止，正在结束当前分片……");
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && route === "/api/rebuild-manifest") {
    const body = await readBody(req);
    const argv = buildArgv({ ...body });
    argv.push("--rebuild-manifest");
    const result = { ok: true, logs: [] };
    const mark = logSeq;
    try {
      await captureLogs(() => runGenerator(argv));
    } catch (error) {
      result.ok = false;
      result.error = String(error?.message || error);
    }
    result.logs = logBuffer.filter((item) => item.seq > mark).map((item) => item.line);
    result.seq = logSeq;
    return sendJson(res, 200, result);
  }

  if (req.method === "GET" && route === "/api/logs") {
    const since = Number(url.searchParams.get("since") || 0);
    const lines = logBuffer.filter((item) => item.seq > since).map((item) => item.line);
    const progress = await countGenerated(defaultOutDir);
    return sendJson(res, 200, {
      lines,
      seq: logSeq,
      running: Boolean(job?.running),
      error: job?.error || "",
      generated: progress,
    });
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
}

// ---------- 启动 ----------

function openBrowser(url) {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // 打不开浏览器不影响服务，手动访问即可
  }
}

async function listen(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    handleRequest(req, res, url).catch((error) => {
      const status = Number(error?.status) || 500;
      if (!res.headersSent) sendJson(res, status, { error: String(error?.message || error) });
      else res.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const basePort = Number(process.env.ATO_TTS_PORT || 8791);
let server = null;
let usedPort = basePort;
for (let offset = 0; offset < 10; offset += 1) {
  try {
    server = await listen(basePort + offset);
    usedPort = basePort + offset;
    break;
  } catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
  }
}
if (!server) {
  console.error(`端口 ${basePort}..${basePort + 9} 都被占用，请设置 ATO_TTS_PORT 后重试。`);
  process.exit(1);
}

const url = `http://127.0.0.1:${usedPort}/`;
console.log("");
console.log("  ATO 故事书语音工具包已启动");
console.log(`  地址: ${url}`);
console.log("  关闭此窗口即可停止服务。");
console.log("");
if (!process.env.ATO_TTS_NO_OPEN) openBrowser(url);
