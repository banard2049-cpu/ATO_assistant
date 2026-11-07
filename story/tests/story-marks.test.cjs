/* 段首 (拇指)/(圈) 标记的图标化（story/assets/story-marks.js）。
 *
 * 设计前提：源文本里的 "(拇指) " / "(圈) " 一个字都不删——混排映射的 textLength、
 * textFingerprint 和每张图的字符偏移都是按带标记的原文算的。图标只在显示层替换，
 * 并且必须发生在混排渲染器 mount 之后（prepareHTML 要先按原文核对字符数）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { harness } = require('./helpers/mixed-media-dom.cjs');
const marks = require('../assets/story-marks.js');

const root = path.resolve(__dirname, '../..');
const appSource = fs.readFileSync(path.join(root, 'story/assets/app.js'), 'utf8');
const ssSource = fs.readFileSync(path.join(root, 'ss/app.js'), 'utf8');

function run(html) {
  const h = harness();
  h.container.innerHTML = html;
  const count = marks.decorate(h.container);
  return { count, html: h.container.innerHTML, text: h.container.textContent, container: h.container };
}

test('段首的 (拇指) 换成拇指图标，正文原样保留', () => {
  const out = run('<div class="battle-block">(拇指) 这不是石碑的一部分，而是一组如何解释百手巨人的说明。</div>');
  assert.equal(out.count, 1);
  assert.match(out.html, /class="ato-story-mark ato-story-mark-thumb"/);
  // 拇指指向 mixed-media/images/c5 下的真实 PNG 文件，不再内嵌 base64 / SVG。
  assert.match(out.html, /<img class="ato-mark-bitmap"[^>]*src="[^"]*mixed-media\/images\/c5\/mark-thumb-c5\.png"/);
  assert.equal(out.text, '这不是石碑的一部分，而是一组如何解释百手巨人的说明。');
  assert.equal(/拇指/.test(out.text), false);
});

test('全角括号的 （圈） 换成星芒图标', () => {
  const out = run('<div>(圈) 这里的海滩因数百万只成群的食腐蟹而闪耀着深红色。</div>');
  assert.equal(out.count, 1);
  assert.match(out.html, /ato-story-mark-circle/);
  // 圈也是同一目录下的 PNG 文件（C5 第 42 页那枚星芒盘），不是参数化 SVG。
  assert.match(out.html, /<img class="ato-mark-bitmap"[^>]*src="[^"]*mixed-media\/images\/c5\/mark-circle-c5\.png"/);
  assert.equal(out.text.startsWith('这里的海滩'), true);
});

test('段中间出现标记不算段首，不动', () => {
  const out = run('<div>前一句。(拇指) 后一句。</div>');
  assert.equal(out.count, 0);
  assert.match(out.text, /\(拇指\)/);
});

test('同一段里第二处标记也不处理（只有段首那一处是排版标记）', () => {
  const out = run('<div><span>(拇指) 开头</span> 中间 (拇指) 结尾</div>');
  assert.equal(out.count, 1);
  assert.equal(out.text, '开头 中间 (拇指) 结尾');
});

test('其它括号词（如英文原名）不受影响', () => {
  const out = run('<div>(Centimanes) 百手巨人。</div>');
  assert.equal(out.count, 0);
  assert.equal(out.text, '(Centimanes) 百手巨人。');
});

test('重复调用是幂等的', () => {
  const h = harness();
  h.container.innerHTML = '<div>(拇指) 正文</div>';
  assert.equal(marks.decorate(h.container), 1);
  assert.equal(marks.decorate(h.container), 0);
  assert.equal(h.container.querySelectorAll('.ato-story-mark').length, 1);
});

test('C4 那段「编号 + 中英标题」也在图标后原样保留', () => {
  const out = run('<div>(拇指) 0010 被盗的呼吸 (Stolen Breaths) 正文开始。</div>');
  assert.equal(out.count, 1);
  assert.equal(out.text.startsWith('0010 被盗的呼吸 (Stolen Breaths)'), true);
});

test('图标尺寸跟正文走，且两种标记都在样式表里有定义', () => {
  const css = fs.readFileSync(path.join(root, 'story/assets/mixed-media/styles.css'), 'utf8');
  assert.match(css, /\.ato-story-mark\s*\{[^}]*width:\s*1\.05em/);
  assert.match(css, /\.ato-story-mark svg\s*\{/);
  assert.match(css, /--story-mark-glyph/);
});

test('纯文本场景用 strip 去标记：只去段首那一段，正文与其它括号不动', () => {
  assert.equal(marks.strip('(拇指) 正文'), '正文');
  assert.equal(marks.strip('（圈） 正文'), '正文');
  assert.equal(marks.strip('正文 (拇指) 后面'), '正文 (拇指) 后面');
  assert.equal(marks.strip('(Centimanes) 百手巨人'), '(Centimanes) 百手巨人');
  assert.equal(marks.strip(null), '');
});

test('故事页与第二屏都引入了这个脚本，并在渲染后调用 decorate', () => {
  for (const page of ['story/index.html', 'ss/index.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /story-marks\.js/, `${page} 缺 script`);
  }
  for (const source of [appSource, ssSource]) {
    assert.match(source, /ATO_STORY_MARKS\?\.decorate\?\./);
  }
});

test('故事页里 decorate 必须排在混排 mount 之后', () => {
  const start = appSource.indexOf('  function renderStory(entry) {');
  assert.ok(start > 0, 'renderStory not found');
  const body = appSource.slice(start, appSource.indexOf('\n  }', start));
  const mount = body.indexOf('mixedMediaRuntime()?.mount?.(storyText');
  const decorate = body.indexOf('ATO_STORY_MARKS?.decorate?.(storyText)');
  assert.ok(mount > 0 && decorate > 0, '缺 mount 或 decorate');
  assert.ok(mount < decorate, 'decorate 必须先让 prepareHTML 跑完');
});

test('真实数据里 44 处标记都能被替换，且替换后正文不再出现标记字样', () => {
  const dataFile = path.join(root, 'story/data/storybook-data.js');
  if (!fs.existsSync(dataFile)) return;
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(dataFile, 'utf8'), ctx);
  const MARK_RE = /^[（(][ \t\u00a0\u3000]*[拇圈](?:指)?[ \t\u00a0\u3000]*[)）]/;
  let expected = 0;
  for (const book of ctx.window.STORYBOOK_DATA.books) {
    for (const entry of book.entries || []) {
      const text = String(entry.text || '');
      if (!MARK_RE.test(text)) continue;
      expected++;
      const h = harness();
      h.container.innerHTML = '<div class="battle-block"></div>';
      h.container.firstChild.textContent = text;
      assert.equal(marks.decorate(h.container), 1, `${book.id} ${entry.key} 未替换`);
      const seen = h.container.textContent;
      assert.equal(MARK_RE.test(seen), false, `${book.id} ${entry.key} 仍残留标记`);
      // 标记长度必须和源文本对得上：抠掉的首部就是那段标记
      assert.equal(seen, text.slice(text.length - seen.length));
    }
  }
  assert.equal(expected, 44, '标记条目数应与数据一致');
});

test('图标是真实图片文件，不再内嵌 base64', () => {
  const src = fs.readFileSync(path.join(root, 'story/assets/story-marks.js'), 'utf8');
  assert.equal(src.includes('data:image'), false, 'story-marks.js 里不应再有 data URI');
  for (const name of ['c5/mark-thumb-c5.png', 'c5/mark-circle-c5.png']) {
    const file = path.join(root, 'story/assets/mixed-media/images', name);
    assert.ok(fs.existsSync(file), `缺少图标文件 ${name}`);
    const head = fs.readFileSync(file).subarray(0, 8);
    assert.deepEqual([...head.subarray(1, 4)], [0x50, 0x4e, 0x47], `${name} 不是 PNG`);
  }
  const srcs = ['<div>(拇指) 一</div>', '<div>(圈) 二</div>'].map(html => {
    const out = run(html);
    assert.equal(out.count, 1);
    return out.html.match(/src="([^"]+)"/)[1];
  });
  // 单测里没有 document，只能拿到相对 assets 的路径；两个页面靠 ASSET_BASE 补前缀。
  for (const s of srcs) {
    assert.match(s, /^mixed-media\/images\/c5\/mark-(thumb|circle)-c5\.png$/);
    assert.ok(fs.existsSync(path.join(root, 'story/assets', s)), `路径不可达 ${s}`);
  }
});
