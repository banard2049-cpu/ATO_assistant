const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const storyRoot = path.join(__dirname, "..");
const context = { window: {} };
vm.createContext(context);

for (const file of ["data/entity-index.js", "data/storybook-data.js"]) {
  const filePath = path.join(storyRoot, file);
  assert.ok(fs.existsSync(filePath), `${file} is missing`);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context);
}

test("entity biographies have data that matches story text", () => {
  const entities = context.window.STORY_ENTITY_INDEX?.entities || [];
  const books = context.window.STORYBOOK_DATA?.books || [];
  const entries = books.flatMap((book) => book.entries || []);

  assert.ok(entities.length > 0, "entity index is empty");
  assert.ok(
    entities.some((entity) => entity.intro || entity.bioNonSpoiler || entity.bio),
    "entity biographies are empty"
  );

  const aliases = entities
    .flatMap((entity) => {
      const source = Array.isArray(entity.matchAliases)
        ? entity.matchAliases
        : [entity.name, entity.englishName, ...(entity.aliases || [])];
      return source.filter(Boolean).map((alias) => String(alias).toLowerCase());
    })
    .sort((a, b) => b.length - a.length);

  assert.ok(
    entries.some((entry) => {
      const text = String(entry.text || "").toLowerCase();
      return aliases.some((alias) => text.includes(alias));
    }),
    "no entity alias matches the story text"
  );
});
