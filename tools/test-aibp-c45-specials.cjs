const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(name) {
    this.values.add(name);
  }

  remove(name) {
    this.values.delete(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.innerHTML = "";
    this.textContent = "";
    this.listeners = {};
    this.parentNode = null;
  }

  addEventListener(type, listener, options) {
    this.listeners[type] ||= [];
    this.listeners[type].push({
      listener,
      capture: options === true || Boolean(options?.capture)
    });
  }

  dispatch(type, target = this) {
    const event = {
      target,
      defaultPrevented: false,
      immediateStopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        this.immediateStopped = true;
      }
    };
    const listeners = (this.listeners[type] || []).slice()
      .sort((left, right) => Number(right.capture) - Number(left.capture));
    for (const entry of listeners) {
      entry.listener(event);
      if (event.immediateStopped) break;
    }
    return event;
  }

  querySelectorAll() {
    return [];
  }

  querySelector() {
    return null;
  }

  replaceChildren() {
    this.innerHTML = "";
    this.textContent = "";
  }

  setAttribute(name, value) {
    this[name] = value;
  }
}

function makeActionTarget(action, extra = {}) {
  return {
    dataset: { action, ...extra },
    closest(selector) {
      if (selector === "[data-action]" && action) return this;
      if (selector === "[data-value]" && this.dataset.value !== undefined) return this;
      return null;
    }
  };
}

function makeCounterTarget(field, delta, minimum = 0, maximum = 99) {
  return {
    dataset: {
      counterField: field,
      delta: String(delta),
      min: String(minimum),
      max: String(maximum)
    },
    closest(selector) {
      return selector === "[data-counter-field]" ? this : null;
    }
  };
}

function makeChangeTarget(kind, dataset, value, checked = false) {
  return {
    dataset,
    value,
    checked,
    closest(selector) {
      return selector === `[${kind}]` ? this : null;
    }
  };
}

function basicPile(type, count = 6) {
  return {
    deck: Array.from({ length: count }, (_, index) => ({
      type,
      level: "I",
      index: index + 1
    })),
    discard: [],
    damage: [],
    damage1: [],
    damage2: [],
    pending: null,
    supply: {
      I: [],
      II: Array.from({ length: count }, (_, index) => ({
        type,
        level: "II",
        index: index + 1
      })),
      III: Array.from({ length: count }, (_, index) => ({
        type,
        level: "III",
        index: index + 1
      }))
    },
    removed: []
  };
}

function initialState() {
  return {
    AI: basicPile("AI"),
    BP: basicPile("BP"),
    flare: { deck: [], discard: [] },
    feint: {
      deck: Array.from({ length: 10 }, (_, index) => ({
        type: "FEINT",
        level: "X",
        index: index + 1
      })),
      active: [],
      removed: []
    },
    tokens: []
  };
}

