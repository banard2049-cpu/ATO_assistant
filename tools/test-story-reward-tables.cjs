/* Real-browser regression for the Temenos victory/reward tables.
 * Run: node tools/test-story-reward-tables.cjs
 * Requires Playwright and Chrome (NODE_PATH / CHROME_PATH are supported).
 * The local story material pack is read as-is; no source text is copied into
 * this test. All HTTP requests are intercepted, and campaign writes exist only
 * in this process. Screenshots go to the gitignored tmp directory.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://story.test';
const ENTRY_KEY = 'c1-15-18';
const OUTPUT = path.join(ROOT, 'tmp', 'story-reward-tables');
const compact = value => String(value).replace(/\s+/gu, '');

function playwright() {
  try { return require('playwright'); } catch (error) {
    const bundled = path.join(os.homedir(), '.cache', 'codex-runtimes',
      'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright');
    if (!fs.existsSync(bundled)) throw error;
    return require(bundled);
  }
}

function expectations() {
  const context = { window: {} };
  for (const name of ['storybook-data.js', 'storybook-official-data.js']) {
    const filename = path.join(ROOT, 'story', 'data', name);
    assert.ok(fs.existsSync(filename), `Local story material pack required: ${filename}`);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  const find = name => context.window[name]?.books?.find(book => book.id === 'c1')
    ?.entries?.find(entry => entry.key === ENTRY_KEY);
  const fan = find('STORYBOOK_DATA');
  const official = find('STORYBOOK_OFFICIAL_DATA');
  assert.ok(fan && official, `Local story material pack must contain ${ENTRY_KEY} in both versions`);
  const blocks = fan.text.split(/\n{2,}/u).map(value => value.trim()).filter(Boolean);
  const pairs = (left, right, count) => {
    const start = blocks.findIndex((value, index) => value === left && blocks[index + 1] === right);
    assert.ok(start >= 0, `Missing fan table header ${left}/${right}`);
    return Array.from({ length: count }, (_, index) => blocks.slice(start + 2 + index * 2, start + 4 + index * 2));
  };
  const lines = official.officialText.split('\n');
  const pipeRows = (header, count) => {
    const start = lines.findIndex(line => line.startsWith(header) && line.includes('|'));
    assert.ok(start >= 0, `Missing official table header ${header}`);
    return lines.slice(start + 1, start + count + 1).map(line => line.split('|').map(cell => cell.trim()));
  };
  return {
    fan: { title: fan.title, victory: pairs('方框', '损伤', 3), rewards: pairs('损伤', '奖励', 6) },
    official: { title: official.officialTitle, victory: pipeRows('方框数量', 3), rewards: pipeRows('伤口数量', 6) },
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf',
};

async function isolatedContext(browser, version) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(value => {
    localStorage.setItem('ato-term-language-v1', value);
    localStorage.setItem('ato-second-screen-story-content-v1', 'text');
  }, version);
  const state = { story: null, revision: 0, posts: 0, unexpectedApi: [] };
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname.startsWith('/api/') && url.pathname.endsWith('.php')) {
      if (url.pathname !== '/api/campaign-state.php') {
        state.unexpectedApi.push(url.pathname);
        return route.fulfill({ status: 404, json: { ok: false, error: 'Not mocked' } });
      }
      const action = url.searchParams.get('action');
      if (action === 'second-screen-status') return route.fulfill({ json: { ok: true, enabled: true, displayMode: 'story' } });
      if (action === 'second-screen-mode') return route.fulfill({ json: { ok: true, displayMode: 'story' } });
      if (action === 'second-screen') return route.fulfill({ json: {
        ok: true, screen: { displayMode: 'story', story: state.story || {} },
      } });
      if (action) {
        state.unexpectedApi.push(action);
        return route.fulfill({ status: 404, json: { ok: false, error: 'Not mocked' } });
      }
      if (request.method() === 'POST') {
        const payload = request.postDataJSON();
        assert.equal(payload.section, 'story', 'Browser may write only the mocked story section');
        state.story = payload.state;
        state.posts += 1;
        state.revision += 1;
      }
      return route.fulfill({ json: {
        ok: true, user: { id: 'synthetic-story-browser-test' }, revision: state.revision, state: state.story,
        campaign: { sectionRevisions: { story: state.revision }, sections: {
          story: state.story,
          dashboard: { activeProfileId: 'test', profiles: { test: { activeCycleId: 'c1' } } },
        } },
      } });
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filename = path.resolve(ROOT, relative);
    const inside = path.relative(ROOT, filename);
    const contentType = MIME[path.extname(filename).toLowerCase()];
    if (inside.startsWith('..') || path.isAbsolute(inside) || !contentType
      || !/^(?:story|ss|assets|aibp|map|api)[/\\]/u.test(relative)
      || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      return route.fulfill({ status: 404, body: '' });
    }
    return route.fulfill({ path: filename, contentType });
  });
  return { context, state };
}

async function assertTables(page, rootSelector, version, expected, screenshotName) {
  const tableSelector = version === 'fan' ? '.battle-table' : '.story-table';
  const rowSelector = version === 'fan' ? 'tbody > tr' : ':scope > .story-table-row:not(:first-child):not(.story-table-sep-row)';
  const cellSelector = version === 'fan' ? 'td' : ':scope > .story-table-cell';
  const tables = page.locator(`${rootSelector} ${tableSelector}`);
  await tables.nth(1).waitFor();
  assert.equal(await tables.count(), 2, 'Both victory and reward tables must render');
  for (const [index, name] of ['victory', 'rewards'].entries()) {
    const rows = tables.nth(index).locator(rowSelector);
    assert.equal(await rows.count(), expected[name].length, `${name} row count`);
    for (let row = 0; row < expected[name].length; row += 1) {
      const rendered = await rows.nth(row).locator(cellSelector).allTextContents();
      assert.deepEqual(rendered.map(compact), expected[name][row].map(compact), `${name} row ${row + 1} preserves complete content`);
    }
  }
  const rewards = tables.nth(1).locator(rowSelector);
  for (const row of [rewards.first(), rewards.last()]) {
    await row.scrollIntoViewIfNeeded();
    assert.ok(await row.isVisible(), 'First and final reward tiers must be visible');
    const bounds = await row.boundingBox();
    assert.ok(bounds && bounds.width > 0 && bounds.height > 0, 'Reward tier has a visible layout box');
    const viewport = page.viewportSize();
    assert.ok(bounds.y < viewport.height && bounds.y + bounds.height > 0, 'Reward tier can be scrolled into the viewport');
  }
  await page.screenshot({ path: path.join(OUTPUT, screenshotName) });
  return { tables: await tables.count(), victoryRows: 3, rewardRows: 6 };
}

async function main() {
  const expected = expectations();
  fs.mkdirSync(OUTPUT, { recursive: true });
  const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  const executablePath = candidates.find(candidate => fs.existsSync(candidate));
  const browser = await playwright().chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    for (const version of ['fan', 'official']) {
      const { context, state } = await isolatedContext(browser, version);
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${ORIGIN}/story/index.html?book=c1&key=${ENTRY_KEY}`, { waitUntil: 'load' });
        await page.waitForFunction(title => document.querySelector('#entryTitle')?.textContent.includes(title), expected[version].title);
        const result = await assertTables(page, '#storyText', version, expected[version], `${version}-story.png`);
        assert.deepEqual(errors, [], 'Story page has no JavaScript errors');
        console.log(`PASS ${version} reader: ${JSON.stringify(result)}`);
        if (version === 'official') {
          await page.waitForFunction(() => !document.querySelector('#secondScreenStoryModeToggle')?.disabled);
          for (let attempt = 0; attempt < 40 && !state.story; attempt += 1) await page.waitForTimeout(100);
          assert.ok(state.story && state.posts > 0, 'Reader must publish a snapshot to the in-memory API');
          assert.equal(state.story.imagesOnly, false, 'Official second screen uses the text preference');
          assert.equal(state.story.entryKey, ENTRY_KEY);
          const second = await context.newPage();
          const secondErrors = [];
          second.on('pageerror', error => secondErrors.push(error.message));
          await second.goto(`${ORIGIN}/ss/index.html?token=synthetic-browser-test`, { waitUntil: 'load' });
          const secondResult = await assertTables(second, '#storyBody', version, expected[version], 'official-second-screen.png');
          assert.deepEqual(secondErrors, [], 'Second screen has no JavaScript errors');
          console.log(`PASS official second screen: ${JSON.stringify(secondResult)}`);
        }
        for (const fixture of [
          { book: 'c1', key: 'c1-15-45', rows: [5, 4], battle: true },
          { book: 'c1', key: 'c1-10-3', rows: [10] },
          { book: 'c3', key: 'c3-10-1', rows: [10] },
        ]) {
          await page.goto(`${ORIGIN}/story/index.html?book=${fixture.book}&key=${fixture.key}`, { waitUntil: 'load' });
          const native = version === 'fan' && fixture.battle;
          const tables = page.locator(`#storyText ${native ? '.battle-table' : '.story-table'}`);
          await tables.first().waitFor();
          assert.equal(await tables.count(), fixture.rows.length, `${fixture.key} table count`);
          for (let index = 0; index < fixture.rows.length; index += 1) {
            const rows = tables.nth(index).locator(native ? 'tbody > tr'
              : ':scope > .story-table-row:not(:first-child):not(.story-table-sep-row)');
            assert.equal(await rows.count(), fixture.rows[index], `${fixture.key} complete row count`);
            for (const row of [rows.first(), rows.last()]) {
              await row.scrollIntoViewIfNeeded();
              assert.ok(await row.isVisible(), `${fixture.key} first/final row visible`);
            }
          }
          assert.deepEqual(errors, [], `${fixture.key} has no JavaScript errors`);
          console.log(`PASS ${version} ${fixture.key}: ${fixture.rows.join('+')} data rows`);
        }
        assert.deepEqual(state.unexpectedApi, [], 'All API accesses stay within the synthetic campaign mock');
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`Screenshots: ${OUTPUT}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
