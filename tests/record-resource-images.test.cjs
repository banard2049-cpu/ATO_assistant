const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../record/index.html'), 'utf8').replace(/\r\n/g, '\n');
function harness() {
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  function element() {
    return {
      children: [], listeners: {}, isConnected: true,
      set innerHTML(value) { this.children = []; },
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); },
      setAttribute(key, value) { this[key] = value; },
      removeAttribute(key) { if (key === 'src') this._src = ''; },
      addEventListener(event, fn) { this.listeners[event] = fn; },
      get src() { return this._src; },
      set src(value) {
        assert.equal(typeof this.onload, 'function', 'Load handler must exist before requesting image');
        assert.equal(typeof this.onerror, 'function', 'Error handler must exist before requesting image');
        this._src = value;
        requests.push(value);
      },
    };
  }
  const context = vm.createContext({
    document: { createElement: element }, Date: { now: () => 12345 },
    window: {
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    resourceHeadingCache: new Map(),
    resourceImageMap: { armament: './assets/resource-icons/armament.png', core: './assets/resource-icons/core.png?v=old' },
    escapeHtml: (text) => text,
    createResourceCardImage: () => 'data:image/svg+xml,fallback',
  });
  for (const name of ['loadResourceImage', 'makeResourceHeading', 'renderResources']) {
    const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  function heading(key = 'armament', icon = key) {
    return context.makeResourceHeading({ key, icon, zh: key, en: key });
  }
  function fire(delay) {
    const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `Expected ${delay}ms timer`);
    timers.delete(entry[0]);
    entry[1].fn();
  }
  return { context, heading, fire, requests, timers };
}

test('small resource images load eagerly and synchronization reuses the same image', () => {
  const h = harness();
  const heading = h.heading();
  const image = heading.children[0].children[0];
  assert.equal(image.loading, 'eager');
  assert.equal(image.decoding, 'async');
  assert.equal(h.heading(), heading);
  assert.equal(h.requests.length, 1, 'A state rerender must not restart the image request');
  image.onload();
  assert.equal(h.timers.size, 0);
});

test('transient image failure retries the known path once and restores the icon', () => {
  const h = harness();
  const [image, retry] = h.heading().children[0].children;
  image.onerror();
  assert.equal(image.hidden, true);
  assert.equal(retry.hidden, false);
  h.fire(800);
  assert.equal(h.requests[1], './assets/resource-icons/armament.png?resourceRetry=12345');
  image.onload();
  assert.equal(image.hidden, false);
  assert.equal(retry.hidden, true);
  assert.equal(h.timers.size, 0);
});

test('missing images stop retrying automatically and can recover after import by clicking retry', () => {
  const h = harness();
  const [image, retry] = h.heading('core').children[0].children;
  image.onerror();
  h.fire(800);
  image.onerror();
  assert.equal(h.requests.length, 2);
  assert.equal(h.timers.size, 0, 'A missing image must not create a retry loop');
  assert.equal(h.heading('core').children[0].children[0], image);
  retry.listeners.click();
  assert.equal(h.requests[2], './assets/resource-icons/core.png?v=old&resourceRetry=12345');
  image.onload();
  assert.equal(retry.hidden, true);
  assert.equal(h.timers.size, 0);
});

test('a stalled image times out and old views do not start delayed retries', () => {
  const h = harness();
  const [image, retry] = h.heading().children[0].children;
  h.fire(15000);
  assert.equal(retry.hidden, false);
  image.isConnected = false;
  h.fire(800);
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
});

test('manual retry cancels a pending automatic retry and unrelated resource labels stay separate', () => {
  const h = harness();
  const first = h.heading('first-core', 'core');
  const second = h.heading('second-core', 'core');
  assert.notEqual(first, second);
  const [image, retry] = first.children[0].children;
  image.onerror();
  retry.listeners.click();
  assert.ok(![...h.timers.values()].some((timer) => timer.delay === 800));
  image.onload();
  second.children[0].children[0].onload();
  assert.equal(h.timers.size, 0);
});

test('resource rerenders update quantities without recreating loaded or pending icons', () => {
  const h = harness();
  const grid = h.context.document.createElement('div');
  h.context.elements = { resourceGrid: grid };
  h.context.state = { resources: { armament: 3 } };
  h.context.currentResources = () => [{ key: 'armament', icon: 'armament', zh: 'Armament', en: 'Armament', type: 'number' }];
  h.context.resourceStorageKey = (key) => key;
  h.context.makeNumberField = (key) => ({ value: h.context.state.resources[key] });
  h.context.renderResources();
  const heading = grid.children[0].children[0];
  assert.equal(grid.children[0].children[1].value, 3);
  h.context.state.resources.armament = 7;
  h.context.renderResources();
  assert.equal(grid.children[0].children[0], heading);
  assert.equal(grid.children[0].children[1].value, 7);
  assert.equal(h.requests.length, 1);
  heading.children[0].children[0].onload();
  h.context.renderResources();
  assert.equal(grid.children[0].children[0], heading);
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
});
