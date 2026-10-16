const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const datasetSource = fs.readFileSync(path.join(root, 'assets/story-doom-card-data.js'), 'utf8');

function dashboardFunction(name) {
  const match = html.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, `index.html must define ${name}`);
  return match[0];
}

function dashboard(cycle = 'c1', positions = {}) {
  const calls = { save: 0, flow: 0, dialog: 0 };
  const sandbox = {
    window: {},
    console,
    state: {
      cardTracks: {
        story: { position: positions.story ?? 1, progress: 0, doom: 0 },
        inwardOdyssey: { position: positions.inwardOdyssey ?? 0, progress: 0, doom: 0 },
        doom: { position: positions.doom ?? 1, progress: 0, doom: 0 },
      },
      mapCurrentTileIsLatestRevealed: true,
    },
    currentCycleConfig: () => ({ id: cycle }),
    saveState: () => { calls.save += 1; },
    renderFlow: () => { calls.flow += 1; },
    renderCardTrackDialog: () => { calls.dialog += 1; },
    ownsDashboardWriteLease: () => true,
    isPlainObject: value => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
    cloneJson: value => JSON.parse(JSON.stringify(value)),
    escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    currentMapTagSet: () => new Set(['progress', 'calamity']),
    currentMapTileLabel: () => '测试板块',
    getMnemosPendingReminders: () => [],
    elements: {
      cardTrackDialog: { dataset: { group: 'doom' } },
      cardTrackBody: { innerHTML: '' },
      cardTrackTitle: { textContent: '' },
    },
    updateDashboardWriteAccessUi() {},
  };
  sandbox.ensureCardTracks = () => sandbox.state.cardTracks;
  const context = vm.createContext(sandbox);
  vm.runInContext(datasetSource, context);
  context.storyDoomData = context.window.ATO_STORY_DOOM_DATA;
  context.cardTrackGroups = {
    story: {
      title: '故事',
      tracks: [
        { key: 'story', label: '故事卡', source: 'storySteps', fixed: false },
        { key: 'inwardOdyssey', label: '内蕴奥德赛', source: 'inwardOdyssey', fixed: true },
      ],
    },
    doom: { title: '灾祸', tracks: [{ key: 'doom', label: '灾祸卡', source: 'doomSteps', fixed: false }] },
  };
  for (const name of [
    'normalizeCounterValue', 'activeStoryDoomData', 'cardTrackCard', 'cardTrackPreviewCard',
    'cardTrackStatus', 'cardTrackMeta', 'cardTrackTokenState', 'cardTokenLimitText',
    'cardTokenPlacementTargets', 'renderCardTokenPlacementTools', 'refreshCardTokenViews', 'placeCardTrackToken',
    'getMapProgressTechReminders', 'getStoryMapReminders', 'getDoomMapReminders', 'renderStepTrackReminders',
    'doomSaveFateSources',
  ]) vm.runInContext(dashboardFunction(name), context);
  context.calls = calls;
  context.loadDialog = () => vm.runInContext(dashboardFunction('renderCardTrackDialog'), context);
  return context;
}

function placementButtons(markup) {
  return [...String(markup).matchAll(/<button\b[^>]*\bdata-card-token-place="[^"]+"[^>]*>/g)].map(match => match[0]);
}

function hasPlacement(markup, key, field, amount) {
  return placementButtons(markup).some(button => button.includes(`data-card-token-place="${key}"`)
    && button.includes(`data-card-token-field="${field}"`)
    && (amount === undefined || button.includes(`data-amount="${amount}"`)));
}

function tokenElement(tag) {
  const element = {
    tagName: String(tag).toUpperCase(), className: '', textContent: '', children: [], listeners: {},
    prepend(child) { this.children.unshift(child); },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    querySelectorAll(selector) { return selector === '[data-card-token-place]' ? this.buttons : []; },
    buttons: [],
  };
  Object.defineProperty(element, 'innerHTML', {
    get() { return this.markup || ''; },
    set(markup) {
      this.markup = String(markup);
      this.buttons = placementButtons(markup).map(tag => ({
        disabled: /\bdisabled\b/.test(tag),
        dataset: {
          cardTokenPlace: tag.match(/data-card-token-place="([^"]+)"/)[1],
          cardTokenField: tag.match(/data-card-token-field="([^"]+)"/)[1],
          amount: tag.match(/data-amount="([^"]+)"/)[1],
        },
        closest(selector) { return selector === '[data-card-token-place]' ? this : null; },
      }));
    },
  });
  return element;
}

function explorationDashboard(cycle = 'c1') {
  const app = dashboard(cycle);
  const entry = { id: 123, name: '测试探索卡', day: 1, drawnAt: 12345 };
  const local = { applied: {}, manual: {}, skipped: {}, tokenPlacements: {} };
  app.document = { createElement: tokenElement };
  app.state.exploration = { drawStateByCycle: { [cycle]: { activePiles: [[entry]] } } };
  app.explorationEffectState = () => app.local;
  app.getExplorationSettlement = () => app.testExplorationSettlement || null;
  app.mutateExplorationRecord = { busy: false };
  app.explorationCardResources = () => ({});
  app.explorationCardContext = () => ({});
  app.explorationResourceRules = () => ({ plan: () => ({ grants: [], variants: [] }) });
  app.explorationEffectDescriptors = () => app.testExplorationItems;
  app.explorationManagedChoices = () => [];
  app.explorationOptionRules = () => null;
  app.explorationDelayRules = () => null;
  app.testExplorationItems = [];
  for (const name of [
    'explorationRoundId', 'explorationNeedsPlacement', 'explorationHasRecordOperation',
    'explorationPlacementText', 'remainingExplorationTokenPlacements', 'explorationTokenPlacementBlocked',
    'placeExplorationCardToken', 'createExplorationTokenPlacementTools', 'pendingExplorationEffects',
    'explorationTokenPlacementQueue', 'queuedExplorationTokenTask', 'explorationTokenPlacementState',
    'pendingExplorationTokenReminders', 'syncExplorationTokenPlacementQueue',
    'updateExplorationTokenTask',
  ]) vm.runInContext(dashboardFunction(name), app);
  app.entry = entry;
  app.local = local;
  return app;
}

