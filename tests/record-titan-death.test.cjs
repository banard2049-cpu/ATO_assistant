const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../record/index.html'), 'utf8').replace(/\r\n/g, '\n');
function extract(name) {
  const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
}
function element() {
  return {
    children: [], listeners: {}, attributes: {},
    set innerHTML(value) { this.children = []; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
  };
}

function harness() {
  const c = vm.createContext({
    state: {
      titans: [
        { id: 'a', name: 'A', count: 3, limit: 3, crippled: true },
        { id: 'b', name: 'B', count: 2, limit: 2, crippled: false },
      ],
      titanLimit: '5', deadTitans: '',
    },
    saves: 0,
    queueSave() { c.saves++; },
    document: { createElement: element },
    elements: Object.fromEntries(['titanList', 'titanListCount', 'titanLimitInput', 'deadTitansInput'].map(key => [key, element()])),
  });
  vm.runInContext(['isPlainObject', 'normalizeTitanList', 'normalizeTitanLimit', 'titanTotals', 'updateTitanListCount', 'renderTitans'].map(extract).join('\n'), c);
  c.renderTitans();
  return c;
}

test('each death click loses one Titan and removes only the exhausted row', () => {
  const c = harness();
  const clickDeath = () => c.elements.titanList.children[0].children[3].listeners.click();
  clickDeath();
  assert.equal(c.state.titans[0].count, 2);
  assert.equal(c.state.deadTitans, '1');
  assert.equal(c.state.titans[0].crippled, true);
  assert.equal(c.elements.titanListCount.textContent, '总数 4/5 · 残废 2 · 已死亡 1');
  assert.equal(c.elements.deadTitansInput.value, '1');
  clickDeath();
  assert.equal(c.state.titans[0].count, 1);
  assert.equal(c.state.deadTitans, '2');
  clickDeath();
  assert.equal(c.state.titans.length, 1);
  assert.equal(c.state.titans[0].id, 'b');
  assert.equal(c.state.titans[0].count, 2);
  assert.equal(c.state.deadTitans, '3');
  assert.equal(c.state.titanLimit, '5');
  clickDeath();
  clickDeath();
  assert.equal(c.state.titans.length, 0);
  assert.equal(c.state.deadTitans, '5');
  assert.equal(c.elements.titanList.children[0].textContent, '尚未添加泰坦');
  assert.equal(c.saves, 5);
});

test('crippling splits off one Titan with a unique ID and preserves the totals', () => {
  const c = harness();
  c.state.titans[0].crippled = false;
  c.renderTitans();
  const changeCrippled = (index, checked) => {
    const input = c.elements.titanList.children[index].children[2].children[0];
    input.checked = checked;
    input.listeners.change();
  };
  changeCrippled(0, true);
  assert.equal(c.state.titans[0].count, 2);
  assert.equal(c.state.titans[0].crippled, false);
  assert.equal(c.state.titans[1].name, 'A');
  assert.equal(c.state.titans[1].count, 1);
  assert.equal(c.state.titans[1].crippled, true);
  assert.equal(new Set(c.state.titans.map(titan => titan.id)).size, 3);
  assert.equal(c.state.titans[2].id, 'b');
  assert.equal(c.state.titans[2].count, 2);
  assert.equal(c.elements.titanListCount.textContent, '总数 5/5 · 残废 1 · 已死亡 -');
  changeCrippled(0, true);
  assert.equal(c.state.titans[0].count, 1);
  assert.equal(c.state.titans.length, 3);
  assert.equal(c.state.titans[1].count, 2);
  assert.equal(c.titanTotals().crippled, 2);
  changeCrippled(0, true);
  assert.equal(c.state.titans.length, 2, 'the last healthy Titan merges into the crippled row');
  assert.equal(c.state.titans[0].count, 3);
  assert.equal(c.titanTotals().crippled, 3);
  changeCrippled(0, false);
  assert.equal(c.titanTotals().crippled, 2);
  assert.equal(c.state.deadTitans, '');
  assert.equal(c.state.titanLimit, '5');
  assert.equal(c.saves, 4);
  c.renderTitans();
  assert.equal(c.titanTotals().crippled, 2);
});

test('existing same-name crippled rows merge, while healthy and different names stay separate', () => {
  const c = harness();
  c.state.titans.push(
    { id: 'c', name: 'A', count: 2, limit: 2, crippled: true },
    { id: 'd', name: 'A', count: 4, limit: 4, crippled: false },
    { id: 'e', name: 'C', count: 1, limit: 1, crippled: true },
  );
  c.renderTitans();
  assert.equal(c.state.titans.length, 4);
  assert.equal(c.state.titans[0].id, 'a');
  assert.equal(c.state.titans[0].count, 5);
  assert.equal(c.state.titans[0].limit, 5);
  assert.equal(c.state.titans[2].count, 4);
  assert.equal(c.state.titans[2].crippled, false);
  assert.equal(c.titanTotals().total, 12);
  assert.equal(c.titanTotals().crippled, 6);
  c.renderTitans();
  assert.equal(c.state.titans[0].count, 5, 'rendering twice does not double-count');
  const name = c.elements.titanList.children[3].children[0];
  name.value = 'A';
  name.listeners.input();
  name.listeners.change();
  assert.equal(c.state.titans.length, 3);
  assert.equal(c.state.titans[0].count, 6);
  c.elements.titanList.children[0].children[3].listeners.click();
  assert.equal(c.state.titans[0].count, 5);
  assert.equal(c.state.deadTitans, '1');
});

test('recovering a grouped crippled row also splits off only one Titan', () => {
  const c = harness();
  const input = c.elements.titanList.children[0].children[2].children[0];
  input.checked = false;
  input.listeners.change();
  assert.equal(c.state.titans[0].count, 2);
  assert.equal(c.state.titans[0].crippled, true);
  assert.equal(c.state.titans[1].count, 1);
  assert.equal(c.state.titans[1].crippled, false);
  assert.equal(c.titanTotals().total, 5);
  assert.equal(c.titanTotals().crippled, 2);
  c.elements.titanList.children[1].children[3].listeners.click();
  assert.equal(c.state.titans.length, 2);
  assert.equal(c.state.titans[1].id, 'b');
  assert.equal(c.state.deadTitans, '1');
});
