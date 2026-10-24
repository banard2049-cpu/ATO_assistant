/* Isolated browser QA: local assets only, no campaign state or server writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/c5-map-covers');
function playwright() {
  try { return require('playwright'); } catch (_) {
    return require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  }
}
const app = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8').replace(/\r\n/g, '\n');
const extract = name => app.match(new RegExp('^function ' + name + '\\([^]*?^}', 'm'))[0];
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/map/styles.css">
<style>body{margin:0;padding:24px;background:#101820;color:#edf3f4;font:16px sans-serif}h1{margin:0 0 8px;font-size:22px}p{margin:0 0 20px;color:#a9bcc8}.sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.caption{padding:8px 0}.sample .tile-card{position:relative;left:auto;top:auto;width:100%;border:0;border-radius:0}.tile-image{position:relative}</style>
<h1>C5 蓝黑牌背与派系蒙版</h1><p>牌背：编号与派系上方居中 · 揭示面保留上浮／下潜标记</p><div class="sheet" id="sheet"></div>
${['map-data.js','tile-artwork-data.js','tile-back-data.js','c5-heading-data.js','tile-artwork.js','map-tile-tags.js'].map(f => `<script src="/map/${f}"></script>`).join('')}
<script>
window.state={activeCycleId:'c5'}; window.cs={tileVariants:{}};
window.mapTagData=window.ATO_MAP_TILE_TAGS;window.c1AlternateTileAssets={};
window.factionLabelsByCycle={c5:{followersOfArete:'Followers of Areté',cycladeanProtectorate:'Cycladean Protectorate',outcastVanguard:'Outcast Vanguard'}};
function activeCycleState(){return window.cs;}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
${['tileFaceId','tileTagEntry','tileAssets','renderVariantToggle'].map(extract).join('\n')}
const cycle=window.ATO_MAP_DATA.cycles.find(c=>c.id==='c5');
const samples=[['080',false,true],['008',false,true],['008',true,true],['080',false,false],['008',false,false],['008',true,false],['040',false,false],['001',false,false],['004',false,false]];
function render(){document.getElementById('sheet').innerHTML=samples.map(([id,alt,covered],i)=>{
 const tile=cycle.tiles.find(t=>t.id===id);const saved={tileVariants:alt?{[id]:'alternate'}:{}};
 const source=tileAssets(tile,saved).front;
 return '<section class="sample" data-sample="'+i+'"><div class="caption">'+id+' · '+(alt?'B 水上':'A 水下')+' · '+(covered?'牌背':'正面')+'</div><article class="tile-card"><div class="tile-image">'+(covered?ATO_MAP_ARTWORK.coverMarkup(source,id):ATO_MAP_ARTWORK.markup(source,id))+'</div>'+(covered?'':renderVariantToggle(tile,saved))+'</article></section>';
}).join('');}
render();ATO_MAP_ARTWORK.bind(document.getElementById('sheet'));
document.getElementById('sheet').addEventListener('click',e=>{const b=e.target.closest('[data-variant-tile]');if(b){const i=+b.closest('[data-sample]').dataset.sample;samples[i][1]=!samples[i][1];render();}});
</script>`;

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await playwright().chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1260, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/map/preview.html') return route.fulfill({ contentType: 'text/html', body: html });
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
      const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript' };
      return route.fulfill({ contentType: types[path.extname(file)] || 'text/plain', body: fs.readFileSync(file) });
    });
    await page.goto('http://c5.test/map/preview.html', { waitUntil: 'networkidle' });
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('.tile-c5-cover').count(), 3);
    assert.equal(await page.locator('.tile-c5-cover .tile-artwork-base').count(), 0);
    assert.equal(await page.locator('.tile-c5-heading').count(), 3);
    assert.equal(await page.locator('.tile-c5-cover img').count(), 3);
    await page.screenshot({ path: path.join(output, 'preview.png'), fullPage: true });
    await page.screenshot({ path: path.join(output, 'covers.png'), clip: { x: 0, y: 0, width: 1260, height: 548 } });
    const button = page.locator('[data-sample="4"] .c5-face-toggle');
    assert.match(await button.locator('img').getAttribute('src'), /c5-face-b\.png/);
    await button.click();
    assert.match(await button.locator('img').getAttribute('src'), /c5-face-a\.png/);
    assert.match(await button.getAttribute('aria-label'), /当前 B 面.*下潜/);
    await button.click();
    assert.match(await button.locator('img').getAttribute('src'), /c5-face-b\.png/);
    const placement = await page.locator('[data-sample="0"] .tile-c5-cover-heading').evaluate(el => {
      const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();
      return { center:(a.x+a.width/2-b.x)/b.width,top:(a.y-b.y)/b.height };
    });
    assert.ok(Math.abs(placement.center-.5)<.002);
    assert.ok(Math.abs(placement.top-.056)<.002);
    await page.setViewportSize({ width: 600, height: 1000 });
    await page.screenshot({ path: path.join(output, 'preview-small.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      const sheet = document.getElementById('sheet');
      sheet.style.gridTemplateColumns = 'repeat(8,1fr)';
      sheet.style.gap = '8px';
      sheet.innerHTML = Object.keys(ATO_C5_HEADING_DATA).sort().map(key =>
        '<div style="height:68px">'+ATO_MAP_ARTWORK.headingMarkup('./images/'+key+'.png', key, 'audit')+'</div>').join('');
    });
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.tile-c5-heading').count(), 160);
    await page.screenshot({ path: path.join(output, 'all-160-headings.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ cards: 9, faceToggle: 'A→B→A', coverPlacement: placement, screenshots: output, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