function mapReminderDashboard(cycle = 'c1', unlocked = ['hope logic']) {
  const app = dashboard(cycle);
  app.cachedArgoRecord = { fate: '2' };
  app.state.mapSnapshot = { cycleId: cycle, currentTileId: 'tile-a', exploredIds: ['tile-a'] };
  app.state.mapCurrentTileTags = ['progress', 'calamity'];
  app.currentMapTagSet = () => new Set(app.state.mapCurrentTileTags);
  app.window.ATO_STRUCTURE_TECH_RULES = require('../technology/structure-tech-rules.js');
  app.saveContext = { dictionary: require('../technology/tech_card_dictionary.min.json'),
    technology: { unlocked }, cycleId: cycle, record: app.cachedArgoRecord };
  app.getStructureTechContext = () => app.saveContext;
  vm.runInContext(dashboardFunction('structureSaveReminders'), app);
  return app;
}

function placementItem(overrides = {}) {
  return {
    id: 'manual:0', text: '放置进展', effects: [], conditionState: true,
    remainder: '请放置2枚进展', placementOnly: true,
    manualPlacements: [{ type: 'progress', amount: 2 }],
    ...overrides,
  };
}

function loadRealCardTrackSetters(app) {
  // The real normalizer rebuilds state.cardTracks on every call. A setter must
  // write the live object after its permission lookup normalizes the tracks.
  for (const name of [
    'argoKnowledgeStart', 'normalizeCardTrackEntry', 'normalizeCardTracks', 'ensureCardTracks',
    'setCardTrackProgress', 'stepCardTrackProgress', 'setCardTrackCounter', 'stepCardTrackCounter',
  ]) vm.runInContext(dashboardFunction(name), app);
}

function queuedExplorationDashboard(cycle = 'c1') {
  const app = explorationDashboard(cycle);
  app.isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  app.cloneJson = value => JSON.parse(JSON.stringify(value));
  app.todayTrackIcons = () => [];
  app.testExplorationItemsByRound = {};
  app.testExplorationLocalsByRound = {};
  app.explorationEffectState = entry => {
    if (app.explorationRoundId(entry) === app.explorationRoundId(app.entry)) return app.local;
    return app.testExplorationLocalsByRound[app.explorationRoundId(entry)] ||= { applied: {}, manual: {}, skipped: {}, tokenPlacements: {} };
  };
  app.explorationEffectDescriptors = entry => app.testExplorationItemsByRound[app.explorationRoundId(entry)] || app.testExplorationItems;
  Object.assign(app.state.exploration.drawStateByCycle[cycle], {
    drawPile: [], temporaryRemoved: [], permanentRemoved: [], history: [], discardPile: [], current: null,
  });
  app.ensureExplorationDrawState = () => app.state.exploration.drawStateByCycle[cycle];
  app.explorationRules = () => ({ settlePiles: () => ({ returnIds: [], temporaryRemoved: [], permanentIds: [] }) });
  app.getDestructionCardIds = () => [];
  app.getDestructionPileIds = () => [];
  app.shuffleList = values => [...values];
  app.processExplorationDelays = () => {};
  app.window.confirm = () => true;
  for (const name of [
    'normalizeExploration', 'pendingExplorationTokenReminders', 'explorationTokenPlacementQueue',
    'queuedExplorationTokenTask', 'explorationTokenPlacementState', 'syncExplorationTokenPlacementQueue',
    'getExplorationStepTokenReminders', 'getStepTrackReminders', 'endExplorationDraw',
  ]) vm.runInContext(dashboardFunction(name), app);
  vm.runInContext('let explorationSettlePrepared = false;', app);
  return app;
}

test('soft limits retain every printed threshold and warn without imposing a maximum', () => {
  const app = dashboard();
  const below = app.cardTokenLimitText(0, [2, 5, 9]);
  const at = app.cardTokenLimitText(5, [2, 5, 9]);
  const over = app.cardTokenLimitText(10, [2, 5, 9]);
  for (const text of [below, at, over]) {
    assert.match(text, /上限/);
    assert.doesNotMatch(text, /软上限/);
    for (const limit of [2, 5, 9]) assert.match(text, new RegExp(String(limit)));
  }
  assert.match(at, /已达到/);
  assert.match(over, /已超过/);
  assert.match(app.cardTokenLimitText(50, []), /无固定上限/);
});

test('C5 opening story faces remove earned progress only after city confirmation and keep manual counts editable', () => {
  for (const [position, initial] of [[1, 4], [2, 3]]) {
    const app = dashboard('c5', { story: position });
    app.state.cardTracksVersion = 2;
    loadRealCardTrackSetters(app);
    app.setCardTrackProgress('story', initial);
    const target = app.cardTrackTokenState('story', 'progress');
    assert.equal(target.gainMode, 'remove');
    assert.equal(target.gainCondition, 'lastVisitedCity');
    assert.match(target.statusText, /仅最后访问城市/);
    const markup = app.renderCardTokenPlacementTools([{ type: 'progress', amount: 2 }]);
    assert.match(markup, /data-card-token-place="story"[^>]*aria-label="[^"]*移除 2 枚进展">−2/);
    let confirmed = false;
    const prompts = [];
    app.window.confirm = message => { prompts.push(message); return confirmed; };
    assert.equal(app.placeCardTrackToken('story', 'progress', 2), false);
    assert.equal(app.state.cardTracks.story.progress, initial);
    assert.match(prompts[0], /当前板块.*最后访问城市/);
    confirmed = true;
    assert.equal(app.placeCardTrackToken('story', 'progress', 2), true);
    assert.equal(app.state.cardTracks.story.progress, initial - 2);
    assert.equal(app.placeCardTrackToken('story', 'progress', 10), true);
    assert.equal(app.state.cardTracks.story.progress, 0);
    const promptCount = prompts.length;
    assert.equal(app.placeCardTrackToken('story', 'progress', 1), false);
    assert.equal(prompts.length, promptCount);
    assert.match(app.renderCardTokenPlacementTools([{ type: 'progress', amount: 1 }]), /data-card-token-place="story"[^>]* disabled/);
    app.setCardTrackProgress('story', initial);
    assert.equal(app.state.cardTracks.story.progress, initial);
  }
});

