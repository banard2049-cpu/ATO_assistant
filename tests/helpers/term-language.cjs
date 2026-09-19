/*
 * 从 assets/term-language.js 里取出真正的选表 + 套用逻辑，供测试直接调用，
 * 避免测试自己再实现一遍（实现一旦分叉，测试就失去意义）。
 *
 * 取的是 IIFE 里的两段纯逻辑：
 *   1. 术语表与作用域选择（pairs / scopeSelectors / pairsFor / indexFor）
 *   2. translate 本身
 * 它只用到一个外部变量 state.official，这里在沙箱里补上。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const engineFile = path.join(__dirname, '..', '..', 'assets', 'term-language.js');
const source = fs.readFileSync(engineFile, 'utf8');

function sliceFrom(startMarker, endMarker, inclusive = false) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`term-language.js 里找不到「${startMarker}」`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`term-language.js 里找不到结尾标记「${endMarker}」`);
  return source.slice(start, inclusive ? end + endMarker.length : end);
}

const engineSource = [
  sliceFrom('const pairs = (window.ATO_TERMS', 'const activeScopes'),
  // translate 的结尾标记要连 `};` 一起取进来
  sliceFrom('const translate = (value', '\n  };', true),
].join('\n');

function createEngine(terms, official = true) {
  const sandbox = { window: { ATO_TERMS: terms }, state: { official } };
  vm.createContext(sandbox);
  vm.runInContext(engineSource, sandbox, { filename: 'assets/term-language.js' });
  const translate = vm.runInContext('translate', sandbox);
  const pairsFor = vm.runInContext('pairsFor', sandbox);
  return {
    translate: (value, scopes = []) => translate(value, scopes),
    pairsFor: (scopes = []) => pairsFor(scopes),
    setOfficial: (value) => { sandbox.state.official = value; },
  };
}

module.exports = { createEngine, engineSource };
