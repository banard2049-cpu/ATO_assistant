/*
 * 术语引擎本身的回归（assets/term-language.js）。
 *
 * 引擎按「从左往右最长命中」套用术语，而且只作用于原文：一条术语写进去的译文不会再被
 * 别的条目改写。以前是「按 from 长度倒序逐条 split/join」，于是短条目会把长条目刚写出来
 * 的官方名再改一遍——这份测试把当时踩到的几处都钉住：
 *   Market Forces 的官方名「市场力量」被「力量 => 狂怒」改成「市场狂怒」；
 *   Cyclops Trap 的官方名「独眼巨人陷阱」被「独眼巨人 => 无眼巨人」改成「无眼巨人陷阱」；
 *   主线 C3 的「阿尔戈号命运耗尽」被「阿尔戈号命运 => 阿尔戈命运」改掉；
 *   航行时间线的「循环纪 III」被「循环 => 故事集」改成「故事集纪 III」；
 *   「赫尔墨斯弩炮枪」被「弩炮 => 弩炮枪」加成「赫尔墨斯弩炮枪枪枪」。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createEngine } = require('./helpers/term-language.cjs');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const sandbox = { window: {} };
require('node:vm').runInNewContext(read('assets/ato-terms.js'), sandbox);
const terms = sandbox.window.ATO_TERMS;

const surveyScope = '[data-term-scope~="survey-record"]';
const stepScope = '[data-term-scope~="step-constants"]';
const engine = createEngine(terms);

test('译文不会被别的条目二次改写', () => {
  assert.equal(engine.translate('Market Forces', [surveyScope]), '市场力量');
  assert.equal(engine.translate('Cyclops Trap', [surveyScope]), '独眼巨人陷阱');
  assert.equal(engine.translate('阿尔戈号命运失败', [stepScope]), '阿尔戈号命运耗尽');
  assert.equal(engine.translate('赫尔墨斯弩炮'), '赫尔墨斯弩炮枪');
  assert.equal(engine.translate('命运守护者'), '命运保险器');
  assert.equal(engine.translate('永恒誓言'), '永恒誓约');
});

test('航行时间线保留「循环纪」', () => {
  // .date-track-panel 里有一条 循环 => 循环 的同名条目，新引擎下它是空操作；
  // 关键是被顶掉的全局「循环 => 故事集」不会再回头改写刚写好的「循环纪」。
  assert.equal(engine.translate('Cycle III 航行时间表', ['.date-track-panel']), '循环纪 III 航行时间线');
  assert.equal(engine.translate('循环', ['.date-track-panel']), '循环');
  assert.equal(engine.translate('循环'), '故事集');
});

test('逐字最长命中：长条目优先，短条目不会抢走它的前缀', () => {
  // Sowing 与 Sowing and Reaping 都各自有官方名，长的必须先命中。
  assert.equal(engine.translate('Sowing and Reaping', [surveyScope]), '种瓜得瓜，种豆得豆');
  assert.equal(engine.translate('Sowing', [surveyScope]), '播种');
  assert.equal(engine.translate('Good Deeds', [surveyScope]), '善行');
});

test('作用域内的同名条目会顶掉全局条目', () => {
  const scopedFroms = engine.pairsFor([surveyScope]).map((pair) => pair.from);
  assert.ok(scopedFroms.includes('Market Forces'));
  assert.equal(engine.pairsFor([surveyScope]).filter((pair) => pair.from === 'Market Forces').length, 1);
});

test('关掉官方翻译时原样返回', () => {
  const off = createEngine(terms, false);
  assert.equal(off.translate('Market Forces', [surveyScope]), 'Market Forces');
  assert.equal(off.translate('循环'), '循环');
});

test('引擎不再用会连锁改写的 split/join 套用方式', () => {
  const source = read('assets/term-language.js');
  assert.ok(
    !/out = out\.split\(pair\.from\)\.join\(pair\.to\)/.test(source),
    'term-language.js 又回到逐条 split/join，短条目会二次改写长条目的译文',
  );
  assert.match(source, /value\.startsWith\(pair\.from, at\)/, 'translate 应逐字取最长命中');
});

test('八个页面的 term-language.js 版本号一致且已更新', () => {
  const files = [
    'index.html', 'map/index.html', 'hero/index.html', 'record/index.html',
    'ss/index.html', 'technology/index.html', 'story/index.html', 'aibp/index.html',
  ];
  const versions = new Set();
  for (const file of files) {
    const match = read(file).match(/term-language\.js\?v=([^"']+)/);
    assert.ok(match, `${file} 没有引入 term-language.js`);
    versions.add(match[1]);
  }
  assert.equal(versions.size, 1, `各页面的版本号不一致：${[...versions].join('、')}`);
  assert.notEqual([...versions][0], '20260913a', '引擎改了，版本号要一起换掉，否则浏览器还用旧脚本');
});