test('C5 exploration earned progress consumes its positive request only when story progress is removed', () => {
  const app = explorationDashboard('c5');
  app.state.cardTracks.story.progress = 3;
  const item = placementItem();
  app.testExplorationItems = [item];
  app.window.confirm = () => false;
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), false);
  assert.equal(app.state.cardTracks.story.progress, 3);
  assert.equal(app.local.tokenPlacements[item.id], undefined);
  assert.equal(app.local.manual[item.id], undefined);
  app.window.confirm = () => true;
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), true);
  assert.equal(app.state.cardTracks.story.progress, 1);
  assert.equal(app.local.tokenPlacements[item.id].progress, 2);
  assert.equal(app.local.manual[item.id], true);
  assert.equal(app.remainingExplorationTokenPlacements(app.entry, item).length, 0);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), false);
});

test('Inward Odyssey plus, input, and minus controls write live normalized tracks', () => {
  const app = dashboard();
  loadRealCardTrackSetters(app);
  const original = app.state.cardTracks;
  app.stepCardTrackProgress('inwardOdyssey', 1);
  assert.notEqual(app.state.cardTracks, original);
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 1);
  app.setCardTrackProgress('inwardOdyssey', '4');
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 4);
  app.stepCardTrackProgress('inwardOdyssey', -1);
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 3);
  app.setCardTrackProgress('inwardOdyssey', '0');
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 0);
  assert.deepEqual(app.calls, { save: 4, flow: 4, dialog: 4 });
});

test('story progress and doom controls preserve writes when status lookups replace the track object', () => {
  const app = dashboard();
  loadRealCardTrackSetters(app);
  app.stepCardTrackProgress('story', 1);
  assert.equal(app.state.cardTracks.story.progress, 1);
  app.setCardTrackProgress('story', '7');
  assert.equal(app.state.cardTracks.story.progress, 7);
  app.stepCardTrackProgress('story', -1);
  assert.equal(app.state.cardTracks.story.progress, 6);
  app.stepCardTrackCounter('doom', 'doom', 1);
  assert.equal(app.state.cardTracks.doom.doom, 1);
  app.setCardTrackCounter('doom', 'doom', '8');
  assert.equal(app.state.cardTracks.doom.doom, 8);
  app.stepCardTrackCounter('doom', 'doom', -1);
  assert.equal(app.state.cardTracks.doom.doom, 7);
  assert.deepEqual(app.calls, { save: 6, flow: 6, dialog: 6 });
});

test('doom input and plus controls reject increases until a card face is active', () => {
  const app = dashboard('c1', { doom: 0 });
  loadRealCardTrackSetters(app);
  app.setCardTrackCounter('doom', 'doom', '2');
  assert.equal(app.state.cardTracks.doom.doom, 0);
  app.stepCardTrackCounter('doom', 'doom', 1);
  assert.equal(app.state.cardTracks.doom.doom, 0);
  assert.deepEqual(app.calls, { save: 0, flow: 0, dialog: 0 });
});

test('an active story face accepts progress beyond its soft limit and refreshes both views', () => {
  const app = dashboard();
  const track = app.state.cardTracks.story;
  track.progress = 6;
  app.placeCardTrackToken('story', 'progress', 3);
  assert.equal(track.progress, 9);
  assert.equal(app.calls.save, 1);
  assert.equal(app.calls.flow, 1);
  assert.equal(app.calls.dialog, 1);
  const status = app.cardTrackTokenState('story', 'progress');
  assert.equal(status.allowed, true);
  assert.equal(status.count, 9);
  assert.deepEqual(Array.from(status.limits), [6]);
});

test('deferred placement lets exploration counters and completion markers save together', () => {
  const app = dashboard();
  assert.equal(app.placeCardTrackToken('story', 'progress', 2, false), true);
  assert.equal(app.placeCardTrackToken('doom', 'doom', 1, false), true);
  assert.equal(app.state.cardTracks.story.progress, 2);
  assert.equal(app.state.cardTracks.doom.doom, 1);
  assert.deepEqual(app.calls, { save: 0, flow: 0, dialog: 0 });
  app.refreshCardTokenViews();
  assert.deepEqual(app.calls, { save: 1, flow: 1, dialog: 1 });
});

test('placement rechecks the current story face, and forbidden or inactive cards do not change', () => {
  const app = dashboard('c1', { story: 2, doom: 0 });
  app.state.cardTracks.story.progress = 4;
  assert.equal(app.cardTrackTokenState('story', 'progress').allowed, false);
  assert.equal(app.cardTrackTokenState('doom', 'doom').allowed, false);
  app.placeCardTrackToken('story', 'progress', 1);
  app.placeCardTrackToken('doom', 'doom', 1);
  assert.equal(app.state.cardTracks.story.progress, 4);
  assert.equal(app.state.cardTracks.doom.doom, 0);
  assert.equal(app.calls.save, 0);
  app.state.cardTracks.story.position = 1;
  assert.equal(app.cardTrackTokenState('story', 'progress').allowed, true);
  app.state.cardTracks.story.position = 0;
  app.placeCardTrackToken('story', 'progress', 1);
  assert.equal(app.state.cardTracks.story.progress, 4);
  assert.equal(app.calls.save, 0);
});

test('Inward Odyssey remains a progress target and allows progress beyond its soft limit of one', () => {
  const app = dashboard('c1', { story: 0 });
  const status = app.cardTrackTokenState('inwardOdyssey', 'progress');
  assert.equal(status.allowed, true);
  assert.deepEqual(Array.from(status.limits), [1]);
  app.state.cardTracks.inwardOdyssey.progress = 1;
  app.placeCardTrackToken('inwardOdyssey', 'progress', 2);
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 3);
  assert.equal(app.state.cardTracks.inwardOdyssey.position, 0);
  app.placeCardTrackToken('inwardOdyssey', 'doom', 1);
  assert.equal(app.state.cardTracks.inwardOdyssey.doom, 0);
  assert.equal(app.calls.save, 1);
});

