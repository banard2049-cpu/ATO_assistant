const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const rules = require('../aibp/boss-trait-rules.js');
const data = require('../aibp/boss-levels-data.js');
const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const names = state => state.active.map(trait => trait.title);

test('all 21 Bosses and 182 recorded levels resolve additions and cancellations without mutating source data', () => {
  const before = JSON.stringify(data);
  for (const boss of Object.values(data.bosses)) for (const row of Object.values(boss.levels)) {
    const state = rules.stateFor(boss.id, row.level, data);
    assert.equal(state.available, true, `${boss.id}/${row.level}`);
    assert.equal(new Set(names(state)).size, names(state).length);
    assert.ok(names(state).every(title => !state.removed.includes(title)));
    assert.deepEqual(state, rules.stateFor(boss.id, row.level, data));
  }
  assert.equal(JSON.stringify(data), before);
  assert.equal(rules.stateFor('BLACKBEAK', 9, data).available, false);
});

test('embedded traits are removed at their printed thresholds and restore at lower levels', () => {
  for (const [boss, rows] of Object.entries(rules.removals)) for (const [minimum, title] of rows) {
    for (const row of Object.values(data.bosses[boss].levels)) {
      if (row.level < minimum) continue;
      const state = rules.stateFor(boss, row.level, data);
      assert.ok(!names(state).includes(title), `${boss}/${row.level}/${title}`);
      assert.ok(state.removed.includes(title));
    }
  }
  for (const [boss, level, title] of [['HEKATON', 1, '善意上门'], ['DRAGON_OF_PHOBOS', 3, '以真还真'],
    ['DRAGON_OF_PHOBOS', 4, '以假还真'], ['UR_FLEECE', 2, '凡性柴薪'], ['UR_FLEECE', 7, 'Deeper Depths']]) {
    assert.ok(names(rules.stateFor(boss, level, data)).includes(title));
  }
  assert.ok(!names(rules.stateFor('UR_FLEECE', 3, data)).includes('凡性柴薪'));
  assert.ok(!names(rules.stateFor('UR_FLEECE', 8, data)).includes('Deeper Depths'));
});

test('removed standalone cards cannot survive explicit old selections; custom cards stay independent', () => {
  for (const [boss, level, card] of [
    ['DAHAKA', 2, { level: 'O', index: 1 }], ['DRAGON_OF_PHOBOS', 4, { level: 'I', index: 2 }],
    ['UR_FLEECE', 2, { level: 'I', index: 2 }], ['UR_FLEECE', 3, { level: 'I', index: 1 }],
    ['TITAN_X', 2, { level: 'I', index: 1 }],
  ]) {
    assert.equal(rules.isRemoved(boss, level - 1, card), false);
    for (let higher = level; higher <= 9; higher++) assert.equal(rules.isRemoved(boss, higher, card), true);
    assert.equal(rules.isRemoved(boss, 9, { ...card, scope: 'custom' }), false);
    assert.equal(rules.defaultShown(boss, 9, card), false);
  }
  assert.equal(rules.defaultShown('DAHAKA', 1, { level: 'O', index: 1 }), true);
  assert.equal(rules.defaultShown('CHIMERA_METASTASIOS', 9, { level: 'X', index: 1 }), false);
  assert.equal(rules.defaultShown('DEMIDJINN', 9, { level: 'IV', index: 1 }), false);
});

test('Babel adds the shared bones trait at II, without granting it to other Bosses', () => {
  assert.deepEqual(rules.additionalCards('THE_BABELIAN_LUNACY', 1), []);
  const [card] = rules.additionalCards('THE_BABELIAN_LUNACY', 2);
  assert.equal(rules.defaultShown('THE_BABELIAN_LUNACY', 2, card), true);
  assert.equal(rules.defaultShown('DAHAKA', 2, card), null);
  assert.ok(fs.existsSync(path.join(__dirname, '../aibp/ps/other/trait/C45_COMMON_TR_002.jpg')));
});

