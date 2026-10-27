const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');

const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/ato-terms.js'), 'utf8'), box);
const terms = box.window.ATO_TERMS;
const hit = (t) => /独眼|无眼|Cyclop/i.test(t.from) || /独眼|无眼|Cyclop/i.test(t.to);
console.log('== ato-terms matches:', terms.filter(hit).length);
for (const p of terms.filter(hit)) console.log(JSON.stringify(p));

const b2 = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/english-terms.js'), 'utf8'), b2);
const en = b2.window.ATO_ENGLISH_TERMS;
console.log('\n== english scoped:', JSON.stringify(en.scoped));
for (const row of en.terms) {
  if (/独眼|无眼|Cyclop/i.test(row[0]) || /独眼|无眼|Cyclop/i.test(row[1])) console.log(JSON.stringify(row));
}