test('progress reminders list story and Inward Odyssey while ordinary doom targets stay hidden', () => {
  const app = dashboard('c1', { story: 2 });
  const targets = app.cardTokenPlacementTargets('progress');
  assert.ok(Array.from(targets, value => typeof value === 'string' ? value : value.key).includes('story'));
  assert.ok(Array.from(targets, value => typeof value === 'string' ? value : value.key).includes('inwardOdyssey'));
  app.state.cardTracks.story.progress = 4;
  app.state.cardTracks.inwardOdyssey.progress = 1;
  const markup = app.renderCardTokenPlacementTools([{ type: 'progress', amount: 2 }]);
  assert.match(markup, /故事卡/);
  assert.match(markup, /内蕴奥德赛/);
  assert.doesNotMatch(markup, /灾祸卡/);
  assert.match(markup, /title="[^"]*已放 4/);
  assert.match(markup, /title="[^"]*上限/);
  assert.equal(hasPlacement(markup, 'story', 'progress'), false);
  assert.equal(hasPlacement(markup, 'doom', 'progress'), false);
  assert.equal(hasPlacement(markup, 'inwardOdyssey', 'progress', 2), true);
});

test('doom reminders only target the active doom card and can place beyond its printed cap', () => {
  const app = dashboard();
  assert.deepEqual(Array.from(app.cardTokenPlacementTargets('doom'), value => typeof value === 'string' ? value : value.key), ['doom']);
  app.state.cardTracks.doom.doom = 5;
  const markup = app.renderCardTokenPlacementTools([{ type: 'doom', amount: 2 }]);
  assert.equal(hasPlacement(markup, 'doom', 'doom', 2), true);
  assert.equal(hasPlacement(markup, 'story', 'doom'), false);
  assert.equal(hasPlacement(markup, 'inwardOdyssey', 'doom'), false);
  app.placeCardTrackToken('doom', 'doom', 2);
  assert.equal(app.state.cardTracks.doom.doom, 7);
});

test('cycle IV doom investment permits progress and ordinary doom cards reject it', () => {
  const special = dashboard('c4', { doom: 6 });
  assert.equal(special.cardTrackTokenState('doom', 'progress').allowed, true);
  special.state.cardTracks.doom.progress = 8;
  special.placeCardTrackToken('doom', 'progress', 2);
  assert.equal(special.state.cardTracks.doom.progress, 10);
  assert.equal(hasPlacement(special.renderCardTokenPlacementTools([{ type: 'progress', amount: 1 }]), 'doom', 'progress', 1), true);
  for (const cycle of ['c1', 'c2', 'c3', 'c5']) {
    const ordinary = dashboard(cycle);
    ordinary.placeCardTrackToken('doom', 'progress', 1);
    assert.equal(ordinary.state.cardTracks.doom.progress, 0, cycle);
    assert.equal(ordinary.calls.save, 0, cycle);
  }
});

test('doom dialogs hide progress controls outside cycle IV and retain doom controls', () => {
  for (const cycle of ['c1', 'c2', 'c3', 'c5']) {
    const app = dashboard(cycle);
    app.loadDialog();
    app.renderCardTrackDialog('doom');
    const markup = app.elements.cardTrackBody.innerHTML;
    assert.doesNotMatch(markup, /data-card-progress(?:-input)?="doom"/, cycle);
    assert.match(markup, /data-card-counter="doom"/, cycle);
    assert.match(markup, /title="[^"]*上限/, cycle);
  }
  const special = dashboard('c4');
  special.loadDialog();
  special.renderCardTrackDialog('doom');
  assert.match(special.elements.cardTrackBody.innerHTML, /data-card-progress="doom"/);
  assert.match(special.elements.cardTrackBody.innerHTML, /data-card-counter="doom"/);
  const counterTitles = [...special.elements.cardTrackBody.innerHTML.matchAll(/<span\b[^>]*class="card-track-counter-label"[^>]*>/g)];
  assert.equal(counterTitles.length, 2);
  for (const [tag] of counterTitles) assert.match(tag, /title="[^"]*上限/);

  const story = dashboard('c1', { story: 3 });
  story.loadDialog();
  story.renderCardTrackDialog('story');
  const storyTitles = [...story.elements.cardTrackBody.innerHTML.matchAll(/<span\b[^>]*class="card-track-counter-label"[^>]*>/g)];
  assert.equal(storyTitles.length, 2);
  for (const [tag] of storyTitles) assert.match(tag, /title="[^"]*上限/);
  assert.match(storyTitles[0][0], /上限 2 \/ 9/);
  assert.match(storyTitles[1][0], /上限 1/);
});

test('map progress and doom reminders retain normal quick placement', () => {
  const app = mapReminderDashboard();
  app.state.cardTracks.story.progress = 3;
  const progress = app.renderStepTrackReminders(app.getStoryMapReminders());
  const doom = app.renderStepTrackReminders(app.getDoomMapReminders());
  assert.match(progress, /新探索板块放置进展/);
  assert.match(progress, /内蕴奥德赛/);
  assert.match(progress, /title="[^"]*上限/);
  assert.equal(hasPlacement(progress, 'story', 'progress', 1), true);
  assert.equal(hasPlacement(progress, 'inwardOdyssey', 'progress', 1), true);
  assert.equal(hasPlacement(doom, 'doom', 'doom', 1), true);
  assert.match(doom, /title="[^"]*上限/);
});

