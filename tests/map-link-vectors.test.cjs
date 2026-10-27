const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'tools/map-link-vector-source');
const review = path.join(root, 'output/map-link-vector-review-20261025');
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const production = () => json(path.join(source, 'production.json'));
const fixture = relative => {
  const primary = path.join(source, relative);
  return fs.existsSync(primary) ? primary : path.join(review, relative.replace(/^approved37\//, 'native-samples/'));
};
const attrs = (text, name) => [...text.matchAll(new RegExp(` ${name}="([^"]*)"`, 'g'))].map(match => match[1]);
const canonical = text => text.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '').replace(/\s*\/>/g, '/>').replace(/>\s+</g, '><').trim();
const inner = text => text.slice(text.indexOf('>') + 1, text.lastIndexOf('</'));
function group(text, attribute, value) {
  const start = new RegExp(`<g\\b[^>]* ${attribute}="${value}"[^>]*>`).exec(text);
  assert.ok(start, `Missing ${attribute}=${value}`);
  const tags = /<\/?g\b[^>]*>/g;
  tags.lastIndex = start.index;
  let depth = 0;
  for (let tag; (tag = tags.exec(text));) {
    depth += tag[0].startsWith('</') ? -1 : tag[0].endsWith('/>') ? 0 : 1;
    if (!depth) return text.slice(start.index, tags.lastIndex);
  }
  assert.fail(`Unclosed ${attribute}=${value}`);
}
function vector(row) {
  assert.match(row.vector, /^production\/[\w-]+\.svg$/);
  const file = path.join(source, row.vector), bytes = fs.readFileSync(file);
  assert.equal(digest(bytes), row.sha256, row.vector);
  return bytes.toString('utf8');
}

test('all 511 map faces have complete artwork from the shared semantic templates', () => {
  const manifest = production();
  assert.equal(manifest.method, 'shared-fixed-elements');
  const registryContext = vm.createContext({ window: {} });
  vm.runInContext(read(path.join(root, 'map/tile-artwork-data.js')), registryContext);
  const registry = registryContext.window.ATO_MAP_ARTWORK_DATA;
  assert.deepEqual(Object.keys(manifest.faces).sort(), [...registry.cornerVectorFiles].sort());
  assert.equal(Object.keys(manifest.faces).length, 511);
  let panels = 0;
  for (const [key, row] of Object.entries(manifest.faces)) {
    const svg = vector(row);
    assert.match(svg, /viewBox="0 0 1024 1024"/);
    assert.doesNotMatch(svg, /<(?:\w+:)?(?:text|use|script|foreignObject)\b|@font-face/i, key);
    assert.equal(attrs(svg,'href').length, attrs(svg,'data-component-kind').filter(k=>k==='original-raster-alpha').length,key);
    assert.doesNotMatch(svg, /NaN|Infinity/, key);
    assert.equal(attrs(svg, 'data-panel').length, row.panels, key);
    assert.deepEqual(attrs(svg, 'data-template-layout'), row.templates, key);
    assert.equal(attrs(svg, 'data-template-instance').length, row.panels, key);
    assert.doesNotMatch(svg, /data-content-method="source-(?:ink|black-inset)"|smoothed-source|source-colour-contours/i, key);
    assert.ok(row.maskPath.startsWith('M'), key);
    panels += row.panels;
  }
  assert.equal(panels, 1575);
});

test('the 37 reviewed examples retain their audited contents while using the common templates', () => {
  const manifest = production();
  const samples = json(fixture('approved37/report.json')).records;
  const contents = {};
  for (const file of ['contents-c1-c2.json', 'contents-c3-c4.json', 'contents-c5.json']) Object.assign(contents, json(path.join(source, file)).faces);
  assert.equal(samples.length, 37);
  for (const sample of samples) {
    const svg = vector(manifest.faces[sample.key]);
    const panel = group(svg, 'data-panel', sample.panelId);
    const semantic = contents[sample.key].panels[sample.panelId].cells.filter(cell => cell.type !== 'restricted');
    assert.deepEqual(semantic.map(cell => [cell.type, cell.value]), sample.cells.map(cell => [cell.kind, cell.value]), sample.id);
    assert.deepEqual(attrs(panel, 'data-number'), semantic.filter(cell => cell.type === 'number').map(cell => cell.value), sample.id);
    assert.deepEqual(attrs(panel, 'data-faction'), semantic.filter(cell => cell.type === 'faction').map(cell => cell.value), sample.id);
    assert.deepEqual(attrs(panel, 'data-glyph'), semantic.filter(cell => ['greek', 'icon'].includes(cell.type)).map(cell => cell.value), sample.id);
    assert.equal(attrs(panel, 'data-wave-count').length, semantic.filter(cell => cell.type === 'waves').length, sample.id);
    assert.ok(attrs(panel, 'data-wave-count').every(value => value === '3'), sample.id);
    const instance = group(panel, 'data-template-instance', attrs(panel, 'data-template-instance')[0]);
    assert.match(attrs(instance.slice(0, instance.indexOf('>') + 1), 'transform')[0], /^translate\(-?[\d.]+ -?[\d.]+\)$/);
  }
});

test('every source arrow is represented once by a five-sided symmetric template at its source center', () => {
  const manifest = production();
  const inventory = json(fixture('inventory.json'));
  let arrows = 0;
  for (const face of inventory.faces) {
    const svg = vector(manifest.faces[face.key]);
    const starts = [...svg.matchAll(/<g\b[^>]* data-arrow="(up|down|left|right)"[^>]*>/g)];
    const footprints = [];
    for (const match of starts) {
      const header = match[0], direction = match[1];
      const sourceBox = attrs(header, 'data-source-bbox')[0].split(/\s+/).map(Number);
      const bbox = attrs(header, 'data-template-bbox')[0].split(/\s+/).map(Number);
      footprints.push(sourceBox.join(' '));
      assert.equal((bbox[0] + bbox[2]) / 2, (sourceBox[0] + sourceBox[2]) / 2, face.key);
      assert.equal((bbox[1] + bbox[3]) / 2, (sourceBox[1] + sourceBox[3]) / 2, face.key);
      assert.deepEqual([bbox[2] - bbox[0], bbox[3] - bbox[1]], ['up', 'down'].includes(direction) ? [59, 28] : [28, 59], face.key);
      const next = svg.slice(match.index + header.length).match(/<polygon\b[^>]* data-arrow-inset="0"[^>]*>/);
      assert.ok(next, face.key);
      const numbers = attrs(next[0], 'points')[0].trim().split(/[\s,]+/).map(Number);
      assert.equal(numbers.length, 10, face.key);
      const points = Array.from({ length: 5 }, (_, i) => numbers.slice(i * 2, i * 2 + 2));
      const [l, t, r, b] = bbox, cx = (l + r) / 2, cy = (t + b) / 2;
      const expected = direction === 'up' ? [[l,b],[l,cy],[cx,t],[r,cy],[r,b]]
        : direction === 'down' ? [[l,t],[r,t],[r,cy],[cx,b],[l,cy]]
        : direction === 'left' ? [[r,t],[cx,t],[l,cy],[cx,b],[r,b]]
        : [[l,t],[cx,t],[r,cy],[cx,b],[l,b]];
      assert.deepEqual(points, expected, `${face.key} ${direction}`);
      assert.equal(attrs(header, 'data-rim-inset')[0], '2');
      arrows++;
    }
    for (const part of face.arrows) {
      assert.equal(footprints.filter(box => box === part.bbox.join(' ')).length, 1,
        `${face.key} ${part.id} missing or duplicated`);
    }
  }
  assert.equal(arrows, inventory.summary.arrows + 2, 'Includes the two source-connected arrows');
});

test('installation preserves the original PNG and every corner, and adds one link cut and layer', {
  skip: !fs.existsSync(path.join(root, 'official-assets/_backups/map-links-20261025/manifest.json'))
    ? 'Local official-material backup is only available for installation acceptance' : false,
}, () => {
  const manifest = production();
  const backup = json(path.join(root, 'official-assets/_backups/map-links-20261025/manifest.json'));
  const snapshots = new Map(backup.files.filter(row => row.kind === 'pre-install-vector-overlay').map(row => [row.key, row]));
  const registryContext = vm.createContext({ window: {} });
  vm.runInContext(read(path.join(root, 'map/tile-artwork-data.js')), registryContext);
  const markerFile=path.join(root,'tools/map-marker-vector-source/production.json');
  const markerProduction=fs.existsSync(markerFile)?json(markerFile):null;
  assert.equal(registryContext.window.ATO_MAP_ARTWORK_DATA.cornerVectorVersion, markerProduction?markerProduction.version:manifest.version);
  for (const [key, row] of Object.entries(manifest.faces)) {
    const snapshot = snapshots.get(key);
    const beforeBytes = fs.readFileSync(path.join(root, snapshot.backup));
    assert.equal(digest(beforeBytes), snapshot.sha256, key);
    const before = beforeBytes.toString('utf8');
    const after = read(path.join(root, 'map/images/hd1024/overlay', `${key}-corners.svg`));
    assert.equal(attrs(after, 'data-map-links').length, 1, key);
    assert.equal(attrs(after, 'data-map-links')[0], 'true', key);
    assert.equal(attrs(after, 'data-remove').filter(value => value === 'links').length, 1, key);
    assert.deepEqual(attrs(after, 'data-corner'), attrs(before, 'data-corner'), key);
    for (const side of attrs(before, 'data-corner')) {
      assert.equal(canonical(group(after, 'data-corner', side)), canonical(group(before, 'data-corner', side)), `${key} ${side}`);
    }
    const mask = text => text.match(/<mask\b[^>]* id="keep"[^>]*>[\s\S]*?<\/mask>/)[0];
    const retained = mask(after).replace(/<path\b(?=[^>]* data-remove="(?:links|remaining-markers)")[^>]*\/>/g, '');
    assert.equal(canonical(retained), canonical(mask(before)), key);
    const image = text => text.match(/<image\b[^>]*>/)[0];
    assert.deepEqual(attrs(image(after), 'href'), attrs(image(before), 'href'), key);
    const markerImages=markerProduction?attrs(group(after,'data-map-markers','true'),'href').length:0;
    assert.equal(attrs(after, 'href').length, 1+attrs(vector(row),'href').length+markerImages,key);
    const linkLayer = group(after, 'data-map-links', 'true');
    assert.equal(canonical(inner(linkLayer)), canonical(inner(vector(row))), key);
    assert.equal(attrs(linkLayer.slice(0, linkLayer.indexOf('>') + 1), 'data-version')[0], manifest.version);
  }
});

test('C4 keeps two equal black frame strokes with gold between them', () => {
  const manifest = production();
  let panels = 0;
  for (const [key, row] of Object.entries(manifest.faces)) {
    if (!key.startsWith('c4-')) continue;
    const svg = vector(row);
    const frames = [...svg.matchAll(/<(?:polygon|path)\b(?=[^>]* data-(?:cell-inner-frame|frame-network|joined-frame|shared-rim)=)[^>]*>/g)];
    assert.ok(frames.length, key);
    for (const [frame] of frames) {
      assert.equal(attrs(frame, 'stroke')[0], '#171713', key);
      assert.equal(Number(attrs(frame, 'stroke-width')[0]), 2, key);
    }
    const fills = [...svg.matchAll(/<polygon\b(?=[^>]* data-cell-fill="true")[^>]*>/g)];
    for (const [fill] of fills) assert.equal(attrs(fill, 'fill')[0], '#b89b5a', key);
    panels += row.panels;
  }
  assert.equal(panels, 262);
});
