// 主控台的 MNEMOS_CARD_NODES 与 hero 页的 MNEMOS 必须描述同一批回忆卡：
// 逐卡比较 nodes / thresholds，并列出偏离官方节点位置的条目。
// 官方 fmnemos 表里标准卡是 3/7/10（10 格轨道），唯一例外是 c5_07：官方给 5/9/14（14 格）。
import fs from 'node:fs';
import vm from 'node:vm';

const STANDARD = '[3,7,10]';
const EXCEPTIONS = { c5_07: '[5,9,14]' };
const expectedShape = id => EXCEPTIONS[id] || STANDARD;

function literalFrom(source, name) {
  const start = source.indexOf(`const ${name} = `);
  if (start < 0) throw new Error(`缺少常量 ${name}`);
  const open = source.slice(start).search(/[[{]/);
  let depth = 0;
  for (let i = start + open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (!depth) return source.slice(start + open, i + 1);
    }
  }
  throw new Error(`常量 ${name} 没有闭合`);
}

const heroSrc = fs.readFileSync('hero/index.html', 'utf8').replace(/\r\n/g, '\n');
const dashSrc = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

const heroMnemos = vm.runInNewContext(`(${literalFrom(heroSrc, 'MNEMOS')})`, {});
const dashNodes = vm.runInNewContext(`(${literalFrom(dashSrc, 'MNEMOS_CARD_NODES')})`, {});

// 摊平成 id -> {nodes, thresholds}
const heroCards = new Map();
for (const cards of Object.values(heroMnemos)) {
  for (const card of cards) heroCards.set(card.id, { nodes: card.nodes, thresholds: card.thresholds });
}

console.log(`hero 回忆卡: ${heroCards.size}  主控台 MNEMOS_CARD_NODES: ${Object.keys(dashNodes).length}`);

const shapes = new Map();
for (const [, card] of heroCards) {
  const key = JSON.stringify(card.thresholds);
  shapes.set(key, (shapes.get(key) || 0) + 1);
}
console.log('hero thresholds 分布:', [...shapes].map(([k, v]) => `${k}×${v}`).join('  '));

const badShapes = [...heroCards].filter(([id, c]) => JSON.stringify(c.thresholds) !== expectedShape(id));
console.log(`hero 偏离官方节点位置的卡: ${badShapes.length}` + (badShapes.length ? ' → ' + badShapes.map(([id, c]) => `${id}:${JSON.stringify(c.thresholds)}`).join(', ') : ''));

const dashBad = Object.entries(dashNodes).filter(([id, c]) => JSON.stringify(c.thresholds) !== expectedShape(id));
console.log(`主控台偏离官方节点位置的卡: ${dashBad.length}` + (dashBad.length ? ' → ' + dashBad.map(([id, c]) => `${id}:${JSON.stringify(c.thresholds)}`).join(', ') : ''));

const mismatches = [];
for (const [id, heroCard] of heroCards) {
  const dash = dashNodes[id];
  if (!dash) { mismatches.push(`${id}: 主控台缺这张卡`); continue; }
  if (JSON.stringify(dash.nodes) !== JSON.stringify(heroCard.nodes)) {
    mismatches.push(`${id}: nodes hero=${JSON.stringify(heroCard.nodes)} 主控台=${JSON.stringify(dash.nodes)}`);
  }
  if (JSON.stringify(dash.thresholds) !== JSON.stringify(heroCard.thresholds)) {
    mismatches.push(`${id}: thresholds hero=${JSON.stringify(heroCard.thresholds)} 主控台=${JSON.stringify(dash.thresholds)}`);
  }
}
for (const id of Object.keys(dashNodes)) {
  if (!heroCards.has(id)) mismatches.push(`${id}: hero 页缺这张卡`);
}

console.log(`\n两表差异: ${mismatches.length}`);
for (const row of mismatches) console.log('  ' + row);
console.log('\n一致性: ' + (mismatches.length === 0 ? 'OK' : 'FAIL'));
process.exit(mismatches.length === 0 && dashBad.length === 0 ? 0 : 1);
