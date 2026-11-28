const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../aibp/card-translations.js'), 'utf8');
const cards = require('../aibp/card-translations.json');
const theatreTerms = require('../theatre/terms.js');

function renderer(context) {
  const node = {
    addEventListener() {},
    setAttribute() {},
    getContext: () => context,
    parentElement: { classList: { contains: () => false } },
    complete: true, width: 750, height: 1050, naturalWidth: 750, naturalHeight: 1050,
  };
  const sandbox = vm.createContext({
    URL,
    window: { addEventListener() {}, ATO_THEATRE_TERMS: theatreTerms },
    document: { currentScript: { src: 'https://ato.test/aibp/card-translations.js' }, getElementById: () => node },
    MutationObserver: class { observe() {} },
  });
  vm.runInContext(script.replace('  void synchronize();', `
    window.test = { bodySize, fanBodySize, layoutText, layoutCardTitle, printedInkRows, coverText, clearOfBanners, clearOfGuards, separateRows, localizeBossNames, fanTextChanged,
      paintCard: card => paintTranslation(image, face, card),
    };
  `), sandbox);
  return sandbox.window.test;
}

function metricsContext() {
  return {
    canvas: { width: 750, height: 1050 },
    font: '',
    measureText(text) {
      const size = Number(this.font.match(/(\d+)px/)[1]);
      return { width: text.length * size, actualBoundingBoxAscent: size - 3, actualBoundingBoxDescent: 2 };
    },
  };
}

test('Fitting a shorter line and a wrapped rule uses the same body font', () => {
  const { bodySize, layoutText } = renderer();
  const context = metricsContext();
  const layouts = [
    { patch: { kind: 'body', text: '前方最近的泰坦。' }, strips: [{ left: 150, top: 535, right: 695, bottom: 564 }] },
    { patch: { kind: 'body', text: '每次命中造成三危险和一枚神浆指示物。命中至少两次，空气爆一。' },
      strips: [{ left: 68, top: 771, right: 460, bottom: 804 }, { left: 68, top: 806, right: 458, bottom: 838 }] },
  ];
  const size = bodySize(context, layouts);
  const lines = layouts.flatMap(({ patch, strips }) => layoutText(context, patch, strips, size));
  assert.ok(lines.length > 2);
  assert.equal(new Set(lines.map(line => line.font)).size, 1);
});

test('A merged OCR box leaves the gold ribbon above the rule outside its paint area', () => {
  const { clearOfBanners } = renderer();
  const width = 750, height = 1050;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const origin = (y * width + x) * 4;
      const isRibbon = x >= 68 && x < 488 && y >= 725 && y < 767;
      const isLetter = isRibbon && x % 11 === 6;
      data.set(isRibbon && !isLetter ? [172, 151, 98, 255] : [235, 228, 209, 255], origin);
    }
  }
  const strip = clearOfBanners({ width, height, data }, { left: 68, top: 751, right: 640, bottom: 800 });
  assert.ok(strip.top >= 767);
  assert.equal(strip.bottom, 800);
});

test('Adjacent OCR boxes that overlap use disjoint vertical paint slots', () => {
  const { separateRows } = renderer();
  const first = { left: 60, top: 800, right: 600, bottom: 839 };
  const second = { left: 60, top: 830, right: 600, bottom: 865 };
  separateRows([first, second]);
  assert.ok(first.bottom < second.top);
  assert.ok(first.bottom - first.top > 20 && second.bottom - second.top > 20);
});

test('A rule box crossing a printed label keeps the label outside its paint slot', () => {
  const { clearOfGuards } = renderer();
  const body = { left: 95, top: 703, right: 560, bottom: 752 };
  const header = { left: 68, top: 680, right: 254, bottom: 725 };
  const slot = clearOfGuards(body, [header]);
  assert.equal(slot.top, 725);
  assert.equal(slot.left, body.left);
});

