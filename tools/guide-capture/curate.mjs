// Build the guide's final image set from the raw captures: keep the good ones,
// rename them by chapter, and drop duplicates, blank/black frames and error
// overlays. Each entry declares the viewport the capture must have, so a stale
// file from an earlier run is rejected instead of silently included.
//
// Usage: node curate.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const DIR = 'D:\\desktop\\ATO_assistant\\docs\\guide\\images';
const RAW = 'D:\\desktop\\ATO_assistant\\tmp\\raw-captures';
const dry = process.argv.includes('--dry');

// source, final name, required [width,height]
const plan = [
  ['01-login.png', '02-login.png', [1600, 1000]],
  ['02-login-mobile.png', '03-login-mobile.png', [430, 860]],
  ['03-register.png', '04-register.png', [1600, 1000]],
  ['04-dashboard.png', '10-dashboard.png', [1600, 1000]],
  ['05-dashboard-bottom.png', '12-dashboard-bottom.png', [1600, 1000]],
  ['07-dashboard-mobile.png', '13-dashboard-mobile.png', [430, 900]],
  ['09-aibp-mobile.png', '16-aibp-mobile.png', [430, 900]],
  ['10-aibp.png', '20-aibp.png', [1600, 1000]],
  ['11-aibp-token.png', '21-aibp-token.png', [1600, 1000]],
  ['20-map.png', '30-map.png', [1600, 1000]],
  ['21-map-explore.png', '31-map-explore.png', [1600, 1000]],
  ['30-hero.png', '40-hero.png', [1600, 1000]],
  ['32-hero-add.png', '41-hero-add.png', [1600, 1000]],
  ['40-tech.png', '50-tech.png', [1600, 1000]],
  ['41-tech-cycle3.png', '51-tech-cycle3.png', [1600, 1000]],
  ['50-record.png', '60-record.png', [1600, 1000]],
  ['52-record-resource.png', '61-record-resource.png', [1600, 1000]],
  ['53-record-adventure.png', '62-record-adventure.png', [1600, 1000]],
  ['60-story.png', '70-story.png', [1600, 1000]],
  ['62-story-pick.png', '71-story-battle.png', [1600, 1000]],
  ['63-story-text.png', '72-story-text.png', [1600, 1000]],
];

// Captures deliberately not published, with the reason kept for the write-up.
const dropped = [
  ['05b-dashboard-bottom.png', '与 05-dashboard-bottom 同图（页面无可滚动余量）'],
  ['06-dashboard-bottom2.png', '与 05-dashboard-bottom 同图'],
  ['08-dashboard-account.png', '与 05b 同图'],
  ['31-hero-bottom.png', '与 30-hero 同图'],
  ['51-record-bottom.png', '与 50-record 同图'],
  ['70-ss.png', '第二屏为空状态（黑色底 + 单块图），无教学价值'],
  ['71-ss-story.png', '第二屏为空状态（全黑）'],
  ['61-story-panel.png', '捕获时 Chrome 崩溃（STATUS_ACCESS_VIOLATION）'],
  ['64-story-tts.png', '驱动错误条覆盖画面'],
];

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

fs.mkdirSync(RAW, { recursive: true });
const kept = [];
const problems = [];

for (const [src, dest, [w, h]] of plan) {
  const from = fs.existsSync(path.join(DIR, src)) ? path.join(DIR, src) : path.join(RAW, src);
  if (!fs.existsSync(from)) { problems.push(`${src}: missing`); continue; }
  const size = pngSize(from);
  if (!size) { problems.push(`${src}: not a PNG`); continue; }
  if (size[0] !== w || size[1] !== h) {
    problems.push(`${src}: viewport ${size[0]}x${size[1]}, expected ${w}x${h}`);
    continue;
  }
  if (!dry) {
    const bytes = fs.statSync(from).size;
    fs.copyFileSync(from, path.join(DIR, dest));
    if (path.dirname(from) === DIR && src !== dest) fs.rmSync(from, { force: true });
    kept.push(`${src} -> ${dest}  ${size[0]}x${size[1]}  ${(bytes / 1024).toFixed(0)}KB`);
    continue;
  }
  kept.push(`${src} -> ${dest}  ${size[0]}x${size[1]}  ${(fs.statSync(from).size / 1024).toFixed(0)}KB`);
}

if (!dry) {
  // Move everything already published but not in the plan out of the way.
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith('.png')) continue;
    if (plan.some(([, dest]) => dest === f)) continue;
    fs.renameSync(path.join(DIR, f), path.join(RAW, f));
  }
  for (const [f, why] of dropped) {
    const p = path.join(DIR, f);
    if (fs.existsSync(p)) fs.renameSync(p, path.join(RAW, f));
    else if (!fs.existsSync(path.join(RAW, f))) problems.push(`${f}: not found to drop (${why})`);
  }
}

console.log('KEPT:');
for (const k of kept) console.log('  ' + k);
console.log('\nPROBLEMS:');
for (const p of problems) console.log('  ' + p);
console.log('\nDROPPED:');
for (const [f, why] of dropped) console.log(`  ${f} — ${why}`);
console.log('\nfinal image count: ' + fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).length);
