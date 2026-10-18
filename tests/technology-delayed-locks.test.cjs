const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../technology/index.html'), 'utf8').replace(/\r\n/g, '\n');
const plain = value => JSON.parse(JSON.stringify(value));
const noop = () => {};

function fn(name) {
  const match = source.match(new RegExp('^(?:async )?function ' + name + '\\([^]*?^}', 'm'));
  assert.ok(match, `Missing ${name}`);
  return match[0];
}

function classList() {
  const entries = new Set();
  return { add: (...values) => values.forEach(value => entries.add(value)),
    remove: (...values) => values.forEach(value => entries.delete(value)),
    contains: value => entries.has(value), toggle: noop };
}

function context() {
  const node = { id: 'aa', name: 'Duplicate AA', name_zh: '阿尔戈技能', tech_category: 'structure', card_indexes: [0] };
  const page = { key: 'cycle1', label: '循环 I', nodes: [node] };
  const other = { id: 'other', name: 'Other', tech_category: 'structure', card_indexes: [0] };
  const otherPage = { key: 'cycle4', label: '循环 IV', nodes: [other] };
  const c = vm.createContext({
    node, page, other, otherPage,
    MAIN_CYCLE_BY_TECH_CYCLE: { cycle1: 'c1', cycle2: 'c2', cycle3: 'c3', cycle4: 'c4', cycle5: 'c5' },
    currentCycle: 'cycle4', viewPage: 'cycle1', currentTab: 'unlocked', treeLanguage: 'zh',
    gearRecordState: { explorationDelays: { disabledTechs: {
      c4: { 'duplicate aa@@cycle1': { receiptId: 'mountain-gate', untilDay: 31, label: '山门' } },
      c1: { 'duplicate aa@@cycle1': { receiptId: 'older', untilDay: 22, label: '山门' } },
    } } },
    gearRecordUserId: 'A', activeAccountId: 'A', campaignSession: { changed: false },
    DISAMBIGUATED_TECH_NAMES: new Set(['duplicate aa']), techKey: value => String(value || '').toLowerCase(),
    unlocked: new Set(['duplicate aa@@cycle1', 'other']), unimportant: new Set(), conditionTicked: new Set(),
    accounts: { A: { name: '档案 A' } }, unlockedRecords: () => [{ page, node }, { page: otherPage, node: other }],
    pageByKey: key => key === page.key ? page : otherPage,
    displayTechName: value => value.name_zh || value.name,
    cardsForNode: () => [],
    categoryLabel: () => '结构科技', isNegotiationNode: () => false, structureTypesForNode: () => [],
    isUnimportantNode: () => false, isLargeTechCard: () => false, isStructureNode: () => true,
    structureTypeBadgesHtml: () => '', backThumb: () => '<img>',
    window: { ATO_STRUCTURE_CARD_TYPES: { labels: () => [] } },
    cardForNode: () => ({ key: 'aa', name: 'AA' }),
    modalCardImage: () => '<img>', renderCard: () => '<img>', renderRequirementUnlockColumns: () => '',
    technologyMetaLabel: () => '结构科技',
    unlockedModalTitle: {}, unlockedModalMeta: {}, modalTechLinks: {}, unlockedModalImage: {},
    unlockedModal: { classList: classList(), setAttribute: noop },
    modalViewTree: { classList: classList() }, modalToggleUnlock: { classList: classList() },
    modalToggleUnimportant: { classList: classList() }, activeUnlockedRecord: null, activeModalMode: '',
    isConditionDiscoveryPending: () => false, hideUnknownTech: false, isDiscoveredNode: () => true,
    updateTreeLinkHighlights: noop, updateModalUnlockButton: noop, selectedNodeId: null,
    document: { querySelectorAll: () => [] }, data: { cards: [{}] },
    isAutoUnlockedNode: () => false, nodeRecordByName: key => key === 'duplicate aa' ? { page, node } : null,
    isConditionSatisfied: () => true,
  });
  vm.runInContext(['nodeKey', 'explorationTechLock', 'esc', 'displayTechReferenceName', 'unlockedTechSnapshot', 'unlockedItemHtml',
    'showUnlockedModal', 'showNodeModal', 'isUnlockedNode', 'isRequirementUnlocked', 'areRequirementsMet', 'isUnlockableNode'].map(fn).join('\n'), c);
  return c;
}

test('a temporary ability lock uses the current campaign bucket and preserves disambiguated node keys', () => {
  const c = context();
  const lock = c.explorationTechLock('cycle1', c.node);
  assert.equal(lock.untilDay, 31);
  assert.equal(lock.receiptId, 'mountain-gate');
  assert.equal(lock.displayLabel, '暂时禁用 · D31发展步骤修复');
  delete c.gearRecordState.explorationDelays.disabledTechs.c4['duplicate aa@@cycle1'];
  assert.equal(c.explorationTechLock('cycle1', c.node).untilDay, 22, 'a lock belonging to the node cycle is the fallback');
  assert.equal(c.explorationTechLock('cycle4', c.other), null);
});

test('locks from another profile or a changed login session are not displayed', () => {
  const c = context();
  c.gearRecordUserId = 'B';
  assert.equal(c.explorationTechLock('cycle1', c.node), null);
  c.gearRecordUserId = 'A';
  c.campaignSession.changed = true;
  assert.equal(c.explorationTechLock('cycle1', c.node), null);
  c.campaignSession.changed = false;
  c.gearRecordState = null;
  assert.equal(c.explorationTechLock('cycle1', c.node), null);
});

