const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sandbox = { window: {} };
for (const file of ['assets/ato-terms.js', 'assets/english-terms.js', 'assets/english-ui.js', 'assets/english-language.js']) {
  vm.runInNewContext(read(file), sandbox, { filename: file });
}
const english = sandbox.window.ATO_ENGLISH;

test('AIBP panel state buttons, marker titles, and break locks are fully English', () => {
  const html = read('aibp/index.html').replace(/\r\n/g, '\n');
  const scope = '#nietzscheStateButton, .panel-state-marker, .nietzsche-break-lock, #imageZoomNotice';
  const states = name => vm.runInNewContext('(' + html.match(new RegExp('^    const ' + name + ' = ([^]*?^    [}\\]]);', 'm'))[1] + ')');
  const update = html.match(/^    function updateNietzscheStateUi\([^]*?^    }/m)[0];
  const marker = { classList: { toggle() {} }, style: { setProperty() {} }, dataset: {} };
  const button = { classList: { toggle() {} } };
  const ctx = vm.createContext({
    currentPanelState: () => ctx.state, nietzscheStateButton: button,
    isChimera: () => false, isLabyrinthTrackApostle: () => false,
    hasManualPanelState: () => true, hasPanelState: () => true,
  });
  vm.runInContext(update, ctx);
  for (const [state, original] of [
    ...Array.from(states('nietzscheStates'), state => [state, state.comboEnglish]),
    ...Array.from(states('nietzscheAdvancedStates'), state => [state, state.comboEnglish]),
    ...Array.from(states('cyclonusStates'), state => [state, state.comboEnglish]),
    ...Object.values(states('chimeraPhaseStates')).map((state, i) => [state, ['Corrosive', 'Gelatinous', 'Supersolid'][i]]),
  ]) {
    ctx.state = state;
    ctx.updateNietzscheStateUi(marker);
    assert.equal(english.translate(button.textContent, [scope]), `Switch state: ${original}`);
    assert.equal(english.translate(marker.title, [scope]), `${original}; click for next state`);
  }
  assert.equal(english.translate('损伤已达到阈值：不能打破巨剑', [scope]), 'Wound threshold reached: cannot break Sword combo');
  assert.equal(english.translate('巨剑', []), '巨剑', 'panel-specific Sword must not rename unrelated terms');
});

test('all Labyrinth track positions localize whole names, counters, and hover hints', () => {
  const html = read('aibp/index.html').replace(/\r\n/g, '\n');
  const block = html.slice(html.indexOf('    const labyrinthTrackApostles = new Set('), html.indexOf('    const panelRatio ='));
  const ctx = vm.createContext({
    labyrinthaurosName: 'LABYRINTHAUROS', currentApostle: 'LABYRINTHAUROS',
    localStorage: { getItem: () => null },
  });
  // Only the track declarations precede the following panel sizing constants.
  const end = block.indexOf('    labyrinthTrackApostles.forEach');
  const declarations = block.slice(0, end);
  vm.runInContext(declarations, ctx);
  for (const boss of ['LABYRINTHAUROS', 'ALPHA_TEMENOS']) {
    for (let i = 0; i < 4; i++) {
      vm.runInContext(`labyrinthTrackIndexes['${boss}'] = ${i}`, ctx);
      const state = ctx.labyrinthTrackState(boss);
      assert.equal(english.translate(state.label), `Labyrinth ${state.short}`);
      assert.equal(english.translate(state.buttonLabel), `Labyrinth marker: ${state.short} (${i + 1}/4)`);
      assert.equal(english.translate(state.hint), `Labyrinth ${state.short}: Labyrinth track space ${i + 1}/4; click to advance clockwise`);
    }
  }
});

