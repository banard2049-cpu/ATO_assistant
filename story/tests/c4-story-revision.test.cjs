const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const test = require('node:test');

const filename = path.join(__dirname, '../data/storybook-data.js');
const available = fs.existsSync(filename);
const data = available ? JSON.parse(fs.readFileSync(filename, 'utf8')
  .replace(/^\s*window\.STORYBOOK_DATA\s*=\s*/, '').replace(/;\s*$/, '')) : null;
const c4 = data?.books.find(book => book.id === 'c4');
const entry = key => c4.entries.find(value => value.key === key);
const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

test('C4 source repairs retain the complete approved paragraph text', { skip: !available }, () => {
  const approved = {
    'c4-0-4': '8bbeb979851db07560c4e151b0c2149c60ead824c243c796b6a35b5ac0fb7c1d',
    'c4-0-35': 'a73ded57779ca62f0bdf4dd09a6fe7bb9ebdce059622ba2123c133b43d7b2793',
    'c4-0-53': '2ff96a1e6753f8c2420185fa6752c9ae895e3bc70dd9d5c8e1cb2b939a651434',
    'c4-0-74': 'bc522cb779363de40e50a88f6eef80785df690ac0a3a345dc70696c5bdbea760',
    'c4-0-104': '6fb0d47e46e585656f8a62ecefcc1d5d04684d1a43ca92a46b38bfe5fcd7572d',
    'c4-0-145': '6ecea7eccff84f75feb21605b57f5fd5221169c51cf201e2bec5aa5dc49045ab',
    'c4-3-68': '95fa9ca9e42b3a33d10d42acd970d6267bcb51f7d8a68e57e32d37e5a0cf8687',
    'c4-7-15': '7fce5d84c5b7e4f46e82e303dc4743f7567825e013887de8640ad130111d4763',
  };
  for (const [key, expected] of Object.entries(approved)) {
    assert.equal(sha(entry(key).text), expected, `${key}: complete R2 text`);
  }
  assert.notEqual(entry('c4-0-104').text, entry('c4-0-103').text, '1120 must not duplicate 1119');
});

test('C4 keeps the local 1346 repair and both original destinations', { skip: !available }, () => {
  const text = entry('c4-0-146').text;
  assert.equal(sha(text), 'b8883fbd8e3bd5cb84783f39dc1e15dcaed424e4be1192dd73007fd221105710');
  assert.match(text, /获得 \+1〔船体〕，参见 1350/);
  assert.match(text, /获得 \+1〔船员〕，参见 1351/);
});
