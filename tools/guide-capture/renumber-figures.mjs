// Renumber every figure caption as a single document-wide sequence (图 1, 图 2,
// …) and rebuild the screenshot index in 附录 A, so captions and the index can
// never drift apart when the guide is edited.
//
// node renumber-figures.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

// 与 build-docs.mjs 保持一致：ASCII 文件名（见那边的注释）。
const BASENAME = 'ATO-Assistant-user-guide';
const MD = path.join('D:\\desktop\\ATO_assistant\\docs\\guide', `${BASENAME}.md`);
const dry = process.argv.includes('--dry');

const lines = fs.readFileSync(MD, 'utf8').split('\n');

const figures = [];   // { imgLine, capLine, file, caption }
let lastImage = null;

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  const img = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(trimmed);
  if (img) { lastImage = { index: i, alt: img[1], file: img[2].replace(/\\/g, '/') }; continue; }
  const cap = /^\*图\s*[^*]*\*$/.exec(trimmed);
  if (cap && lastImage) {
    // caption text = the italic body, minus any existing "图 x-y：" prefix
    const body = trimmed.replace(/^\*|\*$/g, '').replace(/^图[^：]*：\s*/, '');
    figures.push({ ...lastImage, capLine: i, caption: body });
    lastImage = null;
    continue;
  }
  // The caption must be the first non-blank line after the image; any other
  // content cancels the association so a stray italic line cannot steal it.
  if (trimmed) lastImage = null;
}

console.log(`found ${figures.length} figures`);

// rewrite captions
figures.forEach((f, idx) => {
  const n = idx + 1;
  f.number = n;
  lines[f.capLine] = `*图 ${n}：${f.caption}*`;
});

// Text references like "（见下图右下）" stay untouched; only the index is rebuilt.
const idxStart = lines.findIndex((l) => /^## 附录 A\. 截图索引/.test(l));
if (idxStart < 0) { console.error('cannot find 附录 A'); process.exit(1); }
let idxEnd = idxStart + 1;
while (idxEnd < lines.length && !/^## /.test(lines[idxEnd])) idxEnd++;

const table = [
  '| 图号 | 文件 | 内容 |',
  '| --- | --- | --- |',
  ...figures.map((f, idx) => `| 图 ${idx + 1} | \`${f.file}\` | ${f.caption.replace(/\|/g, '\\|')} |`),
  '',
];
lines.splice(idxStart + 1, idxEnd - idxStart - 1, '', ...table);

const out = lines.join('\n');
if (!dry) fs.writeFileSync(MD, out, 'utf8');
console.log(`appendix A rebuilt with ${figures.length} rows${dry ? ' (dry run)' : ''}`);
for (const [i, f] of figures.entries()) console.log(`  图 ${i + 1}  ${f.file}`);
