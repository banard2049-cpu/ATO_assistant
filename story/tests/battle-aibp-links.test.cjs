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
const battleAibpLink = vm.runInNewContext(`
  (() => {
    ${functionSource}
    return battleAibpLink;
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