test('map Doom appends the Save cost, check and effect to the tile description without blocking placement', () => {
  for (const [cycle, key, name, expected] of [
    ['c1', 'hope logic', '希望之解', /\+1 命运.*检定 8\+.*成功时本次灾祸增加量降低 1。/],
    ['c3', 'sun shielding', '太阳防护', /失去 1 凝固时光.*掷 1d10.*4\+ 忽略本次灾祸增加/],
  ]) {
    const app = mapReminderDashboard(cycle, [key]);
    const markup = app.renderStepTrackReminders(app.getDoomMapReminders());
    const hint = markup.match(/<p class="step-track-desc">([^]*?)<\/p>/);
    assert.ok(hint);
    assert.match(hint[1], new RegExp(`带有灾祸标记。请在灾祸步骤放置 1 个灾祸指示物。 ${name}：`));
    assert.match(hint[1], expected);
    assert.doesNotMatch(hint[1], /X|当前灾祸卡编号/);
    assert.ok(markup.indexOf(hint[0]) < markup.indexOf('data-card-token-place='));
    assert.doesNotMatch(markup, /如需使用请按卡面手动结算/);
    assert.doesNotMatch(markup, /可用豁免|（最低\s*0）|step-track-save-hint/);
    assert.doesNotMatch(markup, /<img|<details|继续原效果|本项已手动处理|\bdisabled\b/);
    assert.equal(hasPlacement(markup, 'doom', 'doom', 1), true);
    // 「+1 命运」的豁免带一键加命运按钮（样式同已探索板块进展）；凝固时光那类代价不配这个按钮。
    if (key === 'hope logic') {
      assert.match(markup, /data-doom-save-fate="hope logic"[^>]*>命运 \+1<\/button>/);
    } else {
      assert.doesNotMatch(markup, /data-doom-save-fate/);
    }
    assert.equal(app.placeCardTrackToken('doom', 'doom', 1), true);
    assert.equal(app.state.cardTracks.doom.doom, 1);
    assert.equal(app.cachedArgoRecord.fate, '2');
  }
});

test('map Doom Save records Fate +1 from the latest record and stops at the Fate cap', async () => {
  const app = mapReminderDashboard('c1', ['hope logic']);
  const alerts = [];
  app.window.alert = message => alerts.push(message);
  app.structureTechTarget = () => ({ cycleId: 'c1' });
  app.assertStructureTechTarget = () => {};
  app.explorationEffectRules = () => require('../assets/exploration-card-effects.js');
  app.refreshStructureTechContext = async () => {};
  let saved;
  app.mutateExplorationRecord = async mutate => {
    saved = mutate({ cycle: 'c1', fate: '6', cycleStats: { c1: { fate: '6' } }, resources: { untouched: 9 } }).record;
  };
  vm.runInContext(dashboardFunction('addDoomSaveTechFate'), app);
  await app.addDoomSaveTechFate('hope logic');
  assert.equal(saved.cycleStats.c1.fate, '7');
  assert.equal(saved.fate, '7');
  assert.equal(saved.resources.untouched, 9);
  assert.deepEqual(alerts, []);
  saved = undefined;
  app.mutateExplorationRecord = async mutate => { saved = mutate({ cycle: 'c1', fate: '11' }).record; };
  await app.addDoomSaveTechFate('hope logic');
  assert.equal(saved, undefined, 'a Save that would pass the Fate cap must not partially apply');
  assert.match(alerts[0], /超过上限/);
});

test('Hope Logic uses the current printed Doom card number across A/B sides and updates after advancement', () => {
  const app = mapReminderDashboard('c1', ['hope logic']);
  for (const [position, threshold] of [[1, 8], [2, 8], [3, 7], [4, 7], [5, 6], [6, 6]]) {
    app.state.cardTracks.doom.position = position;
    const hint = app.getDoomMapReminders()[0].desc;
    assert.ok(hint.includes(`检定 ${threshold}+`), `Doom position ${position}: ${hint}`);
    assert.doesNotMatch(hint, /X|当前灾祸卡编号/);
  }
  app.state.cardTracks.doom.position = 0;
  const pending = app.getDoomMapReminders()[0].desc;
  assert.match(pending, /选择当前灾祸卡/);
  assert.doesNotMatch(pending, /检定 \d+\+|X|NaN/, 'an unstarted track must not borrow the preview card number');
});

test('map Doom omits unavailable Save hints without blocking placement', () => {
  const app = mapReminderDashboard('c1', []);
  assert.doesNotMatch(app.renderStepTrackReminders(app.getDoomMapReminders()), /希望之解/);
  app.saveContext = null;
  assert.doesNotMatch(app.renderStepTrackReminders(app.getDoomMapReminders()), /希望之解/);
  assert.equal(app.placeCardTrackToken('doom', 'doom', 1), true);
  app.state.mapCurrentTileTags = ['progress'];
  assert.equal(app.getDoomMapReminders().length, 0);
});

test('all five explored-tile technologies remind their printed cost and reward in the story step without applying them', () => {
  for (const [cycle, key, name, fate] of [
    ['c1', 'deeply embedded spies', '敌后密探', 2],
    ['c2', 'grassroot support', '基层支持', 1],
    ['c3', "delphi peoples' support", '德尔菲人民支援', 1],
    ['c4', 'archeohistorians', '考古历史学家', 2],
    ['c5', 'pattern deciphering', '模式破译', 1],
  ]) {
    const app = mapReminderDashboard(cycle, [key]);
    app.state.mapCurrentTileIsLatestRevealed = false;
    const before = JSON.stringify(app.state);
    const reminders = app.getStoryMapReminders();
    assert.equal(reminders.length, 1);
    assert.match(reminders[0].title, new RegExp(name));
    assert.ok(reminders[0].desc.includes(`+${fate} 命运`));
    assert.match(reminders[0].desc, /外交（7\+）.*成功时获得 1 进展/);
    if (cycle === 'c4') assert.match(reminders[0].desc, /或在内蕴奥德赛上放置 1 个进展指示物/);
    assert.match(reminders[0].desc, /失败时不增加进展/);
    const markup = app.renderStepTrackReminders(reminders);
    assert.equal(hasPlacement(markup, 'story', 'progress', 1), true);
    assert.equal(hasPlacement(markup, 'inwardOdyssey', 'progress', 1), true);
    assert.ok(markup.includes(`data-map-progress-fate="${key}"`));
    assert.ok(markup.includes(`>命运 +${fate}</button>`));
    assert.equal(JSON.stringify(app.state), before);
    assert.equal(app.cachedArgoRecord.fate, '2');
  }
});

