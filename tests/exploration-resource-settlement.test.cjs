const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const rules = require('../assets/exploration-card-resource-rules.js');

function fn(name) {
  const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}

function constant(name) {
  const match = source.match(new RegExp('^    const ' + name + ' = [^]*?^    };', 'm'));
  assert.ok(match, name);
  return match[0];
}

function loadDataset() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/exploration-card-resources.js'), 'utf8'), ctx);
  return ctx.window.ATO_EXPLORATION_CARD_RESOURCES;
}

const dataset = loadDataset();

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this[name] = value; }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      node.children.forEach((child) => {
        if (selector === 'button' && child.tag === 'button') found.push(child);
        walk(child);
      });
    };
    walk(this);
    return found;
  }
  get buttons() { return this.querySelectorAll('button'); }
  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

function settleHarness(options = {}) {
  const written = [];
  let diplomacyBonus = options.diplomacyBonus === undefined ? 1 : options.diplomacyBonus;
  const labels = { minoians: '米诺斯人', sunheirs: '太阳后裔' };
  // A stand-in for the record section of the save file: writes land here so a
  // second action (the undo) sees the value the first one produced.
  const server = { record: { resources: { ...(options.record || {}) } }, revision: 1 };
  const ctx = vm.createContext({
    window: {
      ATO_EXPLORATION_CARD_RESOURCES: dataset,
      ATO_EXPLORATION_RESOURCE_RULES: rules,
    },
    document: { createElement: (tag) => new Element(tag) },
    console,
    state: { exploration: {}, day: 12 },
    currentCycleConfig: () => ({ id: options.cycle || 'c1' }),
    currentMapFactions: () => (options.factions === undefined ? ['minoians'] : options.factions),
    mapFactionLabel: (cycleId, factionId) => labels[factionId] || factionId,
    diplomacyValue: () => (diplomacyBonus === null ? null : 4),
    diplomacyStatus: () => ({ label: '友善', bonus: diplomacyBonus }),
    normalizeCampaignDay: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    isPlainObject: (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
    escapeHtml: (value) => String(value ?? ''),
    readLocalArgoRecord: () => ({}),
    readServerArgoRecord: async () => ({ available: true, record: server.record, revision: server.revision }),
    mergeArgoRecords: (base) => ({ ...(base || {}) }),
    writeServerArgoRecord: async (record) => {
      server.record = record;
      server.revision += 1;
      written.push(record);
      return { conflict: false, revision: server.revision };
    },
    appendRecordSyncLog: () => {},
    updateRecordLinks: () => {},
    recordSyncChannel: null,
    saveState: () => {},
    renderFlow: () => {},
  });
  vm.runInContext([
    fn('explorationResourceRules'),
    fn('explorationResourceDataset'),
    fn('explorationCardResources'),
    fn('currentExplorationDiplomacy'),
    fn('explorationSettlementContext'),
    fn('normalizeExploration'),
    fn('explorationSettlementStore'),
    fn('getExplorationSettlement'),
    fn('clearExplorationSettlements'),
    fn('writeExplorationResourceChanges'),
    fn('createExplorationSettleBlock'),
  ].join('\n'), ctx);
  return {
    ctx,
    written,
    setDiplomacy: (bonus) => { diplomacyBonus = bonus; },
  };
}

async function clickAndWait(button) {
  button.listeners.click();
  for (let tick = 0; tick < 20; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('every exploration card in the app decks has a scanned resource entry', () => {
  const ctx = vm.createContext({});
  vm.runInContext([
    constant('explorationDecks'),
    constant('hiddenExplorationCards'),
    // `const` at script top level is not a property of the vm global, so export
    // the two tables explicitly.
    'this.__decks = explorationDecks;\nthis.__hidden = hiddenExplorationCards;',
  ].join('\n'), ctx);
  for (const [cycleId, decks] of Object.entries(ctx.__decks)) {
    const ids = new Set(decks.flatMap((deck) => deck.cards.map((card) => card.id)));
    (ctx.__hidden[cycleId] || []).forEach((card) => ids.add(card.id));
    const scanned = new Set(rules.cardsForCycle(dataset, cycleId).map((card) => card.cardId));
    for (const id of ids) {
      assert.ok(scanned.has(id), `${cycleId}:${id} 在卡组里但没有扫描数据`);
    }
  }
});

test('a pure resource card settles its resources into the record sheet in one click', async () => {
  const harness = settleHarness({ diplomacyBonus: 1 });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6404', name: 'Trade Post', day: 12 });
  assert.ok(block, '贸易站要显示结算区块');
  assert.match(block.children[0].textContent, /纯资源卡/);
  const buttons = block.buttons;
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, '自动结算');

  await clickAndWait(buttons[0]);

  assert.equal(harness.written.length, 1, '结算要写一次记录表');
  assert.equal(harness.written[0].resources['c1-trireme'], 2, 'Friendly+ 分支要写 ×2');
  assert.ok(harness.ctx.state.exploration.settledByCycle.c1['c1:6404:12'], '结算后要记住这张卡已结算');
});

test('an unsettled card offers both branches when no faction status is known', () => {
  const harness = settleHarness({ factions: [] });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6404', name: 'Trade Post', day: 12 });
  assert.equal(block.buttons.length, 2, '没有外交记录时要给出基础值与 instead 两个选项');
  assert.equal(block.buttons[0].textContent, '基础值结算');
  assert.match(block.buttons[1].textContent, /Friendly\+/);
});

test('a card with extra effects settles only the resources and lists the rest', async () => {
  const harness = settleHarness({ diplomacyBonus: -2 });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6406', name: 'Fishing Pier', day: 12 });
  assert.match(block.children[0].textContent, /含其它效果/);
  assert.equal(block.buttons[0].textContent, '结算资源部分');
  const manual = block.descendants().find((node) => node.className === 'exploration-settle-manual');
  assert.ok(manual, 'Denounced 时要把额外效果列出来');
  assert.match(manual.children[0].textContent, /Chosen Argonaut/);

  await clickAndWait(block.buttons[0]);
  assert.equal(harness.written[0].resources['c1-trireme'], 2);
});

test('a card without resource effects gets no settlement block', () => {
  const harness = settleHarness();
  assert.equal(harness.ctx.createExplorationSettleBlock({ id: '6436', name: 'Cackle', day: 12 }), null);
  assert.equal(harness.ctx.createExplorationSettleBlock({ id: '9999', name: 'Unknown', day: 12 }), null);
});

test('a settled card can be undone and the record goes back to its old value', async () => {
  const harness = settleHarness({ diplomacyBonus: 1, record: { 'c1-trireme': 3 } });
  const entry = { id: '6404', name: 'Trade Post', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  await clickAndWait(block.buttons[0]);
  assert.equal(harness.written[0].resources['c1-trireme'], 5);

  const settledBlock = harness.ctx.createExplorationSettleBlock(entry);
  assert.match(settledBlock.children[0].innerHTML, /已结算/);
  assert.equal(settledBlock.buttons[0].textContent, '撤销结算');
  await clickAndWait(settledBlock.buttons[0]);

  assert.equal(harness.written[1].resources['c1-trireme'], 3, '撤销要把资源减回去');
  assert.equal(harness.ctx.state.exploration.settledByCycle.c1['c1:6404:12'], undefined);
});

test('a new draw clears last round settlement marks', () => {
  const harness = settleHarness();
  harness.ctx.state.exploration.settledByCycle = { c1: { 'c1:6404:12': { summary: '船材 +2' } } };
  harness.ctx.clearExplorationSettlements('c1');
  assert.equal(Object.keys(harness.ctx.state.exploration.settledByCycle.c1).length, 0);
});

test('a diplomacy menu card settles the branch the tile faction points at', async () => {
  const harness = settleHarness({ diplomacyBonus: 1 });
  const entry = { id: '6401', name: 'Minoan Fleet', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  assert.equal(block.buttons.length, 1);
  assert.equal(block.buttons[0].textContent, '结算资源部分');
  assert.match(block.children[0].textContent, /船材|Trireme/, '状态行要写明命中的分支收益');
  const manual = block.descendants().find((node) => node.className === 'exploration-settle-manual');
  const texts = manual.children.map((item) => item.textContent).join(' | ');
  assert.ok(!texts.includes('[Denounced]') && !texts.includes('[Allied]'), '未命中的分支不该出现在待办里');

  await clickAndWait(block.buttons[0]);
  assert.equal(harness.written[0].resources['c1-trireme'], 4, 'Friendly 分支给 4 船材');
});

test('a diplomacy branch that only loses something lists it and never writes', () => {
  const harness = settleHarness({ diplomacyBonus: -2 });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6401', name: 'Minoan Fleet', day: 12 });
  assert.equal(block.buttons.length, 0, '该分支没有资源收益，不该给出按钮');
  const texts = block.descendants()
    .find((node) => node.className === 'exploration-settle-manual')
    .children.map((item) => item.textContent).join(' | ');
  assert.match(texts, /Denounced/, '命中的分支效果要留在待办里');
  assert.ok(!texts.includes('[Friendly]'));
});

test('a diplomacy branch with no scannable resource shows no dead button', () => {
  // Minoan Fleet "Allied" grants a resource printed as a picture, so there is
  // nothing to write: the card must still list what the player has to handle.
  const harness = settleHarness({ diplomacyBonus: 2 });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6401', name: 'Minoan Fleet', day: 12 });
  assert.equal(block.buttons.length, 0, '没有可写资源时不要给出无效按钮');
  assert.match(block.children[0].textContent, /没有资源收益/);
  const manual = block.descendants().find((node) => node.className === 'exploration-settle-manual');
  assert.ok(manual && manual.children.length > 0, '仍要列出待办效果');
});

test('a rare resource is appended to the record sheet text field', async () => {
  const harness = settleHarness({ cycle: 'c3', diplomacyBonus: 2, factions: ['sunheirs'] });
  const entry = { id: '13511', name: 'Siren Temple of Hyperion', day: 30 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  assert.ok(block);
  await clickAndWait(block.buttons[0]);
  assert.equal(harness.written[0].resources['c3-sirenshell'], 3);
  assert.equal(harness.written[0].resources.rare, 'Antedeluvian Sirenshell');
});
