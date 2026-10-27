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