function makeHarness(startApostle = "MIDASCORE", options = {}) {
  const buttons = Object.fromEntries([
    "drawAiButton",
    "drawBpButton",
    "confirmAiButton",
    "discardBpButton",
    "defeatBpButton",
    "criticalBpButton",
    "promoteAiSingleButton",
    "promoteBpSingleButton",
    "drawFeintButton",
    "newCampaignButton",
    "aiDrawPreview",
    "bpDrawPreview",
    "babelianFusionControl"
  ].map((name) => [name, new FakeElement()]));
  const cardsPanel = new FakeElement();
  const cardsParent = new FakeElement();
  cardsPanel.parentNode = cardsParent;
  cardsParent.insertBefore = (element) => {
    cardsParent.inserted = element;
  };

  const context = {
    ...buttons,
    console,
    currentApostle: startApostle,
    piles: {},
    undoStacks: {},
    aibpLayout: new FakeElement(),
    bpColumn: new FakeElement(),
    extraGrid: new FakeElement(),
    imageZoomBpActions: new FakeElement(),
    levels: {},
    lastZoom: null,
    shuffleCount: 0,
    panelTokenRenders: 0,
    timers: [],
    document: {
      createElement() {
        return new FakeElement();
      },
      getElementById(id) {
        return buttons[id] || null;
      },
      querySelector(selector) {
        return selector === ".cards-panel" ? cardsPanel : null;
      }
    },
    localStorage: {
      values: new Map(options.localRecord
        ? [["ato-argo-record-sheet-v1", JSON.stringify(options.localRecord)]]
        : []),
      getItem(key) {
        return this.values.get(key) || null;
      },
      setItem(key, value) {
        this.values.set(key, String(value));
      }
    },
    fetch: async () => {
      throw new Error("offline");
    },
    confirm: () => true,
    setTimeout(callback) {
      context.timers.push(callback);
      return context.timers.length;
    },
    structuredClone,
    ensurePiles(name) {
      context.piles[name] ||= initialState();
    },
    renderApostle(name) {
      context.currentApostle = name;
      context.ensurePiles(name);
      const noBp = name === "DAHAKA";
      context.aibpLayout.classList.toggle("ai-only", noBp);
      context.bpColumn.hidden = noBp;
      context.renderAibpCards();
    },
    renderAibpCards() {
      const state = context.piles[context.currentApostle];
      if (!state) return;
      context.confirmAiButton.disabled = !state.AI.pending;
      context.discardBpButton.disabled = !state.BP.pending;
      context.defeatBpButton.disabled = !state.BP.pending;
      context.criticalBpButton.disabled = !state.BP.pending;
    },
    renderExtraCards() {},
    renderPanelTokens() {
      context.panelTokenRenders += 1;
    },
    renderDeckInfo() {},
    renderDrawPreview() {},
    drawAi(remember = true) {
      const pile = context.piles[context.currentApostle].AI;
      if (pile.pending || !pile.deck.length) return;
      if (remember) context.rememberUndo(context.currentApostle, "AI");
      pile.pending = pile.deck[0];
    },
    drawBp() {
      const pile = context.piles[context.currentApostle].BP;
      if (pile.pending || !pile.deck.length) return;
      context.rememberUndo(context.currentApostle, "BP");
      pile.pending = pile.deck[0];
    },
    discardAiPending(remember = true) {
      const pile = context.piles[context.currentApostle].AI;
      if (!pile.pending) return;
      if (remember) context.rememberUndo(context.currentApostle, "AI");
      const index = pile.deck.findIndex((card) => context.sameCard(card, pile.pending));
      pile.discard.push(index >= 0 ? pile.deck.splice(index, 1)[0] : pile.pending);
      pile.pending = null;
    },
    resolveBp(mode) {
      const pile = context.piles[context.currentApostle].BP;
      if (!pile.pending) return;
      context.rememberUndo(context.currentApostle, "BP");
      const index = pile.deck.findIndex((card) => context.sameCard(card, pile.pending));
      const card = index >= 0 ? pile.deck.splice(index, 1)[0] : pile.pending;
      pile.pending = null;
      if (mode === "discard") pile.discard.push(card);
      else {
        pile.damage.push(card);
        context.C45Specials?.recordBpWound?.(card.level === "III" ? 2 : 1);
      }
    },
    promoteSinglePile() {},
    promoteBpByRemovingLowest() {},
    performLinkedPromotion() {
      return context.promoteBpByRemovingLowest();
    },
    promoteAiFromLevel() {},
    promoteAiForBpIII() {},
    setImageZoomBpActions() {},
    undoLastAibp(type = "") {
      const stack = context.undoStacks[context.currentApostle] || [];
      const entry = stack.at(-1);
      if (!entry || (type && entry.scope !== type && entry.scope !== "AIBP")) return;
      stack.pop();
      context.piles[context.currentApostle] = structuredClone(entry.state);
    },
    startNewCampaign() {
      context.undoStacks[context.currentApostle] = [];
      context.piles[context.currentApostle] = initialState();
      context.renderAibpCards();
    },
    drawFeint() {},
    rememberUndo(name, scope = "AIBP") {
      context.ensurePiles(name);
      context.undoStacks[name] ||= [];
      context.undoStacks[name].push({
        scope,
        state: structuredClone(context.piles[name])
      });
    },
    savePiles() {},
    clonePileState: structuredClone,
    shuffleCards(cards) {
      context.shuffleCount += 1;
      return cards.slice();
    },
    insertRandom(deck, card) {
      if (card) deck.splice(Math.floor(deck.length / 2), 0, card);
    },
    sameCard(left, right) {
      if (!left || !right) return false;
      if (left.fileName || right.fileName) return left.fileName === right.fileName;
      return left.type === right.type
        && left.level === right.level
        && left.index === right.index;
    },
    cardSrc(card) {
      return `ps/${context.currentApostle}/${card.fileName || `${card.type}_${card.level}_${card.index}.jpg`}`;
    },
    openImageZoom(src, title, onClose) {
      context.lastZoom = { src, title, onClose };
    },
    currentApostleLevel() {
      return context.levels[context.currentApostle] || 1;
    },
    applyCurrentApostleLevelBonuses() {}
  };
  context.window = context;
  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(__dirname, "..", "aibp", "c45_specials.js"),
    "utf8"
  );
  vm.runInContext(source, context, { filename: "c45_specials.js" });
  context.specialRoot = cardsParent.inserted;
  context.timers = [];
  return context;
}

