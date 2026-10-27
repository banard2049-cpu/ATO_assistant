const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
let sharp; try { sharp = require('sharp'); } catch (_) { sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')); }

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'tools/map-link-vector-source');
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const manifest = () => json(path.join(source, 'production.json'));
const attrs = (text, name) => [...text.matchAll(new RegExp(` ${name}="([^"]*)"`, 'g'))].map(match => match[1]);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = text => text.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '').replace(/\s*\/>/g, '/>').replace(/>\s+</g, '><').trim();

function groupAt(text, start) {
  const tags = /<\/?g\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let tag; (tag = tags.exec(text));) {
    depth += tag[0].startsWith('</') ? -1 : tag[0].endsWith('/>') ? 0 : 1;
    if (!depth) return { text: text.slice(start, tags.lastIndex), end: tags.lastIndex };
  }
  assert.fail('Unclosed template group');
}
function groups(text, attribute) {
  const starts = [...text.matchAll(new RegExp(`<g\\b[^>]* ${attribute}="([^"]*)"[^>]*>`, 'g'))];
  return starts.map(match => ({ value: match[1], header: match[0], ...groupAt(text, match.index) }));
}
function removeContents(text) {
  const matches = [...text.matchAll(/<g\b[^>]* data-cell-content="[^"]*"[^>]*>/g)];
  for (const match of matches.reverse()) {
    const found = groupAt(text, match.index);
    text = text.slice(0, match.index) + text.slice(found.end);
  }
  return canonical(text);
}
function vector(row) {
  assert.match(row.vector, /^production\/[\w-]+\.svg$/);
  const file = path.join(source, row.vector), bytes = fs.readFileSync(file);
  assert.equal(digest(bytes), row.sha256, row.vector);
  return bytes.toString('utf8');
}

test('all 511 faces use complete semantic templates and only manifested complete original alpha', async () => {
  const production = manifest();
  assert.equal(production.method, 'shared-fixed-elements');
  for (const [file, expected] of Object.entries(production.inputSha256)) assert.equal(digest(fs.readFileSync(path.join(root, file))), expected, file);
  const inventory = json(path.join(source, 'inventory.json'));
  assert.deepEqual(Object.keys(production.faces).sort(), inventory.faces.map(face => face.key).sort());
  let panelCount = 0;
  const original = json(path.join(root, 'tools/map-marker-vector-source/original-components/manifest.json')).components;
  const checked = new Map();
  for (const [key, row] of Object.entries(production.faces)) {
    const svg = vector(row);
    let pathsOnly = svg;
    for (const group of groups(svg, 'data-component-kind').reverse()) {
      assert.equal(group.value, 'original-raster-alpha', key);
      const id = attrs(group.header, 'data-emblem')[0], record = original[id];
      assert.ok(record, id);
      assert.equal(record.kind, 'original-raster-alpha', id);
      assert.equal(record.canvasCropped, false, id);
      assert.equal(record.newSilhouetteInvented, false, id);
      assert.equal(attrs(group.header, 'data-source-sha256')[0], record.sha256, id);
      assert.equal(attrs(group.header, 'data-full-source-canvas')[0], `${record.width} ${record.height}`, id);
      const uri = attrs(group.text, 'href')[0];
      assert.match(uri, /^data:image\/png;base64,/, id);
      const bytes = Buffer.from(uri.split(',')[1], 'base64');
      const token = id + digest(bytes);
      if (!checked.has(token)) {
        const source = fs.readFileSync(path.join(root, record.file));
        assert.equal(digest(source), record.sha256, id);
        const actual = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        const expected = await sharp(source).ensureAlpha().raw().toBuffer();
        assert.deepEqual([actual.info.width, actual.info.height], [record.width,record.height], id);
        for (let p=0;p<expected.length;p+=4) {
          assert.equal(actual.data[p+3], expected[p+3], `${id} alpha pixel ${p/4}`);
          assert.equal(actual.data[p],255,id); assert.equal(actual.data[p+1],255,id); assert.equal(actual.data[p+2],255,id);
        }
        checked.set(token,true);
      }
      pathsOnly=pathsOnly.replace(group.text,'');
    }
    assert.doesNotMatch(pathsOnly, /<(?:\w+:)?(?:image|text|use|script|foreignObject)\b|data:image|@font-face|(?:xlink:)?href=|NaN|Infinity/i, key);
    assert.doesNotMatch(svg, /data-content-method="source-(?:ink|black-inset)"|smoothed-source|source-colour-contours|geometric-native-review-only/i, key);
    assert.equal(attrs(svg, 'data-panel').length, row.panels, key);
    assert.deepEqual(attrs(svg, 'data-template-layout'), row.templates, key);
    panelCount += row.panels;
  }
  assert.equal(Object.keys(production.faces).length, 511);
  assert.equal(panelCount, 1575);
});

test('every copy of a structural layout has exactly the same frame and untranslated geometry', () => {
  const production = manifest(), frames = new Map(), counts = new Map();
  let copies = 0;
  for (const [key, row] of Object.entries(production.faces)) {
    const svg = vector(row);
    const instances = groups(svg, 'data-template-instance');
    assert.equal(instances.length, row.panels, key);
    for (const instance of instances) {
      // Translation places a fixed-size module; stretching it would recreate
      // the source scan's inconsistent dimensions and glyph sizes.
      assert.match(attrs(instance.header, 'transform')[0], /^translate\(-?[\d.]+ -?[\d.]+\)$/);
    }
    for (const layout of groups(svg, 'data-template-layout')) {
      assert.ok(production.templates[layout.value], `${key} unknown layout ${layout.value}`);
      const frame = removeContents(layout.text);
      if (frames.has(layout.value)) { assert.equal(frame, frames.get(layout.value), `${key} reused frame differs`); copies++; }
      else frames.set(layout.value, frame);
      counts.set(layout.value, (counts.get(layout.value) || 0) + 1);
    }
  }
  assert.equal(frames.size, Object.keys(production.templates).length);
  assert.ok(copies > 1400, `Expected substantial exact template reuse, found ${copies}`);
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), 1575);
});

