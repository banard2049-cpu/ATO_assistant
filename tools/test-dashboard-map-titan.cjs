// Synthetic saves only; requires Playwright on NODE_PATH and installed Chrome.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.ATO_TEST_BROWSER || 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const campaign = { sections: {
      dashboard: { activeProfileId: 'chosen', profiles: { chosen: { id: 'chosen', name: '测试档案', activeCycleId: 'c1',
        cycles: { c1: { state: { day: 4, notes: '' } } } } } },
      record: { users: { chosen: { cycle: 'c1', fate: '2', titans: [], titanLimit: '10' } } },
      technology: { users: { chosen: { unlocked: ['titan hunting'], unimportant: ['titan hunting'] } } },
      map: { users: { chosen: { activeCycleId: 'c1', hideUnknown: true, cycles: { c1: {
        currentTile: '001', explored: { '001': true }, tokens: { AG: '001', markers: {} },
      } } } } },
    }, sectionRevisions: { dashboard: 0, map: 0, record: 0, technology: 0, heroes: 0 } };
    const errors = [], writes = [];
    await context.route('http://titan.test/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, user: { id: 'alice', username: '测试账号' }, ...body }) });
      if (url.pathname === '/api/campaign-state.php') {
        if (request.method() === 'POST') {
          const payload = request.postDataJSON(); writes.push(copy(payload));
          const expected = payload.expectedRevisions || { [payload.section]: payload.expectedRevision };
          if (Object.entries(expected).some(([name, revision]) => campaign.sectionRevisions[name] !== revision)) {
            return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'SAVE_CONFLICT', revision: campaign.sectionRevisions[payload.section] }) });
          }
          const sections = {};
          for (const [name, state] of Object.entries(payload.sections || { [payload.section]: payload.state })) {
            if (payload.userId && name !== 'dashboard') {
              campaign.sections[name] ||= { users: {} };
              campaign.sections[name].users[payload.userId] = copy(state);
            } else campaign.sections[name] = copy(state);
            sections[name] = ++campaign.sectionRevisions[name];
          }
          return json({ sections, revision: campaign.sectionRevisions[payload.section] });
        }
        if (url.searchParams.get('action') === 'me') return json({ authenticated: true });
        if (url.searchParams.get('action') === 'second-screen-status') return json({ screen: { enabled: false } });
        if (url.searchParams.has('section')) {
          const section = url.searchParams.get('section');
          return json({ state: campaign.sections[section] || {}, exists: true, revision: campaign.sectionRevisions[section] || 0 });
        }
        return json({ campaign });
      }
      if (url.pathname.endsWith('.php')) return json({});
      const local = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!local.startsWith(root + path.sep) || !fs.existsSync(local) || !fs.statSync(local).isFile()) return route.fulfill({ status: 404, body: '' });
      const type = ({ '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' })[path.extname(local)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(local) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto('http://titan.test/map/index.html?cycle=c1');
    await page.waitForFunction(() => document.querySelector('#campaignSaveStatus').dataset.state === 'saved');
    await page.locator('#currentTileSelect').selectOption('002');
    assert.equal(await page.locator('[data-titan-tile]').count(), 0, 'map module has no new capture interaction');
    assert.equal(campaign.sections.record.users.chosen.titans.length, 0, 'map module does not mutate Titans');
    await page.locator('#headerSaveReturnButton').click();
    await page.waitForURL('**/index.html');
    const reminder = page.locator('.map-titan-reminder');
    await reminder.getByRole('status').filter({ hasText: '已自动写入记录表' }).waitFor();
    assert.equal(campaign.sections.record.users.chosen.titans[0].count, 1);
    assert.equal(campaign.sections.record.users.chosen.fate, '2');
    const flowStep = reminder.locator('xpath=ancestor::*[contains(@class,"flow-step")][1]');
    assert.match(await flowStep.innerText(), /移动/);
    assert.match(await reminder.innerText(), /「泰坦捕获」.*外交检定（7\+）/s);
    const output = path.join(root, 'tmp', 'dashboard-map-titan'); fs.mkdirSync(output, { recursive: true });
    await reminder.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    const successBounds = await reminder.getByRole('button', { name: '额外捕获：检定成功', exact: true }).boundingBox();
    const failureBounds = await reminder.getByRole('button', { name: '额外捕获：检定失败', exact: true }).boundingBox();
    assert.equal(successBounds.x, failureBounds.x, 'capture buttons align vertically on the right');
    assert.ok(failureBounds.y >= successBounds.y + successBounds.height);
    assert.ok(Number(await reminder.getByRole('status').evaluate(node => getComputedStyle(node).fontWeight)) >= 700);
    await page.setViewportSize({ width: 390, height: 844 });
    await reminder.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'mobile-actions.png') });
    const mobileButtons = await reminder.getByRole('button').evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y, right: node.getBoundingClientRect().right })));
    assert.equal(mobileButtons[0].x, mobileButtons[1].x);
    assert.ok(mobileButtons[1].y > mobileButtons[0].y && mobileButtons.every(bounds => bounds.right <= 390));
    await page.setViewportSize({ width: 1280, height: 1000 });
    await reminder.getByRole('button', { name: '额外捕获：检定成功', exact: true }).click();
    await reminder.getByText(/本日额外捕获已处理/).waitFor();
    assert.equal(campaign.sections.record.users.chosen.titans[0].count, 2);
    assert.equal(campaign.sections.record.users.chosen.fate, '3');
    await page.reload();
    await reminder.getByText(/本日额外捕获已处理/).waitFor();
    assert.equal(campaign.sections.record.users.chosen.titans[0].count, 2, 'reload cannot award the base Titan again');
    assert.equal(campaign.sections.record.users.chosen.fate, '3');
    await page.setViewportSize({ width: 390, height: 844 });
    await reminder.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    const bounds = await reminder.boundingBox(); assert.ok(bounds.width <= 390 && bounds.x >= 0);
    campaign.sections.dashboard.profiles.chosen.cycles.c1.state.day = 5;
    campaign.sectionRevisions.dashboard++;
    await page.reload();
    await reminder.getByRole('button', { name: '额外捕获：检定失败', exact: true }).click();
    await reminder.getByText(/本日额外捕获已处理.*失败/).waitFor();
    assert.equal(campaign.sections.record.users.chosen.titans[0].count, 2, 'failed checks cannot grant a Titan');
    assert.equal(campaign.sections.record.users.chosen.fate, '4', 'failed checks still pay one fate');
    campaign.sections.technology.users.chosen.unlocked = [];
    campaign.sectionRevisions.technology++;
    await page.reload();
    await reminder.getByRole('status').filter({ hasText: '首次探索奖励已领取' }).waitFor();
    assert.equal(await reminder.getByRole('button').count(), 0, 'locked technology cannot expose extra capture controls');
    assert.deepEqual(errors, []);
    assert.equal(writes.filter(write => write.sections?.record).length, 3);
    console.log('PASS: map Save and Return -> inline movement reminder -> automatic dreamwalker -> technology extra capture -> reload without duplicate -> mobile layout.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
