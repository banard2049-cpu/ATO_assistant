// 复刻 tools/audit-public-release.ps1 的判定，用于本地定位违规文件。
// （PowerShell 5.1 处理含中文/emoji 的文件名会 GetExtension 报错，所以用 Node 读
//  git ls-files 的 UTF-8 输出自己算。）
import fs from 'node:fs';

const MEDIA_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.svg',
  '.pdf', '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.mp4', '.webm', '.mov',
  '.zip', '.7z', '.rar', '.ttf', '.otf', '.woff', '.woff2',
]);

const BLOCKED_PATHS = [
  'data/', 'logs/', 'log/', 'tmp/', 'story/data/', 'story/data/storybook-data.js',
  'story/data/entity-index.json', 'story/audio-packs/', 'story/audio-packs/audio/manifest.js',
  'story/audio-packs/audio/manifest.json', 'supplements/', 'map/images/', 'map/tokens/',
  'record/assets/', 'story/images/battles/', 'technology/images/',
];

const BLOCKED_PATH_PATTERNS = [
  'assets/*', 'tools/bgstorybook-*.json', 'tools/*-storybook-diff.json', 'tools/ocr-*.json',
  'tools/fsadf.txt', 'tools/exploration-effect-automation-report.csv',
  'tools/exploration-effect-automation-report.md',
];

const ALLOWED_PATHS = new Set([
  'assets/ato-terms.js', 'assets/bgm/README.md', 'assets/bgm/bgm.js', 'assets/bgm/manifest.js',
  'assets/campaign-session.js', 'assets/cycle-symbols.js', 'assets/exploration-card-rules.js',
  'assets/exploration-card-resource-rules.js', 'assets/exploration-card-resources.js',
  'assets/exploration-card-tags.js', 'assets/page-focus-router.js',
  'assets/story-doom-card-data.js', 'assets/term-language.js', 'assets/update/app-version.js',
  'assets/update/update-check.css', 'assets/update/update-check.js',
  'tools/packaging/android/app/src/main/res/drawable-nodpi/app_icon.jpg',
]);

const BLOCKED_NAME_PATTERNS = [
  'php_errors.log', 'error_log', '*.backup', '*.backup.*', '*.bak', '*.atoback',
  '*.atoback.partial', '*.atopack', '*.atopack.partial', '*.tmp', '*.tmp.*', '*.log', '*.lock',
];

// PowerShell -like：*.ext 形式；只用到后缀通配与精确名
function like(value, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

// 沙箱禁止子进程管道，所以文件清单由外部先落盘，这里只读文件：
//   git ls-files > tmp/rel/git-files.txt
const listFile = process.argv[2] || 'tmp/rel/git-files.txt';
const files = fs.readFileSync(listFile, 'utf8')
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

const violations = [];
for (const file of files) {
  const normalized = file.replace(/\\/g, '/');
  if ([...ALLOWED_PATHS].some((p) => normalized.toLowerCase() === p.toLowerCase())) continue;

  const leaf = normalized.split('/').pop();
  const dot = leaf.lastIndexOf('.');
  const extension = dot >= 0 ? leaf.slice(dot).toLowerCase() : '';

  const reasons = [];
  if (MEDIA_EXTENSIONS.has(extension)) reasons.push(`媒体/文档扩展名 ${extension}`);
  for (const p of BLOCKED_PATHS) {
    if (normalized.toLowerCase().startsWith(p.toLowerCase())) { reasons.push(`路径前缀 ${p}`); break; }
  }
  for (const p of BLOCKED_PATH_PATTERNS) {
    if (like(normalized, p)) { reasons.push(`路径模式 ${p}`); break; }
  }
  for (const p of BLOCKED_NAME_PATTERNS) {
    if (like(leaf, p)) { reasons.push(`文件名模式 ${p}`); break; }
  }
  if (reasons.length) violations.push({ file: normalized, reasons });
}

console.log(`git ls-files 共 ${files.length} 个文件`);
console.log(`违规 ${violations.length} 个：`);
for (const v of violations) console.log(`  ${v.file}\n      ← ${v.reasons.join('；')}`);
process.exit(violations.length ? 1 : 0);
