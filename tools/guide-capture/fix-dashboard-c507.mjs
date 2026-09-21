// 把主控台 MNEMOS_CARD_NODES 里 c5_07 的 thresholds 从 [5,9,14] 改成 [3,7,10]，
// 与 hero/index.html 的 MNEMOS 保持一致（见 check-mnemos-consistency.mjs）。
import fs from 'node:fs';

const file = 'index.html';
const before = fs.readFileSync(file, 'utf8');
const oldFragment = '"c5_07":{"nodes":["M008","M018","M028"],"thresholds":[5,9,14]}';
const newFragment = '"c5_07":{"nodes":["M008","M018","M028"],"thresholds":[3,7,10]}';

const hits = before.split(oldFragment).length - 1;
console.log(`找到 ${hits} 处待替换片段`);
if (hits !== 1) {
  console.error(hits === 0 ? '没有找到该片段，可能已被改过' : '片段不唯一，手工确认后再改');
  process.exit(1);
}

fs.writeFileSync(file, before.replace(oldFragment, newFragment), 'utf8');
console.log('已替换 c5_07 thresholds: [5,9,14] -> [3,7,10]');
