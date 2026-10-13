const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/story-doom-card-data.js'), 'utf8'), sandbox);
const data = sandbox.window.ATO_STORY_DOOM_DATA;
const local = value => JSON.parse(JSON.stringify(value));

// Expected values are the printed token triggers on the audited card faces.
const auditedProgress = {
  c1: { '1A': [6], '2A': [2, 9], '3A': [2, 5, 9], '4A': [5, 12] },
  c2: { '1A': [7], '2A': [6], '2B': [10, 15, 20], '4A': [10] },
  c3: { '1A': [6], '1B': [2, 5], '2A': [1, 3, 5], '2B': [9], '3A': [2, 5, 9], '3B': [2, 5, 9] },
  c4: { '1A': [5], '1B': [2, 5, 7], '2A': [2, 4, 7], '3A': [5], '4A': [9] },
  c5: { '1A': [4], '1B': [3], '2A': [4], '2B': [], '3A': [3, 5], '3B': [] },
};
const auditedDoom = {
  c1: [[5], [6], [5], [6], [5], [6]],
  c2: [[5], [5], [5], [6], [1, 5], [6]],
  c3: [[7], [7], [7], [7], [7], [7]],
  c4: [[5], [6], [7], [7], [6], [5]],
  c5: [[5], [5], [5], [4], [4], [6]],
};

test('all 40 story faces use the audited progress permissions and every printed trigger', () => {
  for (const [cycleId, cycle] of Object.entries(data.cycles)) {
    assert.equal(cycle.storySteps.length, 8);
    for (const step of cycle.storySteps) {
      const rule = data.tokenRule(cycleId, 'story', step, 'progress');
      const expected = auditedProgress[cycleId][step.label];
      assert.equal(rule.allowed, expected !== undefined, `${cycleId} story ${step.label}`);
      assert.deepEqual(local(rule.limits), expected || [], `${cycleId} story ${step.label}`);
      assert.equal(data.tokenRule(cycleId, 'story', step, 'doom').allowed, false);
    }
  }
});

test('all 30 doom faces allow doom and only cycle IV allows progress investment', () => {
  for (const [cycleId, cycle] of Object.entries(data.cycles)) {
    assert.equal(cycle.doomSteps.length, 6);
    for (const [index, step] of cycle.doomSteps.entries()) {
      const doom = data.tokenRule(cycleId, 'doom', step, 'doom');
      const progress = data.tokenRule(cycleId, 'doom', step, 'progress');
      assert.equal(doom.allowed, true);
      assert.deepEqual(local(doom.limits), auditedDoom[cycleId][index], `${cycleId} doom ${step.label}`);
      assert.equal(progress.allowed, cycleId === 'c4', `${cycleId} doom ${step.label} progress`);
      assert.deepEqual(local(progress.limits), cycleId === 'c4' ? [index + 3] : []);
    }
  }
});

test('all inward Odyssey cards expose the requested soft limit of one', () => {
  for (const cycleId of Object.keys(data.cycles)) {
    for (const key of ['inwardOdyssey', 'inward', 'inward-odyssey']) {
      const rule = data.tokenRule(cycleId, key, undefined, 'progress');
      assert.equal(rule.allowed, true);
      assert.deepEqual(local(rule.limits), [1]);
      assert.match(rule.note, /每2枚进展/);
      assert.equal(data.tokenRule(cycleId, key, undefined, 'doom').allowed, false);
    }
  }
});

test('printed labels, one-based position and card IDs resolve the same face', () => {
  const sideA = data.cycles.c4.doomSteps[0];
  assert.match(sideA.image, /-back\.jpg$/);
  const expected = local(data.tokenRule('c4', 'doom', sideA, 'progress'));
  for (const selector of [1, '1A', '1a', sideA.id, { cardId: sideA.cardId, side: 'A' }, { id: sideA.physicalCardId, side: 'A' }]) {
    assert.deepEqual(local(data.tokenRule('c4', 'doom', selector, 'progress')), expected);
  }
  assert.equal(data.tokenRule('c4', 'doom', 0, 'progress').allowed, false);
  assert.equal(data.tokenRule('c4', 'doom', 7, 'progress').allowed, false);
  assert.equal(data.tokenRule('c4', 'doom', 1.5, 'progress').allowed, false);
  assert.equal(data.tokenRule('missing', 'doom', 1, 'doom').allowed, false);
});

test('special obtain-progress mechanisms remain explicit and rules are safe to read', () => {
  assert.match(data.tokenRule('c2', 'story', '3B', 'progress').note, /身份线索卡/);
  assert.match(data.tokenRule('c5', 'story', '1A', 'progress').note, /移除1枚/);
  assert.match(data.tokenRule('c5', 'story', '1B', 'progress').note, /最后访问城市/);
  for (const label of ['2B', '3B']) {
    const rule = data.tokenRule('c5', 'story', label, 'progress');
    assert.equal(rule.allowed, true);
    assert.deepEqual(local(rule.limits), []);
    assert.match(rule.note, /没有固定数量上限/);
  }
  const rule = data.tokenRule('c1', 'story', '3A', 'progress');
  rule.limits.push(99);
  assert.deepEqual(local(data.tokenRule('c1', 'story', '3A', 'progress').limits), [2, 5, 9]);
  assert.deepEqual(local(data.tokenRules.c1.story['3A']), local(data.cycles.c1.storySteps[4].tokenRules));
});