test('Protected printed artwork is copied from the original after erasure', () => {
  const width = 750, height = 1050;
  const original = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(235) };
  const copies = [];
  const context = Object.assign(metricsContext(), {
    drawImage() {}, save() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {}, restore() {},
    getImageData: () => original,
    createImageData: (width, height) => ({ width, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image, ...args) => copies.push({ image, args }),
    fillText() {},
  });
  assert.ok(renderer(context).paintCard([
    { kind: 'body', text: '空气爆。', lines: [[1000, 5000, 5000, 5500]], slots: [[2000, 5000, 5000, 5500]] },
    { kind: 'guard', preserve: true, lines: [[1000, 5000, 2000, 5500]] },
    { kind: 'guard', preserve: true, lines: [[5000, 5000, 6000, 5500]], moveTo: [[6000, 5100]] },
  ]));
  assert.notEqual(copies.at(-3).image, original);
  assert.deepEqual(copies.at(-3).args, [375, 525]);
  assert.equal(copies.at(-2).image, original);
  assert.deepEqual(copies.at(-2).args, [0, 0, 75, 525, 75, 53]);
  assert.equal(copies.at(-1).image, original);
  assert.deepEqual(copies.at(-1).args, [75, 11, 375, 525, 75, 53]);
});

test('Flavor is italic Songti and emphasis uses a bold body font', () => {
  const { layoutText } = renderer();
  const context = metricsContext();
  const slots = [{ left: 75, top: 100, right: 450, bottom: 132 }];
  const [flavor] = layoutText(context, { kind: 'flavor', text: '远处传来声音。' }, slots, 22);
  const [rule] = layoutText(context, { kind: 'body', bold: true, text: '抽取一张卡。' }, slots, 22);
  assert.match(flavor.font, /^italic 400 22px SimSun/);
  assert.match(rule.font, /^700 22px "Microsoft YaHei"/);
});

test('One tiny rule slot does not reduce the whole card to the smallest font', () => {
  const { bodySize, layoutText } = renderer();
  const context = metricsContext();
  const body = { patch: { kind: 'body', text: '获得两枚指示物。' },
    strips: [{ left: 65, top: 800, right: 500, bottom: 838 }] };
  const narrow = { patch: { kind: 'body', text: '测试' },
    strips: [{ left: 250, top: 741, right: 350, bottom: 758 }] };
  const size = bodySize(context, [body, body, narrow]);
  const [fitted] = layoutText(context, narrow.patch, narrow.strips, size);
  assert.ok(size >= 24);
  assert.ok(parseInt(fitted.font.split(' ')[1], 10) < size);
});

test('Wrapped rules keep a word together when there is room on the next row', () => {
  const { layoutText } = renderer();
  const slots = [
    { left: 0, top: 0, right: 102, bottom: 23 },
    { left: 0, top: 24, right: 220, bottom: 48 },
  ];
  const lines = layoutText(metricsContext(), { kind: 'body', text: '每次造成危险。' }, slots, 20);
  assert.deepEqual(Array.from(lines, row => row.line), ['每次造成', '危险。']);
});

test('Fan labels in narrow slots shrink proportionally without stretching glyphs', () => {
  const { layoutText } = renderer();
  const strips = [{ left: 5, top: 0, right: 56, bottom: 20 }];
  const patch = { kind: 'caption', fanOnly: true, lines: [[66, 0, 560, 190]] };
  const [shortLabel] = layoutText(metricsContext(), { ...patch, text: '击退' }, strips, 20);
  const [label] = layoutText(metricsContext(), { ...patch, text: '不可避免击退' }, strips, 20);
  assert.equal(label.line, '不可避免击退');
  assert.match(label.font, / 8px /);
  assert.match(shortLabel.font, / 19px /);
  assert.equal(label.scale, 1);
  const context = metricsContext();
  context.measureText = () => ({ width: 18, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 });
  assert.match(layoutText(context, { ...patch, text: '玩弄' }, strips, 20)[0].font, / 19px /);
});