test('AIBP board hover hints, sight descriptions, wish controls and token badges stay English', () => {
  const board = read('aibp/battle_map_control.js');
  const labels = [...board.matchAll(/(?:parts|notes)\.push\("([^"\n]*[\u3400-\u9fff][^"\n]*)"\)/g)]
    .map(match => match[1]);
  for (const source of [...labels,
    'Fortified City（双击选中，再次双击取消）', 'Labyrinth - 点击查看大图',
    'THE NIETZSCJEAN 2×2 · 移速 8 · 攻击距离 1 · 射程 9 格 · 朝左 · 盲区 右方 2 格',
    'MIDASCORE 3×3 · 移速 ∞ · 攻击距离 1 · 射程 全图 · 朝左 · 盲区 右方 3 格 · 总是有视线',
    '黄箭头=朝向，斜纹格=盲区（在朝向的反向），永远不算有视线。',
    '黄箭头=朝向；该始徒没有盲区。',
    '高地（手动开启）：无视其他遮蔽地形与红线；云层地形（蓝框）例外，仍然遮挡。',
    '高地（泰坦位于高地板块，已自动勾选）：无视全部遮蔽地形与红线，视线不被地形阻挡。',
    '全场愿望', '抽取全场愿望', '重置愿望牌堆', '首个泰坦轮不启用全场愿望',
    '第 2 个泰坦轮 · 牌堆 3 · 弃牌 1', '每命中', '（每命中）',
    '点击放置 1 个疼痛增量通用标记', '点击放置 1 个以怨还怨通用标记',
    '减少', '增加', '万事皆休 · 三台泰坦 X',
  ]) assert.doesNotMatch(english.translate(source), /[\u3400-\u9fff]/, source);
  assert.match(read('aibp/index.html'), /html\[data-ato-language="en"\] \.panel-token-item\.auto-level-danger-per-hit::after,[^]*?content: "per hit"/);
});

test('official combo terms use printed Chinese names while fan terms keep bilingual captions', () => {
  const { createEngine } = require('./helpers/term-language.cjs');
  const engine = createEngine(sandbox.window.ATO_TERMS);
  const scope = ['#imageZoomAiComboActions'];
  for (const [source, official] of [
    ['巨剑连招（Sword Combo）', '刀剑连击'], ['火焰连招（Fire Combo）', '火焰连击'],
    ['神浆连招（Ambrosia Combo）', '神浆连击'], ['球锤连招（Mauls Combo）', '铁槌连击'],
    ['锁链连招（Chain Combo）', '链条连击'], ['身躯连招（Body Combo）', '躯体连击'],
    ['匕首（Knife）', '小刀'], ['盾牌（Shield）', '盾'], ['鞭（Whip）', '鞭'],
    ['板剑（Slabsword）', '平板剑'], ['矛（Spear）', '矛'], ['剑（Sword）', '剑'],
    ['拳套（Cestus）', '拳套'], ['棍棒（Club）', '棍棒'], ['斧（Axe）', '斧'], ['弓（Bow）', '弓'],
    ['可打断连招的武器', '可中断连击的武器'], ['无法打断连招', '无法中断连击'],
    ['连招第二张 AI', '连击第二张 AI'], ['不再触发连招', '不再触发连击'],
  ]) {
    assert.equal(engine.translate(source, scope), official);
    engine.setOfficial(false);
    assert.equal(engine.translate(source, scope), source);
    engine.setOfficial(true);
  }
  assert.equal(engine.translate('打断连招', ['#imageZoomAiComboActions, #breakAiComboButton']), '中断连击');
  assert.equal(engine.translate('继续连招', ['#imageZoomAiComboActions, #continueAiComboButton']), '继续连击');
});

test('bilingual combo notices switch to English without duplicate captions', () => {
  for (const [chinese, original] of [
    ['巨剑', 'Sword'], ['火焰', 'Fire'], ['神浆', 'Ambrosia'],
    ['球锤', 'Mauls'], ['锁链', 'Chain'], ['身躯', 'Body'],
  ]) assert.equal(english.translate(`${chinese}连招（${original} Combo）`), `${original} combo`);
  for (const [chinese, original] of [
    ['匕首', 'Knife'], ['盾牌', 'Shield'], ['鞭', 'Whip'], ['板剑', 'Slabsword'],
    ['矛', 'Spear'], ['剑', 'Sword'], ['拳套', 'Cestus'], ['棍棒', 'Club'], ['斧', 'Axe'], ['弓', 'Bow'],
  ]) assert.equal(english.translate(`${chinese}（${original}）`), original);
  assert.equal(english.translate('损伤已达到 6+。'), 'Wounds have reached 6+.');
  assert.equal(english.translate('无法打断连招'), 'Combo cannot be broken');
});

test('English uses attested originals, including names whose Chinese literal meaning differs', () => {
  assert.equal(english.translate('独眼巨人', english.scopes), 'Cyclonus');
  assert.equal(english.translate('独眼巨人'), 'Cyclopes');
  assert.equal(english.translate('无眼巨人'), 'Cyclonus');
  assert.equal(english.translate('百臂巨人'), 'Hekaton');
  assert.equal(english.translate('船体'), 'Hull');
  assert.equal(english.translate('力量'), 'Fury');
  assert.equal(english.translate('Sisyphus Tears'), 'Sisyphus Tears');
});