test("Dahaka uses one visible shared AI/BP pile and BP-only promotion", () => {
  const app = makeHarness();
  app.renderApostle("DAHAKA");
  const state = app.piles.DAHAKA;

  assert.equal(app.bpColumn.hidden, false);
  assert.equal(app.aibpLayout.classList.contains("ai-only"), false);
  assert.strictEqual(state.AI, state.aibp);
  assert.strictEqual(state.BP, state.aibp);
  assert.equal(state.aibp.deck.length, 6);
  assert.equal(state.aibp.supply.II.length, 6);
  assert.equal(state.aibp.supply.III.length, 6);
  assert.match(
    app.cardSrc(state.aibp.deck[0]),
    /\?v=20260730dahakaccw1$/
  );

  app.drawAi();
  const first = state.aibp.pending;
  assert.equal(state.aibp.pendingMode, "AI");
  app.drawBp();
  assert.equal(state.aibp.pending.fileName, first.fileName);
  app.discardAiPending();
  assert.equal(state.aibp.discard.length, 1);

  app.drawBp();
  assert.equal(state.aibp.pendingMode, "BP");
  app.resolveBp("defeat");
  assert.equal(state.aibp.pending, null);
  assert.equal(state.aibp.damage.length, 1);
  assert.equal(state.aibp.supply.II.length, 5);

  const aiSupplyBefore = state.aibp.supply.II.length;
  app.promoteSinglePile("AI");
  assert.equal(state.aibp.supply.II.length, aiSupplyBefore - 1);

  const bpThree = {
    type: "AI",
    level: "III",
    bpLevel: "III",
    index: 6,
    combinedAibp: true,
    fileName: "DAHAKA_AI_III_006.jpg"
  };
  state.aibp.deck = [bpThree];
  state.aibp.pending = null;
  state.aibp.pendingMode = "";
  state.aibp.supply.III = [{
    ...bpThree,
    index: 5,
    fileName: "DAHAKA_AI_III_005.jpg"
  }];
  app.drawBp();
  const pendingFile = state.aibp.pending.fileName;
  app.resolveBp("defeat");
  assert.equal(state.aibp.deck.at(-1).fileName, pendingFile);
  assert.equal(
    state.aibp.removed.some((card) => card.fileName === pendingFile),
    false
  );
});

test("Dahaka linked promotion upgrades the shared pile only once", () => {
  const app = makeHarness("DAHAKA");
  const pile = app.piles.DAHAKA.aibp;

  const levelOneBefore = pile.deck.filter((card) => card.bpLevel === "I").length;
  const levelTwoSupplyBefore = pile.supply.II.length;

  assert.equal(app.performLinkedPromotion(), true);
  assert.equal(pile.deck.filter((card) => card.bpLevel === "I").length, levelOneBefore - 1);
  assert.equal(pile.deck.filter((card) => card.bpLevel === "II").length, 1);
  assert.equal(pile.supply.II.length, levelTwoSupplyBefore - 1);
  assert.equal(pile.removed.length, 1);
});

test("Dahaka migrates a legacy AI save without clearing other progress", () => {
  const app = makeHarness();
  const legacy = initialState();
  legacy.AI.deck = [{ type: "AI", level: "II", index: 4 }];
  legacy.AI.discard = [{ type: "AI", level: "I", index: 2 }];
  legacy.tokens = [{ id: "keep", file: "AT+.png", count: 2 }];
  app.piles.DAHAKA = legacy;

  app.renderApostle("DAHAKA");
  assert.equal(app.piles.DAHAKA.aibp.deck[0].bpLevel, "II");
  assert.equal(app.piles.DAHAKA.aibp.discard[0].bpLevel, "I");
  assert.equal(app.piles.DAHAKA.tokens[0].id, "keep");
});