test('Fan body rules share the printed card size across short and long lines', () => {
  const { fanBodySize, layoutText } = renderer();
  const context = metricsContext();
  const strip = { left: 10, top: 0, right: 620, bottom: 35 };
  const patch = { kind: 'body', fanOnly: true };
  const captions = ['顶推 3。', '额外设置：变更战斗图示，查看规则书「忆识战斗图示」。', '如果泰坦必须结算硬币抽取，则改为死亡。'];
  const sources = [17, 20, 32].map((height, index) => ({
    patch: { ...patch, text: captions[index] }, strips: [strip],
    sourceRows: [{ left: 10, top: 0, right: 620, bottom: height }],
  }));
  assert.equal(fanBodySize(context, sources), 20);
  sources[2].strips = [{ ...strip, right: strip.left + captions[2].length * 19 + 2 }];
  const fittedSize = fanBodySize(context, sources);
  assert.equal(fittedSize, 19);
  for (const { patch, strips, sourceRows } of sources) {
    const [line] = layoutText(context, patch, strips, fittedSize, sourceRows);
    assert.match(line.font, / 19px /);
    assert.equal(line.scale, 1);
  }
});

test('Fan overlays use the printed ink height and vertical position inside a padded mask', () => {
  const { printedInkRows, layoutText } = renderer();
  for (const ink of ['dark', 'light']) {
    const data = new Uint8ClampedArray(80 * 40 * 4).fill(ink === 'dark' ? 221 : 43);
    for (let row = 1; row < 34; row++) {
      for (let column = 5 + row % 3; column < 75; column += 3) {
        data[(row * 80 + column) * 4 + 1] = ink === 'dark' ? 89 : 170;
      }
    }
    for (let row = 11; row < 31; row++) {
      for (let column = 14; column < 64; column += 2) {
        data[(row * 80 + column) * 4 + 1] = ink === 'dark' ? 38 : 225;
      }
    }
    const slot = { left: 5, top: 1, right: 75, bottom: 34 };
    const rows = printedInkRows({ width: 80, height: 40, data }, slot, ink);
    assert.equal(rows.top, 11);
    assert.equal(rows.bottom, 31);
    const patch = { kind: 'caption', fanOnly: true, text: '始徒轮', lines: [[66, 0, 920, 300]] };
    const [label] = layoutText(metricsContext(), patch, [slot], 30, [rows]);
    assert.match(label.font, / 20px /);
    assert.ok(Math.abs(label.y - 27) <= 1);
  }
});

test('Fan-only boss backs rewrite only changed lines and clear each complete source line', () => {
  const width = 750, height = 1050;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([210, 210, 210, 255], offset);
  // Keep the content below the calibrated ink threshold, then verify that the
  // fan rewrite still replaces the whole line instead of preserving its tint.
  for (let y = 315; y < 368; y++) {
    for (let x = 150; x < 450; x++) {
      data.set([214, 214, 214, 255], (y * width + x) * 4);
    }
  }
  const original = { width, height, data };
  const writes = [];
  const paintedText = [];
  const context = Object.assign(metricsContext(), {
    drawImage() {}, save() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {}, restore() {},
    getImageData: () => original,
    createImageData: (maskWidth, maskHeight) => ({
      width: maskWidth, height: maskHeight,
      data: new Uint8ClampedArray(maskWidth * maskHeight * 4),
    }),
    putImageData: (image, ...args) => writes.push({ image, args }),
    fillText: text => paintedText.push(text),
  });
  const changed = {
    text: '希望断绝', sourceText: '希望终结', kind: 'caption', ink: 'dark',
    fanOnly: true, exact: true, lines: [[2000, 3000, 6000, 3500]],
  };
  const unchanged = {
    text: '特质', kind: 'caption', ink: 'dark', fanOnly: true, exact: true,
    lines: [[2000, 5000, 3000, 5200]],
  };
  const { fanTextChanged, paintCard } = renderer(context);
  assert.equal(fanTextChanged(changed), true);
  assert.equal(fanTextChanged(unchanged), false);
  assert.equal(paintCard([changed, unchanged]), true);
  assert.deepEqual(paintedText, ['希望断绝']);

  const line = writes.find(({ image }) => image.width === 302 && image.height === 55);
  assert.ok(line, 'changed line uses one full padded mask');
  const localX = 200 - 149;
  const localY = 330 - 314;
  const offset = (localY * line.image.width + localX) * 4;
  assert.ok(Math.abs(line.image.data[offset] - 210) <= 3);
});