test('fan and official Chinese spellings lead to the same English gear title', () => {
  assert.equal(english.translate('赫尔墨斯弩炮'), 'Hermes Ballista Gun');
  assert.equal(english.translate('赫尔墨斯弩炮枪'), 'Hermes Ballista Gun');
});

test('an existing English caption is kept once and an output is not retranslated', () => {
  assert.equal(english.translate('百臂巨人 Hekaton'), 'Hekaton');
  assert.equal(english.translate('Trireme 船材'), 'Trireme');
  assert.equal(english.translate('Market Forces'), 'Market Forces');
});

test('single-character yes/no values cannot corrupt unrelated UI phrases', () => {
  assert.equal(english.translate('总是执行'), 'Always');
  assert.equal(english.translate('这是随手所写'), '这是随手所写');
});

test('whole UI templates retain live values and localize recovered game names', () => {
  assert.equal(english.translate('第 12 步'), 'Step 12');
  assert.equal(english.translate('显示更多（剩余 23 条）'), 'Show more (23 remaining)');
  assert.equal(english.translate('暂无宿命回忆'), 'None Fated Mnemos');
  assert.equal(english.translate('当前阿尔戈号知识 4；已放进展 2'), 'Argo Knowledge 4; Progress placed 2');
  assert.equal(english.translate('材料不足：船材，现有 3'), 'Insufficient materials: Trireme; available 3');
  const patterns = sandbox.window.ATO_ENGLISH_UI_TEMPLATES.map(([from]) => from);
  assert.equal(new Set(patterns).size, patterns.length, 'UI templates must be unique');
});

test('dashboard fated-event titles retain the English titles from their source rows', () => {
  for (const [from, expected] of [
    ['粗暴的觉醒', 'Rude Awakening'], ['深不可测的永恒', 'Unfathomable Aeons'],
    ['一万个日夜', 'Ten Thousand Nights and Days'], ['浅滩寓言', 'Parable of the Shallows'],
    ['希望是什么？', 'What Is Hope?'],
  ]) assert.equal(english.translate(from), expected);
});

test('every dashboard record-box title and label is English across all five cycles', () => {
  const dashboard = read('index.html');
  for (const name of ['pharosDreamConstants', 'mainStoryConstants', 'specialEventConstants']) {
    const declaration = dashboard.match(new RegExp('const ' + name + ' = [\\s\\S]*?\\n    };'))[0];
    const cycles = vm.runInNewContext(declaration + '\n' + name);
    for (const [cycle, data] of Object.entries(cycles)) {
      for (const label of [data.title, data.title + '定数框', ...data.boxes.flatMap(box => [box[1], box[2]])]) {
        assert.doesNotMatch(english.translate(label), /[\u3400-\u9fff]/, `${name}/${cycle}: ${label}`);
      }
    }
  }
});

test('short action labels and conjunctions are English without corrupting Chinese words', () => {
  assert.equal(english.translate('结算'), 'Resolve');
  assert.equal(english.translate('或'), 'or');
  assert.equal(english.translate('和'), 'and');
  assert.equal(english.translate('船体或船员'), 'Hull or Crew');
  assert.equal(english.translate('船体和船员'), 'Hull and Crew');
  assert.equal(english.translate('和平'), 'Peace');
  assert.equal(english.translate('和我'), '和我');
});

test('application controls and dynamic counters are localized', () => {
  assert.equal(english.translate('当前版本：3.5.10'), 'Current version: 3.5.10');
  assert.equal(english.translate('等级 VIII'), 'Level VIII');
  assert.equal(english.translate('已添加 2/16 · 已用 1'), 'Added 2/16 · Used 1');
  assert.equal(english.translate('ATO 战役主控台'), 'ATO Campaign Dashboard');
  assert.equal(english.translate('破坏卡组（4） · 探索中 0'), 'Destruction deck (4) · In Exploration 0');
  assert.equal(english.translate('探索卡组中的破坏卡（2）'), 'Destruction cards in Exploration deck (2)');
  assert.equal(english.translate('追踪推进 1 格'), 'Advance track by 1');
  assert.equal(english.translate('追踪减缓 1 格'), 'Slow track by 1');
});