test('all arrows are the same five-sided 59 by 28 module and keep the original center', () => {
  const production = manifest();
  let count = 0;
  for (const [key, row] of Object.entries(production.faces)) {
    const svg = vector(row), arrows = groups(svg, 'data-arrow');
    assert.equal(arrows.length, row.arrows, key);
    for (const arrow of arrows) {
      const [l, t, r, b] = attrs(arrow.header, 'data-template-bbox')[0].split(/\s+/).map(Number);
      const [sl, st, sr, sb] = attrs(arrow.header, 'data-source-bbox')[0].split(/\s+/).map(Number);
      assert.equal((l + r) / 2, (sl + sr) / 2, key);
      assert.equal((t + b) / 2, (st + sb) / 2, key);
      assert.deepEqual([r - l, b - t], ['up', 'down'].includes(arrow.value) ? [59, 28] : [28, 59], key);
      const polygon = arrow.text.match(/<polygon\b(?=[^>]* data-arrow-inset="0")[^>]*>/)[0];
      const values = attrs(polygon, 'points')[0].trim().split(/[\s,]+/).map(Number);
      const points = Array.from({ length: 5 }, (_, i) => values.slice(i * 2, i * 2 + 2));
      assert.equal(values.length, 10, key);
      const cx = (l + r) / 2, cy = (t + b) / 2;
      const expected = arrow.value === 'up' ? [[l,b],[l,cy],[cx,t],[r,cy],[r,b]]
        : arrow.value === 'down' ? [[l,t],[r,t],[r,cy],[cx,b],[l,cy]]
        : arrow.value === 'left' ? [[r,t],[cx,t],[l,cy],[cx,b],[r,b]]
        : [[l,t],[cx,t],[r,cy],[cx,b],[l,b]];
      assert.deepEqual(points, expected, `${key} ${arrow.value}`);
      count++;
    }
  }
  assert.equal(count, 758);
});

test('C4 Greek suffixes are distinct from factions and both black frame strokes are 2px', () => {
  const production = manifest();
  let factions = 0, suffixes = 0;
  for (const [key, row] of Object.entries(production.faces)) {
    if (!key.startsWith('c4-')) continue;
    const svg = vector(row);
    factions += attrs(svg, 'data-faction-placement').length;
    suffixes += attrs(svg, 'data-kind').filter(kind => kind === 'greek').length;
    const frames = [...svg.matchAll(/<(?:polygon|path)\b(?=[^>]* data-(?:cell-inner-frame|frame-network)=)[^>]*>/g)];
    for (const [frame] of frames) {
      assert.equal(attrs(frame, 'stroke')[0], '#171713', key);
      assert.equal(Number(attrs(frame, 'stroke-width')[0]), 2, key);
    }
    for (const fill of svg.matchAll(/<polygon\b(?=[^>]* data-cell-fill="true")[^>]*>/g)) assert.equal(attrs(fill[0], 'fill')[0], '#b89b5a', key);
  }
  assert.equal(factions, 262);
  assert.equal(suffixes, 9);
});

test('every used icon has clean component provenance and no bitmap-contour fallback', () => {
  const production = manifest();
  const original = new Map(json(path.join(source, 'glyphs/manifest.json')).glyphs.map(row => [row.id, row]));
  const ids = new Set();
  const originals = json(path.join(root,'tools/map-marker-vector-source/original-components/manifest.json')).components;
  for (const row of Object.values(production.faces)) for (const id of attrs(vector(row), 'data-glyph')) ids.add(id);
  for (const id of ids) {
    const clean = originals[id] || fs.existsSync(path.join(source, 'components', `${id}.svg`));
    if (!clean) {
      assert.ok(original.has(id), id);
      assert.notEqual(original.get(id).method, 'isolated-bitmap-contour', id);
    }
  }
  assert.ok(ids.has('alpha') && ids.has('beta'));
});
