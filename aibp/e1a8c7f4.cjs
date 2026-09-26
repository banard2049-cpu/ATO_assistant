// Run locally when the private Helios source images change. Never commit them.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assets = require("./b4d7e218.js");

const project = path.resolve(__dirname, "..");
const sourceRoot = path.join(project, "official-assets", "6e3c4f89");
const outputRoot = path.join(__dirname, "ps", "other", "3b6e9d20");
const sources = [];

function collect(directory, relative) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (relative === "ENVELOPES" && entry.isDirectory() && ["S", "U"].includes(entry.name)) continue;
    const next = path.join(directory, entry.name);
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) collect(next, name);
    else if (/\.(?:jpe?g|png)$/i.test(entry.name)) sources.push({ file: next, name });
  }
}

for (const folder of ["ENVELOPES", "9a10b8d7"]) {
  const directory = path.join(sourceRoot, folder);
  if (!fs.existsSync(directory)) throw new Error(`缺少赫利俄斯原图：${directory}`);
  collect(directory, folder);
}

fs.mkdirSync(outputRoot, { recursive: true });
const names = new Map();
for (const source of sources) {
  const target = path.join(__dirname, assets.path(source.name));
  if (names.has(target)) throw new Error(`加密文件名冲突：${source.name} / ${names.get(target)}`);
  names.set(target, source.name);
  const plain = fs.readFileSync(source.file);
  const nonce = crypto.randomBytes(12);
  const cipher = assets.transform(plain, nonce);
  const packed = Buffer.concat([Buffer.from(assets.magic), nonce, Buffer.from(cipher)]);
  if (!crypto.timingSafeEqual(crypto.createHash("sha256").update(assets.decode(packed)).digest(),
    crypto.createHash("sha256").update(plain).digest())) throw new Error(`加密校验失败：${source.name}`);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, packed);
  fs.renameSync(temporary, target);
}
// 只提交路径名单；加密内容继续由 atopack 分发。
fs.writeFileSync(path.join(outputRoot, "catalog.json"), JSON.stringify({
  version: 1,
  targets: [...names.keys()].map(target => path.posix.join("3b6e9d20", path.basename(target))).sort(),
}, null, 2) + "\n");
console.log(`已加密 ${sources.length} 张赫利俄斯图片到 ${outputRoot}`);
