// C4 主控制台：按循环 IV 记录表标记战斗日，日期轨没有上限。
// 1) Day 93 及以前只在表上标有战斗的日期提醒，Day 94 起每日战斗，包括时间表
//    扩展到 Day 200 的全部日期，以及 200 之后的续推日；
// 2) nextDay() 走到最后一行后继续按数字 +1，不停在 200；
// 3) trackEntriesForRender() 给时间表之外的当天补一行，否则日期轨里没有「当前」。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
  const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, `missing ${name}`);
  return match[0];
}

function extractConstObject(name) {
  const match = source.match(new RegExp('^    const ' + name + ' = (\\{[^]*?^    \\};)', 'm'));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

function setup(extra = {}) {
  const ctx = vm.createContext({
    state: {day: 96, completed: {}, events: [], notes: ''},
    currentCycleConfig: () => ({id: 'c4'}),
    archive: { activeProfileId: 'default' }, campaignSessionEpoch: 1, campaignRestoreInFlight: false,
    ownsDashboardWriteLease: () => true, flushCampaignSave: async () => true,
    elements: { appShell: { inert: false } }, window: { alert: message => { throw new Error(message); } },
    ...extra,
  });
  vm.runInContext(`dateTrackData = ${extractConstObject('dateTrackData')};`, ctx);
  vm.runInContext(`dateIconTypes = ${extractConstObject('dateIconTypes')};`, ctx);
  vm.runInContext([
    extractFunction('isTrackBattleDay'),
    extractFunction('dateTrackIcons'),
    extractFunction('trackEntriesForRender'),
    extractFunction('todayTrackIcons'),
    extractFunction('getStepTrackReminders'),
    extractFunction('nextDay'),
  ].join('\n'), ctx);
  // nextDay() 里的存档与重绘：只记录有没有被调用。
  ctx.rendered = [];
  ctx.syncInputs = () => {};
  ctx.saveState = () => {};
  ctx.renderFlow = () => {};
  ctx.renderDateTrack = options => ctx.rendered.push(options || null);
  ctx.getExploreMapReminders = () => [];
  ctx.getSurveyMapReminders = () => [];
  ctx.getStoryMapReminders = () => [];
  ctx.getDoomMapReminders = () => [];
  ctx.getNextBattleTerrainReminder = () => [];
  return ctx;
}

const battleIcon = icon => icon.className === 'battle';
// vm 里造出来的对象原型和测试进程不同，比较前先变成普通对象。
const plain = value => JSON.parse(JSON.stringify(value));

// 只够 renderDateTrack() 用的最小 DOM：记录日期轨最终画出来的行。
function setupRender(day) {
  const rows = [];
  const element = tag => ({
    tag, className: '', title: '', innerHTML: '', children: [],
    setAttribute() {}, addEventListener() {}, appendChild(child) { this.children.push(child); },
  });
  const ctx = vm.createContext({
    state: {day, completed: {}, events: [], notes: '', dateNotes: {}},
    currentCycleConfig: () => ({id: 'c4'}),
    elements: {
      dateTrackList: {innerHTML: '', appendChild(node) { rows.push(...node.children); }},
      dateTrackMeta: {innerHTML: '', textContent: ''},
    },
    document: {
      createElement: element,
      createDocumentFragment: () => ({children: [], appendChild(child) { this.children.push(child); }}),
    },
    escapeHtml: value => String(value),
    getAcclimationRule: () => null,
    renderCurrentDateNote: () => {},
    keepCurrentDateVisible: () => {},
  });
  vm.runInContext(`dateTrackData = ${extractConstObject('dateTrackData')};`, ctx);
  vm.runInContext(`dateIconTypes = ${extractConstObject('dateIconTypes')};`, ctx);
  vm.runInContext([
    extractFunction('formatTrackDay'),
    extractFunction('dateNoteKey'),
    extractFunction('isTrackBattleDay'),
    extractFunction('dateTrackIcons'),
    extractFunction('trackEntriesForRender'),
    extractFunction('renderDateTrack'),
  ].join('\n'), ctx);
  ctx.renderDateTrack();
  return {ctx, rows};
}

// 从用户提供的 A10.5 循环 IV 阿尔戈号记录表第 2 页逐日核对的战斗标记。
const printedBattleDays = [1, 7, 13, 19, 25, 31, 37, 43, 49, 55, 61, 67, 73, 79, 84, 88, 91, 93, 94, 95, 96];

test('C4 原时间表与记录表一致，日期轨扩展至 200 天且新增日期每天战斗', () => {
  const ctx = setup();
  const track = ctx.dateTrackData.c4;
  assert.equal(track.entries.length, 201);
  assert.equal(track.entries[0].day, 0);
  assert.equal(track.entries.at(-1).day, 200);
  for (let day = 97; day <= 200; day += 1) {
    assert.equal(track.entries[day].day, day, `扩展日期 Day ${day} 缺失`);
    assert.ok(ctx.dateTrackIcons(track.entries[day], track).some(battleIcon), `Day ${day} 缺少战斗标记`);
    ctx.state.day = day;
    assert.ok(ctx.getStepTrackReminders('encounter').some(reminder => reminder.title === '今日战斗'), `Day ${day} 缺少今日战斗提醒`);
  }
  for (let day = 0; day <= 96; day += 1) {
    const expected = printedBattleDays.includes(day);
    assert.equal(ctx.isTrackBattleDay(day, track), expected, `C4 Day ${day} 战斗日判断错误`);
    assert.equal(ctx.dateTrackIcons({day}, track).some(battleIcon), expected, `C4 Day ${day} 日期轨战斗标记错误`);
  }
  for (const day of [97, 120, 999, 5000]) {
    assert.equal(ctx.isTrackBattleDay(day, track), true, `C4 Day ${day} 应该是战斗日`);
    assert.ok(ctx.dateTrackIcons({day}, track).some(battleIcon), `C4 Day ${day} 日期轨缺少战斗标记`);
  }
  for (const day of [null, undefined, NaN, Infinity, -1, 94.5, 'T6/00']) {
    assert.equal(ctx.isTrackBattleDay(day, track), false, `无效日期 ${day} 不应触发战斗`);
  }
});

test('其它循环仍按各自的 battleDays 标记', () => {
  const ctx = setup();
  for (const cycle of ['c1', 'c2', 'c3', 'c5']) {
    const track = ctx.dateTrackData[cycle];
    for (let day = 0; day <= 120; day += 1) {
      const expected = track.battleDays.includes(day);
      assert.equal(ctx.isTrackBattleDay(day, track), expected, `${cycle} Day ${day}`);
      assert.equal(ctx.dateTrackIcons({day}, track).some(battleIcon), expected, `${cycle} Day ${day} 战斗标记`);
    }
    assert.equal(ctx.isTrackBattleDay(null, track), false);
  }
});

test('今日战斗提醒与记录表一致，包括 93/94 边界及 96 之后', () => {
  const ctx = setup();
  for (let day = 0; day <= 96; day += 1) {
    ctx.state.day = day;
    const hasReminder = ctx.getStepTrackReminders('encounter').some(reminder => reminder.title === '今日战斗');
    assert.equal(hasReminder, printedBattleDays.includes(day), `C4 Day ${day} 今日战斗提醒错误`);
  }
  for (const day of [97, 150, 5000]) {
    ctx.state.day = day;
    assert.ok(ctx.getStepTrackReminders('encounter').some(reminder => reminder.title === '今日战斗'));
  }
  ctx.currentCycleConfig = () => ({id: 'c2'});
  ctx.state.day = 2;
  assert.ok(!ctx.getStepTrackReminders('encounter').some(reminder => reminder.title === '今日战斗'));
});

test('nextDay 穿过原末尾并走到 Day 200 后继续往后推，没有上限', async () => {
  const ctx = setup();
  for (const day of [17, 96, 199]) {
    ctx.state.day = day;
    await ctx.nextDay();
    assert.equal(ctx.state.day, day + 1, `Day ${day} 应推进到下一行`);
  }
  ctx.state.day = 200;
  ctx.rendered.length = 0;
  const days = [];
  for (let index = 0; index < 5; index += 1) {
    await ctx.nextDay();
    days.push(ctx.state.day);
  }
  assert.deepEqual(days, [201, 202, 203, 204, 205]);
  assert.equal(ctx.rendered.length, 5);
  assert.deepEqual(plain(ctx.rendered[0]), {focusCurrentDay: true});
});

test('时间表之外的日子会在日期轨里补出当天一行', () => {
  const ctx = setup();
  const track = ctx.dateTrackData.c4;
  for (const day of [50, 96, 97, 199, 200]) {
    ctx.state.day = day;
    assert.equal(ctx.trackEntriesForRender(track).length, 201);
    assert.ok(!ctx.trackEntriesForRender(track).some(entry => entry.beyondTrack));
  }

  ctx.state.day = 201;
  const extended = ctx.trackEntriesForRender(track);
  assert.equal(extended.length, 202);
  assert.deepEqual(plain(extended.at(-1)), {day: 201, beyondTrack: true});
  assert.equal(extended[0].day, 0, '原有的时间表行不能被改动');

  ctx.state.day = 5000;
  assert.equal(ctx.trackEntriesForRender(track).length, 202, '补行只加当天一行，不铺满中间的日子');
});

test('补出来的当天行也带战斗标记，顶部 day 输入框接受任意数字', () => {
  const ctx = setup();
  ctx.state.day = 201;
  const entry = ctx.trackEntriesForRender(ctx.dateTrackData.c4).at(-1);
  assert.ok(ctx.dateTrackIcons(entry, ctx.dateTrackData.c4).some(battleIcon));
  assert.ok(source.includes('state.day = normalizeCampaignDay(elements.dayInput.value, currentCycleConfig().id)'));

  vm.runInContext([extractFunction('defaultDayForCycle'), extractFunction('normalizeCampaignDay')].join('\n'), ctx);
  assert.equal(ctx.normalizeCampaignDay('97', 'c4'), 97);
  assert.equal(ctx.normalizeCampaignDay('5000', 'c4'), 5000, '手填大数字不能被截断');
  assert.equal(ctx.normalizeCampaignDay('T6/00', 'c1'), 'T6/00');
});

test('日期轨完整画出 0 至 200 天，201 之后补当天一行', () => {
  const last = setupRender(200);
  assert.equal(last.rows.length, 201);
  for (let day = 97; day <= 200; day += 1) {
    assert.ok(last.rows[day].innerHTML.includes('class="date-track-icon battle"'), `Day ${day} 缺少战斗标记`);
    assert.ok(!last.rows[day].className.includes('beyond-track'));
  }
  for (let day = 0; day <= 96; day += 1) {
    assert.equal(last.rows[day].innerHTML.includes('class="date-track-icon battle"'), printedBattleDays.includes(day), `C4 Day ${day} 渲染的战斗标记错误`);
  }
  assert.ok(last.rows.at(-1).className.includes('date-track-item'));
  assert.ok(last.rows.at(-1).className.includes('current'));
  assert.ok(!last.rows.at(-1).className.includes('beyond-track'));
  assert.ok(last.rows.at(-1).innerHTML.includes('战斗'));

  const beyond = setupRender(201);
  assert.equal(beyond.rows.length, 202);
  assert.ok(beyond.rows.at(-1).className.includes('beyond-track'));
  assert.ok(beyond.rows.at(-1).className.includes('current'));
  assert.ok(beyond.rows.at(-1).innerHTML.includes('战斗'), '续推日也要有战斗标记');
  assert.match(beyond.rows.at(-1).title, /时间表之外/);
  assert.equal(beyond.rows.filter(row => row.className.includes('current')).length, 1);
});

test('all inline dashboard scripts parse', () => {
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) new vm.Script(match[1]);
  }
});