test('A changed fan line redraws both text runs around its printed icon', () => {
  const { layoutText } = renderer();
  const patch = cards['ps/ALPHA_TEMENOS/ALPHA_TEMENOS_TR_II_001.jpg']
    .find(patch => patch.sourceText?.startsWith('每次对卫域'));
  const strips = patch.lines.map(([left, top, right, bottom]) =>
    ({ left: left / 5, top: top / 10, right: right / 5, bottom: bottom / 10 }));
  const lines = layoutText(metricsContext(), patch, strips, 20);
  assert.deepEqual(Array.from(lines, ({ line }) => line), [
    '每次对吞域兽造成损伤，它获得 1 枚正面',
    '指示物。下一次你结算 AI 卡时，',
  ]);
  assert.ok(lines[0].strip.right < lines[1].strip.left);
  assert.equal(lines[0].font, lines[1].font);
});

test('Chinese titles fit in the available space around their corresponding English names', () => {
  const { layoutCardTitle } = renderer();
  const context = metricsContext();
  const original = { width: 750, height: 1050, data: new Uint8ClampedArray(750 * 1050 * 4).fill(230) };
  const inkblot = cards['ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_AI_III_001.jpg'];
  const english = inkblot.find(patch => patch.kind === 'card-title');
  const [top] = layoutCardTitle(context, original, english);
  assert.equal(top.line, '深海惧龙墨团');
  assert.ok(top.center && top.strip.top > 0);
  assert.ok(top.strip.bottom < Math.round(english.lines[0][1] * 1050 / 10000));

  const double = cards['ps/DAHAKA/DAHAKA_AI_I_001.jpg'];
  const lower = double.find(patch => patch.role === 'BP');
  const [subtitle] = layoutCardTitle(context, original, lower);
  assert.equal(subtitle.line, '缠绕烟雾');
  assert.equal(subtitle.center, false);
  assert.ok(subtitle.strip.top > 1050 / 2 - 5);
  assert.ok(subtitle.strip.bottom <= Math.round(lower.lines[0][1] * 1050 / 10000));

  const vapor = cards['ps/DAHAKA/DAHAKA_AI_III_003.jpg'].find(patch => patch.role === 'BP');
  const [underEnglish] = layoutCardTitle(context, original, vapor);
  assert.equal(underEnglish.line, '神血蒸气');
  assert.ok(underEnglish.strip.top > Math.max(...vapor.lines.map(line => Math.round(line[3] * 1050 / 10000))));

  const stormcloud = cards['ps/DAHAKA/DAHAKA_AI_III_002.jpg'].find(patch => patch.role === 'BP');
  const [nextToEnglish] = layoutCardTitle(context, original, stormcloud);
  assert.equal(nextToEnglish.line, '风暴云之心');
  assert.ok(nextToEnglish.strip.top >= Math.round(stormcloud.lines[0][3] * 1050 / 10000));
  assert.ok(nextToEnglish.strip.left > Math.round(stormcloud.lines[1][2] * 750 / 10000));
});

test('Card rules and titles take boss names from Theatre terminology', () => {
  const { localizeBossNames } = renderer();
  const fanName = (id) => theatreTerms.boss(id, 'fan', '');
  const officialName = (id) => theatreTerms.boss(id, 'official', '');
  const patches = [
    { kind: 'body', text: `移动${fanName('DEMIDJINN')}或${fanName('UR_FLEECE')}。` },
    { kind: 'card-title', text: fanName('HELIOS') },
  ];
  assert.equal(localizeBossNames(patches, 'fan'), patches);
  assert.equal(localizeBossNames(patches, 'en'), patches);
  const localized = localizeBossNames(patches, 'official');
  assert.equal(localized[0].text, `移动${officialName('DEMIDJINN')}或${officialName('UR_FLEECE')}。`);
  assert.equal(localized[1].text, officialName('HELIOS'));
  const allText = Object.values(cards).flatMap(patches => patches.map(patch => patch.text)).join(' ');
  assert.ok(allText.includes(fanName('HELIOS')));
  assert.doesNotMatch(allText, /旧日阴影|无情之日/);
});