test('trait tokens follow level and manual cancellation; per-hit minimum is displayed and End of Hope restores', () => {
  for (const boss of ['HERMESIAN_PURSUER', 'DAHAKA', 'TITAN_X', 'THE_NIETZSCJEAN', 'UR_FLEECE']) {
    const one = rules.tokenEffects(boss, 1, data, {}).filter(effect => effect.count);
    assert.equal(one.length, ['UR_FLEECE', 'THE_NIETZSCJEAN'].includes(boss) ? 1 : 2);
    assert.ok(rules.tokenEffects(boss, 2, data, {}).every(effect => effect.count === 0));
    const title = rules.effects.find(effect => effect.apostle === boss).title;
    const hidden = { hiddenTraits: [rules.ruleKey(title)] };
    assert.ok(rules.tokenEffects(boss, 1, data, hidden).every(effect => effect.count === 0));
    if (['HERMESIAN_PURSUER', 'DAHAKA', 'TITAN_X'].includes(boss)) {
      assert.ok(one.some(effect => effect.file === 'DA-.png' && effect.perHit));
      assert.ok(!names(rules.stateFor(boss, 1, data)).includes('希望断绝'));
      assert.ok(names(rules.stateFor(boss, 1, data, hidden)).includes('希望断绝'));
      assert.ok(rules.stateFor(boss, 1, data).reminders.some(text => text.includes('最低为 1')));
    }
  }
  assert.ok(rules.tokenEffects('TITAN_X', 1, data, { special: { titanX: { group: {} } } }).every(effect => effect.count === 0));
  assert.equal(rules.isRemoved('TITAN_X', 1, { level: 'I', index: 1 }, true), true);
});

test('manual card hiding disables only its own automatic effect', () => {
  for (const [boss, key] of [['UR_FLEECE', 'apostle-I-2-jpg'], ['TITAN_X', 'apostle-I-1-jpg']]) {
    assert.ok(rules.tokenEffects(boss, 1, data, { hiddenTraits: [key] }).every(effect => effect.count === 0));
  }
});

test('retired Oracle IV card is excluded even when an old image index still lists it', () => {
  for (let level = 1; level <= 9; level++) {
    assert.equal(rules.isRemoved('HYPERTIME_ORACLE', level, { level: 'IV', index: 1 }), true);
    assert.equal(rules.defaultShown('HYPERTIME_ORACLE', level, { level: 'IV', index: 1 }), false);
    assert.equal(rules.isRemoved('HYPERTIME_ORACLE', level, { level: 'V', index: 1 }), false);
  }
});

test('AI button opens the current level summary in a dialog, including cancellation and unavailable levels', () => {
  assert.match(source, /id="scryAiButton"[^]*?id="traitLevelButton"[^]*?<\/div>/);
  assert.doesNotMatch(source, /<details[^>]*id="traitLevelSummary"/);
  assert.match(source, /id="traitLevelDialog"[^]*?id="traitLevelSummary"[^]*?<\/dialog>/);
  const box = { children: [], replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); } };
  const document = { getElementById: id => id === 'traitLevelSummary' ? box : null,
    createElement: tag => ({ tag, textContent: '' }) };
  rules.renderSummary(document, 'UR_FLEECE', 1, data, {});
  assert.ok(box.children.some(item => item.textContent.includes('生效：') && item.textContent.includes('只是一段回忆')));
  rules.renderSummary(document, 'UR_FLEECE', 3, data, {});
  assert.ok(box.children.some(item => item.textContent.includes('移除／禁用：') && item.textContent.includes('只是一段回忆')));
  assert.ok(!box.children.some(item => item.textContent.startsWith('生效：') && item.textContent.includes('只是一段回忆')));
  assert.ok(box.children[0].textContent.includes('III'));
  rules.renderSummary(document, 'BLACKBEAK', 9, data, {});
  assert.equal(box.children.length, 1);
  assert.ok(box.children[0].textContent.includes('暂无'));
});

test('old Nietzsche DA-minus migrates before merging, preserving manual counts and position', () => {
  let sequence = 0;
  const ctx = vm.createContext({ nonStackingTokenFiles: new Set(), createTokenStackId: () => `id-${++sequence}`,
    clampTokenCount: count => Math.max(0, Math.floor(Number(count) || 0)) });
  for (const name of ['isPlainObject', 'isCriticalMassStack', 'isPerHitTokenStack', 'tokenMergeKey', 'tokenMergeKeyForItem', 'normalizeTokenStacks']) {
    vm.runInContext(source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'))[0], ctx);
  }
  for (const manualFirst of [true, false]) {
    const legacy = { file: 'DA-.png', count: 1, initialSetup: 'nietzscheDangerMinus' };
    const manual = { file: 'DA-.png', count: 2, x: 50, y: 25 };
    const result = ctx.normalizeTokenStacks(manualFirst ? [manual, legacy] : [legacy, manual]);
    assert.equal(result.length, 1);
    assert.equal(result[0].count, 3);
    assert.equal(result[0].autoLevelBonusContributions.nietzscheStayYourHand, 1);
    assert.equal(result[0].initialSetup, undefined);
    assert.equal(ctx.normalizeTokenStacks(result)[0].autoLevelBonusContributions.nietzscheStayYourHand, 1);
    if (manualFirst) { assert.equal(result[0].x, 50); assert.equal(result[0].y, 25); }
  }
});
