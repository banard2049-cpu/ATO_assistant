// Confirm the likelihood fix is in place in hero/index.html: two-level ranking
// with 回忆卡张数 first and 轨道已推进格数 second.
import fs from 'node:fs';

const src = fs.readFileSync('hero/index.html', 'utf8').replace(/\r\n/g, '\n');
const names = ['heroMnemosCardCount', 'heroMnemosTrackCount', 'computeLikelihood'];

let ok = true;
for (const name of names) {
  const re = new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm');
  const m = src.match(re);
  if (m) console.log(`ok    ${name}  (${m[0].split('\n').length} 行)`);
  else { console.log(`MISS  ${name}`); ok = false; }
}

for (const stale of ['heroMnemosNodeCount', 'heroMnemosLitNodeCount']) {
  const found = new RegExp(stale).test(src);
  console.log(`${found ? 'FAIL' : 'ok  '} 旧函数 ${stale} 残留: ${found}`);
  if (found) ok = false;
}

const body = src.match(/function computeLikelihood\(\)[^]*?\n    }/)[0];
const cardIdx = body.indexOf('heroMnemosCardCount');
const trackIdx = body.indexOf('heroMnemosTrackCount');
const cardsFirst = cardIdx >= 0 && trackIdx > cardIdx;
console.log(`${cardsFirst ? 'ok  ' : 'FAIL'} computeLikelihood 先卡后轨道: ${cardsFirst}`);
if (!cardsFirst) ok = false;

// 次判据必须逐格累加 mnemosProgress，且不能再按 thresholds 长度当轨道长度。
const trackFn = src.match(/const MNEMOS_TRACK_LENGTH = (\d+);/);
const hasTrackConst = !!trackFn;
console.log(`${hasTrackConst ? 'ok  ' : 'FAIL'} 轨道长度常量存在（固定 10 格）: ${hasTrackConst ? trackFn[1] : 'missing'}`);
if (!hasTrackConst) ok = false;

const misread = /thresholds \|\| \[\]\)\.length/.test(src);
console.log(`${misread ? 'FAIL' : 'ok  '} 没有再把 thresholds 数组长度当轨道长度: ${!misread}`);
if (misread) ok = false;

process.exit(ok ? 0 : 1);