test('All eight English level panels and the reported AI card have calibrated source regions', () => {
  const bosses = require('../aibp/boss-levels-data.json').bosses;
  const ids = ['MIDASCORE', 'DEMIDJINN', 'THE_BABELIAN_LUNACY', 'DAHAKA', 'DRAGON_OF_PHOBOS', 'MEDUKETOS', 'UR_FLEECE', 'TITAN_X'];
  for (const id of ids) {
    const panel = cards[bosses[id].sources.back.slice(5)];
    assert.ok(panel.some(patch => patch.kind === 'panel'));
    assert.equal(panel.find(patch => patch.kind === 'card-title')?.text, theatreTerms.boss(id, 'fan', ''));
  }
  const earth = cards['ps/DEMIDJINN/DEMIDJINN_AI_II_001.jpg'];
  assert.equal(earth.find(patch => patch.kind === 'card-title')?.text, '大地裂隙');
  assert.ok(earth.every(patch => patch.kind !== 'heading'));
  const attack = earth.find(patch => patch.text.startsWith('每次命中'));
  assert.ok(attack.lines[0][1] >= 7300);
});

test('Old Haunt uses translation overlays on gameplay faces and original art on decorative backs', () => {
  const sandbox = { window: {} };
  for (const file of ['b4d7e218.js', 'c9f0a6d3.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../aibp', file), 'utf8'), sandbox);
  }
  const { HeliosConfig: config, HeliosAssets: assets } = sandbox.window;
  const paths = new Set([config.common.routine, config.common.signature]);
  const decorative = new Set([config.common.routineBack, config.common.signatureBack,
    assets.path('ENVELOPES/Y/card107_00_B_shared.jpg')]);
  for (const [mode, { panel, panelHigh, decks }] of Object.entries(config.modes)) {
    paths.add(panel);
    if (panelHigh) paths.add(panelHigh);
    for (const { src, backSrc } of Object.values(decks).flatMap(levels => Object.values(levels).flat())) {
      paths.add(src);
      decorative.add(backSrc);
    }
    for (const { src, backSrc } of config.extras(mode)) {
      paths.add(src);
      if (!decorative.has(backSrc)) paths.add(backSrc);
    }
  }
  for (const src of paths) {
    assert.ok(cards[src]?.some(patch => patch.text && !patch.fanOnly), src);
  }
  for (const src of decorative) assert.equal(cards[src], undefined, src);
});

test('The new Old Haunt card names are bilingual like the existing translated cards', () => {
  const namedFaces = {
    e2cc96fa: 'Merciless Sun', fa7b1fca: 'Eclipse Point', '09d605de': 'Old Wounds',
    '86e8d041': 'Glass It All', c0184628: 'God Among Men', '252f5606': 'Pitiless Sun',
  };
  for (const [hash, name] of Object.entries(namedFaces)) {
    const patch = cards[`ps/other/3b6e9d20/${hash}.bin`]?.find(patch =>
      patch.kind === 'card-title' && patch.en.toLowerCase() === name.toLowerCase());
    assert.ok(patch?.text, name);
    for (const [left, top, right, bottom] of patch.slots || []) {
      assert.ok(patch.lines.every(([x0, y0, x1, y1]) =>
        right <= x0 || left >= x1 || bottom <= y0 || top >= y1), name);
    }
  }
});

test('Official C1–C3 level-panel backs have fan-only patches and the fan Oracle back uses its existing art', () => {
  const bosses = require('../aibp/boss-levels-data.json').bosses;
  const theatre = require('../theatre/catalog.js').bosses;
  for (const [id, { cycle }] of Object.entries(theatre)) {
    if (!['c1', 'c2', 'c3'].includes(cycle)) continue;
    const back = bosses[id].sources.back.slice(5);
    if (id === 'HYPERTIME_ORACLE') {
      assert.equal(cards[back], undefined);
      continue;
    }
    assert.ok(cards[back]?.some(patch => patch.sourceText.includes('生死关头') && patch.text.includes('硬币卡除外')), back);
    assert.ok(cards[back].every(patch => patch.fanOnly && patch.sourceText && patch.text !== patch.sourceText), back);
  }
});

