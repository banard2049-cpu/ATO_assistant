/*
 * 英雄「最大 / 最小似然」判定回归。
 *
 * 判定是两级复合判据，顺序不能颠倒（旧实现只有次判据，且次判据本身也算错了）：
 *   1. 回忆卡张数（宿命回忆 fatedMnemos 不算）——多者最大似然、少者最小似然；
 *   2. 张数相同时，才比轨道上已推进的格数（1–10 那排格子，节点格同样计入）。
 * 两级都完全相同才算同一名次：完全并列的几位一起打标记（真·全员同分才都不打标记）。
 *
 * 两处历史错误都被钉在这里：
 *   - computeLikelihood() 曾直接拿「轨道格数」当唯一判据，于是「卡少但推得深」的英雄
 *     会被误判成最大似然（2 张卡各推到第 3 格 = 6，输给 1 张卡推到第 10 格 = 10）；
 *   - 数的格数曾把记忆节点所在的格子跳过（节点固定在第 3/7/10 格），
 *     所以推到第 10 格只算 7 格。
 *
 * 沙箱里刻意不提供 MNEMOS：判据只需要「回忆卡张数」和「轨道推进值」，
 * 如果实现又去查卡表取轨道长度（曾经把 thresholds 的数组长度误当轨道长度，
 * 导致上限变成 3），这些用例就会暴露出来。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const heroSource = fs.readFileSync(path.join(root, 'hero/index.html'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
  const pattern = new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm');
  const match = heroSource.match(pattern);
  assert.ok(match, `hero/index.html 缺少函数 ${name}`);
  return match[0];
}

// 判据依赖 CYCLES（遍历循环）与 state（英雄列表）。
function extractLiteral(name) {
  const start = heroSource.indexOf(`const ${name} = `);
  assert.ok(start >= 0, `hero/index.html 缺少常量 ${name}`);
  const open = heroSource.slice(start).search(/[[{]/);
  const from = start + open;
  let depth = 0;
  for (let index = from; index < heroSource.length; index += 1) {
    const char = heroSource[index];
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (!depth) return heroSource.slice(from, index + 1);
    }
  }
  throw new Error(`常量 ${name} 没有闭合`);
}

const CYCLES = vm.runInNewContext(`(${extractLiteral('CYCLES')})`, {});
const MNEMOS = vm.runInNewContext(`(${extractLiteral('MNEMOS')})`, {});
const TRACK_LENGTH = 10;   // 轨道固定 1–10 格

// 判据还会引用模块级常量（轨道长度上限），一并按名字取出来。
function extractConst(name) {
  const match = heroSource.match(new RegExp(`^\\s*const ${name} = ([^;\\n]+);`, 'm'));
  assert.ok(match, `hero/index.html 缺少常量 ${name}`);
  return match[1];
}

const FUNCTIONS = ['heroMnemosCardCount', 'heroMnemosTrackCount', 'heroMnemosRankCompare', 'computeLikelihood'];
const CONSTANTS = { MNEMOS_TRACK_LENGTH: extractConst('MNEMOS_TRACK_LENGTH') };

function makeEnv(heroes) {
  const sandbox = {
    CYCLES,
    state: { heroes, activeHeroId: heroes.length ? heroes[0].id : '', graveyard: [] },
  };
  vm.createContext(sandbox);
  for (const [name, expression] of Object.entries(CONSTANTS)) {
    vm.runInContext(`const ${name} = ${expression};`, sandbox, { filename: `hero/index.html#const ${name}` });
  }
  for (const name of FUNCTIONS) {
    vm.runInContext(extractFunction(name), sandbox, { filename: `hero/index.html#${name}` });
  }
  return sandbox;
}

// cards: [{ cycle, mId?, progress? }]
function hero(id, { cards = [], fatedMnemos = {}, nodeProgress = {} } = {}) {
  const mnemos = {};
  const mnemosProgress = {};
  cards.forEach(({ cycle, mId, progress = 0 }) => {
    const cardId = mId || `${cycle}_${(mnemos[cycle] || []).length}`;
    mnemos[cycle] = mnemos[cycle] || [];
    mnemos[cycle].push(cardId);
    if (progress) mnemosProgress[cardId] = progress;
  });
  return { id, mnemos, mnemosProgress, mnemosNodeProgress: nodeProgress, fatedMnemos };
}

function keysOf(value) { return Object.keys(value).sort(); }
function describe(env, result) {
  return env.state.heroes
    .map(h => `${h.id}(cards=${env.heroMnemosCardCount(h)},track=${env.heroMnemosTrackCount(h)})→${result[h.id] || '-'}`)
    .join('  ');
}

test('主判据是回忆卡张数：卡少者最小似然、卡多者最大似然', () => {
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1' }, { cycle: 'c1' }] }),
    hero('b', { cards: [{ cycle: 'c1' }] }),
    hero('c', { cards: [{ cycle: 'c1' }, { cycle: 'c1' }, { cycle: 'c1' }] }),
  ]);
  const result = env.computeLikelihood();
  const detail = describe(env, result);
  assert.equal(result.c, 'most', `卡最多的 c 应判最大似然 — ${detail}`);
  assert.equal(result.b, 'least', `卡最少的 b 应判最小似然 — ${detail}`);
  assert.equal(result.a, undefined, `张数居中不该有标记 — ${detail}`);
});

test('回归：卡少但轨道推得深，不该被误判成最大似然', () => {
  // 旧实现只比轨道格数：b = 10 格 > a = 6 格，于是把卡少的 b 判成最大似然。
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1', progress: 3 }, { cycle: 'c1', progress: 3 }] }),
    hero('b', { cards: [{ cycle: 'c1', progress: 10 }] }),
  ]);
  const result = env.computeLikelihood();
  const detail = describe(env, result);
  assert.equal(result.a, 'most', `2 张卡应压过 1 张卡，不论轨道推到哪里 — ${detail}`);
  assert.equal(result.b, 'least', detail);
});

test('次判据：回忆卡张数相同时比轨道已推进的格数', () => {
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1', progress: 7 }] }),
    hero('b', { cards: [{ cycle: 'c1', progress: 3 }] }),
  ]);
  const result = env.computeLikelihood();
  const detail = describe(env, result);
  assert.equal(result.a, 'most', `张数相同、轨道推得多的 a 为最大似然 — ${detail}`);
  assert.equal(result.b, 'least', `张数相同、轨道推得少的 b 为最小似然 — ${detail}`);
});

test('回归：轨道格数把记忆节点所在的格子也算进去', () => {
  // c1_00 的记忆节点固定在第 3、7、10 格，旧实现跳过这 3 格，
  // 所以推到第 10 格只数成 7 格、推到第 3 格只数成 2 格。
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1', mId: 'c1_00', progress: TRACK_LENGTH }] }),
    hero('b', { cards: [{ cycle: 'c1', mId: 'c1_01', progress: TRACK_LENGTH }] }),
  ]);
  assert.equal(env.heroMnemosTrackCount(env.state.heroes[0]), TRACK_LENGTH, `推到第 ${TRACK_LENGTH} 格就该算 ${TRACK_LENGTH} 格`);

  const env3 = makeEnv([hero('a', { cards: [{ cycle: 'c1', progress: 3 }] })]);
  assert.equal(env3.heroMnemosTrackCount(env3.state.heroes[0]), 3, '推到第 3 格（正好是节点格）应记 3 格，不是 2 格');
});

test('主判据有胜负时不再看轨道：卡多但没推进仍是最大似然', () => {
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1' }, { cycle: 'c1' }] }),
    hero('b', { cards: [{ cycle: 'c1', progress: 10 }] }),
  ]);
  const result = env.computeLikelihood();
  const detail = describe(env, result);
  assert.equal(result.a, 'most', `张数是主判据，轨道格数只在张数相同时才参与 — ${detail}`);
  assert.equal(result.b, 'least', detail);
});

test('宿命回忆（fatedMnemos）不计入判据', () => {
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1' }], fatedMnemos: { c1: ['fated-1', 'fated-2', 'fated-3'] } }),
    hero('b', { cards: [{ cycle: 'c1' }, { cycle: 'c1' }], fatedMnemos: { c1: [] } }),
  ]);
  const result = env.computeLikelihood();
  const detail = describe(env, result);
  assert.equal(result.b, 'most', `b 有 2 张回忆卡 — ${detail}`);
  assert.equal(result.a, 'least', `a 只有 1 张回忆卡，宿命再多也不算 — ${detail}`);
});

test('两级判据都分不出胜负时返回空对象', () => {
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1', progress: 5 }] }),
    hero('b', { cards: [{ cycle: 'c1', progress: 5 }] }),
  ]);
  // 返回值来自 vm 沙箱，原型与宿主 realm 不同，deepStrictEqual 会因原型不等而误报，
  // 所以只比较键集合。
  assert.deepEqual(keysOf(env.computeLikelihood()), [], '张数与轨道格数都相同 → 不打标记');
});

test('只有一名英雄时不判定', () => {
  const env = makeEnv([hero('a', { cards: [{ cycle: 'c1', progress: 5 }] })]);
  assert.deepEqual(keysOf(env.computeLikelihood()), []);
});

test('判据函数本身：卡数跨循环累加；轨道格数逐卡累加且不跳过节点格', () => {
  const h = hero('a', {
    cards: [
      { cycle: 'c1', mId: 'c1_00', progress: 10 },
      { cycle: 'c1', mId: 'c1_01', progress: 3 },
      { cycle: 'c3', mId: 'c3_00', progress: 7 },
    ],
    fatedMnemos: { c1: ['x', 'y'] },
  });
  const env = makeEnv([h, hero('b')]);
  assert.equal(env.heroMnemosCardCount(h), 3, '跨循环累加回忆卡张数');
  assert.equal(env.heroMnemosTrackCount(h), 20, '10 + 3 + 7，节点格不跳过');
});

test('轨道格数对进度做上限保护，不会超过 10 格', () => {
  const env = makeEnv([hero('a', { cards: [{ cycle: 'c1', progress: 99 }] })]);
  assert.equal(env.heroMnemosTrackCount(env.state.heroes[0]), TRACK_LENGTH, `进度异常时最多算 ${TRACK_LENGTH} 格`);
});

// 回归：判据必须是「复合排序」，不能在主判据分出胜负后就丢掉次判据。
// 旧实现只在「所有英雄卡数完全相同」时才看次判据，于是卡数并列最多的几个人会被一起
// 判成最大似然——连其中轨道推得最少的那个也算。
test('回归：卡数并列最多时，轨道推得少的那个不该也被判最大似然', () => {
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1', progress: 10 }, { cycle: 'c1', progress: 10 }] }), // cards=2 track=20
    hero('b', { cards: [{ cycle: 'c1', progress: 2 }, { cycle: 'c1', progress: 2 }] }),   // cards=2 track=4
    hero('c', { cards: [{ cycle: 'c1', progress: 5 }] }),                                 // cards=1 track=5
  ]);
  const result = env.computeLikelihood();
  const detail = describe(env, result);
  assert.equal(result.a, 'most', `卡数相同、轨道最多的 a 才是最大似然 — ${detail}`);
  assert.equal(result.b, undefined, `b 卡数与 a 并列但轨道少，不该判最大似然 — ${detail}`);
  assert.equal(result.c, 'least', `c 卡数最少，是最小似然 — ${detail}`);
});

// 复合排序完全并列（记忆卡张数与记忆节点推进都一样）时，这几位本来就是同一个名次，
// 应当一起打标记。上一版为了「极值唯一」只取最先遇到的那个，标记会随英雄顺序「跳人」。
test('回归：卡数与节点推进都相同的最多者，一起判最大似然', () => {
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1', progress: 10 }, { cycle: 'c1', progress: 10 }] }), // cards=2 track=20
    hero('b', { cards: [{ cycle: 'c1', progress: 10 }, { cycle: 'c1', progress: 10 }] }), // cards=2 track=20
    hero('c', { cards: [{ cycle: 'c1', progress: 1 }] }),                                 // cards=1 track=1
    hero('d', { cards: [{ cycle: 'c1', progress: 2 }] }),                                 // cards=1 track=2
  ]);
  const result = env.computeLikelihood();
  const detail = describe(env, result);
  assert.equal(result.a, 'most', `a 与 b 完全同分，都该判最大似然 — ${detail}`);
  assert.equal(result.b, 'most', `b 与 a 完全同分，都该判最大似然 — ${detail}`);
  assert.equal(result.c, 'least', `c 推进最少，是最小似然 — ${detail}`);
  assert.equal(result.d, undefined, `d 与 c 张数并列但推进不同，不算同分 — ${detail}`);
});

test('回归：卡数与节点推进都相同的最少者，一起判最小似然', () => {
  const env = makeEnv([
    hero('a', { cards: [{ cycle: 'c1', progress: 9 }, { cycle: 'c1', progress: 9 }] }), // cards=2 track=18
    hero('b', { cards: [{ cycle: 'c1', progress: 1 }] }),                              // cards=1 track=1
    hero('c', { cards: [{ cycle: 'c1', progress: 1 }] }),                              // cards=1 track=1
    hero('d', { cards: [{ cycle: 'c1', progress: 3 }] }),                              // cards=1 track=3
  ]);
  const result = env.computeLikelihood();
  const detail = describe(env, result);
  assert.equal(result.a, 'most', `a 卡最多，是最大似然 — ${detail}`);
  assert.equal(result.b, 'least', `b 与 c 完全同分，都该判最小似然 — ${detail}`);
  assert.equal(result.c, 'least', `c 与 b 完全同分，都该判最小似然 — ${detail}`);
  assert.equal(result.d, undefined, `d 与 b、c 张数并列但推进不同，不算同分 — ${detail}`);
});

test('复合排序：先比卡数，卡数相同才用轨道格数细分', () => {
  const env = makeEnv([hero('a'), hero('b')]);
  const compare = env.heroMnemosRankCompare;
  assert.ok(compare({ cards: 2, track: 0 }, { cards: 1, track: 10 }) > 0, '卡数优先：2 张的空轨道仍大于 1 张的满轨道');
  assert.ok(compare({ cards: 1, track: 10 }, { cards: 1, track: 3 }) > 0, '卡数相同才比轨道格数');
  assert.equal(compare({ cards: 2, track: 7 }, { cards: 2, track: 7 }), 0, '两项都相同即同分');
});

// 数据侧的一致性：所有回忆卡的节点都固定落在第 3/7/10 格，轨道因此统一是 10 格。
// c5_07 曾经写成 [5,9,14]，是全表唯一的异类（会让它的节点画到轨道外）。
test('所有回忆卡的 thresholds 都是 [3,7,10]', () => {
  const expected = '[3,7,10]';
  const offenders = [];
  let total = 0;
  for (const [cycle, cards] of Object.entries(MNEMOS)) {
    for (const card of cards) {
      total += 1;
      const shape = JSON.stringify(card.thresholds);
      // 节点数与 thresholds 必须一一对应，否则 renderTrack10 会取到 undefined
      if (shape !== expected || (card.nodes || []).length !== card.thresholds.length) {
        offenders.push(`${cycle}/${card.id}: thresholds=${shape} nodes=${(card.nodes || []).length}`);
      }
    }
  }
  assert.ok(total >= 40, `回忆卡总数看起来不对：${total}`);
  assert.deepEqual(offenders, [], `这些回忆卡的轨道规格不一致：\n  ${offenders.join('\n  ')}`);
});

// hero 页与主控台各存了一份回忆卡节点表（hero: MNEMOS，主控台: MNEMOS_CARD_NODES）。
// 两份表曾经只改了一处：c5_07 在 hero 页是 [3,7,10]、主控台还是 [5,9,14]，
// 于是主控台「回忆突破」提醒要到第 5 格才出现，而 hero 页第 3 格就亮。
test('hero 页与主控台的回忆卡节点表完全一致', () => {
  const dashboardSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const dashboardStart = dashboardSource.indexOf('const MNEMOS_CARD_NODES = ');
  assert.ok(dashboardStart >= 0, 'index.html 缺少 MNEMOS_CARD_NODES');
  const open = dashboardSource.slice(dashboardStart).search(/[[{]/);
  const from = dashboardStart + open;
  let depth = 0;
  let literal = null;
  for (let index = from; index < dashboardSource.length; index += 1) {
    const char = dashboardSource[index];
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (!depth) { literal = dashboardSource.slice(from, index + 1); break; }
    }
  }
  assert.ok(literal, 'MNEMOS_CARD_NODES 没有闭合');
  const dashboardNodes = vm.runInNewContext(`(${literal})`, {});

  const heroCards = new Map();
  for (const cards of Object.values(MNEMOS)) {
    for (const card of cards) heroCards.set(card.id, card);
  }

  const mismatches = [];
  for (const [id, heroCard] of heroCards) {
    const dash = dashboardNodes[id];
    if (!dash) { mismatches.push(`${id}: 主控台缺这张卡`); continue; }
    if (JSON.stringify(dash.nodes) !== JSON.stringify(heroCard.nodes)) {
      mismatches.push(`${id}: nodes hero=${JSON.stringify(heroCard.nodes)} 主控台=${JSON.stringify(dash.nodes)}`);
    }
    if (JSON.stringify(dash.thresholds) !== JSON.stringify(heroCard.thresholds)) {
      mismatches.push(`${id}: thresholds hero=${JSON.stringify(heroCard.thresholds)} 主控台=${JSON.stringify(dash.thresholds)}`);
    }
  }
  for (const id of Object.keys(dashboardNodes)) {
    if (!heroCards.has(id)) mismatches.push(`${id}: hero 页缺这张卡`);
  }

  assert.ok(heroCards.size >= 40, `hero 页回忆卡总数看起来不对：${heroCards.size}`);
  assert.deepEqual(mismatches, [], `两份表不一致：\n  ${mismatches.join('\n  ')}`);
});
