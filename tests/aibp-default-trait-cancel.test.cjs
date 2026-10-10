// 守护「特性区默认显示的 Trait 卡也能在 Trait 选择里取消」：
// 这些卡不进存档的 traits，由特性区实际资源清单（尼采「人人为我」由 setup 补）显示；
// 取消勾选必须写进 hiddenTraits，否则下次渲染又会被加回来。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'aibp', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function entryFunction(name) {
  const start = source.indexOf(`    function ${name}(`);
  assert.notEqual(start, -1, `${name} 缺失`);
  const end = source.indexOf('\n    function ', start + 1);
  return source.slice(start, end);
}

function load(context, names) {
  for (const name of names) vm.runInContext(entryFunction(name), context);
}

// vm 里造出来的对象/数组原型不同，先过一遍 JSON 再比较。
function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function levelContext(apostle, level) {
  const context = vm.createContext({
    currentApostle: apostle,
    nietzscheName: 'THE_NIETZSCJEAN',
    currentApostleLevel: () => level,
  });
  load(context, ['automaticTraitLevels', 'isDefaultShownTrait']);
  return context;
}

test('等级内的使徒特性与 X 级都算默认显示，O 级与通用/周期卡不算', () => {
  const c = levelContext('HEKATON', 3);
  assert.equal(c.isDefaultShownTrait({ level: 'I', index: 1, ext: 'jpg' }), true);
  assert.equal(c.isDefaultShownTrait({ level: 'III', index: 4, ext: 'jpg' }), true);
  assert.equal(c.isDefaultShownTrait({ level: 'X', index: 1, ext: 'jpg' }), true);
  assert.equal(c.isDefaultShownTrait({ level: 'V', index: 1, ext: 'jpg' }), false, '未到 5 级不显示');
  assert.equal(c.isDefaultShownTrait({ level: 'O', index: 1, ext: 'jpg' }), false, 'O 级大卡只在显式选中时显示');
  assert.equal(c.isDefaultShownTrait({ scope: 'common', level: 'COMMON', index: 2 }), false);
  assert.equal(c.isDefaultShownTrait({ scope: 'c4-cursed', level: 'COMMON', index: 1 }), false);
});

test('尼采「人人为我」按默认卡处理，其他 O 级卡不受影响', () => {
  const c = levelContext('THE_NIETZSCJEAN', 3);
  assert.equal(c.isDefaultShownTrait({ level: 'O', index: 2, ext: 'jpg' }), true);
  assert.equal(c.isDefaultShownTrait({ level: 'O', index: 1, ext: 'jpg' }), false);
});

function saveHarness(apostle = 'HEKATON') {
  const state = { traits: [], hiddenTraits: [], hiddenExtraCards: [], customTraits: [] };
  let inputs = [];
  const context = vm.createContext({
    currentApostle: apostle,
    aibpImageIndex: new Set(),
    nietzscheName: 'THE_NIETZSCJEAN',
    piles: { [apostle]: state },
    traitLevels: ['O', 'I', 'II', 'III', 'X'],
    ensurePiles() {}, savePiles() {}, renderExtraCards() {}, traitDialog: { close() {} },
    traitDialogGrid: { querySelectorAll: () => inputs },
  });
  load(context, ['traitKey', 'hiddenTraitKeySet', 'hiddenExtraCardKeySet', 'restoreDefaultTraits',
    'saveTraitSelection']);
  return {
    state,
    inputs(values) { inputs = values; },
    restore() { context.restoreDefaultTraits(); },
    save() { context.saveTraitSelection(); },
  };
}

test('取消默认显示的卡只记进 hiddenTraits，不写进 traits', () => {
  const h = saveHarness();
  h.inputs([{ checked: false, dataset: { level: 'I', index: '3', ext: 'jpg', scope: '', defaultShown: '1' } }]);
  h.save();
  assert.deepEqual(json(h.state.traits), []);
  assert.deepEqual(json(h.state.hiddenTraits), ['apostle-I-3-jpg']);
});

test('保留勾选的默认卡不写进存档，重新勾选会解除隐藏', () => {
  const h = saveHarness();
  h.inputs([{ checked: true, dataset: { level: 'I', index: '3', ext: 'jpg', scope: '', defaultShown: '1' } }]);
  h.save();
  assert.deepEqual(json(h.state.traits), []);
  assert.deepEqual(json(h.state.hiddenTraits), []);

  h.state.hiddenTraits = ['apostle-I-3-jpg'];
  h.save();
  assert.deepEqual(json(h.state.hiddenTraits), [], '重新勾选后不再隐藏');
});

test('显式选过的默认卡继续留在存档里，取消后才移除并隐藏', () => {
  const explicit = { level: 'I', index: '3', ext: 'jpg', scope: '', defaultShown: '1', traitSelected: '1' };
  const kept = saveHarness();
  kept.inputs([{ checked: true, dataset: explicit }]);
  kept.save();
  assert.equal(kept.state.traits.length, 1);
  assert.equal(kept.state.traits[0].level, 'I');
  assert.equal(kept.state.traits[0].index, 3);

  const dropped = saveHarness();
  dropped.state.traits = [{ type: 'TR', level: 'I', index: 3, ext: 'jpg', scope: '' }];
  dropped.inputs([{ checked: false, dataset: explicit }]);
  dropped.save();
  assert.deepEqual(json(dropped.state.traits), []);
  assert.deepEqual(json(dropped.state.hiddenTraits), ['apostle-I-3-jpg']);
});