test('C5 retains the complete printed Timeline rule and original adventure titles', () => {
  assert.equal(english.translate('时间线步骤开始时若没有空白格可标记，读 3749'),
    'At the start of the Timeline Step, if there are no empty boxes to mark on the Timeline, see 3749.');
  assert.equal(english.translate('真相的半衰期'), 'Half-lives of Truths');
  assert.equal(english.translate('**&#xA0;读“泡腾临界”**'), '**&#xA0;Read “Effervescence”**');
  assert.equal(english.translate('\u00a0读“泡腾临界”'), '\u00a0Read “Effervescence”');
  assert.equal(english.translate('读4213'), 'Read 4213');
  assert.equal(english.translate('读我'), '读我');
  const terms = sandbox.window.ATO_ENGLISH_TERMS.terms;
  const timelineRule = terms.find(([zh]) => zh === '时间线步骤开始时若没有空白格可标记，读 3749');
  assert.match(timelineRule[2], /tts:3458296558:Cycle V Argo Sheet Back/);
  for (const file of ['index.html', 'record/index.html']) {
    assert.match(read(file), /80:\s*"时间线步骤开始时若没有空白格可标记，读 3749"/);
    assert.doesNotMatch(read(file), /\b0:\s*"时间线步骤开始时若没有空白格可标记，读 3749"/);
  }
});

test('all Structural Technology categories and filter headings are English', () => {
  const types = require('../technology/structure-card-types.js');
  for (const option of types.options) assert.doesNotMatch(english.translate(option.label), /[\u3400-\u9fff]/);
  assert.equal(english.translate('结构科技细分'), 'Structural Technology categories');
  assert.equal(english.translate('按结构科技细分筛选'), 'Filter by Structural Technology category');
  for (const [from, to] of [['一次性效果', 'One-time effect'], ['主动', 'Active'], ['被动', 'Passive']]) {
    assert.equal(english.translate(from), to);
    assert.equal(english.translate(from + '（12）'), to + '(12)');
  }
});

test('all application modules load the source adapter before the shared language controller', () => {
  for (const file of ['index.html', ...['aibp','hero','record','map','technology','story','ss','briefing'].map(dir => `${dir}/index.html`)]) {
    const source = read(file);
    const includes = ['english-terms.js', 'english-ui.js', 'english-language.js', 'term-language.js'];
    for (const name of includes) assert.ok(source.includes(name), `${file}: ${name}`);
    assert.ok(source.indexOf('english-language.js') < source.indexOf('<script src="' + (file === 'index.html' ? './' : '../') + 'assets/term-language.js'), file);
    assert.match(source, /story\/data\/english-source-data\.js/);
  }
});

test('dashboard persists en and broadcasts a language rather than coercing it to fan', () => {
  const source = read('index.html');
  // One button carries the active language and opens a popup; the other two
  // choices live in that popup instead of taking a row of their own.
  assert.match(source, /id="termLanguageToggle"[^>]*aria-haspopup="menu"[^>]*data-dashboard-readonly-allowed/);
  assert.match(source, /id="termLanguageMenu"[^>]*role="menu"/);
  for (const language of ['fan', 'official', 'en']) {
    assert.match(source, new RegExp('<button[^>]*data-term-language-option="' + language + '"'));
  }
  assert.doesNotMatch(source, /id="termOfficialToggle"|id="termEnglishToggle"/);
  assert.match(source, /\.app \.settings-language-menu button\[aria-checked="true"\]/);
  assert.match(source, /\["fan", "official", "en"\]\.includes\(language\)/);
  assert.match(source, /detail: \{ language: storedTermLanguage\(\)/);
});

test('the language picker shows the active language and opens a popup', () => {
  const source = read('assets/term-language.js');
  assert.match(source, /trigger\.setAttribute\("aria-haspopup", "menu"\)/);
  assert.match(source, /const openMenu = \(\) => \{/);
  assert.match(source, /const closeMenu = \(\) => \{/);
  assert.match(source, /trigger\.textContent = names\[state\.language\]/);
  assert.match(source, /option\.setAttribute\("aria-checked", String\(language === state\.language\)\)/);
  assert.match(source, /menu\.querySelector\(`\[data-term-language-option="\$\{language\}"\]`\)/);
  assert.doesNotMatch(source, /updateButtons|languageButtons/);
  const fixture = read('tests/fixtures/english-language.html');
  assert.match(fixture, /data-term-language-option="official"/);
  assert.doesNotMatch(fixture, /termOfficialToggle|termEnglishToggle/);
});

test('story reader uses original English fields and never its Chinese text as English', () => {
  const source = read('story/assets/app.js');
  assert.match(source, /if \(storyVersion === "English"\) return entry\.englishText \|\| entry\.originalText \|\| "";/);
  assert.match(source, /The English original for this paragraph is not available/);
  assert.match(source, /utterance\.lang = storyVersion === "English" \? "en-US"/);
});
