const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('tools/packaging/android/fetch-bridge.js', 'utf8');
function setup(open) {
  let listener; const navigations = [];
  const location = {href:'file:///android_asset/web/index.html?cycle=c1'};
  const window = { location, fetch: async()=>{}, ATOAndroid:{request(){}, openModuleTab: open} };
  const context = {window, document:{addEventListener(type, fn){ if(type==='click') listener=fn; }}, URL, Request, Response};
  vm.runInNewContext(source, context);
  function click(href) {
    const event = {button:0, target:{closest:()=>({href, hasAttribute:()=>false})}, preventDefault(){this.prevented=true}, stopImmediatePropagation(){this.stopped=true}};
    listener(event); return event;
  }
  return {window,click};
}
test('module links open native tabs with cycle parameters intact', () => {
  let opened; const h=setup(url => {opened=url; return true});
  const event=h.click('file:///android_asset/web/story/index.html?cycle=c2&book=c2');
  assert.equal(opened,'file:///android_asset/web/story/index.html?cycle=c2&book=c2');
  assert.equal(event.prevented,true); assert.equal(h.window.location.href,'file:///android_asset/web/index.html?cycle=c1');
});
test('other local links and old bridges continue in current page', () => {
  const h=setup(undefined); h.click('file:///android_asset/web/story/index.html');
  assert.equal(h.window.location.href,'file:///android_asset/web/story/index.html');
  h.click('file:///android_asset/web/tools/tag-editor.html');
  assert.equal(h.window.location.href,'file:///android_asset/web/tools/tag-editor.html');
});

test('dashboard links switch to the dashboard tab instead of replacing a module', () => {
  let opened; const h=setup(url => {opened=url; return true});
  h.window.location.href='file:///android_asset/web/story/index.html?cycle=c2';
  h.click('file:///android_asset/web/index.html');
  assert.equal(opened,'file:///android_asset/web/index.html');
  assert.equal(h.window.location.href,'file:///android_asset/web/story/index.html?cycle=c2');
});

test('all ordinary module return links hand off to the native dashboard tab', () => {
  const cases = [
    ['record/index.html', /class="back-to-console" href="\.\.\/index\.html"/],
    ['hero/index.html', /class="back-to-console" href="\.\.\/index\.html"/],
    ['story/index.html', /class="home-link" href="\.\.\/index\.html"/],
    ['aibp/index.html', /class="return-main-link" href="\.\.\/index\.html"/],
    ['map/index.html', /class="return-without-save" href="\.\.\/index\.html"/],
    ['briefing/index.html', /id="backLink" class="back-link" href="\.\.\/"/],
  ];
  for (const [file, pattern] of cases) {
    assert.match(fs.readFileSync(file, 'utf8'), pattern, `${file} should provide a dashboard link`);
    let target;
    const h = setup(url => { target = url; return true; });
    h.window.location.href = `file:///android_asset/web/${file}`;
    const url = file.startsWith('briefing/') ? 'file:///android_asset/web/' : 'file:///android_asset/web/index.html';
    h.click(url);
    assert.equal(target, url, `${file} return must switch through native tabs`);
    assert.equal(h.window.location.href, `file:///android_asset/web/${file}`);
  }
});

test('Android matrix source opens the exact story entry without replacing the record sheet', () => {
  const record = fs.readFileSync('record/index.html', 'utf8').replace(/\r\n/g, '\n');
  const match = record.match(/^    function jumpToMatrixSource\(notes\) \{[^]*?^    }/m);
  assert.ok(match);
  let opened;
  const location = { href: 'file:///android_asset/web/record/index.html?cycle=c2', protocol: 'file:' };
  const win = { location, ATOAndroid: {openModuleTab(url) { opened = url; return true; }} };
  win.parent = win;
  const context = vm.createContext({ window: win, URL, URLSearchParams,
    allMatrixSourceTargets: () => [{bookId:'c4', chapterHint:'battle', entryId:'123'}] });
  vm.runInContext(match[0], context);
  context.jumpToMatrixSource('note');
  assert.equal(opened, 'file:///android_asset/web/story/index.html?book=c4&chapter=battle&entry=123');
  assert.equal(location.href, 'file:///android_asset/web/record/index.html?cycle=c2');
});