test("Demidjinn keeps AI O at the bottom and rotates four wishes", () => {
  const app = makeHarness();
  app.levels.DEMIDJINN = 4;
  app.renderApostle("DEMIDJINN");
  const state = app.piles.DEMIDJINN;
  const aiO = state.AI.deck.at(-1);

  assert.equal(aiO.specialAi, "demidjinn-o");
  assert.equal(state.special.demidjinn.globalWish.deck.length, 4);
  assert.equal(state.special.demidjinn.globalWish.active, null);

  state.AI.deck.pop();
  state.AI.removed.push(aiO);
  app.renderAibpCards();
  assert.equal(state.AI.removed.some((card) => card.specialAi === "demidjinn-o"), false);
  assert.equal(state.AI.deck.at(-1).specialAi, "demidjinn-o");

  app.specialRoot.dispatch("click", makeActionTarget("next-global-wish"));
  assert.equal(state.special.demidjinn.globalWish.round, 2);
  assert.ok(state.special.demidjinn.globalWish.active);
  assert.equal(state.special.demidjinn.globalWish.deck.length, 3);
});

test("Babelian BP module records and clears its bonus without VP overwrites", () => {
  const app = makeHarness();
  app.renderApostle("THE_BABELIAN_LUNACY");
  const state = app.piles.THE_BABELIAN_LUNACY;
  assert.equal("fusionRoll" in state.special.babelian, false);
  assert.equal(app.babelianFusionControl.hidden, false);
  assert.match(
    app.babelianFusionControl.innerHTML,
    /合体攻击加成|babelian\.fusionBonus|归零/
  );
  assert.equal(app.specialRoot.classList.contains("show"), false);

  app.babelianFusionControl.dispatch(
    "click",
    makeCounterTarget("babelian.fusionBonus", 1, 0, 99)
  );
  assert.equal(state.special.babelian.fusionBonus, 1);

  const card = state.BP.deck[0];
  state.BP.pending = card;
  app.resolveBp("vp-defeat");
  assert.equal(state.BP.pending, null);
  assert.equal(state.BP.deck.some((candidate) => app.sameCard(candidate, card)), true);
  assert.equal(state.BP.damage.length, 0);
  assert.equal(state.special.babelian.fusionBonus, 1);

  app.babelianFusionControl.dispatch(
    "click",
    makeActionTarget("clear-fusion-bonus")
  );
  assert.equal(state.special.babelian.fusionBonus, 0);
});

test("Titan X setup, Feints, Overstep, and bottom draws share persistent state", () => {
  const app = makeHarness();
  app.renderApostle("TITAN_X");
  const state = app.piles.TITAN_X;

  assert.deepEqual(
    Array.from(state.BP.deck, (card) => card.index),
    [2, 3, 4, 5, 6, 7]
  );
  assert.deepEqual(
    Array.from(state.BP.supply.II, (card) => card.index),
    [1, 2, 3, 5, 6, 7]
  );

  state.feint.deck = [{ type: "FEINT", level: "X", index: 8 }];
  app.drawFeint();
  assert.equal(state.special.titanX.pendingEffect.index, 8);
  assert.equal(app.drawFeintButton.disabled, true);
  app.lastZoom.onClose();
  assert.equal(state.special.titanX.pendingEffect, null);
  assert.equal(state.feint.removed[0].index, 8);
  assert.equal(state.BP.deck.some((card) => card.level === "I" && card.index === 1), true);

  state.feint.deck = [
    { type: "FEINT", level: "X", index: 3 },
    { type: "FEINT", level: "X", index: 9 }
  ];
  app.drawFeint();
  assert.equal(state.special.titanX.activeStatus.index, 3);
  app.drawFeint();
  assert.equal(state.special.titanX.activeStatus.index, 9);
  assert.equal(state.feint.active.length, 1);

  state.AI.deck = [
    { type: "AI", level: "I", index: 1 },
    { type: "AI", level: "I", index: 2 },
    { type: "AI", level: "I", index: 3 }
  ];
  app.drawAi();
  assert.equal(state.AI.pending.index, 3);

  state.AI.pending = null;
  state.BP.deck = [
    { type: "BP", level: "I", index: 2 },
    { type: "BP", level: "III", index: 6 }
  ];
  app.drawBp();
  assert.equal(state.BP.pending.index, 6);
  const shufflesBefore = app.shuffleCount;
  app.resolveBp("discard");
  assert.ok(app.shuffleCount > shufflesBefore);
});

