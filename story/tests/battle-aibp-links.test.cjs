const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const storyRoot = path.join(__dirname, "..");
const appSource = fs.readFileSync(
  path.join(storyRoot, "assets", "app.js"),
  "utf8"
);
const functionStart = appSource.indexOf("  function battleAibpLink(entry) {");
const functionEnd = appSource.indexOf(
  "  function configureUtterance(utterance) {",
  functionStart
);

assert.notEqual(functionStart, -1, "battleAibpLink function is missing");
assert.notEqual(functionEnd, -1, "battleAibpLink function boundary is missing");

const functionSource = appSource.slice(functionStart, functionEnd);
const linkContext = {
  escapeHtml: (value) => String(value),
};
const { battleAibpLink, envelopeAibpLink } = vm.runInNewContext(`
  (() => {
    ${functionSource}
    return { battleAibpLink, envelopeAibpLink };
  })()
`, linkContext);

const storyContext = { window: {} };
vm.createContext(storyContext);
vm.runInContext(
  fs.readFileSync(path.join(storyRoot, "data", "storybook-data.js"), "utf8"),
  storyContext
);

const expectedC45Links = {
  c4: {
    "迈达狮之战-midascore-battle": "MIDASCORE",
    "半神迪精之战-demidjinn-battle": "DEMIDJINN",
    "潘多拉视界之战-pandora-horizon-battle": "THE_BABELIAN_LUNACY",
    "撞击之战-the-crash-battle": "THE_BABELIAN_LUNACY",
    "收割旋风之战-reap-the-whirlwind-battle": "DAHAKA",
    "扬谷之战-the-winnowing-battle": "DAHAKA",
  },
  c5: {
    "dragon-of-phobos-battle": "DRAGON_OF_PHOBOS",
    "meduketos-battle": "MEDUKETOS",
    "the-devil-himself-battle": "TITAN_X",
    "thicker-than-water-battle": "TITAN_X",
    "harsh-truth-battle": "UR_FLEECE",
    "white-lie-battle": "UR_FLEECE",
  },
};

for (const [bookId, expectedLinks] of Object.entries(expectedC45Links)) {
  test(`${bookId.toUpperCase()} battle modules link to the matching AIBP`, () => {
    const book = storyContext.window.STORYBOOK_DATA.books.find(
      (candidate) => candidate.id === bookId
    );
    assert.ok(book, `${bookId} story book is missing`);

    for (const [entryId, apostle] of Object.entries(expectedLinks)) {
      const entry = book.entries.find((candidate) => candidate.id === entryId);
      assert.ok(entry, `${bookId} battle entry is missing: ${entryId}`);
      const html = battleAibpLink(entry);
      assert.match(
        html,
        new RegExp(`\\.\\./aibp/index\\.html#${apostle}(?:["'])`),
        `${entry.title} should link to ${apostle}`
      );
    }
  });
}

test("C5 envelope story entry only hints at the hidden HELIOS AIBP", () => {
  const c3Book = storyContext.window.STORYBOOK_DATA.books.find((book) => book.id === "c3");
  const c5Book = storyContext.window.STORYBOOK_DATA.books.find((book) => book.id === "c5");
  assert.ok(c3Book && c5Book, "c3/c5 story books are missing");

  const c5Entry = c5Book.entries.find((entry) => entry.id === "0199");
  assert.ok(c5Entry, "C5 0199 (open envelope Y) is missing");

  const html = envelopeAibpLink(c5Entry, "c5");
  assert.match(html, /data-aibp-hint="helios"/, "C5 0199 should render the hint button");
  assert.match(html, /赫利俄斯 AIBP/, "C5 0199 button should name the hidden boss");
  assert.doesNotMatch(html, /跳转/, "the button must not promise a jump");
  assert.doesNotMatch(
    html,
    /aibp\/index\.html/,
    "the button must not link straight to the hidden AIBP"
  );
  assert.doesNotMatch(
    html,
    /<a class="battle-aibp-button"/,
    "the button must be a plain button, not a link"
  );
});

test("C3 no longer gets an envelope button", () => {
  const c3Book = storyContext.window.STORYBOOK_DATA.books.find((book) => book.id === "c3");
  assert.ok(c3Book, "c3 story book is missing");
  for (const id of ["0261", "0203"]) {
    const entry = c3Book.entries.find((candidate) => candidate.id === id);
    assert.ok(entry, `C3 ${id} is missing`);
    assert.equal(envelopeAibpLink(entry, "c3"), "", `C3 ${id} should not render the button`);
  }
});

