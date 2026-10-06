'use strict';
// Synthetic text only: copyrighted story resources are deliberately not test fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness, escape } = require('./helpers/mixed-media-dom.cjs');
const source = fs.readFileSync(path.join(__dirname, '../assets/mixed-media/renderer.js'), 'utf8');
const registryPattern = /  const records = (\[.*\]);/;
const production = JSON.parse(source.match(registryPattern)[1]);
const context = { schema: 1, bookId: 'c5', entryKey: 'synthetic-battle', variant: 'fan' };
const oldText = 'Demo heading\n\nAlpha body.';
const revisedText = 'Demo heading\n\nAlpha revised body.';
function fingerprint(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}
function record(text, title = 'Demo heading') {
  const start = text.indexOf(title);
  return { entryKey: context.entryKey, sourceKind: 'translation', textLength: text.length,
    textFingerprint: fingerprint(text), ranges: [{ start, end: start + title.length,
      kind: 'battle-title', titleFingerprint: fingerprint(title) }] };
}
function fixture(records = [record(oldText), record(revisedText)]) {
  const h = harness();
  const scope = { module: { exports: {} } };
  vm.runInNewContext(source.replace(registryPattern, () => `  const records = ${JSON.stringify(records)};`), scope);
  return { ...h, api: scope.module.exports.createC5BattleHeadings(h.env) };
}

test('heading registry contains only identities, lengths, offsets and fingerprints', () => {
  assert.equal(production.length, 14);
  assert.equal(production.reduce((n, r) => n + r.ranges.length, 0), 344);
  const identities = new Set();
  for (const r of production) {
    assert.deepEqual(Object.keys(r).sort(), ['entryKey', 'ranges', 'sourceKind', 'textFingerprint', 'textLength']);
    assert.match(r.textFingerprint, /^[a-f0-9]{8}$/);
    const identity = `${r.entryKey}:${r.textLength}:${r.textFingerprint}`;
    assert.ok(!identities.has(identity), 'duplicate text variant'); identities.add(identity);
    let end = 0;
    for (const range of r.ranges) {
      assert.deepEqual(Object.keys(range).sort(), ['end', 'kind', 'start', 'titleFingerprint']);
      assert.ok(Number.isInteger(range.start) && range.start >= end);
      assert.ok(Number.isInteger(range.end) && range.end > range.start && range.end <= r.textLength);
      assert.match(range.titleFingerprint, /^[a-f0-9]{8}$/);
      end = range.end;
    }
  }
});

test('original and revised resource variants coexist for both revised battle entries', () => {
  for (const key of ['c5-supplement-harsh-truth-battle', 'c5-supplement-white-lie-battle']) {
    const variants = production.filter(r => r.entryKey === key && r.sourceKind === 'translation');
    assert.equal(variants.length, 2);
    assert.notEqual(variants[0].textFingerprint, variants[1].textFingerprint);
  }
  const { api } = fixture();
  for (const text of [oldText, revisedText]) {
    const ranges = api.plan(context, text);
    assert.equal(ranges.length, 1);
    assert.ok(Object.isFrozen(ranges) && Object.isFrozen(ranges[0]));
    assert.equal(text.slice(ranges[0].start, ranges[0].end), 'Demo heading');
    assert.equal('title' in ranges[0], false);
  }
});

test('source drift, wrong context and unknown data retain plain text', () => {
  const { api } = fixture();
  for (const text of [oldText + '!', oldText.replace('Alpha', 'Omega'), '', 'Unknown']) {
    assert.equal(api.plan(context, text).length, 0);
    assert.equal(api.formatHTML(context, text, escape(text)), escape(text));
  }
  for (const ctx of [null, { ...context, schema: 2 }, { ...context, bookId: 'c4' },
    { ...context, variant: 'official' }, { ...context, entryKey: 'other' }]) {
    assert.equal(api.plan(ctx, oldText).length, 0);
  }
});

test('range fingerprints and boundaries are independently checked', () => {
  for (const change of [{ titleFingerprint: '00000000' }, { end: oldText.length + 1 },
    { start: 1 }, { end: 0 }, { start: 0.5 }]) {
    const row = record(oldText); Object.assign(row.ranges[0], change);
    assert.equal(fixture([row]).api.plan(context, oldText).length, 0);
  }
  const row = record(oldText); row.ranges.push({ ...row.ranges[0] });
  assert.equal(fixture([row]).api.plan(context, oldText).length, 0, 'overlapping ranges are rejected');
});

test('heading enhancement preserves exact text and is idempotent', () => {
  for (const text of [oldText, revisedText]) {
    const h = fixture(); h.container.textContent = text;
    assert.equal(h.api.enhanceHTML(h.container, context, text), 1);
    assert.equal(h.container.querySelectorAll('strong').length, 1);
    assert.equal(h.container.textContent, text);
    const html = h.container.innerHTML;
    h.api.enhanceHTML(h.container, context, text);
    assert.equal(h.container.innerHTML, html, 'repeated rendering adds no wrappers');
    assert.equal(h.api.formatHTML(context, text, escape(text)), html);
  }
});

test('headings spanning nodes preserve entities, Unicode and neighboring markup', () => {
  const text = 'Demo & 🧪 heading\n\nTail';
  const h = fixture([record(text, 'Demo & 🧪 heading')]);
  h.container.innerHTML = 'Demo &amp; <em>🧪</em> heading\n\nTail';
  const emphasis = h.container.querySelector('em');
  h.api.enhanceHTML(h.container, context, text);
  assert.equal(h.container.textContent, text);
  assert.equal(h.container.querySelector('em'), emphasis);
  assert.equal(h.container.querySelectorAll('strong').length, 3);
});

test('native headings and table cells keep their original nodes and formatting', () => {
  for (const tag of ['h2', 'strong', 'b', 'th', 'td']) {
    const h = fixture();
    const title = h.document.createElement(tag); title.textContent = 'Demo heading';
    h.container.append(title, h.document.createTextNode(oldText.slice('Demo heading'.length)));
    const html = h.container.innerHTML;
    h.api.enhanceHTML(h.container, context, oldText);
    assert.equal(h.container.innerHTML, html);
    assert.equal(h.container.firstChild, title);
  }
});

test('forbidden nodes and transformed text cause no partial DOM mutation', () => {
  for (const tag of ['script', 'style', 'noscript', 'textarea', 'option']) {
    const h = fixture();
    h.container.innerHTML = `Demo <${tag}>heading</${tag}>\n\nAlpha body.`;
    const html = h.container.innerHTML;
    assert.equal(h.api.enhanceHTML(h.container, context, oldText), 0);
    assert.equal(h.container.innerHTML, html);
  }
  const h = fixture(); h.container.textContent = oldText + '!';
  assert.equal(h.api.enhanceHTML(h.container, context, oldText), 0);
  assert.equal(h.container.textContent, oldText + '!');
});

test('both screens use the same revised renderer and local mapping cache versions', () => {
  const root = path.resolve(__dirname, '../..');
  for (const page of ['story/index.html', 'ss/index.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /mixed-media\/renderer\.js\?v=c4c5-20261006-r3-compat1/);
    assert.match(html, /mixed-media\/mapping\.js\?v=c4c5-20261006-r3/);
    assert.match(html, /story-tables\.js\?v=20261005-pipetables1/);
  }
});
