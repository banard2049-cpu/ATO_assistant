/* 第二屏 token 接线回归测试（run: node tests/ss-second-screen-token.test.cjs）。
 *
 * ?action=second-screen 在登录校验之前返回账号存档内容，服务端现在只认开启第二屏时
 * 生成的那个随机 token（query 参数，Cookie 仅作为 ss 内嵌地图页的兜底）。两侧的契约
 * 必须同时成立，否则第二屏会整块失效：
 *   - api/campaign-state.php 生成的网址里带 ?token=<48 位十六进制>，读取时才核对；
 *   - ss/app.js 从自己的网址（query 或 #hash）取出同一个参数名，附到每次接口请求上，
 *     并把 token 写进同源 Cookie。
 * 这里跑的是 ss/app.js 里的真实源码片段。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const SS_SOURCE = fs.readFileSync(path.join(ROOT, 'ss', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const PHP_SOURCE = fs.readFileSync(path.join(ROOT, 'api', 'campaign-state.php'), 'utf8').replace(/\r\n/g, '\n');

function ssTokenScope(search, hash) {
  const match = SS_SOURCE.match(/function secondScreenTokenFromLocation\(\)[^]*?const endpoint = [^;]+;/);
  assert.ok(match, '找不到 ss/app.js 里的第二屏 token 片段');
  const document = { cookie: '' };
  const scope = vm.createContext({ document, URLSearchParams, window: { location: { search, hash } } });
  vm.runInContext(match[0], scope);
  // const 声明留在脚本作用域里，不挂在 context 对象上，所以在同一个 context 里取。
  const values = JSON.parse(vm.runInContext('JSON.stringify({token: secondScreenToken, endpoint})', scope));
  return { token: values.token, endpoint: values.endpoint, cookie: document.cookie };
}

test('ss/app.js 从 query 里取 token 并附到接口请求上', () => {
  const page = ssTokenScope('?token=abcdef0123456789', '');
  assert.equal(page.token, 'abcdef0123456789');
  assert.equal(page.endpoint, '../api/campaign-state.php?action=second-screen&token=abcdef0123456789');
  assert.match(page.cookie, /^ato_second_screen_token=abcdef0123456789; path=\//);
});

test('ss/app.js 也接受 #hash 里的 token，并转义后附上', () => {
  const page = ssTokenScope('', '#token=a%2Bb%20c');
  assert.equal(page.token, 'a+b c');
  assert.match(page.endpoint, /&token=a%2Bb%20c$/);
  assert.match(page.cookie, /ato_second_screen_token=a%2Bb%20c;/);
});

test('没有 token 的旧网址仍然照旧请求裸接口（Android 侧不带 token）', () => {
  for (const [search, hash] of [['', ''], ['?second=1', ''], ['?token=', '#token=']]) {
    const page = ssTokenScope(search, hash);
    assert.equal(page.token, '');
    assert.equal(page.endpoint, '../api/campaign-state.php?action=second-screen');
    assert.equal(page.cookie, '', '没有 token 时不能写 Cookie');
  }
});

test('服务端生成的网址带 token，读取时按 hash_equals 核对同一个参数名', () => {
  assert.match(PHP_SOURCE, /function second_screen_urls\(string \$token\): array/);
  assert.match(PHP_SOURCE, /\$path = second_screen_path\(\) \. \(\$token !== '' \? '\?token=' \. rawurlencode\(\$token\) : ''\);/);
  assert.match(PHP_SOURCE, /second_screen_urls\(\$userToken\)/);
  assert.match(PHP_SOURCE, /hash_equals\(\$expected, \$provided\)/);
  // 读取侧认的参数名必须和生成侧写进网址的那个一致。
  const queryParameter = PHP_SOURCE.match(/\$_GET\['([A-Za-z_]+)'\]/g) || [];
  assert.ok(queryParameter.includes("$_GET['token']"), '读取侧必须从 query 取 token');
  const cookieName = PHP_SOURCE.match(/\$_COOKIE\['([A-Za-z_]+)'\]/);
  assert.ok(cookieName, 'Cookie 兜底的名字必须写死在服务端');
  assert.match(SS_SOURCE, new RegExp(`document\\.cookie = \`${cookieName[1]}=`), '两侧的 Cookie 名必须一致');
});

test('第二屏分支在返回内容之前就核对 token', () => {
  const branch = PHP_SOURCE.slice(PHP_SOURCE.indexOf("if ($action === 'second-screen' && $method === 'GET')"));
  const guard = branch.indexOf('second_screen_token_matches');
  const payload = branch.indexOf('public_second_screen_payload');
  assert.ok(guard > 0 && payload > guard, 'token 核对必须排在返回存档内容之前');
  assert.match(branch.slice(guard, payload), /respond\(403/);
});