test('Nietzschean redraws the complete Obol draw rule in fan terminology', () => {
  const patches = cards['ps/THE_NIETZSCJEAN/THE_NIETZSCJEAN_TR_II_001.jpg'];
  const obol = patches.find(patch => patch.sourceText.includes('生死关头抽取'));
  assert.equal(obol.text, '如果泰坦必须结算硬币抽取，则改为死亡。');
  assert.equal(obol.lines.length, 1);
});

test('Labyrinthauros VP reward leaves the printed damage icon and punctuation outside the erase mask', () => {
  const patches = cards['ps/LABYRINTHAUROS/LABYRINTHAUROS_TR_V_001.jpg'];
  const reward = patches.find(patch => patch.text === '当你位于攀爬点时，获得 1');
  const width = 1600;
  const digitRight = 677;
  const iconLeft = 681;
  const [, , right] = reward.lines[0];
  const eraseRight = Math.round(right * width / 10000) + Math.round(width * .0015);
  assert.ok(eraseRight > digitRight && eraseRight <= iconLeft);
});

test('Fan-only backs use the reviewed boss name and unavoidable Knockback keyword', () => {
  const chimera = cards['ps/CHIMERA_METASTASIOS/CHIMERA_METASTASIOS_TR_V_001.jpg'];
  const pursuer = cards['ps/HERMESIAN_PURSUER/HERMESIAN_PURSUER_TR_II_001.jpg'];
  const search = require('../aibp/boss-search.js');
  const chimeraName = search.entries.find(entry => entry.id === 'CHIMERA_METASTASIOS').names.fan;
  assert.equal(chimera.find(patch => patch.kind === 'heading')?.text, chimeraName);
  assert.ok(pursuer.some(patch => patch.text.includes('不可避免击退 7')));
  assert.doesNotMatch(Object.values(cards).flat().filter(patch => patch.fanOnly)
    .map(patch => patch.text).join(' '), /绝对击退|蜕变奇美拉/);
});

test('Manual condition ribbons keep their full height when a neighboring OCR strip overlaps', () => {
  const { separateRows } = renderer();
  const condition = { left: 170, top: 745, right: 510, bottom: 777, exact: true };
  const nextRule = { left: 65, top: 760, right: 612, bottom: 815 };
  separateRows([condition, nextRule]);
  assert.equal(condition.bottom, 777);
  assert.equal(nextRule.top, 778);
});

test('Calibrated lines erase only the printed ink, and fit the complete translation in its own slot', () => {
  const masks = [];
  const lines = [];
  const width = 750, height = 1050;
  const paper = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(235) };
  const context = Object.assign(metricsContext(), {
    drawImage() {}, save() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {}, restore() {},
    getImageData: () => paper,
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image, x, y) => masks.push([x, y, image.width, image.height]),
    fillText: (line) => lines.push(line),
  });
  const text = '迈达斯 3。每次命中造成 4 危险。';
  const { paintCard } = renderer(context);
  assert.equal(paintCard([{
    kind: 'body', text,
    lines: [[900, 7300, 4600, 7610]],
    erase: [[900, 7650, 2800, 7900]],
    slots: [[900, 7300, 9300, 7620]],
  }]), true);
  assert.deepEqual(masks, [[68, 767, 277, 32], [68, 803, 142, 27]]);
  assert.deepEqual(lines, [text]);
});

