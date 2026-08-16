const fs = require("fs");
const vm = require("vm");

const dashboardSource = fs.readFileSync("index.html", "utf8");
const recordSource = fs.readFileSync("record/index.html", "utf8");

function assertInlineScriptCompiles(source, filename) {
  const scripts = Array.from(source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
    .map((match) => match[1])
    .filter((script) => script.trim());
  assert(scripts.length > 0, `${filename} has no inline script.`);
  scripts.forEach((script, index) => {
    new vm.Script(script, { filename: `${filename}:inline-${index + 1}` });
  });
}

function extractBalanced(source, start, openChar, closeChar) {
  const open = source.indexOf(openChar, start);
  if (open < 0) throw new Error(`Missing ${openChar} after offset ${start}.`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }
  throw new Error(`Unclosed ${openChar} after offset ${start}.`);
}

function extractObject(source, name) {
  const marker = `const ${name} =`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${name}.`);
  return vm.runInNewContext(`(${extractBalanced(source, start, "{", "}")})`);
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${name}.`);
  const body = extractBalanced(source, start, "{", "}");
  return source.slice(start, source.indexOf("{", start)) + body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assertInlineScriptCompiles(dashboardSource, "index.html");
assertInlineScriptCompiles(recordSource, "record/index.html");

const constants = extractObject(dashboardSource, "pharosDreamConstants");
const expectedSlots = ["alpha", "beta", "gamma", "delta", "epsilon", "lambda", "omicron", "sigma", "psi", "omega"];
const expectedC5Entries = [
  "浅滩寓言-parable-of-the-shallows",
  "采珠人寓言-parable-of-the-pearl-diver",
  "挣扎寓言-parable-of-the-struggle",
  "思想化物-thoughts-into-things",
  "生命的真相-truth-of-life",
  "恐惧是什么-what-is-fear",
  "为什么会恐惧-why-is-fear",
  "为什么会痛苦-why-is-pain",
  "痛苦是什么-what-is-pain",
  "希望是什么-what-is-hope",
];

assert(constants.c4.title === "一百万日夜", "C4 story shortcut title is incorrect.");
assert(constants.c4.module === "ten-thousand-nights-and-days", "C4 story chapter is incorrect.");
assert(constants.c4.adventure === "Ten Thousand Nights and Days", "C4 record adventure title is incorrect.");
assert(constants.c4.boxes.map((row) => row[0]).join() === expectedSlots.join(), "C4 constant slots are incorrect.");
assert(constants.c4.boxes.map((row) => row[3].entry).join() === ["α", "β", "γ", "δ", "ε", "λ", "ο", "σ", "ψ", "Ω"].join(), "C4 story entries are incorrect.");

assert(constants.c5.title === "浅滩布道", "C5 story shortcut title is incorrect.");
assert(constants.c5.module === "sermons-on-the-shoals", "C5 story chapter is incorrect.");
assert(constants.c5.adventure === "Sermons on the Shoals", "C5 record adventure title is incorrect.");
assert(constants.c5.boxes.map((row) => row[0]).join() === expectedSlots.join(), "C5 constant slots are incorrect.");
assert(constants.c5.boxes.map((row) => row[3].entry).join() === expectedC5Entries.join(), "C5 story entries are incorrect.");

const dashboardFunctions = [
  "simpleConstantSlotIds",
  "findSimpleConstantRow",
  "getPharosDreamStoryLink",
  "normalizeAdventureTitle",
  "recordAdventureIndex",
  "markRecordAdventure",
  "recordAdventureMiddleSlots",
].map((name) => extractFunction(dashboardSource, name)).join("\n");

const dashboardHarness = new Function("pharosDreamConstants", `
  const surveyConstantData = {
    c4: { hubs: Array.from({ length: 7 }, (_, index) => ({ title: \`C4 Hub \${index}\` })) },
    c5: { hubs: Array.from({ length: 7 }, (_, index) => ({ title: \`C5 Hub \${index}\` })) },
  };
  let activeCycle = "c4";
  let activeTarget = "beta";
  function currentCycleConfig() { return { id: activeCycle, storyBook: activeCycle }; }
  function currentPharosDreamConstants() { return pharosDreamConstants[activeCycle]; }
  function getActivePharosDreamTarget() { return activeTarget; }
  function getStoryHref(options = {}) {
    const params = new URLSearchParams();
    params.set("book", activeCycle);
    if (options.chapter) params.set("chapter", options.chapter);
    if (options.entry) params.set("entry", options.entry);
    return \`./story/index.html?\${params.toString()}\`;
  }
  ${dashboardFunctions}
  return {
    storyLink(cycle, target) { activeCycle = cycle; activeTarget = target; return getPharosDreamStoryLink(); },
    markRecordAdventure,
  };
`)(constants);

const c4StoryLink = new URL(dashboardHarness.storyLink("c4", "beta").href, "https://example.test/");
assert(c4StoryLink.searchParams.get("chapter") === "ten-thousand-nights-and-days", "C4 shortcut does not jump to its chapter.");
assert(c4StoryLink.searchParams.get("entry") === "β", "C4 shortcut does not jump to the selected constant.");
const c5StoryLink = new URL(dashboardHarness.storyLink("c5", "psi").href, "https://example.test/");
assert(c5StoryLink.searchParams.get("chapter") === "sermons-on-the-shoals", "C5 shortcut does not jump to its chapter.");
assert(c5StoryLink.searchParams.get("entry") === expectedC5Entries[8], "C5 shortcut does not jump to the selected sermon.");

const c4Record = {};
assert(dashboardHarness.markRecordAdventure(c4Record, {
  cycle: "c4", adventure: constants.c4.adventure, box: "beta", recordSlot: "beta",
}) === "beta", "C4 dashboard record action did not select beta.");
assert(c4Record.adventures["c4-7-beta"], "C4 dashboard record action filled the wrong slot.");

const c5Record = {};
assert(dashboardHarness.markRecordAdventure(c5Record, {
  cycle: "c5", adventure: constants.c5.adventure, box: "psi", recordSlot: "psi",
}) === "psi", "C5 dashboard record action did not select psi.");
assert(c5Record.adventures["c5-7-psi"], "C5 dashboard record action filled the wrong slot.");

const normalRecord = {};
assert(dashboardHarness.markRecordAdventure(normalRecord, {
  cycle: "c4", adventure: "C4 Hub 0", box: "alpha",
}) === "alpha", "Ordinary adventure Alpha behavior regressed in the dashboard.");
assert(dashboardHarness.markRecordAdventure(normalRecord, {
  cycle: "c4", adventure: "C4 Hub 0", box: "42",
}) === "mid1", "Ordinary adventure middle-slot behavior regressed in the dashboard.");

const recordMarkAdventure = extractFunction(recordSource, "markAdventureFromSurvey");
const recordHarness = new Function(`
  const cycleData = {
    c4: { adventures: [["普通", "Normal"], ["一万个日夜", "Ten Thousand Nights and Days", "ten-thousand"]] },
    c5: { adventures: [["普通", "Normal"], ["浅滩布道", "Sermons on the Shoals", "ten-thousand"]] },
  };
  const state = { adventures: {} };
  function normalizeAdventureTitle(value) {
    return String(value || "").toLowerCase().replace(/travelled/g, "traveled").replace(/[^a-z0-9]+/g, "");
  }
  ${recordMarkAdventure}
  return { markAdventureFromSurvey, adventures: state.adventures };
`)(constants);

assert(recordHarness.markAdventureFromSurvey("c4", constants.c4.adventure, "beta") === "beta", "Record URL handler did not accept C4 beta.");
assert(recordHarness.adventures["c4-1-beta"], "Record URL handler filled the wrong C4 slot.");
assert(recordHarness.markAdventureFromSurvey("c5", constants.c5.adventure, "psi") === "psi", "Record URL handler did not accept C5 psi.");
assert(recordHarness.adventures["c5-1-psi"], "Record URL handler filled the wrong C5 slot.");
assert(recordHarness.markAdventureFromSurvey("c4", "Normal", "alpha") === "alpha", "Record URL handler ordinary Alpha behavior regressed.");
assert(recordHarness.markAdventureFromSurvey("c4", "Normal", "omega") === "omega", "Record URL handler ordinary Omega behavior regressed.");
assert(recordHarness.markAdventureFromSurvey("c5", "Normal", "42") === "mid1", "Record URL handler ordinary middle-slot behavior regressed.");
assert(recordSource.includes("consumeDashboardSurveyNote({ clearUrl: false })"), "Record URL action is cleared before NAS loading completes.");
assert(/state = latest\.state;[\s\S]{0,200}consumeDashboardSurveyNote\(\)/.test(recordSource), "Record URL action is not reapplied after NAS state loads.");
assert(/首次修改时会创建记录表存档[\s\S]{0,120}requestedDashboardSurveyNote[\s\S]{0,60}queueServerSave/.test(recordSource), "A first-time record does not save the imported dashboard action.");

console.log("C4/C5 story constants and record autofill regression tests passed.");
