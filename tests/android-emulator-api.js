// Executed by tools/test_android_emulator.py in an installed debug WebView.
(async () => {
  const results = [];
  let checks = 0;
  const check = (condition, message) => { checks++; if (!condition) throw new Error(message); };
  const root = 'file:///android_asset/web/';
  const call = (query = '', method = 'GET', body = '', status = 200, path = 'api/campaign-state.php') => {
    const response = JSON.parse(ATOAndroid.request(root + path + query, method,
      typeof body === 'string' ? body : JSON.stringify(body)));
    const data = JSON.parse(response.body);
    check(response.status === status, method + ' ' + path + query + ': ' + response.status + ' ' + response.body);
    return data;
  };
  const test = async (name, operation) => {
    try { await operation(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.stack }); }
  };
  const account = 'emutest-' + Date.now();
  const profile = 'ship::one';
  const dashboard = (day) => ({ activeProfileId: profile, profiles: { [profile]: {
    id: profile, name: '模拟器测试船', activeCycleId: 'c1', cycles: {
      c1: { state: { day, notes: '测试 ' + day, mapSnapshot: { exploredIds: ['T00'],
        currentTileId: 'T00', savedAt: new Date().toISOString() },
        unlockedTech: { unlockedKeys: ['Test Tech'] }, cardTracksVersion: 2,
        cardTracks: { story: { position: '1A', progress: 2 } } } },
      c2: { state: { day: '0' } } } } } });
  const saveDay = (day) => call('?section=dashboard', 'POST', { state: dashboard(day) });
  const campaign = () => call().campaign;
  const source = (query = '') => call(query, 'GET', '', 200, 'briefing/api.php');
  let attachment;
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=';

  await test('未登录保护与本地登录', () => {
    call('?action=logout', 'POST');
    call('', 'GET', '', 401);
    call('', 'GET', '', 401, 'briefing/api.php');
    check(call('?action=login', 'POST', { username: account }).user.id === account, 'login account');
    check(call('?action=me').authenticated, 'authenticated session');
  });
  await test('空存档不伪造每日备份', () => {
    check(source().snapshots.length === 0, 'fabricated history');
    call('', 'POST', '{}', 405, 'briefing/api.php');
  });
  await test('七模块批量导入与读取', () => {
    const sections = { dashboard: dashboard('T6/00'), map: { users: { [profile]: { cycles: { c1: { explored: ['T00'] } } } } },
      record: { users: { [profile]: { notes: '测试笔记' } } }, technology: { users: { [profile]: {} } },
      heroes: { users: { [profile]: { heroes: [{ argonaut: '赫拉克勒斯' }] } } }, aibp: null,
      story: { users: { [profile]: { section: '1', title: '测试序章' } } } };
    const imported = call('?action=import-sections', 'POST', { sections,
      expectedAccountId: account, expectedRevisions: Object.fromEntries(Object.keys(sections).map((key) => [key, 0])) });
    check(Object.keys(imported.sections).length === 7, 'missing import revision');
    const saved = campaign();
    for (const key of Object.keys(sections)) {
      check(JSON.stringify(saved.sections[key]) === JSON.stringify(sections[key]), 'section changed: ' + key);
      check(saved.sectionRevisions[key] === 1, 'wrong revision: ' + key);
    }
  });
  await test('序章子日与逐日备份', () => {
    saveDay('2');
    call('?section=heroes', 'POST', { userId: profile, state: { heroes: [{ argonaut: '赫拉克勒斯' }], marker: 'day2-latest' } });
    saveDay('4');
    const briefing = source();
    check(briefing.source === 'android-daily-backups', 'wrong backup source');
    check(briefing.snapshots.length === 2, 'wrong backup count');
    check(JSON.stringify(briefing).includes('T6/00'), 'lost encoded prologue day');
    check(JSON.stringify(briefing).includes('day2-latest'), 'latest day state missing');
    check(source('?profile=' + encodeURIComponent(profile) + '&cycle=c2').snapshots.length === 0, 'cross-cycle history');
    const before = JSON.stringify(campaign()); source();
    check(JSON.stringify(campaign()) === before, 'briefing mutated saves');
  });
  await test('冲突导入与非法输入不会覆盖存档', () => {
    const before = JSON.stringify(campaign());
    check(call('?action=import-sections', 'POST', { sections: { map: {} }, expectedRevisions: { map: 0 } }, 409).code === 'SAVE_CONFLICT', 'conflict code');
    check(call('?action=import-sections', 'POST', { sections: { map: {} }, expectedAccountId: 'another' }, 409).code === 'ACCOUNT_MISMATCH', 'account mismatch');
    call('?action=import-sections', 'POST', { sections: { map: {}, unknown: {} } }, 400);
    call('?action=import-sections', 'POST', 'invalid-json', 400);
    check(JSON.stringify(campaign()) === before, 'rejected import altered saves');
  });
  await test('恢复前一天与缺失备份', () => {
    const before = campaign();
    const body = { profileId: profile, cycleId: 'c1', currentDay: '4', day: '3',
      expectedAccountId: account, expectedRevision: before.sectionRevisions.dashboard };
    check(call('?action=restore-previous-day', 'POST', body, 404).code === 'BACKUP_NOT_FOUND', 'missing backup');
    const restored = call('?action=restore-previous-day', 'POST', { ...body, day: '2' }).campaign;
    check(restored.sections.dashboard.profiles[profile].cycles.c1.state.day === '2', 'restored wrong day');
    check(restored.sections.heroes.users[profile].marker === 'day2-latest', 'lost same-day updates');
    for (const key of Object.keys(before.sectionRevisions)) check(restored.sectionRevisions[key] > before.sectionRevisions[key], 'revision went backwards');
    call('?action=restore-previous-day', 'POST', { ...body, day: '2' }, 409);
  });
  await test('图片附件真实解码、去重、读取与非法图片', async () => {
    const body = { expectedAccountId: account, dataUrl: png };
    attachment = call('?action=record-attachment', 'POST', body).attachment;
    check(attachment.width === 1 && attachment.height === 1, 'actual bitmap decoding');
    check(call('?action=record-attachment', 'POST', body).attachment.blobId === attachment.blobId, 'deduplication');
    check(call('?action=record-attachment&id=' + attachment.blobId + '&expectedAccountId=' + account).dataUrl === png, 'attachment round trip');
    call('?action=record-attachment', 'POST', { ...body, dataUrl: 'data:image/png;base64,bm90LWltYWdl' }, 400);
    call('?action=record-attachment', 'POST', { ...body, expectedAccountId: 'other' }, 409);
    const image = new Image(); image.src = png; await image.decode();
    check(image.naturalWidth === 1, 'WebView image decoding');
  });
  await test('多账号数据隔离与返回原账号', () => {
    const before = JSON.stringify(campaign());
    call('?action=login', 'POST', { username: account + '-b' });
    check(source().snapshots.length === 0, 'another account read backups');
    call('?action=record-attachment&id=' + attachment.blobId + '&expectedAccountId=' + account + '-b', 'GET', '', 404);
    call('?action=login', 'POST', { username: account });
    check(JSON.stringify(campaign()) === before, 'switching accounts changed state');
  });
  await test('真实 fetch 桥接、Request 请求体和本地 JSON', async () => {
    const response = await fetch(new Request(root + 'api/campaign-state.php?section=record', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile, state: { notes: 'fetch-request-body' } }) }));
    check(response.ok && (await response.json()).ok, 'Request body bridge');
    check(campaign().sections.record.users[profile].notes === 'fetch-request-body', 'Request body lost');
    const briefing = await fetch(root + 'briefing/api.php'); check(briefing.ok, 'briefing fetch');
    check((await briefing.json()).source === 'android-daily-backups', 'briefing bridge source');
    const missing = await fetch(root + 'missing-fixture.json'); check(missing.status === 404, 'missing local JSON');
    check(ATOAndroid.readBundledJson('../secret.json') === '', 'unsafe bundled JSON');
    for (const path of ['../secret.png', '/data/private.png', 'assets/code.svg', 'assets/missing.png']) {
      check(ATOAndroid.readExportImageData(path) === '', 'unsafe/missing export image: ' + path);
    }
  });
  await test('安卓第二屏服务、模式和主题设置', () => {
    const settings = call('?action=second-screen-status', 'POST', { enabled: true,
      displayScales: { map: 120, battleBoard: 80 }, theme: { mode: 'custom', rgb: [200, 30, 30] } });
    check(settings.enabled && settings.lanSharedAccount, 'LAN server did not start');
    check(settings.theme.rgb[0] === 200 && settings.displayScales.map === 120, 'settings round trip');
    const screen = call('?action=second-screen').screen;
    check(screen.profileName === '模拟器测试船' && screen.day === '2', 'second screen profile/day');
    check(call('?action=second-screen-mode', 'POST', { mode: 'story' }).displayMode === 'story', 'story screen mode');
    call('?action=second-screen-status', 'POST', { enabled: false });
    call('?action=second-screen', 'GET', '', 404);
  });
  window.ATO_EMULATOR_TEST = { account, profile, attachment, campaign: campaign(), results, checks };
  return window.ATO_EMULATOR_TEST;
})()