test('unlocked cards and both detail views show repair timing without disabling research controls', () => {
  const c = context();
  const html = c.unlockedItemHtml({ page: c.page, node: c.node, card: {} });
  assert.match(html, /class="exploration-tech-lock"/);
  assert.match(html, /暂时禁用 · D31发展步骤修复/);
  assert.doesNotMatch(html, /\sdisabled(?:[\s=>])/);
  c.showUnlockedModal('cycle1', 'aa');
  assert.match(c.unlockedModalMeta.textContent, /暂时禁用 · D31发展步骤修复/);
  c.showNodeModal(c.node);
  assert.match(c.unlockedModalMeta.textContent, /暂时禁用 · D31发展步骤修复/);
  assert.equal(c.unlocked.has('duplicate aa@@cycle1'), true);
});

test('snapshot carries disabled and untilDay for locked items without removing unlocked keys or prerequisites', () => {
  const c = context();
  const snapshot = c.unlockedTechSnapshot();
  assert.equal(snapshot.unlocked.length, 2);
  assert.equal(snapshot.unlocked[0].disabled, true);
  assert.equal(snapshot.unlocked[0].untilDay, 31);
  assert.equal(snapshot.unlocked[1].disabled, false);
  assert.equal(snapshot.unlocked[1].untilDay, null);
  assert.ok(snapshot.unlockedKeys.includes('duplicate aa@@cycle1'));
  assert.equal(c.isUnlockedNode('cycle1', c.node), true);
  assert.equal(c.areRequirementsMet({ requires: ['Duplicate AA'] }), true);
  assert.equal(c.isUnlockableNode('cycle4', { name: 'Successor', requires: ['Duplicate AA'] }), true);
  assert.deepEqual(plain(snapshot.unlockedKeys), ['duplicate aa@@cycle1', 'other']);
});

test('repair completion is driven by removing the stored lock rather than by merely reaching the date', () => {
  const c = context();
  c.gearRecordState.day = 99;
  assert.equal(c.explorationTechLock('cycle1', c.node).disabled, true);
  delete c.gearRecordState.explorationDelays.disabledTechs.c4['duplicate aa@@cycle1'];
  delete c.gearRecordState.explorationDelays.disabledTechs.c1['duplicate aa@@cycle1'];
  assert.equal(c.explorationTechLock('cycle1', c.node), null);
  assert.equal(c.unlockedTechSnapshot().unlocked[0].disabled, false);
  assert.equal(c.unlocked.has('duplicate aa@@cycle1'), true);
});

test('the synced snapshot carries dark-side references separately from tree display names, including merged cards', () => {
  const c = context();
  c.cardsForNode = () => [{ reference_name: '圆桌舰桥' }, { reference_name: '圆桌舰桥' }, { reference_name: '迷宫矿井' }];
  const saved = c.unlockedTechSnapshot().unlocked[0];
  assert.equal(saved.displayName, '阿尔戈技能');
  assert.equal(saved.referenceName, '圆桌舰桥 / 迷宫矿井');
  assert.equal(saved.key, 'duplicate aa@@cycle1');
});

test('record refresh cannot adopt a pending response after profile changes', async () => {
  const c = context();
  let resolveRead;
  let requests = 0;
  Object.assign(c, {
    gearRecordLoadInFlight: false, gearRecordError: '', gearRecordRevision: 0,
    readLatestRecordState: () => new Promise(resolve => { resolveRead = resolve; }),
    campaignTechLoaded: true, campaignStorageAvailable: false,
    renderGearInventoryView: noop, refreshExplorationTechLockDisplay: noop,
    requestGearRecordState: () => { requests += 1; },
  });
  vm.runInContext(fn('loadGearRecordState'), c);
  const refresh = c.loadGearRecordState();
  c.activeAccountId = 'B';
  c.gearRecordState = null;
  c.gearRecordUserId = 'B';
  resolveRead({ userId: 'A', state: { explorationDelays: { disabledTechs: { c4: { bad: {} } } } }, revision: 2 });
  await refresh;
  assert.equal(c.gearRecordState, null);
  assert.equal(c.gearRecordUserId, 'B');
  assert.equal(requests, 1);
});

test('an active profile record refresh updates display and syncs the disabled snapshot', async () => {
  const c = context();
  const snapshots = [];
  let redraws = 0;
  Object.assign(c, {
    gearRecordLoadInFlight: false, gearRecordError: '', gearRecordRevision: 0,
    readLatestRecordState: async () => ({ userId: 'A', state: c.gearRecordState, revision: 2 }),
    campaignTechLoaded: true, campaignStorageAvailable: true,
    renderGearInventoryView: noop, refreshExplorationTechLockDisplay: () => { redraws += 1; },
    requestGearRecordState: noop,
    writeSnapshotToMainArchive: async snapshot => { snapshots.push(snapshot); }, console,
  });
  vm.runInContext(fn('loadGearRecordState'), c);
  await c.loadGearRecordState();
  assert.equal(redraws, 1);
  assert.equal(snapshots[0].unlocked[0].disabled, true);
  assert.equal(c.gearRecordRevision, 2);
});

test('all inline technology scripts remain valid JavaScript', () => {
  for (const script of source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);
});