test('非默认卡新勾选后照旧写进 traits，未勾选的普通卡不产生隐藏记录', () => {
  const h = saveHarness();
  h.inputs([
    { checked: true, dataset: { level: 'V', index: '2', ext: 'jpg', scope: '' } },
    { checked: false, dataset: { level: 'V', index: '4', ext: 'jpg', scope: '' } },
  ]);
  h.save();
  assert.deepEqual(json(h.state.traits), [{ type: 'TR', level: 'V', index: 2, ext: 'jpg', scope: '' }]);
  assert.deepEqual(json(h.state.hiddenTraits), [], '本来就不显示的卡不需要记隐藏');
});

test('「恢复默认」重新勾选默认卡、清掉显式选择与自定义选择，保存后回到默认状态', () => {
  const h = saveHarness();
  h.state.traits = [
    { type: 'TR', level: 'I', index: 4, ext: 'jpg', scope: '' },
    { type: 'TR', level: 'V', index: 2, ext: 'jpg', scope: '' },
  ];
  h.state.hiddenTraits = ['apostle-I-3-jpg'];
  h.inputs([
    { checked: false, dataset: { level: 'I', index: '3', ext: 'jpg', scope: '', defaultShown: '1' } },
    { checked: true, dataset: { level: 'I', index: '4', ext: 'jpg', scope: '', defaultShown: '1', traitSelected: '1' } },
    { checked: true, dataset: { level: 'V', index: '2', ext: 'jpg', scope: '' } },
    { checked: true, dataset: { customTraitId: 'custom-1' } },
  ]);
  h.restore();
  h.save();
  assert.deepEqual(json(h.state.traits), [], '显式与自定义选择都清掉；默认卡由实际资源清单显示');
  assert.deepEqual(json(h.state.hiddenTraits), [], '被隐藏的默认卡恢复显示');
});

test('额外卡取消勾选后记进 hiddenExtraCards，「恢复默认」重新勾选', () => {
  const h = saveHarness();
  h.inputs([
    { checked: false, dataset: { extraCardSrc: 'ps/HEKATON/HEKATON_AI_O_001.jpg' } },
    { checked: true, dataset: { extraCardSrc: 'ps/HEKATON/HEKATON_AI_X_001.jpg' } },
  ]);
  h.save();
  assert.deepEqual(json(h.state.hiddenExtraCards), ['ps/HEKATON/HEKATON_AI_O_001.jpg']);
  assert.deepEqual(json(h.state.traits), []);
  h.restore();
  h.save();
  assert.deepEqual(json(h.state.hiddenExtraCards), [], '恢复默认后额外卡重新显示');
});

test('Trait 选择列出 AI/BP 的 O/X 额外卡（含奇美拉 AI_X 一类）', () => {
  const cards = json(extraCardsContext('HEKATON').traitAreaExtraCards('HEKATON'));
  assert.equal(cards.length, 2, '只列实际清单中的 AI/BP O/X 卡');
  assert.ok(cards.some((card) => card.src === 'ps/HEKATON/HEKATON_AI_O_001.jpg'));
  assert.ok(cards.some((card) => card.src === 'ps/HEKATON/HEKATON_BP_X_012.jpg'));
  assert.ok(!cards.some((card) => /_AI_I_|_BP_III_/.test(card.src)), '只列特性区会显示的 O/X 卡');
  const helios = [{ src: 'sealed/helios-trait.bin', backSrc: 'sealed/helios-trait-back.bin', label: '无情之日' }];
  assert.deepEqual(json(extraCardsContext('HELIOS', { helios }).traitAreaExtraCards('HELIOS')), helios);
});

test('黑喙固定特性卡与泰坦X 组特性也进可选列表', () => {
  const blackbeak = { extraCards: [{ src: 'ps/other/3b6e9d20/b1.bin', label: '特性：黑喙' }] };
  assert.deepEqual(json(extraCardsContext('BLACKBEAK', { blackbeak }).traitAreaExtraCards('BLACKBEAK')),
    [{ src: 'ps/other/3b6e9d20/b1.bin', label: '特性：黑喙' }]);

  const off = json(extraCardsContext('TITAN_X').traitAreaExtraCards('TITAN_X'));
  assert.ok(!off.some((card) => card.src === 'ps/other/3b6e9d20/abc.bin'), '未进入组队状态时不列');
  const on = json(extraCardsContext('TITAN_X', { titanXGroup: true }).traitAreaExtraCards('TITAN_X'));
  assert.ok(on.some((card) => card.src === 'ps/other/3b6e9d20/abc.bin'));
});