test("special controls participate in undo and new campaign reset", () => {
  const app = makeHarness();
  app.renderApostle("MIDASCORE");
  const before = app.piles.MIDASCORE.special.midascore.pain;
  app.C45Specials.handleMidascorePainTokenClick();
  assert.equal(app.piles.MIDASCORE.special.midascore.pain, before + 1);
  app.undoLastAibp("BP");
  assert.equal(app.piles.MIDASCORE.special.midascore.pain, before);

  app.piles.MIDASCORE.special.midascore.pain = 4;
  app.newCampaignButton.dispatch("click");
  assert.equal(app.piles.MIDASCORE.special.midascore.pain, 0);
  assert.equal(
    app.piles.MIDASCORE.tokens.some((item) => item.midascorePain),
    false
  );
});

test("Midascore pain follows BP Wounds and discarded Midas without losing overflow", () => {
  const app = makeHarness();
  app.renderApostle("MIDASCORE");
  const data = () => app.piles.MIDASCORE.special.midascore;
  assert.equal(app.specialRoot.classList.contains("show"), false);
  assert.equal(app.specialRoot.innerHTML, "");

  app.piles.MIDASCORE.BP.deck = [{
    type: "BP",
    level: "III",
    index: 1
  }];
  app.drawBp();
  app.resolveBp("defeat");
  assert.equal(data().pain, 2);
  assert.deepEqual(
    structuredClone(app.piles.MIDASCORE.tokens.find((item) => item.midascorePain)),
    {
      id: "c45-midascore-pain",
      file: "CM.jpg",
      x: 96,
      y: 7.5,
      count: 2,
      midascorePain: true
    }
  );

  app.C45Specials.handleMidascorePainTokenClick();
  assert.equal(data().pain, 3);

  app.C45Specials.recordBpWound(4);
  app.renderAibpCards();
  assert.equal(data().pain, 7);
  assert.equal(
    app.piles.MIDASCORE.tokens.find((item) => item.midascorePain).count,
    7
  );
  app.C45Specials.handleMidascorePainTokenClick();
  assert.equal(data().pain, 2);
  assert.equal(
    app.piles.MIDASCORE.tokens.find((item) => item.midascorePain).count,
    2
  );
  assert.match(app.lastZoom.src, /MIDASCORE_SIGNATURE_X_001\.jpg$/);
});

test("partial special-state saves receive missing defaults", () => {
  const app = makeHarness();
  const midas = initialState();
  midas.special = {
    version: 1,
    commonStatuses: {},
    midascore: {
      pain: 4,
      midasByTitan: { "slot-1": 2 },
      impaledOwner: "slot-1"
    }
  };
  app.piles.MIDASCORE = midas;
  app.renderApostle("MIDASCORE");
  assert.deepEqual(
    structuredClone(app.piles.MIDASCORE.special.midascore),
    { pain: 4 }
  );

  const demidjinn = initialState();
  demidjinn.special = {
    version: 1,
    commonStatuses: {},
    demidjinn: { globalWish: { round: 2 } }
  };
  app.piles.DEMIDJINN = demidjinn;
  app.levels.DEMIDJINN = 2;
  app.renderApostle("DEMIDJINN");
  assert.equal(
    app.piles.DEMIDJINN.special.demidjinn.globalWish.deck.length,
    2
  );
});

