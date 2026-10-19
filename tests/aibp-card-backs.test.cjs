const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const mapping = JSON.parse(fs.readFileSync(path.join(__dirname, '../aibp/card-backs.json'), 'utf8'));
const loader = fs.readFileSync(path.join(__dirname, '../aibp/card-backs.js'), 'utf8');
function entryFunction(name) {
  const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
  assert.ok(match, `missing ${name}`);
  return match[0];
}

function backFor(apostle, card, front) {
  const context = vm.createContext({
    currentApostle: apostle,
    window: {
      HeliosAssets: { resolve: value => `resolved:${value}` },
      AibpCardBacks: { backFor: front => mapping.backs[front?.replace(/[?#].*$/, '')] || null },
    },
  });
  vm.runInContext(entryFunction('cardBackMappingSrc'), context);
  vm.runInContext(entryFunction('cardBackImageSrc'), context);
  return context.cardBackImageSrc(card, front);
}

test('Dahaka resolves its special physical AI III back without the front cache query or fragment', () => {
  const front = 'ps/DAHAKA/DAHAKA_AI_III_006.jpg';
  const card = { type: 'AI', level: 'III', bpLevel: 'III', index: 6, combinedAibp: true };
  for (const suffix of ['?v=20260730dahakaccw1', '#card', '?v=1.2#card']) {
    assert.equal(backFor('DAHAKA', card, front + suffix), 'ps/DAHAKA/DAHAKA_AI_III_SPECIAL_BACK.jpg');
  }
});

test('Ordinary AI III cards share a back while Oracle extra AI X 002 uses its matching special back', () => {
  assert.equal(backFor('HEKATON', { type: 'AI', level: 'III', index: 6 },
    'ps/HEKATON/HEKATON_AI_III_006.jpg'), 'ps/HEKATON/HEKATON_AI_III_BACK.jpg');
  assert.equal(backFor('HYPERTIME_ORACLE', { type: 'AI', level: 'X', index: 2 },
    'ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_X_002.jpg'),
  'ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_III_SPECIAL_BACK.jpg');
});

test('Explicit backs retain priority over shared BP III rules', () => {
  assert.equal(backFor('HELIOS', { specialBp: true, backSrc: 'sealed/custom.bin' }, 'front.jpg'),
    'resolved:sealed/custom.bin');
});

test('Shared special BP III and per-card Dragon BP back rules remain intact', () => {
  for (const card of [{ specialBp: true }, { backLevel: 'III' }]) {
    assert.equal(backFor('HEKATON', card, 'front.jpg?cache=1#card'),
      'ps/HEKATON/HEKATON_BP_III_BACK.jpg');
  }
  assert.equal(backFor('DRAGON_OF_PHOBOS', { type: 'BP', level: 'I', index: 2 },
    'ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_BP_I_002.jpg'),
  'ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_BP_I_002_BACK.jpg');
});

test('Blackbeak AI/BP use the Pursuer mapping and migrate legacy backs without replacing custom explicit backs', () => {
  const window = { HeliosAssets: { path: value => value } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../aibp/5158e31a.js'), 'utf8'), { window });
  const cards = ['AI', 'BP'].flatMap(type => Object.values(window.BlackbeakCardList[type]).flat());
  for (const card of cards) {
    assert.equal(card.backSrc, undefined);
    assert.equal(backFor('BLACKBEAK', card, card.src), mapping.backs[card.src]);
  }
  const oldCard = { ...cards[0], backSrc: cards[0].src.replace('.jpg', '_BACK.jpg') };
  const customCard = { ...cards[1], backSrc: 'sealed/custom-back.bin' };
  const state = {
    AI: { deck: [oldCard, customCard], supply: {} },
    BP: { deck: [], removed: [], supply: {} },
    blackbeak: { flareVersion: 1 },
  };
  const oldBp = { ...window.BlackbeakCardList.BP.I[0] };
  oldBp.backSrc = oldBp.src.replace('.jpg', '_BACK.jpg');
  state.BP.damage1 = [{ ...oldBp }];
  state.BP.damage2 = [{ ...oldBp }];
  assert.equal(window.BlackbeakConfig.normalize(state, cards => cards), true);
  assert.equal(oldCard.backSrc, undefined);
  assert.equal(backFor('BLACKBEAK', oldCard, oldCard.src), mapping.backs[oldCard.src]);
  assert.equal(customCard.backSrc, 'sealed/custom-back.bin');
  assert.equal(backFor('BLACKBEAK', customCard, customCard.src), 'resolved:sealed/custom-back.bin');
  assert.equal(state.BP.damage1[0].backSrc, undefined);
  assert.equal(state.BP.damage2[0].backSrc, undefined);
});

function loaderHarness(fetch) {
  const window = { fetch, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(loader, { window });
  return window.AibpCardBacks;
}

const response = () => ({ ok: true, json: async () => mapping });

test('The loader coalesces requests and resolves all 669 cards from the sole JSON mapping', async () => {
  let requests = 0;
  const api = loaderHarness(async url => {
    assert.equal(url, 'card-backs.json');
    requests++;
    return response();
  });
  assert.equal(api.backFor('ps/HEKATON/HEKATON_AI_III_001.jpg'), null);
  const first = api.ready();
  assert.equal(api.ready(), first);
  await first;
  await api.ready();
  assert.equal(requests, 1);
  assert.equal(Object.keys(mapping.backs).length, 669);
  assert.equal(new Set(Object.values(mapping.backs)).size, 145);
  for (const [front, back] of Object.entries(mapping.backs)) {
    assert.equal(api.backFor(front), back, front);
    assert.equal(api.backFor(`${front}?v=1.2#card`), back, front);
  }
  assert.equal(api.backFor('ps/HEKATON/HEKATON_AI_I_001.jpg'), 'ps/HEKATON/HEKATON_AI_I_BACK.jpg');
  assert.equal(api.backFor('ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_III_007.jpg'), null);
  assert.equal(api.backFor(null), null);
  assert.equal(api.backFor('../ps/HEKATON/HEKATON_AI_I_001.jpg'), null);
});

test('AI I/II and ordinary BP levels share their level back while all 18 Dragon BP backs remain distinct', () => {
  for (const type of ['AI', 'BP']) {
    for (const level of type === 'AI' ? ['I', 'II'] : ['I', 'II', 'III']) {
      const first = `ps/HEKATON/HEKATON_${type}_${level}_001.jpg`;
      const last = `ps/HEKATON/HEKATON_${type}_${level}_006.jpg`;
      assert.equal(mapping.backs[first], mapping.backs[last]);
      assert.equal(backFor('HEKATON', { type, level, index: 6 }, last + '?v=2#card'),
        `ps/HEKATON/HEKATON_${type}_${level}_BACK.jpg`);
    }
  }
  const dragonBacks = Object.entries(mapping.backs)
    .filter(([front]) => front.startsWith('ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_BP_'));
  assert.equal(dragonBacks.length, 18);
  assert.equal(new Set(dragonBacks.map(([, back]) => back)).size, 18);
  for (const [front, back] of dragonBacks) assert.equal(back, front.replace('.jpg', '_BACK.jpg'));
  for (const level of ['I', 'II']) {
    const seventh = `ps/TITAN_X/TITAN_X_BP_${level}_007.jpg`;
    assert.equal(mapping.backs[seventh], `ps/TITAN_X/TITAN_X_BP_${level}_BACK.jpg`);
  }
});

test('The mapping loader rejects cross-boss, cross-level, mismatched Dragon, and unsafe paths', async () => {
  const front = 'ps/HEKATON/HEKATON_BP_I_001.jpg';
  const invalid = [
    { version: 2, backs: mapping.backs },
    { version: 1, backs: [] },
    { version: 1, backs: {} },
    { version: 1, backs: { [front]: 'https://example.com/back.jpg' } },
    { version: 1, backs: { [front]: 'ps/../HEKATON_BP_I_BACK.jpg' } },
    { version: 1, backs: { [front]: 'ps/MIDASCORE/MIDASCORE_BP_I_BACK.jpg' } },
    { version: 1, backs: { [front]: 'ps/HEKATON/HEKATON_BP_II_BACK.jpg' } },
    { version: 1, backs: { [front]: 'ps/HEKATON/HEKATON_AI_I_BACK.jpg' } },
    { version: 1, backs: { [front]: 'ps/HEKATON/HEKATON_BP_I_BACK.jpg?redirect=1' } },
    { version: 1, backs: { [front + '?v=1']: mapping.backs[front] } },
    { version: 1, backs: { 'ps/HEKATON/MIDASCORE_BP_I_001.jpg': mapping.backs[front] } },
    { version: 1, backs: { 'ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_BP_I_001.jpg':
      'ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_BP_I_002_BACK.jpg' } },
  ];
  for (const payload of invalid) {
    const api = loaderHarness(async () => ({ ok: true, json: async () => payload }));
    await assert.rejects(api.ready(), /Invalid|Empty/);
    assert.equal(api.backFor(front), null);
  }
});

test('The special AI III cards retain their verified per-boss identities', () => {
  const specialIndices = {
    ALPHA_TEMENOS: 2, CHIMERA_METASTASIOS: 4, CYCLONUS: 3, DAHAKA: 6,
    DEMIDJINN: 6, DRAGON_OF_PHOBOS: 6, HEKATON: 3, HERMESIAN_PURSUER: 2,
    HYPERTIME_ORACLE: 4, ICARIAN_HARPY: 2, LABYRINTHAUROS: 4, MEDUKETOS: 6,
    MIDASCORE: 6, SUN_DESCENDANT: 1, THE_BABELIAN_LUNACY: 6, THE_BURDEN: 3,
    THE_NIETZSCJEAN: 6, TITAN_X: 6, UR_FLEECE: 6,
  };
  for (const [boss, special] of Object.entries(specialIndices)) {
    for (let index = 1; index <= 6; index++) {
      const front = `ps/${boss}/${boss}_AI_III_${String(index).padStart(3, '0')}.jpg`;
      assert.equal(mapping.backs[front],
        `ps/${boss}/${boss}_AI_III${index === special ? '_SPECIAL' : ''}_BACK.jpg`, front);
    }
  }
});

function bindingHarness(api) {
  const probes = [];
  const context = vm.createContext({
    currentApostle: 'DAHAKA',
    window: { AibpCardBacks: api, HeliosAssets: { resolve: value => value } },
    resolveOptionalImagePresence: async src => { probes.push(src); return true; },
  });
  for (const name of ['cardBackMappingSrc', 'cardBackImageSrc', 'enableOptionalCardBack']) {
    const fn = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
    assert.ok(fn, name);
    vm.runInContext(fn[0], context);
  }
  return { context, probes };
}

test('The first card binds its shared back only after mapping loads, leaving its front available', async () => {
  let finish;
  const api = loaderHarness(() => new Promise(resolve => { finish = resolve; }));
  const h = bindingHarness(api);
  const front = 'ps/DAHAKA/DAHAKA_AI_III_006.jpg?v=20260730dahakaccw1';
  const img = { src: front, dataset: {}, isConnected: true };
  const binding = h.context.enableOptionalCardBack(img, front);
  await Promise.resolve();
  assert.equal(img.src, front);
  assert.equal(img.dataset.backSrc, undefined);
  assert.deepEqual(h.probes, []);
  finish(response());
  await binding;
  assert.deepEqual(h.probes, ['ps/DAHAKA/DAHAKA_AI_III_SPECIAL_BACK.jpg']);
  assert.equal(img.dataset.frontSrc, front);
  assert.equal(img.dataset.backSrc, h.probes[0]);
});

test('First AI I/II, BP I/II/III and special BP bindings wait for the shared mapping', async () => {
  const cases = [
    ['AI', 'I'], ['AI', 'II'], ['BP', 'I'], ['BP', 'II'], ['BP', 'III'],
  ].map(([type, level]) => ({ type, level, index: 2 }));
  cases.push({ type: 'TP', level: 'X', index: 1, specialBp: true, backLevel: 'III' });
  for (const card of cases) {
    let finish;
    const api = loaderHarness(() => new Promise(resolve => { finish = resolve; }));
    const h = bindingHarness(api);
    h.context.currentApostle = 'LABYRINTHAUROS';
    const front = `ps/LABYRINTHAUROS/LABYRINTHAUROS_${card.type}_${card.level}_${String(card.index).padStart(3, '0')}.jpg?v=1#card`;
    const img = { src: front, dataset: {}, isConnected: true };
    const binding = h.context.enableOptionalCardBack(img, front, card);
    await Promise.resolve();
    assert.equal(img.src, front);
    assert.equal(img.dataset.backSrc, undefined);
    assert.deepEqual(h.probes, []);
    finish(response());
    await binding;
    const target = `ps/LABYRINTHAUROS/LABYRINTHAUROS_${card.specialBp ? 'BP_III' : `${card.type}_${card.level}`}_BACK.jpg`;
    assert.deepEqual(h.probes, [target]);
    assert.equal(img.dataset.backSrc, target);
  }
});

test('Cards removed while mapping is loading never bind a stale back', async () => {
  let finish;
  const api = loaderHarness(() => new Promise(resolve => { finish = resolve; }));
  const h = bindingHarness(api);
  const img = { dataset: {}, isConnected: true };
  const binding = h.context.enableOptionalCardBack(img, 'ps/HEKATON/HEKATON_AI_III_001.jpg');
  await Promise.resolve();
  img.isConnected = false;
  finish(response());
  await binding;
  assert.deepEqual(h.probes, []);
  assert.equal(img.dataset.backSrc, undefined);
});

test('Failed mapping loads can retry without binding a guessed or incorrect back', async () => {
  let requests = 0;
  const api = loaderHarness(async () => ++requests === 1 ? { ok: false } : response());
  const h = bindingHarness(api);
  const img = { dataset: {}, isConnected: true };
  const front = 'ps/HEKATON/HEKATON_AI_III_003.jpg';
  await h.context.enableOptionalCardBack(img, front);
  assert.equal(img.dataset.backSrc, undefined);
  assert.deepEqual(h.probes, []);
  await h.context.enableOptionalCardBack(img, front);
  assert.equal(requests, 2);
  assert.equal(img.dataset.backSrc, 'ps/HEKATON/HEKATON_AI_III_SPECIAL_BACK.jpg');
});

test('Explicit backs remain available while the shared mapping service is unavailable', async () => {
  const h = bindingHarness({ ready: () => { throw new Error('must not request mapping for explicit back'); }, backFor: () => null });
  const img = { dataset: {}, isConnected: true };
  await h.context.enableOptionalCardBack(img, 'ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_BP_I_002.jpg',
    { type: 'BP', level: 'I', index: 2, backSrc: 'custom/explicit.jpg' });
  assert.equal(img.dataset.backSrc, 'custom/explicit.jpg');
});