function extraCardsContext(apostle, { blackbeak = null, titanXGroup = false, helios = [] } = {}) {
  const context = vm.createContext({
    currentApostle: apostle,
    heliosMode: () => 'c4',
    indexedAibpCards: () => [{ src: `ps/${apostle}/${apostle}_AI_O_001.jpg`, type: 'AI', level: 'O', index: 1 },
      { src: `ps/${apostle}/${apostle}_BP_X_012.jpg`, type: 'BP', level: 'X', index: 12 }],
    piles: { [apostle]: { special: titanXGroup ? { titanX: { group: { target: 'X' } } } : null } },
    numberedName: (name, type, level, index) => `${name}_${type}_${level}_${String(index).padStart(3, '0')}.jpg`,
    window: {
      HeliosConfig: { extras(mode) { assert.equal(mode, 'c4'); return helios; } },
      BlackbeakCardList: blackbeak,
      TitanXGroupConfig: { trait: { src: 'ps/other/3b6e9d20/abc.bin', label: '特性：好事成三' } },
    },
  });
  load(context, ['traitAreaExtraCards']);
  return context;
}

function renderHarness(hiddenTraits = [], hiddenExtraCards = [], indexedSources = null) {
  const existing = new Set(['ps/HEKATON/HEKATON_TR_I_003.jpg', 'ps/HEKATON/HEKATON_AI_O_001.jpg']);
  const makeImg = () => {
    const img = {
      alt: '', className: '', dataset: {}, onload: null, onerror: null, isConnected: true,
      classList: { contains: () => false, add() {} },
      remove() {}, addEventListener() {}, replaceWith() {},
    };
    Object.defineProperty(img, 'src', {
      get() { return this._src || ''; },
      set(value) {
        this._src = value;
        if (existing.has(value)) this.onload?.();
        else this.onerror?.();
      },
    });
    return img;
  };
  const extraGrid = {
    children: [],
    replaceChildren(...next) { this.children = next.slice(); },
    appendChild(child) { this.children.push(child); },
  };
  const state = { traits: [], hiddenTraits, hiddenExtraCards, customTraits: [] };
  const context = vm.createContext({
    currentApostle: 'HEKATON',
    nietzscheName: 'THE_NIETZSCJEAN',
    piles: { HEKATON: state },
    extraGrid,
    document: { createElement: () => makeImg() },
    Image: function Image() { return makeImg(); },
    window: { setTimeout: () => 0, HeliosAssets: { resolve: (src) => src } },
    hiddenBossImagesReady: () => true,
    aibpImageIndex: new Set(indexedSources === null ? existing : indexedSources),
    ensurePiles() {},
    traitSrc: (name, level, index, ext) => `ps/${name}/${name}_TR_${level}_${String(index).padStart(3, '0')}.${ext}`,
    numberedName: (name, type, level, index) => `${name}_${type}_${level}_${String(index).padStart(3, '0')}.jpg`,
    traitCardSrc: () => '', traitCardLabel: () => '', isLargeTraitCard: () => false,
    imageOrMessage: (src) => { const img = makeImg(); img.src = src; return img; },
    enableOptionalCardBack() {}, reorderExtraGridForLargeCards() {}, scheduleSecondScreenSnapshot() {},
    resolveOptionalImagePresence: (src) => ({ then: (callback) => callback(existing.has(src)) }),
    currentApostleLevel: () => 3,
  });
  load(context, ['traitKey', 'selectedTraitKeySet', 'hiddenTraitKeySet', 'hiddenExtraCardKeySet',
    'automaticTraitLevels', 'isNietzscheAllForOneLegacyTrait', 'indexedAibpCards', 'renderExtraCards']);
  context.renderExtraCards();
  return extraGrid.children.map((child) => child.src).filter(Boolean);
}

test('特性区不再自动显示被取消的默认特性卡', () => {
  const defaultSrc = 'ps/HEKATON/HEKATON_TR_I_003.jpg';
  assert.ok(renderHarness([]).includes(defaultSrc), '默认应该自动显示 I/3');
  assert.ok(!renderHarness(['apostle-I-3-jpg']).includes(defaultSrc), '取消后不该再出现');
});

test('特性区不再自动显示被取消的 AI/BP 额外卡', () => {
  const aiSrc = 'ps/HEKATON/HEKATON_AI_O_001.jpg';
  assert.ok(renderHarness().includes(aiSrc), '默认应该自动显示 AI O 1');
  assert.ok(!renderHarness([], [aiSrc]).includes(aiSrc), '取消后不该再出现');
});

test('有实际文件清单时只显示清单中的图片，并继续遵守取消选择', () => {
  const trait = 'ps/HEKATON/HEKATON_TR_I_003.jpg';
  const extra = 'ps/HEKATON/HEKATON_AI_O_001.jpg';
  assert.deepEqual(renderHarness([], [], [extra]), [extra]);
  assert.deepEqual(renderHarness(['apostle-I-3-jpg'], [], [trait, extra]), [extra]);
  assert.deepEqual(renderHarness([], [extra], [trait, extra]), [trait]);
  assert.deepEqual(renderHarness([], [], []), []);
});