test("Dragon and Meduketos panel counters resolve at their thresholds", () => {
  const app = makeHarness();
  app.levels.DRAGON_OF_PHOBOS = 4;
  app.renderApostle("DRAGON_OF_PHOBOS");
  let dragon = app.piles.DRAGON_OF_PHOBOS.special.dragon;
  assert.equal(app.specialRoot.classList.contains("show"), false);
  assert.equal(app.specialRoot.innerHTML, "");
  app.C45Specials.handlePanelCounterTokenClick();
  assert.equal(app.piles.DRAGON_OF_PHOBOS.special.dragon.truthTokens, 1);
  app.C45Specials.handlePanelCounterTokenClick();
  assert.equal(app.piles.DRAGON_OF_PHOBOS.special.dragon.truthTokens, 2);
  app.C45Specials.handlePanelCounterTokenClick();
  dragon = app.piles.DRAGON_OF_PHOBOS.special.dragon;
  assert.equal(dragon.truthTokens, 3);
  assert.deepEqual(
    structuredClone(app.piles.DRAGON_OF_PHOBOS.tokens.find(
      (item) => item.c45PanelCounter === "dragon"
    )),
    {
      id: "c45-dragon-truth",
      file: "CM.jpg",
      x: 93,
      y: 7.5,
      count: 3,
      c45PanelCounter: "dragon"
    }
  );
  app.C45Specials.handlePanelCounterTokenClick();
  dragon = app.piles.DRAGON_OF_PHOBOS.special.dragon;
  assert.equal(dragon.truthTokens, 0);
  assert.equal(
    app.piles.DRAGON_OF_PHOBOS.tokens.some((item) => item.c45PanelCounter === "dragon"),
    false
  );
  assert.equal(app.timers.length, 1);
  app.timers.shift()();
  assert.ok(app.piles.DRAGON_OF_PHOBOS.AI.pending);

  app.renderApostle("MEDUKETOS");
  let meduketos = app.piles.MEDUKETOS.special.meduketos;
  assert.equal(app.specialRoot.classList.contains("show"), false);
  assert.equal(app.specialRoot.innerHTML, "");
  app.C45Specials.handlePanelCounterTokenClick();
  app.C45Specials.handlePanelCounterTokenClick();
  app.C45Specials.handlePanelCounterTokenClick();
  meduketos = app.piles.MEDUKETOS.special.meduketos;
  assert.equal(meduketos.slowBoiling, 3);
  assert.equal(
    app.piles.MEDUKETOS.tokens.find((item) => item.c45PanelCounter === "meduketos").count,
    3
  );
  app.C45Specials.handlePanelCounterTokenClick();
  meduketos = app.piles.MEDUKETOS.special.meduketos;
  assert.equal(meduketos.slowBoiling, 0);
  assert.equal(
    app.piles.MEDUKETOS.tokens.some((item) => item.c45PanelCounter === "meduketos"),
    false
  );
  app.timers.shift()();
  assert.ok(app.piles.MEDUKETOS.AI.pending);
});

test("retired Dahaka, Dragon, and Meduketos modules are removed from saves and UI", () => {
  const app = makeHarness();

  const dahaka = initialState();
  dahaka.special = {
    version: 2,
    commonStatuses: {},
    dahaka: {
      hospitalityOwner: "slot-1",
      hospitalityTarget: "slot-2",
      hospitalityFace: "back",
      precisionByTitan: { "slot-1": 1 }
    }
  };
  app.piles.DAHAKA = dahaka;
  app.renderApostle("DAHAKA");
  assert.equal("dahaka" in app.piles.DAHAKA.special, false);
  assert.doesNotMatch(app.specialRoot.innerHTML, /恐惧的款待|逗留过久|正值精准/);

  const dragon = initialState();
  dragon.special = {
    version: 2,
    commonStatuses: {},
    dragon: {
      assignments: { fear: "slot-1", terror: "slot-2", oxygen: "slot-3" },
      offboard: false,
      truthTokens: 2
    }
  };
  app.piles.DRAGON_OF_PHOBOS = dragon;
  app.renderApostle("DRAGON_OF_PHOBOS");
  assert.deepEqual(
    structuredClone(app.piles.DRAGON_OF_PHOBOS.special.dragon),
    { truthTokens: 2 }
  );
  assert.equal(
    app.piles.DRAGON_OF_PHOBOS.tokens.find(
      (item) => item.c45PanelCounter === "dragon"
    ).count,
    2
  );
  assert.equal(app.specialRoot.innerHTML, "");

  const meduketos = initialState();
  meduketos.special = {
    version: 2,
    commonStatuses: {},
    meduketos: {
      offboard: true,
      vpOwners: ["slot-1", "slot-2"],
      slowBoiling: 1
    }
  };
  app.piles.MEDUKETOS = meduketos;
  app.renderApostle("MEDUKETOS");
  assert.deepEqual(
    structuredClone(app.piles.MEDUKETOS.special.meduketos),
    { slowBoiling: 1 }
  );
  assert.equal(
    app.piles.MEDUKETOS.tokens.find(
      (item) => item.c45PanelCounter === "meduketos"
    ).count,
    1
  );
  assert.equal(app.specialRoot.classList.contains("show"), false);
  assert.equal(app.specialRoot.innerHTML, "");
});

