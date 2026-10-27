/* Browser QA of preview files only. Serves local files through Playwright
 * interception; no campaign API, network service, or production writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const output = path.resolve(args.find(arg => !arg.startsWith('--')) || path.join(root, 'output/map-link-vector-review-20261025'));
const inventory = JSON.parse(fs.readFileSync(path.join(output, 'inventory.json'), 'utf8'));
const screenshots = path.join(output, 'browser');
const origin = 'http://map-link-review.test';
const prefix = '/' + path.relative(root, output).split(path.sep).join('/');
const expected = Object.fromEntries(['c1', 'c2', 'c3', 'c4', 'c5'].map(cycle =>
  [cycle, inventory.faces.filter(face => face.cycle === cycle).length]));

function playwright() {
  try { return require('playwright'); } catch (_) {
    return require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  }
}

async function fidelity() {
  let sharp;
  try { sharp = require('sharp'); } catch (_) {
    sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));
  }
  const components = [];
  for (const face of inventory.faces) {
    const [original, vector] = await Promise.all([
      sharp(path.resolve(root, face.source)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(path.join(output, 'links', `${face.key}.svg`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    assert.equal(original.info.width, 1024); assert.equal(original.info.height, 1024);
    assert.equal(vector.info.width, 1024); assert.equal(vector.info.height, 1024);
    assert.equal(original.info.channels, 4); assert.equal(vector.info.channels, 4);
    const parts = [...face.panels.map(part => ({ ...part, kind: 'panel' })),
      ...face.arrows.map(part => ({ ...part, kind: 'arrow' })),
      ...face.panels.flatMap(panel => (panel.attachedExtras || []).map((part, index) =>
        ({ ...part, kind: 'extra', id: `${panel.id}-extra-${index + 1}` })))];
    const a = original.data, b = vector.data;
    for (const part of parts) {
      const [left, top, right, bottom] = part.bbox;
      let alphaIntersection = 0, alphaUnion = 0, brightIntersection = 0, brightUnion = 0;
      let sourceBrightPixels = 0, vectorBrightPixels = 0, darkIntersection = 0, darkUnion = 0;
      let rgbError = 0, opaqueIntersection = 0;
      const threshold = face.cycle === 'c4' ? 200 : 180;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const i = (y * 1024 + x) * 4, sa = a[i + 3] > 100, va = b[i + 3] > 100;
        alphaIntersection += sa && va; alphaUnion += sa || va;
        const sl = .299 * a[i] + .587 * a[i + 1] + .114 * a[i + 2];
        const vl = .299 * b[i] + .587 * b[i + 1] + .114 * b[i + 2];
        const sb = sa && sl > threshold, vb = va && vl > threshold;
        sourceBrightPixels += sb; vectorBrightPixels += vb;
        brightIntersection += sb && vb; brightUnion += sb || vb;
        const sd = sa && sl < 110, vd = va && vl < 110;
        darkIntersection += sd && vd; darkUnion += sd || vd;
        if (a[i + 3] > 230 && b[i + 3] > 230) {
          opaqueIntersection++;
          rgbError += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        }
      }
      components.push({ key: face.key, id: part.id, kind: part.kind, bbox: part.bbox,
        alphaIoU: alphaUnion ? alphaIntersection / alphaUnion : 1,
        brightInkIoU: brightUnion ? brightIntersection / brightUnion : null,
        darkInkIoU: darkUnion ? darkIntersection / darkUnion : null,
        sourceBrightPixels, vectorBrightPixels, brightInkThreshold: threshold,
        opaqueRgbMAE: opaqueIntersection ? rgbError / (opaqueIntersection * 3) : null,
        opaqueComparedPixels: opaqueIntersection });
    }
  }
  const bright = components.filter(row => row.sourceBrightPixels >= 10 && row.brightInkIoU !== null);
  const warnings = components.filter(row => row.alphaIoU < .90 ||
    (row.sourceBrightPixels >= 10 && row.brightInkIoU < .75));
  const report = { status: 'measured', renderer: 'Independent librsvg rendering through Sharp',
    faces: inventory.faces.length, components: components.length,
    method: 'Compare source PNG with rendered pure-vector SVG within every inventoried component bbox; alpha > 100, bright ink luminance > 180 (C4 > 200), RGB MAE on intersection with both alphas > 230.',
    minimumAlphaIoU: Math.min(...components.map(row => row.alphaIoU)),
    minimumBrightInkIoU: Math.min(...bright.map(row => row.brightInkIoU)),
    meanOpaqueRgbMAE: components.reduce((sum, row) => sum + (row.opaqueRgbMAE || 0) * row.opaqueComparedPixels, 0) /
      Math.max(1, components.reduce((sum, row) => sum + row.opaqueComparedPixels, 0)),
    qualityReviewWarnings: warnings.length,
    warningCriteria: 'alphaIoU < 0.90, or brightInkIoU < 0.75 with at least 10 source bright pixels; flags for visual review, not automatic acceptance.',
    worstAlpha20: [...components].sort((a, b) => a.alphaIoU - b.alphaIoU).slice(0, 20),
    worstBrightInk20: [...bright].sort((a, b) => a.brightInkIoU - b.brightInkIoU).slice(0, 20),
    worstRgbMAE20: [...components].sort((a, b) => (b.opaqueRgbMAE || 0) - (a.opaqueRgbMAE || 0)).slice(0, 20),
    warnings, records: components, installation: 'none' };
  fs.writeFileSync(path.join(output, 'fidelity-check.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ fidelityFaces: report.faces, components: report.components,
    minimumAlphaIoU: report.minimumAlphaIoU, minimumBrightInkIoU: report.minimumBrightInkIoU,
    meanOpaqueRgbMAE: report.meanOpaqueRgbMAE, qualityReviewWarnings: warnings.length }));
}

async function ready(page) {
  return page.evaluate(async () => {
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map(image => image.decode()));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const missing = images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src);
    return { images: images.length, missing };
  });
}

async function main() {
  if (!args.includes('--skip-fidelity')) await fidelity();
  if (args.includes('--fidelity-only')) return;
  fs.mkdirSync(screenshots, { recursive: true });
  const browser = await playwright().chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const errors = [], failedRequests = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort('blockedbyclient');
      if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({ status: 404, body: 'Local QA resource not found' });
      }
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css',
        '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto(origin + prefix + '/index.html', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#gallery article').count(), inventory.faces.length, 'Initial all-face gallery');
    const gallery = {};
    for (const [cycle, count] of Object.entries(expected)) {
      await page.locator(`[data-cycle="${cycle}"]`).click();
      assert.equal(await page.locator('#gallery article').count(), count, `${cycle} filter`);
      const decoded = await ready(page);
      assert.deepEqual(decoded.missing, [], `${cycle}: every gallery image decodes`);
      gallery[cycle] = { count, ...decoded };
      await page.screenshot({ path: path.join(screenshots, `${cycle}-gallery.png`) });
    }
    await page.locator('[data-cycle="all"]').click();
    assert.equal(await page.locator('#gallery article').count(), 511);
    await page.locator('#search').fill('no-such-map-99999');
    assert.equal(await page.locator('#gallery article').count(), 0, 'No-result search');
    const detailKeys = [
      'c1-tile-009-alt-front', 'c1-tile-027-front', 'c2-tile-019-front',
      'c2-tile-041-front', 'c3-tile-050-front', 'c4-tile-011-front',
      'c5-tile-040-front', 'c5-tile-040-back', 'c5-tile-027-front',
    ];
    const details = [];
    for (const key of detailKeys) {
      await page.locator('#search').fill(key);
      assert.equal(await page.locator('#gallery article').count(), 1, `${key}: exact search`);
      assert.deepEqual((await ready(page)).missing, []);
      await page.locator('#gallery article .zoom').first().click();
      assert.equal(await page.locator('dialog[open]').count(), 1, `${key}: zoom dialog`);
      assert.deepEqual((await ready(page)).missing, []);
      await page.locator('dialog[open]').screenshot({ path: path.join(screenshots, `${key}-detail.png`) });
      await page.locator('#close').click();
      assert.equal(await page.locator('dialog[open]').count(), 0, `${key}: close dialog`);
      details.push(key);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#search').fill('c5-tile-040-front');
    await ready(page);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(mobileOverflow, false, 'Mobile gallery fits viewport');
    await page.screenshot({ path: path.join(screenshots, 'mobile.png'), fullPage: true });

    // The native geometry alternative and isolated glyph library are separate
    // review pages; exercise their actual controls and every SVG-as-image load.
    const nativeReport = JSON.parse(fs.readFileSync(path.join(output, 'native-samples/report.json'), 'utf8'));
    await page.setViewportSize({ width: 1440, height: 1120 });
    await page.goto(origin + prefix + '/native-samples/index.html', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#gallery article').count(), nativeReport.samples);
    assert.deepEqual((await ready(page)).missing, []);
    const nativeCycles = {};
    for (const cycle of Object.keys(expected)) {
      const samples = nativeReport.records.filter(row => row.cycle === cycle);
      assert.deepEqual([...new Set(samples.map(row => row.direction))].sort(), ['down', 'left', 'right', 'up']);
      await page.locator(`[data-cycle="${cycle}"]`).click();
      assert.equal(await page.locator('#gallery article').count(), samples.length);
      assert.deepEqual((await ready(page)).missing, []);
      nativeCycles[cycle] = samples.length;
    }
    await page.locator('[data-cycle="all"]').click();
    await page.locator('#search').fill('c2-tile-019-front--left-1');
    assert.equal(await page.locator('#gallery article').count(), 1);
    await page.locator('.zoom').click();
    assert.equal(await page.locator('dialog[open]').count(), 1);
    assert.deepEqual((await ready(page)).missing, []);
    await page.locator('dialog').screenshot({ path: path.join(screenshots, 'native-c2-019-detail.png') });
    await page.locator('.close').click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.locator('#search').fill('no-such-native-99999');
    assert.equal(await page.locator('#gallery article').count(), 0);
    await page.locator('#search').fill('c5-tile-040-front');
    assert.equal(await page.locator('#gallery article').count(), 4);
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    const nativeMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(nativeMobileOverflow, false, 'Native sample gallery fits mobile');
    await page.screenshot({ path: path.join(screenshots, 'native-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1120 });
    await page.goto(origin + prefix + '/glyphs/index.html', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('.grid article').count(), 24);
    const glyphDecoded = await ready(page);
    assert.equal(glyphDecoded.images, 24);
    assert.deepEqual(glyphDecoded.missing, []);
    await page.screenshot({ path: path.join(screenshots, 'glyph-library.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const glyphMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(glyphMobileOverflow, false, 'Glyph library fits mobile');

    // Render every output, including faces not visited in the gallery. Checking
    // pixels beyond route boxes also detects SVG-as-image failures where the
    // existing markings disappear because an external <image> was not loaded.
    await page.setViewportSize({ width: 1440, height: 1120 });
    const raster = await page.evaluate(async ({ faces, prefix }) => {
      function load(src) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Image decode failed: ' + src));
          image.src = src;
        });
      }
      function rasterize(image) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1024;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, 1024, 1024);
        const pixels = context.getImageData(0, 0, 1024, 1024).data;
        canvas.width = canvas.height = 0;
        return pixels;
      }
      const rows = [];
      for (const face of faces) {
        const key = face.key;
        const [links, overlay, original] = await Promise.all([
          load(`${prefix}/links/${key}.svg`),
          load(`${prefix}/overlays/${key}.svg`),
          load(`/map/images/hd1024/overlay/${key}-corners.svg`),
        ]);
        if ([links, overlay, original].some(image => image.naturalWidth !== 1024 || image.naturalHeight !== 1024)) {
          throw new Error(key + ': wrong rendered dimensions');
        }
        const a = rasterize(original), b = rasterize(overlay), v = rasterize(links);
        const allowed = new Uint8Array(1024 * 1024);
        const boxes = [...face.panels, ...face.arrows,
          ...face.panels.flatMap(panel => panel.attachedExtras || [])].map(item => item.bbox);
        for (const [left, top, right, bottom] of boxes) {
          for (let y = Math.max(0, top - 8); y < Math.min(1024, bottom + 8); y++) {
            allowed.fill(1, y * 1024 + Math.max(0, left - 8), y * 1024 + Math.min(1024, right + 8));
          }
        }
        let protectedDiff = 0, worstChannel = 0, vectorPixels = 0;
        for (let pixel = 0; pixel < allowed.length; pixel++) {
          const offset = pixel * 4;
          if (v[offset + 3] > 100) vectorPixels++;
          if (allowed[pixel]) continue;
          const diff = Math.max(Math.abs(a[offset] - b[offset]), Math.abs(a[offset + 1] - b[offset + 1]),
            Math.abs(a[offset + 2] - b[offset + 2]), Math.abs(a[offset + 3] - b[offset + 3]));
          if (diff > 1) protectedDiff++;
          worstChannel = Math.max(worstChannel, diff);
        }
        const componentInk = boxes.map(([left, top, right, bottom]) => {
          let ink = 0;
          for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
            if (v[(y * 1024 + x) * 4 + 3] > 100) ink++;
          }
          return ink;
        });
        rows.push({ key, protectedDiff, worstChannel, vectorPixels,
          components: boxes.length, minimumComponentInk: componentInk.length ? Math.min(...componentInk) : null });
      }
      return rows;
    }, { faces: inventory.faces, prefix });
    const missingInk = raster.filter(row => row.components && row.minimumComponentInk < 5);
    const protectedChanges = raster.filter(row => row.protectedDiff > 0);
    fs.writeFileSync(path.join(output, 'browser-raster-check.json'), JSON.stringify({ faces: raster.length, missingInk, protectedChanges, rows: raster }, null, 2) + '\n');
    assert.deepEqual(missingInk, [], 'Every panel/arrow/extra contains visible vector ink');
    assert.deepEqual(protectedChanges, [], 'Existing markings outside route edits remain pixel-identical');
    assert.deepEqual(errors, [], 'No page errors');
    assert.deepEqual(failedRequests, [], 'No failed image/file requests');
    const report = { status: 'passed', faces: inventory.faces.length, gallery,
      pureVectorsDecoded: raster.length, previewOverlaysDecoded: raster.length,
      existingOverlaysDecoded: raster.length, protectedPixelChanges: 0,
      search: 'passed', zoomAndClose: details, mobileOverflow,
      nativeSamples: { decoded: nativeReport.samples, cycles: nativeCycles,
        allFourDirectionsPerCycle: true, search: 'passed', zoomAndClose: 'passed', mobileOverflow: nativeMobileOverflow },
      glyphLibrary: { decoded: glyphDecoded.images, mobileOverflow: glyphMobileOverflow },
      pageErrors: errors, failedRequests, screenshots,
      network: 'Local files fulfilled by Playwright interception; no live application APIs.',
      installation: 'none' };
    fs.writeFileSync(path.join(output, 'browser-check.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