test('map progress technology Fate uses the latest record and leaves progress for a separate click', async () => {
  for (const [cycle, key, amount] of [
    ['c1', 'deeply embedded spies', 2], ['c2', 'grassroot support', 1],
    ['c3', "delphi peoples' support", 1], ['c4', 'archeohistorians', 2], ['c5', 'pattern deciphering', 1],
  ]) {
    const app = mapReminderDashboard(cycle, [key]);
    const alerts = [];
    app.window.alert = message => alerts.push(message);
    app.structureTechTarget = () => ({ cycleId: cycle });
    app.assertStructureTechTarget = () => {};
    app.explorationEffectRules = () => require('../assets/exploration-card-effects.js');
    let saved;
    app.mutateExplorationRecord = async mutate => {
      saved = mutate({ cycle, fate: '6', cycleStats: { [cycle]: { fate: '6' } }, resources: { untouched: 9 } }).record;
    };
    app.refreshStructureTechContext = async () => {};
    vm.runInContext(dashboardFunction('addMapProgressTechFate'), app);
    await app.addMapProgressTechFate(key);
    assert.equal(saved.cycleStats[cycle].fate, String(6 + amount));
    assert.equal(saved.fate, String(6 + amount));
    assert.equal(saved.resources.untouched, 9);
    assert.equal(app.state.cardTracks.story.progress, 0);
    assert.deepEqual(alerts, []);
    saved = undefined;
    app.mutateExplorationRecord = async mutate => { saved = mutate({ cycle, fate: '12' }).record; };
    await app.addMapProgressTechFate(key);
    assert.equal(saved, undefined, 'over-limit payment must not partially apply');
    assert.match(alerts[0], /超过上限/);
  }
});

test('explored-tile progress reminders exclude preview-only, untagged, stale-cycle and missing map data', () => {
  const app = mapReminderDashboard('c1', ['deeply embedded spies']);
  app.state.mapCurrentTileIsLatestRevealed = false;
  app.state.mapSnapshot.exploredIds = [];
  assert.equal(app.getMapProgressTechReminders().length, 0, 'revealing a scout preview does not explore the tile');
  app.state.mapSnapshot.exploredIds = ['tile-a'];
  app.state.mapCurrentTileTags = ['city'];
  assert.equal(app.getMapProgressTechReminders().length, 0);
  app.state.mapCurrentTileTags = ['progress'];
  app.state.mapSnapshot.cycleId = 'c2';
  assert.equal(app.getMapProgressTechReminders().length, 0);
  app.state.mapSnapshot = null;
  assert.equal(app.getMapProgressTechReminders().length, 0);
});

test('explored-tile progress reminders follow unlocks, cycle scope, unimportant preferences and temporary disablement', () => {
  const app = mapReminderDashboard('c1', ['deeply embedded spies']);
  assert.equal(app.getMapProgressTechReminders().length, 1);
  app.saveContext.technology.unlocked = [];
  assert.equal(app.getMapProgressTechReminders().length, 0);
  app.saveContext.technology = { unlocked: ['deeply embedded spies'], unimportant: ['deeply embedded spies'] };
  assert.equal(app.getMapProgressTechReminders().length, 0);
  app.saveContext.technology.unimportant = [];
  app.saveContext.record.explorationDelays = { disabledTechs: { c1: { 'deeply embedded spies': {} } } };
  assert.equal(app.getMapProgressTechReminders().length, 0);
  const wrongCycle = mapReminderDashboard('c2', ['deeply embedded spies']);
  assert.equal(wrongCycle.getMapProgressTechReminders().length, 0);
});

test('an exploration shortcut places once, marks a pure placement complete, and clears its pending task', () => {
  const app = explorationDashboard();
  const item = placementItem();
  app.testExplorationItems = [item];
  assert.equal(app.pendingExplorationEffects().length, 1);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'inwardOdyssey', 'progress'), true);
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 2);
  assert.equal(app.local.tokenPlacements[item.id].progress, 2);
  assert.equal(app.local.manual[item.id], true);
  assert.equal(app.remainingExplorationTokenPlacements(app.entry, item).length, 0);
  assert.equal(app.pendingExplorationEffects().length, 0);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), false);
  assert.equal(app.state.cardTracks.story.progress, 0);
  assert.equal(app.calls.save, 1);
});

test('a mixed progress and doom exploration task completes only after both fields are placed', () => {
  const app = explorationDashboard();
  const item = placementItem({
    remainder: '请放置2枚进展和1枚灾祸',
    manualPlacements: [{ type: 'progress', amount: 2 }, { type: 'doom', amount: 1 }],
  });
  app.testExplorationItems = [item];
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), true);
  assert.equal(app.local.manual[item.id], undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(app.remainingExplorationTokenPlacements(app.entry, item))), [{ type: 'doom', amount: 1 }]);
  assert.equal(app.pendingExplorationEffects().length, 1);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'inwardOdyssey', 'progress'), false);
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 0);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'doom', 'doom'), true);
  assert.equal(app.state.cardTracks.story.progress, 2);
  assert.equal(app.state.cardTracks.doom.doom, 1);
  assert.equal(app.local.manual[item.id], true);
  assert.equal(app.pendingExplorationEffects().length, 0);
  assert.equal(app.calls.save, 2);
});

test('exploration placement respects an explicit Inward Odyssey target in rendering and the handler', () => {
  const app = explorationDashboard('c4');
  const item = placementItem({ manualPlacements: [{ type: 'progress', amount: 2, target: 'inwardOdyssey' }] });
  const remaining = app.remainingExplorationTokenPlacements(app.entry, item);
  assert.equal(remaining[0].target, 'inwardOdyssey');
  const box = app.createExplorationTokenPlacementTools(app.entry, item);
  assert.equal(hasPlacement(box.innerHTML, 'inwardOdyssey', 'progress', 2), true);
  assert.equal(hasPlacement(box.innerHTML, 'story', 'progress'), false);
  assert.equal(hasPlacement(box.innerHTML, 'doom', 'progress'), false);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), false);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'doom', 'progress'), false);
  assert.equal(app.calls.save, 0);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'inwardOdyssey', 'progress'), true);
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 2);
});