test("retired shared, Ur-Fleece, and Titan X panels are removed", () => {
  const app = makeHarness();

  const urFleece = initialState();
  urFleece.special = {
    version: 4,
    roster: [{ id: "slot-1", name: "Legacy Titan" }],
    commonStatuses: { TERROR: { "slot-1": true } },
    urFleece: { abyss: 11 }
  };
  urFleece.AI.deck.push({
    type: "AI",
    level: "O",
    index: 1,
    specialAi: "ur-fleece-o",
    fileName: "UR_FLEECE_AI_O_001.jpg"
  });
  app.piles.UR_FLEECE = urFleece;
  app.renderApostle("UR_FLEECE");
  const state = app.piles.UR_FLEECE;
  assert.equal("urFleece" in state.special, false);
  assert.equal("commonStatuses" in state.special, false);
  assert.equal("roster" in state.special, false);
  assert.doesNotMatch(
    app.specialRoot.innerHTML,
    /黑暗深渊|公共状态牌|泰坦名单|编辑泰坦名单|特殊 AI O|插入 AI O/
  );
  assert.equal(
    state.AI.deck.some((card) => card.specialAi === "ur-fleece-o"),
    false
  );
  assert.equal(app.specialRoot.classList.contains("show"), false);
  assert.equal(app.specialRoot.innerHTML, "");

  const titanX = initialState();
  titanX.special = {
    version: 3,
    roster: [{ id: "slot-1", name: "Legacy Titan" }],
    commonStatuses: { TERROR: { "slot-1": true } },
    titanX: { extraRounds: 4 }
  };
  titanX.AI.deck.push({
    type: "AI",
    level: "O",
    index: 1,
    specialAi: "titan-x-o",
    fileName: "TITAN_X_AI_O_001.jpg"
  });
  app.piles.TITAN_X = titanX;
  app.renderApostle("TITAN_X");
  assert.equal("extraRounds" in app.piles.TITAN_X.special.titanX, false);
  assert.equal("commonStatuses" in app.piles.TITAN_X.special, false);
  assert.equal("roster" in app.piles.TITAN_X.special, false);
  assert.equal(
    app.piles.TITAN_X.AI.deck.some((card) => card.specialAi === "titan-x-o"),
    false
  );
  assert.equal(app.specialRoot.classList.contains("show"), false);
  assert.equal(app.specialRoot.innerHTML, "");
});

test("recorded titan quantities remain available without rendering a roster module", () => {
  const app = makeHarness("MIDASCORE", {
    localRecord: {
      titans: [
        { id: "argo", name: "Argo", count: 2 },
        { id: "odysseus", name: "Odysseus", count: 1 }
      ]
    }
  });
  const roster = app.C45Specials.getRoster();
  assert.deepEqual(
    Array.from(roster, (titan) => titan.name),
    ["Argo 1", "Argo 2", "Odysseus"]
  );
  assert.doesNotMatch(app.specialRoot.innerHTML, /泰坦名单|编辑泰坦名单/);
});

test("C1-C3 draw and discard paths still delegate to the base module", () => {
  const app = makeHarness();
  app.renderApostle("HEKATON");
  const state = app.piles.HEKATON;
  assert.equal(state.special, undefined);

  app.drawAi();
  assert.equal(state.AI.pending.index, 1);
  app.discardAiPending();
  assert.equal(state.AI.pending, null);
  assert.equal(state.AI.discard.length, 1);

  app.drawBp();
  assert.equal(state.BP.pending.index, 1);
  app.resolveBp("discard");
  assert.equal(state.BP.pending, null);
  assert.equal(state.BP.discard.length, 1);
});

test("leaving Dahaka restores standard C1-C3 button labels", () => {
  const app = makeHarness();
  app.renderApostle("DAHAKA");
  assert.equal(app.promoteAiSingleButton.textContent, "AI/BP 晋升");
  app.renderApostle("HEKATON");
  assert.equal(app.promoteAiSingleButton.textContent, "AI 晋升");
  assert.equal(app.promoteBpSingleButton.textContent, "BP 晋升");
});
