const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createEngine } = require(path.join(__dirname, '..', 'tests', 'helpers', 'term-language.cjs'));
const root = path.join(__dirname, '..');
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/ato-terms.js'), 'utf8').replace(/\r\n/g, '\n'), box);
const terms = box.window.ATO_TERMS;
const engine = createEngine(terms, true);
const fan = createEngine(terms, false);
const bossScope = '#enemyTracks, .boss-search-results, #boss-title';
const samples = [
  ['独眼巨人', []],
  ['独眼巨人：同盟（+2 或更好）', []],
  ['独眼巨人的许珀里翁神殿', []],
  ['独眼巨人的，神器', []],
  ['独眼巨人装备', []],
  ['独眼巨人镰状剑', []],
  ['独眼巨人甲胄', []],
  ['独眼巨人核心', []],
  ['独眼巨人 等级 2', []],
  ['等级 2 的独眼巨人战斗', []],
  ['核心 · 独眼巨人', []],
  ['与独眼巨人结盟', []],
  ['独眼巨人', [bossScope]],
  ['独眼巨人核心', [bossScope]],
  ['Cyclops Trap', ['[data-term-scope~="survey-record"]']],
];
for (const [s, scopes] of samples) {
  console.log(JSON.stringify(s), 'scopes=' + JSON.stringify(scopes), '->', JSON.stringify(engine.translate(s, scopes)));
}
console.log('fan 独眼巨人 ->', JSON.stringify(fan.translate('独眼巨人')));