test('unconfirmed conditions and unsettled dependencies disable exploration placement and reject direct calls', () => {
  const cases = [
    { conditionState: null },
    { conditionState: false },
    { requiresResource: true },
    { requiresEffect: 'manual:prior' },
    { requiresManual: 'manual:prior-event' },
    { effects: [{ type: 'crew', amount: 1 }], placementOnly: false },
    { receiptMismatch: true },
  ];
  for (const overrides of cases) {
    const app = explorationDashboard();
    const item = placementItem(overrides);
    assert.ok(app.explorationTokenPlacementBlocked(app.entry, item));
    const box = app.createExplorationTokenPlacementTools(app.entry, item);
    const buttons = box.querySelectorAll('[data-card-token-place]');
    assert.ok(buttons.length > 0);
    assert.ok(buttons.every(button => button.disabled));
    assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), false);
    assert.equal(app.state.cardTracks.story.progress, 0);
    assert.equal(app.calls.save, 0);
  }
});

test('an unknown exploration condition can be confirmed before choosing a token placement', () => {
  const app = explorationDashboard();
  const item = placementItem({ conditionState: null });
  const initial = app.createExplorationTokenPlacementTools(app.entry, item);
  assert.ok(initial.querySelectorAll('[data-card-token-place]').every(button => button.disabled));
  const confirm = initial.children.find(child => child.tagName === 'BUTTON' && child.textContent === '确认条件成立，选择放置');
  assert.ok(confirm);
  confirm.listeners.click();
  assert.equal(app.local.tokenPlacementConditions[item.id], true);
  assert.equal(app.explorationTokenPlacementBlocked(app.entry, item), '');
  assert.deepEqual(app.calls, { save: 1, flow: 1, dialog: 0 });
  const refreshed = app.createExplorationTokenPlacementTools(app.entry, item);
  const button = refreshed.querySelectorAll('[data-card-token-place]').find(button => button.dataset.cardTokenPlace === 'inwardOdyssey');
  assert.ok(button);
  assert.equal(button.disabled, false);
  refreshed.listeners.click({ target: button, stopPropagation() {} });
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 2);
  assert.equal(app.local.manual[item.id], true);
  assert.deepEqual(app.calls, { save: 2, flow: 2, dialog: 1 });
});

test('a known false exploration condition cannot be bypassed by a saved confirmation', () => {
  const app = explorationDashboard();
  const item = placementItem({ conditionState: false });
  app.local.tokenPlacementConditions = { [item.id]: true };
  assert.ok(app.explorationTokenPlacementBlocked(app.entry, item));
  const box = app.createExplorationTokenPlacementTools(app.entry, item);
  assert.ok(box.querySelectorAll('[data-card-token-place]').every(button => button.disabled));
  assert.equal(box.children.some(child => child.tagName === 'BUTTON' && child.textContent === '确认条件成立，选择放置'), false);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'inwardOdyssey', 'progress'), false);
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 0);
  assert.equal(app.calls.save, 0);
});

test('placing tokens preserves a non-placement remainder as a manual task', () => {
  const app = explorationDashboard();
  const item = placementItem({
    effects: [{ type: 'crew', amount: 1 }], placementOnly: false,
    text: '获得船员、放置进展、抽取遇难者牌', remainder: '抽取遇难者牌',
  });
  app.testExplorationItems = [item];
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), false);
  app.local.applied[item.id] = { changes: [{ type: 'crew', amount: 1 }] };
  assert.equal(app.explorationTokenPlacementBlocked(app.entry, item), '');
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), true);
  assert.equal(app.state.cardTracks.story.progress, 2);
  assert.equal(app.local.manual[item.id], undefined);
  assert.equal(app.remainingExplorationTokenPlacements(app.entry, item).length, 0);
  assert.equal(app.pendingExplorationEffects().length, 1);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), false);
  assert.equal(app.state.cardTracks.story.progress, 2);
});

test('an exploration wrapper stops bubbling so its shortcut cannot place twice', () => {
  const app = explorationDashboard();
  const item = placementItem();
  const box = app.createExplorationTokenPlacementTools(app.entry, item);
  const button = box.querySelectorAll('[data-card-token-place]').find(button => button.dataset.cardTokenPlace === 'story');
  assert.ok(button);
  let stopped = false;
  box.listeners.click({ target: button, stopPropagation() { stopped = true; } });
  if (!stopped) app.placeCardTrackToken(button.dataset.cardTokenPlace, button.dataset.cardTokenField, Number(button.dataset.amount));
  assert.equal(stopped, true);
  assert.equal(app.state.cardTracks.story.progress, 2);
  assert.equal(app.calls.save, 1);
});

test('a shortcut from an old exploration round cannot add tokens to the current campaign', () => {
  const app = explorationDashboard();
  const item = placementItem();
  app.state.exploration.drawStateByCycle.c1.activePiles = [[{ ...app.entry, drawnAt: 67890 }]];
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), false);
  assert.equal(app.state.cardTracks.story.progress, 0);
  assert.equal(app.calls.save, 0);
});

test('exploration token reminders route progress to story and doom to the doom step', () => {
  const app = queuedExplorationDashboard();
  const item = placementItem({ manualPlacements: [{ type: 'progress', amount: 2 }, { type: 'doom', amount: 1 }] });
  app.testExplorationItems = [item];
  const story = app.getExplorationStepTokenReminders('story');
  const doom = app.getExplorationStepTokenReminders('doom');
  assert.equal(story.length, 1);
  assert.equal(doom.length, 1);
  assert.equal(story[0].explorationToken.field, 'progress');
  assert.equal(doom[0].explorationToken.field, 'doom');
  assert.match(story[0].title, /测试探索卡/);
  assert.match(story[0].title, /2/);
  assert.match(doom[0].title, /1/);
  assert.equal(app.getExplorationStepTokenReminders('explore').length, 0);
  assert.ok(app.getStepTrackReminders('story').some(reminder => reminder.explorationToken?.field === 'progress'));
  assert.ok(app.getStepTrackReminders('doom').some(reminder => reminder.explorationToken?.field === 'doom'));
  const storyTools = app.createExplorationTokenPlacementTools(app.entry, item, 'progress').innerHTML;
  const doomTools = app.createExplorationTokenPlacementTools(app.entry, item, 'doom').innerHTML;
  assert.equal(hasPlacement(storyTools, 'story', 'progress', 2), true);
  assert.equal(hasPlacement(storyTools, 'doom', 'doom'), false);
  assert.doesNotMatch(storyTools, /灾祸卡/);
  assert.equal(hasPlacement(doomTools, 'doom', 'doom', 1), true);
  assert.equal(hasPlacement(doomTools, 'story', 'progress'), false);
});

