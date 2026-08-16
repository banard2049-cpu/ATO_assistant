const fs = require("fs");

const appSource = fs.readFileSync("map/app.js", "utf8");
const htmlSource = fs.readFileSync("map/index.html", "utf8");
const cssSource = fs.readFileSync("map/styles.css", "utf8");
const tokenImage = fs.readFileSync("map/tokens/sandstorm.jpg");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `Missing function ${name}.`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
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
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}.`);
}

assert(tokenImage[0] === 0xff && tokenImage[1] === 0xd8 && tokenImage.at(-2) === 0xff && tokenImage.at(-1) === 0xd9, "Sandstorm asset is not a complete JPEG.");
const sandstormConfig = appSource.match(/\{\s*id:\s*"sandstorm"[\s\S]*?\n\s*\},/)?.[0] || "";
assert(/cycles:\s*\["c4"\]/.test(sandstormConfig) && /edge:\s*true/.test(sandstormConfig), "Sandstorm token is not configured as a C4 edge token.");
assert(!/unique:\s*true/.test(sandstormConfig), "Sandstorm token is still configured as unique.");
assert(!/cycles:\s*\[[^\]]*(?:"c1"|"c2"|"c3"|"c5")/.test(sandstormConfig), "Sandstorm token leaked into another cycle.");

for (const direction of ["up", "right", "down", "left"]) {
  assert(htmlSource.includes(`data-edge-direction="${direction}"`), `Missing ${direction} direction control.`);
  assert(cssSource.includes(`.map-edge-token.edge-${direction}`), `Missing ${direction} edge positioning class.`);
}

for (const name of [
  "normalizeEdgeMarkers",
  "edgeMarkerPlacements",
  "getTileEdgeTokens",
  "renderTileEdgeTokens",
]) {
  assert(appSource.includes(`function ${name}(`), `Missing ${name}.`);
}

const behaviorHarness = new Function(`
  const edgeDirections = ["up", "right", "down", "left"];
  const tokenAssetById = { sandstorm: { edge: true } };
  const state = { selectedToken: "sandstorm", selectedEdgeDirection: "up" };
  const cycleState = { currentTile: "", explored: {}, tokens: { AG: "", AD: "", hsCount: 0, markers: {}, edgeMarkers: {} } };
  let undoCount = 0;
  function isPlainObject(value) { return value && typeof value === "object" && !Array.isArray(value); }
  function clearPendingAdversarySpawn() {}
  function activeCycleState() { return cycleState; }
  function pushUndo() { undoCount += 1; }
  function saveState() {}
  function render() {}
  ${extractFunction(appSource, "normalizeEdgeMarkers")}
  ${extractFunction(appSource, "edgeMarkerPlacements")}
  ${extractFunction(appSource, "placeToken")}
  return { state, cycleState, normalizeEdgeMarkers, edgeMarkerPlacements, placeToken, undoCount: () => undoCount };
`)();

behaviorHarness.placeToken("029");
assert(behaviorHarness.edgeMarkerPlacements(behaviorHarness.cycleState, "sandstorm")[0].direction === "up", "Initial sandstorm placement failed.");
behaviorHarness.state.selectedEdgeDirection = "right";
behaviorHarness.placeToken("052");
assert(behaviorHarness.cycleState.tokens.edgeMarkers["029"].sandstorm.includes("up"), "Placing another sandstorm cleared the old tile.");
assert(behaviorHarness.edgeMarkerPlacements(behaviorHarness.cycleState, "sandstorm").length === 2, "A second sandstorm was not added.");
behaviorHarness.state.selectedEdgeDirection = "down";
behaviorHarness.placeToken("052");
assert(behaviorHarness.cycleState.tokens.edgeMarkers["052"].sandstorm.join() === "right,down", "Different sides of one tile cannot hold separate sandstorms.");
behaviorHarness.state.selectedEdgeDirection = "right";
behaviorHarness.placeToken("052");
assert(behaviorHarness.cycleState.tokens.edgeMarkers["052"].sandstorm.join() === "down", "Repeating a placement did not remove only that sandstorm.");
behaviorHarness.state.selectedEdgeDirection = "down";
behaviorHarness.placeToken("052");
assert(!behaviorHarness.cycleState.tokens.edgeMarkers["052"], "Removing the final sandstorm did not clean up its tile.");
assert(behaviorHarness.edgeMarkerPlacements(behaviorHarness.cycleState, "sandstorm").length === 1, "Removing one tile's sandstorms affected another tile.");

const normalized = behaviorHarness.normalizeEdgeMarkers({
  "029": { sandstorm: "down", unknown: "up" },
  "052": { sandstorm: ["left", "up", "left", "diagonal"] },
  "074": { sandstorm: "diagonal" },
});
assert(normalized["029"].sandstorm.join() === "down", "Legacy single-direction sandstorm was not migrated.");
assert(normalized["052"].sandstorm.join() === "left,up", "Multiple saved sandstorms were not normalized.");
assert(!normalized["074"], "Invalid sandstorm direction survived normalization.");
assert(behaviorHarness.undoCount() === 5, "Sandstorm placements are not undoable.");

console.log("C4 sandstorm edge-token regression tests passed.");
