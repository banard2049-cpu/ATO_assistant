const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'aibp/index.html'), 'utf8');
const manifest = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'aibp/ps/other/token/token_manifest.js'), 'utf8'), manifest);

function harness(files, directoryFiles = []) {
  const requests = [];
  let directoryReads = 0;
  const context = {
    tokenFileNames: files, tokenProbeMaxIndex: 199, tokenProbeExtensions: ['png', 'jpg', 'jpeg'],
    tokenBasePath: 'ps/other/token', currentApostle: 'HEKATON', tokenLoadToken: 0,
    ensurePiles() {}, selectedTokenStacksMap() { return new Map(); },
    tokenDialogTitle: {}, tokenFolderHint: {},
    tokenDialogGrid: { replaceChildren() {}, appendChild() {} },
    document: { createElement() { return {}; } }, window: { setTimeout() {} },
    async loadTokenFileNamesFromDirectoryIndex() { directoryReads++; return directoryFiles; },
    Image: class { set src(value) { requests.push(value); } }
  };
  vm.createContext(context);
  for (const name of ['isTokenImageFileName', 'naturalCompareTokenFile', 'normalizeTokenFileName', 'tokenProbeFileNames', 'tokenSrc', 'renderTokenCandidates']) {
    const match = source.match(new RegExp(`    (?:async )?function ${name}\\([\\s\\S]*?\\n    }`));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  return { context, requests, directoryReads: () => directoryReads };
}

test('manifest loads exactly the existing token images without speculative requests', async () => {
  const files = Array.from(manifest.window.AIBP_TOKEN_FILES);
  const h = harness(files);
  await h.context.renderTokenCandidates();
  assert.equal(h.directoryReads(), 0);
  assert.deepEqual(h.requests.slice().sort(), files.map(f => `ps/other/token/${f}`).sort());
  h.requests.forEach(file => assert.ok(fs.existsSync(path.join(root, 'aibp', file)), file));
});

test('directory listing is used without speculative requests when manifest is missing', async () => {
  const h = harness([], ['CA.jpg', 'CA.jpg', 'AT+.png']);
  await h.context.renderTokenCandidates();
  assert.equal(h.directoryReads(), 1);
  assert.deepEqual(h.requests.slice().sort(), ['ps/other/token/AT+.png', 'ps/other/token/CA.jpg']);
});

test('numbered filename fallback remains available when no list exists', async () => {
  const h = harness([]);
  await h.context.renderTokenCandidates();
  assert.ok(h.requests.includes('ps/other/token/TOKEN_001.png'));
});

test('closing or replacing a pending load prevents stale image requests', async () => {
  const h = harness([], ['CA.jpg']);
  const pending = h.context.renderTokenCandidates();
  h.context.tokenLoadToken++;
  await pending;
  assert.equal(h.requests.length, 0);
});