test('Calibrated cleanup removes tinted letters without tinting their background', () => {
  const { coverText } = renderer();
  const width = 50, height = 40;
  const rect = { left: 8, top: 8, right: 40, bottom: 30 };
  let cleaned;
  const context = {
    createImageData: (width, height) => ({ width, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image) => { cleaned = image; },
  };
  for (const { ink, background, letter } of [
    { ink: 'red', background: [235, 228, 208], letter: [237, 185, 172] },
    { ink: 'light', background: [175, 159, 111], letter: [181, 176, 148] },
  ]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let offset = 0; offset < data.length; offset += 4) data.set([...background, 255], offset);
    data.set([...letter, 255], (20 * width + 20) * 4);
    coverText(context, { width, height, data }, rect, ink, true);
    const offset = ((20 - rect.top) * cleaned.width + 20 - rect.left) * 4;
    assert.ok(background.every((value, channel) => Math.abs(value - cleaned.data[offset + channel]) <= 4));
  }
});

test('Paper replacement clears pale halos without copying the tint of a nearby label', () => {
  const { coverText } = renderer();
  const width = 32, height = 24;
  const data = new Uint8ClampedArray(width * height * 4);
  const paper = [224, 214, 191, 255];
  for (let offset = 0; offset < data.length; offset += 4) data.set(paper, offset);
  for (let x = 0; x < width; x++) data.set([229, 199, 183, 255], (6 * width + x) * 4);
  data.set([251, 245, 222, 255], (10 * width + 15) * 4);
  data.set([81, 76, 66, 255], (11 * width + 15) * 4);
  let cleaned;
  const context = {
    createImageData: (width, height) => ({ width, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: image => { cleaned = image; },
  };
  coverText(context, { width, height, data }, { left: 8, top: 8, right: 22, bottom: 16 }, 'paper', true);
  assert.ok(cleaned.data.every((value, index) => Math.abs(value - paper[index % 4]) <= 4));
});

test('Imperial Dance flavor stays in the gap between the artwork and the rule ribbon', () => {
  const card = cards['ps/MIDASCORE/MIDASCORE_AI_II_001.jpg'];
  const flavor = card.find(patch => patch.kind === 'flavor');
  const ribbon = card.find(patch => patch.en === 'Closest Titan in sight with');
  const artworkBottom = 5630;
  for (const [, top, , bottom] of [...flavor.lines, ...flavor.slots]) {
    assert.ok(top > artworkBottom);
    assert.ok(bottom < ribbon.slots[0][1]);
  }
});

test('The reported Midas cards wrap at rule boundaries below their printed ribbons', () => {
  const golden = cards['ps/MIDASCORE/MIDASCORE_AI_III_001.jpg'];
  const [hit, survival] = golden.filter(patch => patch.text.startsWith('若'));
  assert.ok(hit.lines[0][0] < 970);
  assert.equal(survival.erase.length, 1);
  assert.match(hit.text, /9 危险及迈达斯 5。$/);
  assert.match(survival.text, /^若你存活/);

  for (const code of ['I_003', 'II_002', 'III_003']) {
    const card = cards[`ps/MIDASCORE/MIDASCORE_AI_${code}.jpg`];
    const conditions = card.filter(patch => patch.ink === 'light');
    assert.equal(conditions.length, 2);
    assert.ok(conditions[0].lines[0][2] < 4750 && conditions[1].lines[0][0] > 5350);
    const rules = card.filter(patch => patch.slots && patch.ink !== 'light');
    assert.ok(rules.flatMap(patch => patch.lines).every(([, top]) => top >= 7300));
    assert.match(rules[1].text, /^每次命中造成 [34] 危险。$/);
  }

  for (const code of ['I_004', 'II_006']) {
    const card = cards[`ps/MIDASCORE/MIDASCORE_AI_${code}.jpg`];
    const target = card.find(patch => patch.ink === 'red');
    assert.ok(target.lines[0][0] > 2840);
    const rules = card.filter(patch => patch.slots && !patch.ink);
    assert.match(rules[0].text, /4 危险。$/);
    assert.equal(rules[1].text, '若命中至少两次，你被贯穿。');
  }
});

test('Card 192 uses compact numbering so its reward line is not horizontally squeezed', () => {
  const reward = cards['ps/DEMIDJINN/DEMIDJINN_BP_III_001.jpg']
    .filter(patch => patch.en?.includes('[theatre icon]'))
    .map(patch => patch.text);
  assert.equal(reward.at(-1), '第192张），');
});

test('Condition card effects keep the weight printed on the original card', () => {
  const inkblot = cards['ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_AI_III_001.jpg'];
  assert.equal(inkblot.find(patch => patch.text === '获得「恐怖」状态卡。')?.bold, true);

  const attack = cards['ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_AI_I_002.jpg'];
  const regular = attack.find(patch => patch.text?.startsWith('获得「恐怖」状态卡。每次命中'));
  assert.ok(regular && !regular.bold);

  const midas = cards['ps/MIDASCORE/MIDASCORE_AI_II_001.jpg'];
  assert.equal(midas.find(patch => patch.text === '获得「强欲」状态卡')?.bold, true);
});

test('The two Overstep cards replace the printed Chinese title above the English title', () => {
  for (const code of ['I_001', 'II_004']) {
    const [patch] = cards[`ps/TITAN_X/TITAN_X_BP_${code}.jpg`];
    assert.equal(patch.text, '越步');
    assert.equal(patch.kind, 'heading');
    assert.ok(patch.slots.length && patch.lines.length);
  }
});

test('Transcription notes for printed graphics stay out of card text', () => {
  const graphicNote = /[\[［【](?:区域图|(?:单|双|全向)光束图标|两行铭文。?)[\]］】]/;
  for (const [source, patches] of Object.entries(cards)) {
    for (const patch of patches) {
      assert.doesNotMatch(patch.text ?? '', graphicNote, source);
    }
  }
});

test('Dahaka next-AI rules use space beside the preserved Instinct ribbons', () => {
  for (const [code, ribbonTop, expectedCount] of [['II_006', 7175, 1], ['III_002', 6882, 2]]) {
    const card = cards[`ps/DAHAKA/DAHAKA_AI_${code}.jpg`];
    const ribbon = card.find(patch => patch.preserve && patch.lines[0][1] === ribbonTop);
    assert.ok(ribbon, code);
    const [, top, , bottom] = ribbon.lines[0];
    const instructions = card.filter(patch => patch.text === '结算下一张 AI 卡。');
    assert.equal(instructions.length, expectedCount, code);
    for (const instruction of instructions) {
      assert.ok(instruction.slots?.length, code);
      for (const [, first, , last] of [...instruction.lines, ...instruction.slots]) {
        assert.ok(last <= top || first >= bottom, code);
      }
    }
  }
});

test('Shadow Economy has separate attack, Fate and three threshold effects', () => {
  const shadow = cards['ps/THE_BABELIAN_LUNACY/THE_BABELIAN_LUNACY_AI_I_006.jpg'];
  assert.equal(shadow.find(patch => patch.kind === 'card-title').text, '影子经济');
  assert.ok(shadow.find(patch => patch.text.startsWith('X 等于')).erase.length);
  assert.equal(shadow.find(patch => patch.text === 'X 翻倍。').ink, 'light');
  const outcomes = shadow.filter(patch => patch.text?.startsWith('获得「'));
  assert.equal(outcomes.length, 3);
  assert.ok(outcomes[0].text.includes('强欲'));
  assert.ok(outcomes[1].text.includes('贪婪'));
  const lastOutcome = shadow.slice(shadow.indexOf(outcomes[2]));
  assert.ok(lastOutcome.some(patch => patch.text.includes('黄金渴求诅咒')));
  assert.ok(outcomes.every(patch => patch.lines[0][0] > 2500));
});

test('Overlays on English cards store their source without affecting rendered text', () => {
  const entries = Object.values(cards).flat();
  const translated = entries.filter(patch => !patch.fanOnly && patch.kind !== 'guard');
  const guards = entries.filter(patch => !patch.fanOnly && patch.kind === 'guard');
  assert.ok(translated.every(patch => Object.hasOwn(patch, 'en') && patch.en.trim()));
  assert.ok(guards.every(patch => patch.en === ''));
  assert.equal(
    cards['ps/MIDASCORE/MIDASCORE_AI_I_001.jpg'][0].en,
    'Right Claw Swipe',
  );
});
