const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const mapping = JSON.parse(fs.readFileSync(path.join(__dirname, '../aibp/card-backs.json'), 'utf8')).backs;
const dragon = 'DRAGON_OF_PHOBOS';
const clone = value => JSON.parse(JSON.stringify(value));
const card = (type, index, level = 'I') => ({ type, level, index });
const pile = type => ({ deck: [card(type, 1), card(type, 2)], discard: [], pending: null });
const front = (boss, type, index = 1, level = 'I') => `ps/${boss}/${boss}_${type}_${level}_${String(index).padStart(3, '0')}.jpg`;
const back = (boss, type, index = 1, level = 'I') => front(boss, type, index, level).replace('.jpg', '_BACK.jpg');
const settle = () => new Promise(resolve => setImmediate(resolve));

function element() {
  const classes = new Set();
  return {
    children: [], dataset: {}, listeners: {}, parentNode: null, disabled: false, hidden: false,
    _text: '',
    get textContent() { return this._text; },
    set textContent(value) { this._text = value; this.children = []; },
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
    },
    replaceChildren(...children) {
      this.children = children;
      this._text = '';
      children.forEach(child => { child.parentNode = this; });
    },
    setAttribute(name, value) { this[name] = String(value); },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    closest(selector) {
      return selector.split(',').some(value => value.trim() === `#${this.parentNode?.id}`)
        ? this.parentNode : null;
    },
  };
}

function harness(boss = dragon, options = {}) {
  const state = { AI: pile('AI'), BP: pile('BP') };
  const opened = [];
  const requested = [];
  const drawCalls = [];
  const controls = Object.fromEntries([
    'breakAiComboButton', 'continueAiComboButton', 'confirmAiButton',
    'discardBpButton', 'defeatBpButton', 'criticalBpButton',
    'drawBpButton', 'drawAiButton', 'aiDrawPreview', 'bpDrawPreview',
  ].map(name => [name, Object.assign(element(), { id: name })]));
  const context = vm.createContext({
    ...controls,
    window: {
      HeliosAssets: { resolve: value => options.resolveAsset?.(value) || value },
      AibpCardBacks: options.sharedBacks,
      AibpCardImages: {
        sourceFor: value => value,
        unchanged(node, signature) {
          const serialized = JSON.stringify(signature);
          const unchanged = node._aibpRenderSignature === serialized;
          node._aibpRenderSignature = serialized;
          return unchanged;
        },
      },
    },
    currentApostle: boss, piles: { [boss]: state }, activeAiComboZoom: null,
    ensurePiles() {}, hasAiCombo: () => false, currentAiComboBreakInfo: () => null,
    renderCombinedBpControl() {},
    drawAi: () => drawCalls.push('AI'),
    drawBp: () => drawCalls.push('BP'),
    supportsCombinedBp: () => ['SUN_DESCENDANT', 'THE_BABELIAN_LUNACY', 'UR_FLEECE'].includes(context.currentApostle),
    sameCard: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    cardSrc: value => value.src || front(context.currentApostle, value.type, value.index, value.level),
    imageOrMessage(src, alt) {
      requested.push(src);
      return Object.assign(element(), { src, alt });
    },
    shouldZoomImage: () => true,
    openPanelZoom: () => false,
    zoomCardTokenTypeFromImage: image => image.parentNode === controls.aiDrawPreview ? 'AI' : 'BP',
    currentPanelCardTokens: () => [{ id: 'pending-card-token' }],
    currentBpNoticeImages: () => [{ title: 'BP notice' }],
    currentAiNoticeImages: () => [{ title: 'AI notice' }],
    moveContextFromImage: () => ({ location: 'deck' }),
    tokenContextFromImage: () => ({ tokenId: 'pending-card-token' }),
    openImageZoom: (src, alt, onClose, zoomOptions) => opened.push({ src, alt, onClose, options: zoomOptions }),
    setImageZoomAiComboActions() {},
  });
  for (const name of [
    'cardBackMappingSrc', 'cardBackImageSrc', 'returnedBpPreviewCard', 'drawPileBackPreviewCard',
    'renderPileBackPreview', 'renderDrawPreview', 'flipContextFromImage', 'openZoomForImage',
  ]) {
    const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
    assert.ok(match, `missing function ${name}`);
    vm.runInContext(match[0], context);
  }
  for (const name of ['aiDrawPreview', 'bpDrawPreview']) {
    const click = source.match(new RegExp(`^    ${name}\\.addEventListener\\("click", \\([^]*?^    \\}\\);`, 'm'));
    assert.ok(click, `missing ${name} click handler`);
    vm.runInContext(click[0], context);
  }
  return { context, state, controls, opened, requested, drawCalls };
}

