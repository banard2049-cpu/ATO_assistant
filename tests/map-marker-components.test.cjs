const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const markerSource = path.join(root, 'tools/map-marker-vector-source');
const linkSource = path.join(root, 'tools/map-link-vector-source');
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const markers = json(path.join(markerSource, 'production.json'));
const links = json(path.join(linkSource, 'production.json'));
const attrs = (svg, name) => [...svg.matchAll(new RegExp(` ${name}="([^"]*)"`, 'g'))].map(match => match[1]);
const canonical = svg => svg.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '').replace(/\s*\/>/g, '/>').replace(/>\s+</g, '><').trim();
const inner = group => group.endsWith('/>') ? '' : group.slice(group.indexOf('>') + 1, group.lastIndexOf('</'));

function group(svg, attribute, value = 'true') {
  const start = new RegExp(`<g\\b[^>]* ${attribute}="${value}"[^>]*>`).exec(svg);
  assert.ok(start, `Missing ${attribute}=${value}`);
  if (start[0].endsWith('/>')) return start[0];
  const tags = /<\/?g\b[^>]*>/g;
  tags.lastIndex = start.index;
  let depth = 0;
  for (let tag; (tag = tags.exec(svg));) {
    if (tag[0].endsWith('/>')) continue;
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return svg.slice(start.index, tags.lastIndex);
  }
  assert.fail(`Unclosed ${attribute}=${value}`);
}

test('map markers and route labels share one alpha outline', () => {
  const outlines = new Set();
  for (const [directory, manifest, count] of [[markerSource, markers, 36], [linkSource, links]]) {
    let occurrences = 0;
    for (const { vector } of Object.values(manifest.faces)) {
      const svg = read(path.join(directory, vector));
      for (const start of svg.matchAll(/<g\b[^>]* data-shared-alpha="map-alpha-25x22"[^>]*>/g)) {
        const alpha = group(svg.slice(start.index), 'data-shared-alpha', 'map-alpha-25x22');
        const paths = attrs(alpha, 'd');
        assert.equal(paths.length, 1, vector);
        outlines.add(paths[0]);
        occurrences++;
      }
    }
    if (count) assert.equal(occurrences, count);
    else assert.ok(occurrences > 0, 'Route labels include alpha');
  }
  assert.equal(outlines.size, 1);
});

test('map consumers load the current artwork registry version', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(read(path.join(root, 'map/tile-artwork-data.js')), context);
  const registry = context.window.ATO_MAP_ARTWORK_DATA;
  assert.ok(registry.cornerVectorVersion);
  assert.equal(registry.cornerVectorRasterless, true);
  assert.deepEqual(Array.from(registry.cornerVectorFiles).sort(), Object.keys(markers.faces).sort());
  for (const file of ['map/index.html', 'briefing/index.html', 'tools/tag-editor.html']) {
    const version = read(path.join(root, file)).match(/tile-artwork-data\.js\?v=([^"\s]+)/)?.[1];
    assert.equal(version, registry.cornerVectorVersion, file);
  }
});

test('current vectors contain every planned marker and hidden number and place Titans at the recorded centers', () => {
  const layout = json(path.join(markerSource, 'backing-layouts.json'));
  assert.equal(markers.method, 'shared-fixed-elements');
  assert.equal(layout.faces.length, 511);
  assert.deepEqual(Object.keys(markers.faces).sort(), layout.faces.map(face => face.key).sort());
  for (const [file, expected] of Object.entries(markers.inputSha256)) {
    assert.equal(sha(fs.readFileSync(path.join(root, file))), expected, file);
  }
  const types = new Map();
  let total = 0, hidden = 0;
  for (const { key, markers: planned, hiddenNumbers } of layout.faces) {
    const { vector, sha256 } = markers.faces[key];
    const bytes = fs.readFileSync(path.join(markerSource, vector));
    assert.equal(sha(bytes), sha256, key);
    const svg = bytes.toString('utf8');
    assert.doesNotMatch(svg, /data-pending-emblem|data-preview-only|source-ink|NaN|Infinity|redraw\//, key);
    assert.deepEqual(attrs(svg, 'data-marker-instance').sort(), planned.map(mark => mark.id).sort(), key);
    assert.deepEqual(attrs(svg, 'data-hidden-number').sort(), hiddenNumbers.map(number => number.text).sort(), key);
    for (const mark of planned) {
      const type = mark.variantId || mark.type;
      types.set(type, (types.get(type) || 0) + 1);
      if (type !== 'wild_titan') continue;
      const instance = group(svg, 'data-marker-instance', mark.id);
      const template = group(instance, 'data-marker-template', mark.layoutId);
      const position = attrs(template, 'transform')[0]?.match(/^translate\(([-\d.]+) ([-\d.]+)\)$/);
      const circle = template.match(/<circle\b[^>]* data-backing-circle="true"[^>]*>/)?.[0];
      assert.ok(position && circle, mark.id);
      assert.deepEqual([Number(position[1]) + Number(attrs(circle, 'cx')[0]),
        Number(position[2]) + Number(attrs(circle, 'cy')[0])], mark.center, mark.id);
      assert.ok(attrs(template, 'data-emblem').includes(type), mark.id);
    }
    total += planned.length;
    hidden += hiddenNumbers.length;
  }
  assert.equal(total, 595);
  assert.equal(hidden, 11);
  for (const [type, count] of Object.entries({
    wild_titan: 123, wheel_icon: 2, wheel_icon_winged: 2, greek_alpha: 36, greek_beta: 40, secret_number_banner: 14,
  })) assert.equal(types.get(type), count, type);
});

test('installed maps contain one current marker layer and one current route layer per face', () => {
  assert.deepEqual(Object.keys(markers.faces).sort(), Object.keys(links.faces).sort());
  for (const [key, row] of Object.entries(markers.faces)) {
    const svg = read(path.join(root, 'map/images/hd1024/overlay', `${key}-corners.svg`));
    for (const [attribute, file, version] of [
      ['data-map-markers', path.join(markerSource, row.vector), markers.version],
      ['data-map-links', path.join(linkSource, links.faces[key].vector), links.version],
    ]) {
      assert.deepEqual(attrs(svg, attribute), ['true'], key);
      const layer = group(svg, attribute);
      assert.equal(attrs(layer.slice(0, layer.indexOf('>') + 1), 'data-version')[0], version, key);
      assert.equal(canonical(inner(layer)), canonical(inner(read(file))), key);
    }
    assert.doesNotMatch(svg, /url\(#keep\)/i, key);
    const ids = attrs(svg, 'id');
    assert.equal(new Set(ids).size, ids.length, `duplicate id ${key}`);
  }
});
