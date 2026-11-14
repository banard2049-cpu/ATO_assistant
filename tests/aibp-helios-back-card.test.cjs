// 赫利俄斯的背面大卡不再按等级顶掉正面面板：面板永远取正面，背面作为可选的 TR O
// 特性卡出现在 Trait 选择里（默认不显示；其余始徒的反面大卡已按反面首次出现的等级命名）。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('aibp/index.html').replace(/\r\n/g, '\n');

const sandbox = {
  window: {
    HeliosAssets: {
      path: (name) => `ps/other/3b6e9d20/${name}.bin`,
      resolve: (src) => src,
    },
  },
};
vm.runInNewContext(read('aibp/c9f0a6d3.js'), sandbox, { filename: 'c9f0a6d3.js' });
const helios = sandbox.window.HeliosConfig;

test('Helios keeps the front panel at every level', () => {
  for (const mode of ['normal', 'c4']) {
    for (const level of [1, 4, 5, 6, 10]) {
      assert.equal(helios.panelFor(mode, level), helios.modes[mode].panel, `${mode} L${level}`);
    }
  }
  assert.notEqual(helios.modes.normal.panel, helios.modes.normal.panelHigh,
    '背面大卡与正面大卡必须是两张图，否则这个用例没有意义');
});

test('the Helios back card is offered as a selectable TR O card', () => {
  const candidates = helios.traitCandidates('normal');
  assert.equal(candidates.length, 1);
  const [card] = candidates;
  assert.equal(card.level, 'O');
  assert.equal(card.index, 1);
  assert.equal(card.src, helios.modes.normal.panelHigh);
  assert.equal(card.rotate, -90, '背面图是横向卡旋转 90° 存放的，显示时要转回来');
  // candidateFor 每次按卡面重建条目，这里比对内容而不是引用。
  const found = helios.candidateFor('normal', { level: 'O', index: 1 });
  assert.equal(found?.src, card.src);
  assert.equal(found?.rotate, card.rotate);
  assert.equal(helios.candidateFor('normal', { level: 'O', index: 2 }), null);
  assert.equal(helios.candidateFor('normal', { level: 'O', index: 1, scope: 'c45-common' }), null,
    '带 scope 的卡不走配置');
});

test('the dashboard no longer swaps the panel and lists the back card instead', () => {
  // 面板只看模式，不再看等级。
  assert.doesNotMatch(source, /panelFor\(heliosMode\(\), currentApostleLevel\(\)\)/);
  assert.match(source, /window\.HeliosConfig\.panelFor\(heliosMode\(\)\)/);
  // 隐藏 BOSS 的特性列表由配置给出，背面大卡因此进得了 Trait 选择。
  assert.match(source, /if \(name === "HELIOS"\) return window\.HeliosConfig\.traitCandidates\(heliosMode\(\)\);/);
  // 卡图和列表两处都问配置，列表里用外层容器把旋转转回来。
  assert.match(source, /name === "HELIOS"\s*\n\s*\? window\.HeliosConfig\.candidateFor\(heliosMode\(\), card\) : null;/);
  assert.match(source, /\.rotated-card-thumb \{/);
  assert.match(source, /className = "rotated-card-thumb"/);
  // 面板用的旧旋转样式已随行为一起移除。
  assert.doesNotMatch(source, /rotated-panel/);
});
