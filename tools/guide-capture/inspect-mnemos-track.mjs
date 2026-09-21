// Inspect the MNEMOS track data: for every 回忆卡, where do its memory nodes sit
// on the 1..10 track, and are all of them M-prefixed?
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('hero/index.html', 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf('const MNEMOS = ');
const open = src.slice(start).search(/[[{]/);
const from = start + open;
let depth = 0;
let literal = null;
for (let i = from; i < src.length; i += 1) {
  const ch = src[i];
  if (ch === '{' || ch === '[') depth += 1;
  else if (ch === '}' || ch === ']') {
    depth -= 1;
    if (!depth) { literal = src.slice(from, i + 1); break; }
  }
}
const MNEMOS = vm.runInNewContext(`(${literal})`, {});

const mPrefixed = [];   // nodes not starting with M
const thresholdShapes = new Map();
let total = 0;

for (const [cycle, cards] of Object.entries(MNEMOS)) {
  for (const card of cards) {
    total += 1;
    const shape = JSON.stringify(card.thresholds);
    thresholdShapes.set(shape, (thresholdShapes.get(shape) || 0) + 1);
    (card.nodes || []).forEach((n, idx) => {
      if (!String(n).startsWith('M')) mPrefixed.push(`${cycle}/${card.id} node#${idx}="${n}" (格 ${card.thresholds[idx]})`);
    });
  }
}

console.log(`回忆卡总数: ${total}`);
console.log('thresholds 形状分布:');
for (const [shape, n] of [...thresholdShapes].sort((a, b) => b[1] - a[1])) console.log(`  ${shape}  ×${n}`);
console.log(`\n非 M 前缀节点数: ${mPrefixed.length}`);
for (const row of mPrefixed.slice(0, 20)) console.log('  ' + row);

// 例：一张卡推到第 5 格时，原实现（排除节点格）会数出几格
const sample = MNEMOS.c1[0];
console.log(`\n示例卡 ${sample.id} (${sample.zh}): thresholds=${JSON.stringify(sample.thresholds)} nodes=${JSON.stringify(sample.nodes)}`);
for (const progress of [1, 3, 5, 7, 10]) {
  let count = 0;
  for (let i = 1; i <= progress; i++) {
    const nodeIndex = sample.thresholds.indexOf(i);
    if (nodeIndex >= 0 && String(sample.nodes[nodeIndex] || '').startsWith('M')) continue;
    count += 1;
  }
  console.log(`  progress=${String(progress).padStart(2)} → 旧实现计 ${count} 格（分子/分母口径：${count}/${progress}）`);
}
