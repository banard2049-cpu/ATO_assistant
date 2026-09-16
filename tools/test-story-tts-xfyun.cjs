// 验证 story/assets/app.js 里给讯飞在线语音合成用的浏览器端签名逻辑。
// 默认只做离线比对（不需要密钥）；加 --live 会真的用该 URL 连一次讯飞。
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const rootDir = path.resolve(__dirname, "..");
const appPath = path.join(rootDir, "story", "assets", "app.js");
const configPath = path.join(rootDir, "tools", "xfyun-long-tts.config.json");
const host = "tts-api.xfyun.cn";
const ttsPath = "/v2/tts";
const fixedDate = "Mon, 01 Jan 2024 00:00:00 GMT";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// 从 app.js 原样取出浏览器端的签名函数，放进沙箱执行。
const source = fs.readFileSync(appPath, "utf8");
const start = source.indexOf("function bytesToBase64(");
const end = source.indexOf("function isXfyunConfigured(");
if (start === -1 || end === -1) fail("在 app.js 中找不到讯飞签名函数");
const snippet = source.slice(start, end);

// cryptoObject 用来模拟不同的运行环境：安全上下文（https/localhost）有
// crypto.subtle，明文 HTTP 的局域网地址没有 —— 后者必须走 app.js 里的纯 JS 兜底。
function makeSandbox(dateClass, cryptoObject = crypto.webcrypto) {
  const context = {
    TextEncoder,
    btoa,
    URLSearchParams,
    Date: dateClass,
    window: { crypto: cryptoObject },
    console,
  };
  vm.createContext(context);
  vm.runInContext(
    `${snippet}\nthis.__buildXfyunAuthUrl = buildXfyunAuthUrl;\nthis.__hmacSha256Base64 = hmacSha256Base64;`,
    context
  );
  return context;
}

// 固定时间：用于和独立算出的期望值比对。真实时间：用于实际连接。
const fixedSandbox = makeSandbox(class extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixedDate]));
  }
});
const liveSandbox = makeSandbox(Date);
// 明文 HTTP（局域网地址）：window.crypto 存在但没有 subtle。
const noSubtleSandbox = makeSandbox(class extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixedDate]));
  }
}, {});
// 极端情况：连 window.crypto 都没有。
const noCryptoAtAllSandbox = makeSandbox(class extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixedDate]));
  }
}, undefined);

function expectedUrlFor(date, apiKey, apiSecret) {
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${ttsPath} HTTP/1.1`;
  const signature = crypto.createHmac("sha256", apiSecret).update(signatureOrigin).digest("base64");
  const authorizationOrigin =
    `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin, "utf8").toString("base64");
  return `wss://${host}${ttsPath}?${new URLSearchParams({ host, date, authorization })}`;
}

async function liveCheck(url, config) {
  const vcn = config.vcn || "x4_lingbosong_bad_talk";
  console.log(`正在用浏览器端签名实测连接（vcn=${vcn}）…`);
  const result = await new Promise((resolve) => {
    const socket = new WebSocket(url);
    const sizes = [];
    let settled = false;
    const timer = setTimeout(() => finish(new Error("超时")), 40000);
    function finish(error, size) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // 忽略关闭异常
      }
      if (error) resolve({ ok: false, message: String(error.message || error) });
      else resolve({ ok: true, size });
    }
    socket.onopen = () => {
      socket.send(JSON.stringify({
        common: { app_id: config.appId },
        business: {
          aue: "lame",
          sfl: 1,
          auf: "audio/L16;rate=16000",
          vcn,
          tte: "UTF8",
          speed: 50,
          volume: 50,
          pitch: 50,
        },
        data: { status: 2, text: Buffer.from("浏览器端签名实测。", "utf8").toString("base64") },
      }));
    };
    socket.onmessage = (event) => {
      const frame = JSON.parse(typeof event.data === "string" ? event.data : "{}");
      if (Number(frame.code) !== 0) {
        finish(new Error(`code=${frame.code} ${frame.message || ""}`));
        return;
      }
      if (frame?.data?.audio) sizes.push(Buffer.from(frame.data.audio, "base64").length);
      if (Number(frame?.data?.status) === 2) finish(null, sizes.reduce((sum, n) => sum + n, 0));
    };
    socket.onerror = () => finish(new Error("连接失败"));
    socket.onclose = (event) => {
      if (!settled) finish(new Error(`提前关闭 code=${event.code}`));
    };
  });

  if (!result.ok) fail(`真实连接失败：${result.message}`);
  console.log(`PASS: 浏览器端签名通过讯飞鉴权，收到 ${result.size} 字节音频`);
}

