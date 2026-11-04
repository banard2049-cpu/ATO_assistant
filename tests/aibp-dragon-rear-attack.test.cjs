const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8');
function harness() {
  const opened = [];
  const ctx = vm.createContext({
    window: {},
    currentApostle: 'DRAGON_OF_PHOBOS', level: 1, chimeraName: 'CHIMERA_METASTASIOS',
    piles: { DRAGON_OF_PHOBOS: { AI: { deck: [{ type: 'AI', level: 'I', index: 1 }], discard: [], pending: null } } },
    ensurePiles() {}, rememberUndo() {}, savePiles() {}, renderAibpCards() {},
    hasAiCombo: () => false, cardSrc: () => 'dragon-ai.jpg', currentPanelCardTokens: () => [],
    shouldZoomImage: () => true, zoomCardTokenTypeFromImage: () => 'AI',
    flipContextFromImage: () => null, moveContextFromImage: () => null, tokenContextFromImage: () => null,
    currentBpNoticeImages: () => [{ title: 'BP' }],
    openImageZoom: (src, alt, close, options) => opened.push(options),
  });
  ctx.currentApostleLevel = () => ctx.level;
  ctx.isChimera = () => ctx.currentApostle === ctx.chimeraName;
  for (const name of ['currentAiNoticeImages', 'drawAi', 'openZoomForImage']) {
    const match = source.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, opened };
}

test('Dragon rear attack reminder follows every level and leaves other bosses alone', () => {
  const { ctx } = harness();
  for (let level = 1; level <= 9; level++) {
    ctx.level = level;
    const notices = ctx.currentAiNoticeImages();
    assert.equal(notices.length, level >= 4 ? 2 : 1);
    assert.equal(notices[0].title, '背后攻击');
    assert.equal(notices[0].text, level < 3
      ? '身后攻击：忽略闪避投掷，全部自动命中。' : '身后攻击：忽略闪避投掷，你立即被吞噬（死亡）。');
    if (level >= 4) {
      assert.equal(notices[1].title, '黑灯瞎火');
      assert.match(notices[1].text, /完全没有光照 X（Light X）关键词/);
      assert.match(notices[1].text, /总是视作被从身后攻击/);
    }
  }
  ctx.currentApostle = 'HEKATON';
  assert.equal(ctx.currentAiNoticeImages().length, 0);
  ctx.currentApostle = ctx.chimeraName;
  assert.equal(ctx.currentAiNoticeImages().length, 2);
  assert.match(ctx.currentAiNoticeImages()[0].src, /CHIMERA_METASTASIOS_TR_I_002/);
});

test('Drawing and reopening Dragon AI show the current reminder; BP keeps its own notices', () => {
  const { ctx, opened } = harness();
  ctx.drawAi();
  assert.match(opened.at(-1).noticeImages[0].text, /全部自动命中/);
  assert.equal(opened.at(-1).noticeLayout, '');
  ctx.level = 3;
  const image = { src: 'dragon-ai.jpg', alt: 'AI', dataset: {},
    classList: { contains: () => false }, closest: () => null };
  ctx.openZoomForImage(image);
  assert.match(opened.at(-1).noticeImages[0].text, /立即被吞噬/);
  ctx.level = 4;
  ctx.openZoomForImage(image);
  assert.equal(opened.at(-1).noticeImages[1].title, '黑灯瞎火');
  ctx.openZoomForImage({ ...image, closest: selector => selector === '#bpGrid, #bpDrawPreview' ? {} : null });
  assert.equal(opened.at(-1).noticeImages[0].title, 'BP');
});
