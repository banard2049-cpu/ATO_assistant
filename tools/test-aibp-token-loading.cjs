const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'aibp/index.html'), 'utf8');
const tokenDir = path.join(root, 'aibp/ps/other/token');

// Token 名单写死在页面的 tokenFileNames 数组里，测试直接从源码里取出来，保证测的就是页面用的那份。
function builtInTokenFileNames() {
  const match = source.match(/    const tokenFileNames = (\[[\s\S]*?\n    \]);/);
  assert.ok(match, 'index.html 里找不到写死的 tokenFileNames 名单');
  return Array.from(vm.runInNewContext(`(${match[1]})`));
}

const tokenFileNames = builtInTokenFileNames();

function fakeElement() {
  return {
    children: [], dataset: {}, classList: { add() {} },
    append(...nodes) { this.children.push(...nodes); },
    addEventListener() {},
  };
}

function harness(files) {
  const requests = [];
  const grid = {
    children: [],
    replaceChildren() { this.children = []; },
    appendChild(node) { this.children.push(node); },
  };
  const context = {
    tokenFileNames: files,
    tokenBasePath: 'ps/other/token',
    currentApostle: 'HEKATON',
    ensurePiles() {},
    selectedTokenStacksMap() { return new Map(); },
    tokenDialogTitle: {},
    tokenFolderHint: {},
    tokenDialogGrid: grid,
    document: { createElement() { return fakeElement(); } },
    Image: class {
      constructor() { this.classList = { add() {} }; }
      set src(value) { requests.push(value); }
      addEventListener() {}
    },
  };
  vm.createContext(context);
  const names = [
    'isTokenImageFileName', 'naturalCompareTokenFile', 'normalizeTokenFileName',
    'tokenListFileNames', 'tokenSrc', 'appendTokenOption', 'renderTokenCandidates',
  ];
  for (const name of names) {
    const match = source.match(new RegExp(`    (?:async )?function ${name}\\([\\s\\S]*?\\n    }`));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  return { context, grid, requests };
}

test('页面自带的 token 名单和 ps/other/token/ 里的图片一致', () => {
  assert.ok(tokenFileNames.length > 0, '名单不能是空的');
  assert.equal(new Set(tokenFileNames).size, tokenFileNames.length, '名单里有重复项');
  tokenFileNames.forEach((name) => assert.match(name, /\.(?:png|jpe?g)$/i, name));

  // 卡图是使用者自备的本地素材，公开克隆里没有这个目录，所以只在本地有图时核对。
  const onDisk = fs.existsSync(tokenDir)
    ? fs.readdirSync(tokenDir).filter((name) => /\.(?:png|jpe?g)$/i.test(name))
    : [];
  if (onDisk.length === 0) return;
  assert.deepEqual(
    tokenFileNames.slice().sort(),
    onDisk.slice().sort(),
    '写死的名单必须和 token 文件夹里的图片一一对应',
  );
});

test('弹窗按名单整份渲染，不列举目录、也不探测文件名', () => {
  const h = harness(tokenFileNames);
  h.context.renderTokenCandidates();

  assert.equal(h.grid.children.length, tokenFileNames.length, '每个名单项都要出一个选项');
  assert.deepEqual(
    h.requests.slice().sort(),
    tokenFileNames.map((name) => `ps/other/token/${name}`).sort(),
  );
  h.requests.forEach((file) => {
    assert.ok(fs.existsSync(path.join(root, 'aibp', file)), file);
  });
});

test('名单里的图缺失时仍然保留该选项，只把图换成占位', () => {
  const h = harness(['不存在的图.png']);
  h.context.renderTokenCandidates();
  assert.equal(h.grid.children.length, 1);
  assert.deepEqual(h.requests, ['ps/other/token/不存在的图.png']);
});

test('名单为空时给出提示，而不是静默空白', () => {
  const h = harness([]);
  h.context.renderTokenCandidates();
  assert.equal(h.grid.children.length, 1);
  assert.match(h.grid.children[0].textContent, /名单是空的/);
});

test('页面里不再残留目录列举与文件名探测的老代码', () => {
  ['loadTokenFileNamesFromDirectoryIndex', 'tokenProbeFileNames', 'tokenProbeMaxIndex',
   'tokenProbeExtensions', 'AIBP_TOKEN_FILES'].forEach((token) => {
    assert.ok(!source.includes(token), `index.html 里还留着 ${token}`);
  });
});