test('ending exploration snapshots token tasks and the next draw cannot remove them', () => {
  const app = queuedExplorationDashboard();
  const item = placementItem();
  app.testExplorationItems = [item];
  app.endExplorationDraw();
  assert.equal(app.ensureExplorationDrawState().activePiles.flat().length, 0);
  assert.ok(app.queuedExplorationTokenTask(app.entry, item));
  assert.equal(app.getExplorationStepTokenReminders('story').length, 1);
  const later = { ...app.entry, drawnAt: 67890, name: '下一批探索卡' };
  app.ensureExplorationDrawState().activePiles = [[later]];
  app.testExplorationItems = [];
  app.local = { applied: {}, manual: {}, skipped: {}, tokenPlacements: {} };
  assert.equal(app.getExplorationStepTokenReminders('story').length, 1);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'inwardOdyssey', 'progress'), true);
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 2);
  assert.equal(app.getExplorationStepTokenReminders('story').length, 0);
});

test('token queue snapshots survive JSON save normalization, including settled resources', () => {
  const app = queuedExplorationDashboard();
  const item = placementItem({ requiresResource: true });
  app.testExplorationItems = [item];
  app.testExplorationSettlement = { changes: [] };
  app.syncExplorationTokenPlacementQueue();
  const saved = JSON.parse(JSON.stringify(app.state.exploration));
  saved.drawStateByCycle.c1.activePiles = [[], []];
  app.state.exploration = app.normalizeExploration(saved);
  app.testExplorationItems = [];
  app.testExplorationSettlement = null;
  app.local = { applied: {}, manual: {}, skipped: {}, tokenPlacements: {} };
  assert.ok(app.queuedExplorationTokenTask(app.entry, item));
  assert.equal(app.explorationTokenPlacementBlocked(app.entry, item), '');
  assert.equal(app.getExplorationStepTokenReminders('story').length, 1);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), true);
  assert.equal(app.state.cardTracks.story.progress, 2);
  assert.equal(app.getExplorationStepTokenReminders('story').length, 0);
});

test('completed queue tasks remain completed when active local marks are cleared and synced again', () => {
  const app = queuedExplorationDashboard();
  const item = placementItem();
  app.testExplorationItems = [item];
  app.syncExplorationTokenPlacementQueue();
  assert.equal(Object.keys(app.explorationTokenPlacementQueue()).length, 1);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), true);
  app.local = { applied: {}, manual: {}, skipped: {}, tokenPlacements: {} };
  app.syncExplorationTokenPlacementQueue();
  assert.equal(Object.keys(app.explorationTokenPlacementQueue()).length, 1);
  assert.equal(app.getExplorationStepTokenReminders('story').length, 0);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), false);
  assert.equal(app.state.cardTracks.story.progress, 2);
});

test('a queued mixed item survives the next draw until both story and doom placements finish', () => {
  const app = queuedExplorationDashboard();
  const item = placementItem({ manualPlacements: [{ type: 'progress', amount: 2 }, { type: 'doom', amount: 1 }] });
  app.testExplorationItems = [item];
  app.endExplorationDraw();
  app.local = { applied: {}, manual: {}, skipped: {}, tokenPlacements: {} };
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), true);
  assert.equal(app.getExplorationStepTokenReminders('story').length, 0);
  assert.equal(app.getExplorationStepTokenReminders('doom').length, 1);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'doom', 'doom'), true);
  assert.equal(app.getExplorationStepTokenReminders('doom').length, 0);
  assert.equal(app.state.cardTracks.story.progress, 2);
  assert.equal(app.state.cardTracks.doom.doom, 1);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'doom', 'doom'), false);
});

test('two draws of the same card keep separate queued token tasks', () => {
  const app = queuedExplorationDashboard();
  const item = placementItem();
  const second = { ...app.entry, drawnAt: 67890 };
  app.ensureExplorationDrawState().activePiles = [[app.entry, second]];
  app.testExplorationItems = [item];
  app.syncExplorationTokenPlacementQueue();
  assert.equal(Object.keys(app.explorationTokenPlacementQueue()).length, 2);
  assert.equal(app.getExplorationStepTokenReminders('story').length, 2);
  assert.equal(app.placeExplorationCardToken(app.entry, item, 'story', 'progress'), true);
  const remaining = app.getExplorationStepTokenReminders('story');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].explorationToken.entry.drawnAt, second.drawnAt);
  assert.equal(app.placeExplorationCardToken(second, item, 'inwardOdyssey', 'progress'), true);
  assert.equal(app.state.cardTracks.story.progress, 2);
  assert.equal(app.state.cardTracks.inwardOdyssey.progress, 2);
});

test('exploration completion excludes pure placement tasks but keeps actual manual and record work', () => {
  const app = queuedExplorationDashboard();
  const token = placementItem();
  const manual = placementItem({ id: 'manual:1', placementOnly: false, remainder: '抽取遇难者牌' });
  const numeric = placementItem({ id: 'manual:2', effects: [{ type: 'crew', amount: 1 }], remainder: '' });
  app.testExplorationItems = [token, manual, numeric];
  assert.equal(app.pendingExplorationEffects().length, 3);
  assert.equal(app.pendingExplorationEffects(false).length, 2);
  assert.ok(app.pendingExplorationEffects(false).some(text => text.includes('抽取遇难者牌') || text.includes(manual.text)));
});