function deferredBacks() {
  let resolve;
  let reject;
  let mappedBacks = null;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return {
    api: { backFor: src => mappedBacks?.[src?.replace(/[?#].*$/, '')] || null, ready: () => promise },
    resolve(src, cardFront = front('HEKATON', 'AI', 1, 'III')) {
      mappedBacks = { ...mapping, ...(src ? { [cardFront]: src } : {}) };
      resolve();
    },
    reject,
  };
}

test('Dragon idle AI and BP previews show the current top backs without drawing or changing either pile', () => {
  const h = harness();
  const before = clone(h.state);
  for (const type of ['AI', 'BP']) {
    assert.equal(h.context.drawPileBackPreviewCard(type), h.state[type].deck[0]);
  }
  h.context.renderDrawPreview();
  assert.deepEqual(h.requested, [back(dragon, 'AI'), back(dragon, 'BP')]);
  for (const type of ['AI', 'BP']) {
    const preview = h.controls[`${type.toLowerCase()}DrawPreview`];
    assert.equal(preview.children.length, 1);
    assert.equal(preview.children[0].dataset.drawBackPreview, '1');
    assert.equal(preview.classList.contains('has-card'), true);
    assert.equal(h.controls[`draw${type === 'AI' ? 'Ai' : 'Bp'}Button`].disabled, false);
  }
  for (const name of ['confirmAiButton', 'discardBpButton', 'defeatBpButton', 'criticalBpButton']) {
    assert.equal(h.controls[name].disabled, true, `${name} requires a pending card`);
  }
  assert.deepEqual(clone(h.state), before);
});

test('Both back previews follow card identity within the same level and retain unchanged images', () => {
  const h = harness();
  h.context.renderDrawPreview();
  h.state.AI.deck.reverse();
  h.state.BP.deck.reverse();
  h.context.renderDrawPreview();
  assert.deepEqual(h.requested, [back(dragon, 'AI'), back(dragon, 'BP'), back(dragon, 'AI', 2), back(dragon, 'BP', 2)]);
  h.context.renderDrawPreview();
  assert.equal(h.requested.length, 4);
});

test('Opening an idle AI or BP back exposes no front, movement, settlement, or tokens', () => {
  const h = harness();
  h.context.renderDrawPreview();
  const before = clone(h.state);
  for (const type of ['AI', 'BP']) {
    const preview = h.controls[`${type.toLowerCase()}DrawPreview`];
    const image = preview.children[0];
    assert.equal(image.dataset.frontSrc, undefined);
    assert.equal(h.context.flipContextFromImage(image), null);
    const event = { target: image, stopped: false, stopPropagation() { this.stopped = true; } };
    preview.listeners.click(event);
    assert.equal(event.stopped, false, 'the click can bubble to the image zoom handler');
    h.context.openZoomForImage(image);
    const zoom = h.opened.at(-1);
    assert.equal(zoom.src, image.src);
    assert.match(zoom.src, /_BACK\.jpg$/);
    assert.equal(zoom.onClose == null, true);
    assert.equal(zoom.options == null, true, 'back zoom has no hidden-card actions or tokens');
  }
  assert.deepEqual(h.drawCalls, []);
  assert.deepEqual(clone(h.state), before);
});

test('Pending cards take precedence over backs and keep their front and settlement controls', () => {
  const h = harness();
  h.context.renderDrawPreview();
  for (const type of ['AI', 'BP']) h.state[type].pending = h.state[type].deck.shift();
  const before = clone(h.state);
  h.context.renderDrawPreview();
  for (const type of ['AI', 'BP']) {
    assert.equal(h.context.drawPileBackPreviewCard(type), null);
    const image = h.controls[`${type.toLowerCase()}DrawPreview`].children[0];
    assert.equal(image.src, front(dragon, type));
    assert.equal(image.dataset.drawBackPreview, undefined);
    h.context.openZoomForImage(image);
    assert.ok(h.opened.at(-1).options, 'pending fronts keep ordinary zoom actions');
  }
  assert.equal(h.controls.drawBpButton.disabled, true);
  for (const name of ['confirmAiButton', 'discardBpButton', 'defeatBpButton', 'criticalBpButton']) {
    assert.equal(h.controls[name].disabled, false);
  }
  assert.deepEqual(clone(h.state), before);
});

test('Empty decks clear back previews without shuffling discard or creating pending cards', () => {
  const h = harness();
  h.context.renderDrawPreview();
  for (const type of ['AI', 'BP']) {
    h.state[type].discard = h.state[type].deck;
    h.state[type].deck = [];
  }
  const before = clone(h.state);
  h.context.renderDrawPreview();
  for (const type of ['AI', 'BP']) {
    const preview = h.controls[`${type.toLowerCase()}DrawPreview`];
    assert.equal(h.context.drawPileBackPreviewCard(type), null);
    assert.equal(preview.children.length, 0);
    assert.equal(preview.classList.contains('has-card'), false);
    assert.equal(preview.textContent, `未抽取 ${type}`);
  }
  assert.equal(h.requested.length, 2);
  assert.equal(h.controls.drawBpButton.disabled, false);
  assert.deepEqual(clone(h.state), before);
});

test('Ordinary and combined-attack bosses all show idle AI/BP backs and pending fronts', () => {
  for (const boss of ['HEKATON', 'TITAN_X', 'UR_FLEECE', 'SUN_DESCENDANT', 'THE_BABELIAN_LUNACY']) {
    const h = harness(boss);
    h.context.renderDrawPreview();
    assert.deepEqual(h.requested, [back(boss, 'AI'), back(boss, 'BP')]);
    for (const type of ['AI', 'BP']) h.state[type].pending = h.state[type].deck.shift();
    h.context.renderDrawPreview();
    for (const type of ['AI', 'BP']) {
      assert.equal(h.controls[`${type.toLowerCase()}DrawPreview`].children[0].src, front(boss, type));
    }
  }
});

test('Ordinary AI/BP back clicks draw once and stop the old image from opening', () => {
  const h = harness('HEKATON');
  h.context.renderDrawPreview();
  for (const type of ['AI', 'BP']) {
    const preview = h.controls[`${type.toLowerCase()}DrawPreview`];
    const image = preview.children[0];
    assert.equal(image.dataset.drawBackAction, 'draw');
    const event = { target: image, stopped: false, stopPropagation() { this.stopped = true; } };
    preview.listeners.click(event);
    assert.equal(event.stopped, true);
  }
  assert.deepEqual(h.drawCalls, ['AI', 'BP']);
  assert.deepEqual(h.opened, []);
});

test('Ordinary pending front clicks keep zoom available without drawing again', () => {
  const h = harness('HEKATON');
  for (const type of ['AI', 'BP']) h.state[type].pending = h.state[type].deck.shift();
  h.context.renderDrawPreview();
  for (const type of ['AI', 'BP']) {
    const preview = h.controls[`${type.toLowerCase()}DrawPreview`];
    const image = preview.children[0];
    const event = { target: image, stopped: false, stopPropagation() { this.stopped = true; } };
    preview.listeners.click(event);
    assert.equal(event.stopped, false);
    h.context.openZoomForImage(image);
    assert.ok(h.opened.at(-1).options);
  }
  assert.deepEqual(h.drawCalls, []);
});

test('Ordinary preview clicks still draw while empty or waiting for back mappings', () => {
  for (const loading of [false, true]) {
    const deferred = deferredBacks();
    const h = harness('HEKATON', loading ? { sharedBacks: deferred.api } : {});
    if (!loading) for (const type of ['AI', 'BP']) h.state[type].deck = [];
    h.context.renderDrawPreview();
    for (const type of ['AI', 'BP']) {
      const preview = h.controls[`${type.toLowerCase()}DrawPreview`];
      assert.equal(preview.children.length, 0);
      const event = { target: preview, stopped: false, stopPropagation() { this.stopped = true; } };
      preview.listeners.click(event);
      assert.equal(event.stopped, true);
    }
    assert.deepEqual(h.drawCalls, ['AI', 'BP']);
  }
});

test('Explicit hidden-boss back sources resolve directly without requesting their front', () => {
  const h = harness('HIDDEN_BOSS', { resolveAsset: value => `resolved/${value}` });
  for (const type of ['AI', 'BP']) {
    h.state[type].deck[0] = { ...card(type, 1), src: `encrypted/${type}.bin`, backSrc: `${type}-back.bin` };
  }
  const before = clone(h.state);
  h.context.renderDrawPreview();
  assert.deepEqual(h.requested, ['resolved/AI-back.bin', 'resolved/BP-back.bin']);
  for (const type of ['AI', 'BP']) {
    assert.equal(h.controls[`${type.toLowerCase()}DrawPreview`].children[0].dataset.frontSrc, undefined);
  }
  assert.deepEqual(clone(h.state), before);
});

test('Titan X single-sided awakening BP uses the generic back without requesting an encrypted front', () => {
  const h = harness('TITAN_X');
  h.state.AI.deck = [];
  h.state.BP.deck[0] = { ...card('BP', 1), src: 'encrypted/awakening.bin', titanXAwakening: true };
  h.context.renderDrawPreview();
  assert.equal(h.requested.length, 1);
  assert.match(h.requested[0], /^data:image\/svg\+xml,/);
  assert.match(decodeURIComponent(h.requested[0]), />BP<\/text>/);
  assert.equal(h.controls.bpDrawPreview.children[0].dataset.drawBackPreview, '1');
});

test('AI III waits for its shared back mapping before rendering and then uses the mapped image', async () => {
  const deferred = deferredBacks();
  const h = harness('HEKATON', { sharedBacks: deferred.api });
  h.state.AI.deck[0] = card('AI', 1, 'III');
  h.state.BP.deck = [];
  const before = clone(h.state);
  h.context.renderDrawPreview();
  assert.equal(h.controls.aiDrawPreview.textContent, '牌背加载中');
  assert.deepEqual(h.requested, []);
  deferred.resolve('ps/HEKATON/HEKATON_AI_III_SPECIAL_BACK.jpg');
  await settle();
  assert.deepEqual(h.requested, ['ps/HEKATON/HEKATON_AI_III_SPECIAL_BACK.jpg']);
  assert.equal(h.controls.aiDrawPreview.children[0].dataset.drawBackPreview, '1');
  assert.deepEqual(clone(h.state), before);
});

test('AI III loading failure keeps the front hidden and permits a later preview retry', async () => {
  const deferred = deferredBacks();
  const h = harness('HEKATON', { sharedBacks: deferred.api });
  h.state.AI.deck[0] = card('AI', 1, 'III');
  h.state.BP.deck = [];
  h.context.renderDrawPreview();
  deferred.reject(new Error('mapping unavailable'));
  await settle();
  assert.equal(h.controls.aiDrawPreview.textContent, '牌背加载失败');
  assert.deepEqual(h.requested, []);
  const retry = deferredBacks();
  h.context.window.AibpCardBacks = retry.api;
  h.context.renderDrawPreview();
  assert.equal(h.controls.aiDrawPreview.textContent, '牌背加载中');
  retry.resolve('ps/HEKATON/HEKATON_AI_III_SPECIAL_BACK.jpg');
  await settle();
  assert.deepEqual(h.requested, ['ps/HEKATON/HEKATON_AI_III_SPECIAL_BACK.jpg']);
});

test('An old AI III mapping response cannot overwrite a newly selected boss', async () => {
  const deferred = deferredBacks();
  const h = harness('HEKATON', { sharedBacks: deferred.api });
  h.state.AI.deck[0] = card('AI', 1, 'III');
  h.state.BP.deck = [];
  h.context.renderDrawPreview();
  h.context.currentApostle = dragon;
  h.context.piles[dragon] = { AI: pile('AI'), BP: pile('BP') };
  h.context.renderDrawPreview();
  assert.equal(h.controls.aiDrawPreview.textContent, '牌背加载中');
  assert.deepEqual(h.requested, []);
  deferred.resolve('ps/HEKATON/HEKATON_AI_III_SPECIAL_BACK.jpg');
  await settle();
  assert.equal(h.controls.aiDrawPreview.children[0].src, mapping[front(dragon, 'AI')]);
  assert.deepEqual(h.requested, [mapping[front(dragon, 'AI')], mapping[front(dragon, 'BP')]]);
});

test('An old AI III mapping response cannot overwrite a pending AI front', async () => {
  const deferred = deferredBacks();
  const h = harness('HEKATON', { sharedBacks: deferred.api });
  h.state.AI.deck[0] = card('AI', 1, 'III');
  h.state.BP.deck = [];
  h.context.renderDrawPreview();
  h.state.AI.pending = h.state.AI.deck.shift();
  h.context.renderDrawPreview();
  const pendingImage = h.controls.aiDrawPreview.children[0];
  deferred.resolve('ps/HEKATON/HEKATON_AI_III_SPECIAL_BACK.jpg');
  await settle();
  assert.equal(h.controls.aiDrawPreview.children[0], pendingImage);
  assert.deepEqual(h.requested, [front('HEKATON', 'AI', 1, 'III')]);
});

test('An old AI III mapping response cannot overwrite a changed top card', async () => {
  const deferred = deferredBacks();
  const h = harness('HEKATON', { sharedBacks: deferred.api });
  h.state.AI.deck[0] = card('AI', 1, 'III');
  h.state.BP.deck = [];
  h.context.renderDrawPreview();
  h.state.AI.deck.shift();
  h.context.renderDrawPreview();
  assert.equal(h.controls.aiDrawPreview.textContent, '牌背加载中');
  assert.deepEqual(h.requested, []);
  deferred.resolve('ps/HEKATON/HEKATON_AI_III_SPECIAL_BACK.jpg');
  await settle();
  assert.equal(h.controls.aiDrawPreview.children[0].src, mapping[front('HEKATON', 'AI', 2)]);
  assert.deepEqual(h.requested, [mapping[front('HEKATON', 'AI', 2)]]);
});

test('Every AI/BP level waits for the mapping on the first preview before requesting the shared back', async () => {
  for (const type of ['AI', 'BP']) {
    for (const level of ['I', 'II', 'III']) {
      const deferred = deferredBacks();
      const h = harness('HEKATON', { sharedBacks: deferred.api });
      h.state[type].deck = [card(type, 2, level)];
      h.state[type === 'AI' ? 'BP' : 'AI'].deck = [];
      h.context.renderDrawPreview();
      const preview = h.controls[`${type.toLowerCase()}DrawPreview`];
      assert.equal(preview.textContent, '牌背加载中', `${type} ${level}`);
      assert.deepEqual(h.requested, []);
      deferred.resolve();
      await settle();
      assert.deepEqual(h.requested, [mapping[front('HEKATON', type, 2, level)]]);
      assert.equal(preview.children[0].dataset.drawBackPreview, '1');
    }
  }
});

test('Special BP previews wait for the BP III mapping while explicit backs retain priority', async () => {
  const boss = 'LABYRINTHAUROS';
  const deferred = deferredBacks();
  const h = harness(boss, { sharedBacks: deferred.api });
  h.state.AI.deck = [];
  h.state.BP.deck = [{ type: 'TP', level: 'X', index: 1, specialBp: true, backLevel: 'III',
    src: `ps/${boss}/${boss}_TP_X_001.jpg` }];
  h.context.renderDrawPreview();
  assert.equal(h.controls.bpDrawPreview.textContent, '牌背加载中');
  assert.deepEqual(h.requested, []);
  deferred.resolve();
  await settle();
  assert.deepEqual(h.requested, [`ps/${boss}/${boss}_BP_III_BACK.jpg`]);
  h.state.BP.deck[0].backSrc = 'sealed/explicit-back.bin';
  h.context.renderDrawPreview();
  assert.equal(h.controls.bpDrawPreview.children[0].src, 'sealed/explicit-back.bin');
});

test('Dragon BP previews preserve each distinct mapped back and strip front cache suffixes', async () => {
  const deferred = deferredBacks();
  const h = harness(dragon, { sharedBacks: deferred.api });
  h.state.AI.deck = [];
  h.state.BP.deck[0].src = `${front(dragon, 'BP', 1)}?v=1#card`;
  h.context.renderDrawPreview();
  assert.deepEqual(h.requested, []);
  deferred.resolve();
  await settle();
  assert.equal(h.controls.bpDrawPreview.children[0].src, back(dragon, 'BP', 1));
  h.state.BP.deck.shift();
  h.context.renderDrawPreview();
  assert.equal(h.controls.bpDrawPreview.children[0].src, back(dragon, 'BP', 2));
  assert.notEqual(h.requested[0], h.requested[1]);
});

test('Dahaka shared AIBP pile shows the same back in both previews and pending fronts in both', () => {
  const h = harness('DAHAKA');
  h.state.aibp = h.state.AI;
  h.state.BP = h.state.aibp;
  const before = clone(h.state);
  h.context.renderDrawPreview();
  assert.deepEqual(h.requested, [back('DAHAKA', 'AI'), back('DAHAKA', 'AI')]);
  assert.deepEqual(clone(h.state), before);
  h.state.aibp.pending = h.state.aibp.deck.shift();
  h.context.renderDrawPreview();
  for (const type of ['AI', 'BP']) {
    assert.equal(h.context.drawPileBackPreviewCard(type), null);
    const image = h.controls[`${type.toLowerCase()}DrawPreview`].children[0];
    assert.equal(image.src, front('DAHAKA', 'AI'));
    assert.equal(image.dataset.drawBackPreview, undefined);
  }
});

test('Returned combined-attack BP back clicks redraw and preserve accumulated strength until draw resolves', () => {
  for (const boss of ['SUN_DESCENDANT', 'THE_BABELIAN_LUNACY', 'UR_FLEECE']) {
    const h = harness(boss);
    h.state.BP.combinedAttack = { card: h.state.BP.deck[0], total: 7 };
    const before = clone(h.state);
    h.context.renderDrawPreview();
    const image = h.controls.bpDrawPreview.children[0];
    assert.equal(image.src, back(boss, 'BP'));
    assert.equal(image.dataset.drawBackPreview, '1');
    assert.equal(h.controls.drawBpButton.textContent, '重抽此 BP');
    assert.equal(h.controls.drawBpButton.disabled, false);
    const event = { target: image, stopped: false, stopPropagation() { this.stopped = true; } };
    h.controls.bpDrawPreview.listeners.click(event);
    assert.equal(event.stopped, true);
    assert.deepEqual(h.opened, []);
    assert.deepEqual(h.drawCalls, ['BP']);
    assert.equal(h.state.BP.combinedAttack.total, 7);
    assert.deepEqual(clone(h.state), before);
  }
});
