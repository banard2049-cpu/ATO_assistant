// Run: node tests/centimanes-record.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cent = require('../story/assets/centimanes.js');
const source = fs.readFileSync(path.join(__dirname, '../record/index.html'), 'utf8');

const empty = cent.normalize();
assert.deepEqual(empty, {version: 1, mapping: {}, draft: [], records: {}});
assert.deepEqual(cent.translate([0, 1, 0, 15], {0: '0', 1: '4'}), ['0', '4', '0', '']);
const draft = {...empty, mapping: {0: '0', 1: '4'}, draft: [0, 1, 0, 15]};
const saved = cent.saveReading(draft, {id: 'cent-first', title: ' 0046 ', cycle: 'c1', createdAt: '2026-10-04T12:00:00Z'});
assert.deepEqual(draft.records, {}, 'Saving must not mutate the prior snapshot');
assert.deepEqual(saved.records['cent-first'].glyphs, [0, 1, 0, 15]);
assert.deepEqual(saved.records['cent-first'].digits, ['0', '4', '0', '']);
assert.equal(saved.records['cent-first'].title, '0046');
saved.mapping[0] = '9';
assert.deepEqual(saved.records['cent-first'].digits, ['0', '4', '0', ''], 'Old readings retain their digits');
assert.deepEqual(cent.translate(saved.draft, saved.mapping), ['9', '4', '9', '']);
assert.deepEqual(cent.recordView(saved.records['cent-first'], saved.mapping).digits, ['0', '4', '0', ''],
  'A digit recorded at save time is not rewritten by a later mapping');
// Records saved before the cipher was solved fill in as symbols are learned.
const partial = cent.saveReading({...empty, mapping: {0: '0'}, draft: [0, 15]}, {id: 'cent-partial', createdAt: '2026-10-20T00:00:00Z'});
assert.deepEqual(partial.records['cent-partial'].digits, ['0', '']);
const filled = cent.recordView(partial.records['cent-partial'], {0: '0', 15: '7'});
assert.deepEqual(filled.digits, ['0', '7'], 'Symbols unknown at save time use the learned mapping');
assert.equal(filled.filled, 1);
const cleared = cent.recordView(partial.records['cent-partial'], {0: '0'});
assert.deepEqual(cleared.digits, ['0', ''], 'Clearing the mapping returns the unknown symbol');
assert.equal(cleared.filled, 0);
assert.deepEqual(cent.recordView({glyphs: [0, 15], digits: ['0', '']}, {15: 'x'}).digits, ['0', ''],
  'Non-digit mappings cannot fill a saved record');
assert.deepEqual(cent.normalize(JSON.parse(JSON.stringify(saved))), saved, 'Backup round trip preserves repeated/unknown glyphs');
assert.throws(() => cent.saveReading(empty, {id: 'cent-empty'}), /输入符号/);
assert.throws(() => cent.saveReading(saved, {id: 'cent-first'}), /重复/);
const malformed = JSON.parse('{"mapping":{"0":"0","1":12,"16":"4"},"draft":[0,-1,16,"1",2],"records":{"__proto__":{"glyphs":[0]},"cent-bad":{"glyphs":[16]}}}');
assert.deepEqual(cent.normalize(malformed), {version: 1, mapping: {0: '0'}, draft: [0, 2], records: {}});
const templates = Array.from({length: 16}, (_, index) => cent.glyphSvg(index));
assert.equal(new Set(templates).size, 16, 'All sixteen keyboard symbols must be distinct');
assert.equal(cent.glyphSvg(-1), '');

// Exercise the record page's actual merge rather than a duplicate merge algorithm.
const start = source.indexOf('    function isPlainObject(value)');
const end = source.indexOf('    function recordStateFromCampaign(', start);
assert.ok(start >= 0 && end > start);
const ctx = vm.createContext({});
vm.runInContext(source.slice(start, end), ctx);
const base = {centimanes: cent.normalize()};
const local = structuredClone(base), remote = structuredClone(base);
local.centimanes.mapping[0] = '0'; remote.centimanes.mapping[1] = '4';
local.centimanes.records['cent-left'] = saved.records['cent-first'];
remote.centimanes.records['cent-right'] = {...saved.records['cent-first'], title: 'another'};
const merged = JSON.parse(JSON.stringify(ctx.mergeRecordChanges(base, local, remote)));
assert.deepEqual(merged.conflicts, []);
assert.deepEqual(merged.value.centimanes.mapping, {0: '0', 1: '4'});
assert.deepEqual(Object.keys(merged.value.centimanes.records).sort(), ['cent-left', 'cent-right']);
remote.centimanes.mapping[0] = '9';
assert.ok(ctx.mergeRecordChanges(base, local, remote).conflicts.includes('centimanes.mapping.0'), 'Contradictory meanings require the existing conflict resolution');
console.log('PASS Centimanes: repeated symbols, leading zero, unknowns, immutable readings, live fill-in of saved records, backup recovery and real record conflict merge.');
