const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const data = require('../aibp/boss-levels-data.js');
const html = fs.readFileSync(path.join(root, 'aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
function fn(name) {
  const match = html.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}
function harness(boss = 'HEKATON', level = 1) {
  const state = { tokens: [], levelBonusState: { promotions: 0 }, initialSetupApplied: {} };
  const calls = { promotions: 0, saves: 0 };
  let nextId = 0;
  const ctx = vm.createContext({
    window: { AIBP_BOSS_LEVEL_DATA: clone(data), C45SpecialsReady: true },
    currentApostle: boss, piles: { [boss]: state }, burdenName: 'THE_BURDEN',
    c45LevelBonusApostles: new Set(['MIDASCORE', 'DEMIDJINN', 'THE_BABELIAN_LUNACY', 'DAHAKA', 'DRAGON_OF_PHOBOS', 'MEDUKETOS', 'UR_FLEECE', 'TITAN_X']),
    nonStackingTokenFiles: new Set(), ensurePiles() {}, currentApostleLevel: () => level,
    clampTokenCount: value => Math.max(0, Math.floor(Number(value) || 0)),
    createTokenStackId: () => `token-${++nextId}`, savePiles: () => calls.saves++,
    performLinkedPromotion: () => { calls.promotions++; return true; },
  });
  for (const name of ['isPlainObject', 'isCriticalMassStack', 'isPerHitTokenStack', 'tokenMergeKey',
    'tokenMergeKeyForItem', 'findMergeableToken', 'normalizeTokenStacks', 'addPanelToken',
    'levelBonusFor', 'automaticTokenContribution', 'automaticTokenSnapshot',
    'syncAutomaticLevelBonusToken', 'applyCurrentApostleLevelBonuses']) {
    vm.runInContext(fn(name), ctx);
  }
  return { ctx, state, calls, setLevel(value) { level = value; } };
}

test('JSON and offline JS contain the same 21 Bosses and 182 confirmed levels', () => {
  assert.deepEqual(data, JSON.parse(fs.readFileSync(path.join(root, 'aibp/boss-levels-data.json'), 'utf8')));
  assert.equal(Object.keys(data.bosses).length, 21);
  assert.equal(Object.values(data.bosses).reduce((sum, boss) => sum + Object.keys(boss.levels).length, 0), 182);
  assert.match(html, /<script src="boss-levels-data\.js\?/);
  assert.doesNotMatch(html, /const apostleLevelBonusConfig\s*=/);
  assert.deepEqual(data.bosses.BLACKBEAK.levels['1'].stats, { wounds: 12, movementPrinted: '6*', movement: '∞', hitRequirement: 11 });
  assert.deepEqual(Object.keys(data.bosses.BLACKBEAK.levels), ['1']);
  assert.equal(data.bosses.UR_FLEECE.levels['9'].stats.wounds, 99);
});

test('all recorded levels drive promotion and tokens without repeated setup or ID changes', () => {
  for (const boss of Object.values(data.bosses)) {
    for (const row of Object.values(boss.levels)) {
      const { ctx, state, calls } = harness(boss.id, row.level);
      ctx.applyCurrentApostleLevelBonuses();
      assert.equal(calls.promotions, row.bonuses.promotions, `${boss.id} ${row.label}`);
      for (const [kind, file, perHit] of [
        ['at', row.bonuses.at < 0 ? 'AT-.png' : 'AT+.png', false],
        ['dangerPerAttack', 'DA+.png', false], ['dangerPerHit', 'DA+.png', true],
        ['fatePerAttack', 'py+.png', false], ['fatePerHit', 'py+.png', true],
        ['evasionDice', 'ED+.png', false],
      ]) {
        const owned = state.tokens.filter(item => ctx.automaticTokenContribution(item, kind) > 0);
        const expected = Math.abs(row.bonuses[kind]);
        assert.equal(owned.reduce((sum, item) => sum + ctx.automaticTokenContribution(item, kind), 0), expected, `${boss.id} ${row.label} ${kind}`);
        for (const token of owned) {
          assert.equal(token.file, file);
          assert.equal(Boolean(token.perHit), perHit);
        }
      }
      if (state.tokens[0]) { state.tokens[0].x = 63; state.tokens[0].y = 47; }
      const before = JSON.stringify(state);
      const saved = calls.saves;
      assert.equal(ctx.applyCurrentApostleLevelBonuses(), false, `${boss.id} ${row.label} repeated setup`);
      assert.equal(JSON.stringify(state), before);
      assert.equal(calls.promotions, row.bonuses.promotions);
      assert.equal(calls.saves, saved);
    }
  }
});

test('changing the shared table changes automation immediately and exact unknown levels stay unavailable', () => {
  const { ctx } = harness();
  assert.equal(ctx.levelBonusFor('BLACKBEAK', 9), null);
  assert.equal(ctx.levelBonusFor('HELIOS', 10), null);
  assert.equal(ctx.levelBonusFor('MISSING', 1), null);
  ctx.window.AIBP_BOSS_LEVEL_DATA.bosses.HEKATON.levels['1'].bonuses.promotions = 4;
  assert.equal(ctx.levelBonusFor('HEKATON', 1).promotions, 4);
});

test('level changes separate per-attack and per-hit danger while retaining manual and exhausted counts', () => {
  const { ctx, state, calls, setLevel } = harness('MIDASCORE', 4);
  ctx.addPanelToken('DA+.png', 2);
  ctx.addPanelToken('DA+.png', 4, { perHit: true });
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(state.tokens.find(item => item.file === 'DA+.png' && !item.perHit).count, 3);
  setLevel(6);
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(state.tokens.find(item => item.file === 'DA+.png' && !item.perHit).count, 2);
  assert.equal(state.tokens.find(item => item.file === 'DA+.png' && item.perHit).count, 6);
  const promoted = calls.promotions;
  setLevel(4);
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(state.tokens.find(item => item.file === 'DA+.png' && item.perHit).count, 4);
  assert.equal(state.tokens.find(item => item.file === 'DA+.png' && !item.perHit).count, 3);
  assert.equal(calls.promotions, promoted);
});

test('Oracle uses fate instead of danger, including ordinary and per-hit stacks', () => {
  const { ctx, state, setLevel } = harness('HYPERTIME_ORACLE', 3);
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(state.tokens.find(item => item.file === 'py+.png').perHit, undefined);
  assert.equal(state.tokens.find(item => item.file === 'py+.png').count, 1);
  setLevel(6);
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(state.tokens.find(item => item.file === 'py+.png').perHit, true);
  assert.equal(state.tokens.find(item => item.file === 'py+.png').count, 2);
  assert.equal(state.tokens.some(item => item.file === 'DA+.png'), false);
});

test('legacy combined danger contributions and duplicate stacks do not consume other token counts', () => {
  const { ctx, state } = harness('HYPERTIME_ORACLE', 3);
  state.tokens = ctx.normalizeTokenStacks([
    { id: 'old-level', file: 'py+.png', count: 1, autoLevelBonus: 'danger' },
    { id: 'manual', file: 'py+.png', count: 2, perHit: true },
    { id: 'manual-normal', file: 'py+.png', count: 3 },
  ]);
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(state.tokens.find(item => item.perHit).count, 2);
  assert.equal(state.tokens.find(item => !item.perHit).count, 4);
  assert.equal(state.tokens.some(item => ctx.automaticTokenContribution(item, 'danger') > 0), false);
});

test('old Burden setup is migrated without another promotion', () => {
  const { ctx, state, calls, setLevel } = harness('THE_BURDEN', 1);
  state.initialSetupApplied.burdenLinkedPromotion = true;
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(calls.promotions, 0);
  assert.equal(state.levelBonusState.promotions, 1);
  setLevel(4);
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(calls.promotions, 1);
});

test('Hekaton level zero adds AT-minus and preserves manual AT-minus after level one', () => {
  const { ctx, state, setLevel } = harness('HEKATON', 0);
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(state.tokens[0].file, 'AT-.png');
  assert.equal(state.tokens[0].count, 1);
  ctx.addPanelToken('AT-.png', 2);
  setLevel(1);
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(state.tokens[0].count, 2);
  assert.equal(state.tokens[0].autoLevelBonusContributions, undefined);
});

test('level zero is selectable and persisted only for a Boss with a recorded level zero', () => {
  const ctx = vm.createContext({
    window: { AIBP_BOSS_LEVEL_DATA: data }, currentApostle: 'HEKATON',
    apostleLevelOverrides: { HEKATON: 0 }, recordApostleLevels: {},
    fixedLevelOneApostles: new Set(), maxApostleLevel: 9, levelRoman: {},
    apostleLevelSelect: { options: [{ value: '' }, { value: '0' }, { value: '1' }] },
  });
  vm.runInContext(fn('apostleLevelFor') + '\n' + fn('renderApostleLevelSelectOptions'), ctx);
  assert.equal(ctx.apostleLevelFor('HEKATON'), 0);
  ctx.renderApostleLevelSelectOptions();
  assert.equal(ctx.apostleLevelSelect.value, '0');
  assert.equal(ctx.apostleLevelSelect.options[1].hidden, false);
  ctx.currentApostle = 'MIDASCORE';
  ctx.apostleLevelOverrides.MIDASCORE = 0;
  assert.equal(ctx.apostleLevelFor('MIDASCORE'), 1);
  ctx.renderApostleLevelSelectOptions();
  assert.equal(ctx.apostleLevelSelect.options[1].hidden, true);
  assert.equal(ctx.apostleLevelSelect.options[1].disabled, true);
});

test('an unrecorded level clears only automatic contributions and does not promote', () => {
  const { ctx, state, calls, setLevel } = harness('BLACKBEAK', 1);
  ctx.applyCurrentApostleLevelBonuses();
  ctx.addPanelToken('AT+.png', 3);
  const promoted = calls.promotions;
  setLevel(9);
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(calls.promotions, promoted);
  assert.equal(state.tokens.length, 1);
  assert.equal(state.tokens[0].count, 3);
});

test('C4/C5 automation waits for special promotion handlers and retries failed promotions', () => {
  const { ctx, state, calls } = harness('DAHAKA', 9);
  ctx.window.C45SpecialsReady = false;
  assert.equal(ctx.applyCurrentApostleLevelBonuses(), false);
  assert.equal(calls.promotions, 0);
  ctx.window.C45SpecialsReady = true;
  ctx.performLinkedPromotion = () => false;
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(state.levelBonusState.promotions, 0);
  ctx.performLinkedPromotion = () => { calls.promotions++; return true; };
  ctx.applyCurrentApostleLevelBonuses();
  assert.equal(calls.promotions, data.bosses.DAHAKA.levels['9'].bonuses.promotions);
});