async function run() {
  const testKey = "test_api_key_32_chars_padding_xx";
  const testSecret = "test_api_secret_32_chars_padding";

  const actualUrl = await fixedSandbox.__buildXfyunAuthUrl(host, ttsPath, testKey, testSecret);
  const expectedUrl = expectedUrlFor(fixedDate, testKey, testSecret);
  if (actualUrl !== expectedUrl) {
    fail(`签名 URL 不一致\n  实际: ${actualUrl}\n  期望: ${expectedUrl}`);
  }
  console.log("PASS: 浏览器端签名与文档算法一致（含 GET 请求行）");

  const authorization = new URL(actualUrl).searchParams.get("authorization");
  const decoded = Buffer.from(authorization, "base64").toString("utf8");
  if (!/^api_key=".+", algorithm="hmac-sha256", headers="host date request-line", signature=".+="$/.test(decoded)) {
    fail(`authorization 格式不正确: ${decoded}`);
  }
  console.log("PASS: authorization 头部格式正确");

  // 已知向量：单独盯住 HMAC 实现本身，与 URL 拼装无关。
  // 第二条消息超过 64 字节，覆盖多块 + 填充分支。
  const vectors = [
    ["key", "The quick brown fox jumps over the lazy dog"],
    [testSecret, `host: ${host}\ndate: ${fixedDate}\nGET ${ttsPath} HTTP/1.1${"x".repeat(120)}`],
  ];
  for (const [keyText, messageText] of vectors) {
    const expected = crypto.createHmac("sha256", keyText).update(messageText).digest("base64");
    for (const [label, sandbox] of [["Web Crypto", fixedSandbox], ["纯 JS 兜底", noSubtleSandbox]]) {
      const actual = await sandbox.__hmacSha256Base64(keyText, messageText);
      if (actual !== expected) {
        fail(`${label} 的 HMAC-SHA256 与 Node 不一致（${messageText.length} 字节消息）\n  实际: ${actual}\n  期望: ${expected}`);
      }
    }
  }
  console.log("PASS: HMAC-SHA256 已知向量通过（Web Crypto 与纯 JS 兜底结果一致，含 >64 字节多块）");

  // 明文 HTTP（http://<局域网IP>:8793/）里没有 crypto.subtle，
  // 以前这里会直接抛错、讯飞合成在局域网地址上必然失败。
  for (const [label, sandbox] of [
    ["window.crypto 没有 subtle", noSubtleSandbox],
    ["完全没有 window.crypto", noCryptoAtAllSandbox],
  ]) {
    const fallbackUrl = await sandbox.__buildXfyunAuthUrl(host, ttsPath, testKey, testSecret);
    if (fallbackUrl !== expectedUrl) {
      fail(`${label} 时签名 URL 不一致\n  实际: ${fallbackUrl}\n  期望: ${expectedUrl}`);
    }
    console.log(`PASS: ${label} 也能算出与文档算法一致的 URL`);
  }

  if (!process.argv.includes("--live")) {
    console.log("（跳过真实连接；加 --live 可实测，会消耗 1 次调用额度）");
    return;
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    console.log("（没有密钥配置，跳过真实连接）");
    return;
  }
  if (!config.appId || !config.apiKey || !config.apiSecret) {
    console.log("（配置里没有完整密钥，跳过真实连接）");
    return;
  }

  const liveUrl = await liveSandbox.__buildXfyunAuthUrl(host, ttsPath, config.apiKey, config.apiSecret);
  await liveCheck(liveUrl, config);
}

run().catch((error) => fail(String(error?.message || error)));
