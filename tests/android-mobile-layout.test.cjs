const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = fs.readFileSync('tools/packaging/android/app/src/main/java/com/ato/assistant/MobileLayoutEnvironment.java', 'utf8');
const backScript = policy.match(/BACK_SCRIPT = "([^"]+)";/)[1];
const activity = fs.readFileSync('tools/packaging/android/app/src/main/java/com/ato/assistant/MainActivity.java', 'utf8');

test('Android back consumes only an explicitly handled mobile sheet', () => {
  let calls = 0;
  assert.equal(vm.runInNewContext(backScript, {window:{ATO_MOBILE_LAYOUT:{back(){calls++;return true;}}}}), true);
  assert.equal(calls, 1);
  for (const value of [false, undefined, null, 0, 'true', Promise.resolve(true)]) {
    assert.equal(vm.runInNewContext(backScript, {window:{ATO_MOBILE_LAYOUT:{back:()=>value}}}), false);
  }
});

test('missing mobile runtime and failing handlers preserve the native back path', () => {
  assert.equal(vm.runInNewContext(backScript, {window:{}}), false);
  assert.equal(vm.runInNewContext(backScript, {window:{ATO_MOBILE_LAYOUT:{back:()=>{throw Error('closed');}}}}), false);
});

test('APK geometry uses stable system insets and publishes only its native bridge contract', () => {
  const update = activity.match(/private void updateMobileLayoutEnvironment\(\) \{[^]*?\n  \}/)[0];
  assert.match(update, /getCurrentWindowMetrics\(\)/);
  assert.match(update, /getInsetsIgnoringVisibility\(/);
  assert.doesNotMatch(update, /Type\.ime\(|getHeight\(\)|getWindowVisibleDisplayFrame/);
  assert.match(activity, /@android\.webkit\.JavascriptInterface public String mobileLayoutEnvironment\(\)/);
  assert.match(activity, /onConfigurationChanged\(Configuration configuration\)/);
  assert.match(activity, /view\.evaluateJavascript\(MobileLayoutEnvironment\.eventScript\(mobileLayoutEnvironment\)/);
  assert.match(activity, /!resolved\.compareAndSet\(false, true\)/);
  assert.match(activity, /rootView\.postDelayed/);
});