test("envelope hint text, close behaviour and click wiring", () => {
  assert.match(
    appSource,
    /ENVELOPE_AIBP_HINT\s*=\s*"[^"]*赫利俄斯[^"]*"/,
    "hint text should tell the reader to search 赫利俄斯 in AIBP"
  );
  assert.match(
    appSource,
    /closest\("\[data-aibp-hint\]"\)[\s\S]{0,400}showEnvelopeAibpHint\(\)/,
    "a click delegate should open the hint layer"
  );

  const harness = runEnvelopeHarness();
  harness.api.showEnvelopeAibpHint();
  assert.equal(harness.layer.hidden, false, "hint layer should open");
  assert.match(harness.layer.textNode.textContent, /赫利俄斯/, "hint text should name 赫利俄斯");
  assert.match(harness.layer.textNode.textContent, /BOSS 搜索框/, "hint text should point at the BOSS search box");
  assert.match(harness.layer.textNode.textContent, /输入/, "hint text should tell the reader to type the name");
  assert.equal(harness.layer.closeNode.focused, true, "close button should receive focus");

  harness.layer.listener({
    target: { closest: (selector) => (selector === ".aibp-hint-close" ? harness.layer.closeNode : null) },
  });
  assert.equal(harness.layer.hidden, true, "close button should hide the hint layer");
});

function runEnvelopeHarness() {
  const start = appSource.indexOf("  const ENVELOPE_AIBP_HINT");
  const end = appSource.indexOf("  function configureUtterance(utterance) {", start);
  assert.ok(start >= 0 && end > start, "envelope hint snippet is missing");

  const listeners = [];
  const layer = {
    id: "envelopeAibpHint",
    className: "aibp-hint-layer",
    hidden: true,
    innerHTML: "",
    listener: null,
    appendChild() {},
    querySelector(selector) {
      if (selector === "#envelopeAibpHintText") return this.textNode;
      if (selector === ".aibp-hint-close") return this.closeNode;
      return null;
    },
    addEventListener(type, handler) {
      if (type === "click") this.listener = handler;
    },
  };
  layer.textNode = { textContent: "" };
  layer.closeNode = { focused: false, focus() { this.focused = true; } };

  const documentStub = {
    getElementById: () => null,
    createElement: () => layer,
    addEventListener(type, handler) {
      if (type === "click") listeners.push(handler);
    },
    body: { appendChild() {} },
  };
  const context = vm.createContext({ document: documentStub });
  const api = vm.runInContext(
    `(() => {\n${appSource.slice(start, end)}\nreturn { showEnvelopeAibpHint };\n})()`,
    context
  );
  assert.equal(listeners.length, 0, "the snippet itself should not register global listeners");
  return { api, layer };
}

test("existing C1-C3 mappings remain available", () => {
  const cases = [
    ["百臂巨人之战 (Hekaton Battle)", "HEKATON"],
    ["蠕变奇美拉之战", "CHIMERA_METASTASIOS"],
    ["超时光先知战斗", "HYPERTIME_ORACLE"],
  ];

  for (const [title, apostle] of cases) {
    assert.match(
      battleAibpLink({ title }),
      new RegExp(`\\.\\./aibp/index\\.html#${apostle}(?:["'])`)
    );
  }
});

test("C5 translated battle links stay outside the collapsed source section", () => {
  const renderStart = appSource.indexOf("  function renderAiTranslatedSupplement(entry, imagesHtml) {");
  const renderEnd = appSource.indexOf("  function entryBookId(entry) {", renderStart);
  assert.notEqual(renderStart, -1, "translated supplement renderer is missing");
  assert.notEqual(renderEnd, -1, "translated supplement renderer boundary is missing");

  const renderAiTranslatedSupplement = vm.runInNewContext(`
    (() => {
      ${appSource.slice(renderStart, renderEnd)}
      return renderAiTranslatedSupplement;
    })()
  `, {
    battleAibpLink,
    currentBook: () => ({ id: "c5", entries: [] }),
    escapeHtml: (value) => String(value),
    linkify: (value) => String(value),
  });

  const c5Book = storyContext.window.STORYBOOK_DATA.books.find(
    (candidate) => candidate.id === "c5"
  );
  const entry = c5Book.entries.find(
    (candidate) => candidate.id === "dragon-of-phobos-battle"
  );
  const html = renderAiTranslatedSupplement(entry, '<img src="page-174.jpg">');
  const linkIndex = html.indexOf("../aibp/index.html#DRAGON_OF_PHOBOS");
  const detailsIndex = html.indexOf('<details class="source-original">');

  assert.ok(linkIndex >= 0, "C5 AIBP link should be rendered");
  assert.ok(linkIndex < detailsIndex, "C5 AIBP link should be visible before the collapsed source section");
  assert.doesNotMatch(
    html.slice(detailsIndex),
    /battle-aibp-button/,
    "collapsed source section should not contain the AIBP button"
  );
});
