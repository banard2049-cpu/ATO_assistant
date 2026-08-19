const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pageHtml = fs.readFileSync(path.join(__dirname, "..", "aibp", "index.html"), "utf8");
assert.match(pageHtml, /<div class="battle-map-side" role="region" aria-label="地形工具">/);
assert.doesNotMatch(pageHtml, /<aside class="battle-map-side"/);
assert.match(pageHtml, /data-battle-map-setup-select/);
assert.match(pageHtml, /data-battle-map-card-list/);

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.parentNode = null;
    this.attributes = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    if (this.tagName === "SELECT" && !this.value) this.value = child.value;
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, values = {}) {
    const event = {
      clientX: 0,
      clientY: 0,
      ...values,
      stopped: false,
      stopPropagation() { this.stopped = true; },
    };
    (this.listeners.get(type) || []).forEach((listener) => listener(event));
    if (!event.stopped && this.parentNode) this.parentNode.dispatch(type, event);
    return event;
  }
}

const elements = {
  "[data-battle-map-board]": new FakeElement("div"),
  "[data-battle-map-terrain-layer]": new FakeElement("div"),
  "[data-battle-map-start-layer]": new FakeElement("div"),
  "[data-battle-map-add-select]": new FakeElement("select"),
  "[data-battle-map-add]": new FakeElement("button"),
  "[data-battle-map-rotate-left]": new FakeElement("button"),
  "[data-battle-map-rotate-right]": new FakeElement("button"),
  "[data-battle-map-flip]": new FakeElement("button"),
  "[data-battle-map-delete]": new FakeElement("button"),
  "[data-battle-map-reset]": new FakeElement("button"),
  "[data-battle-map-starts-toggle]": new FakeElement("input"),
  "[data-battle-map-setup-control]": new FakeElement("label"),
  "[data-battle-map-setup-select]": new FakeElement("select"),
  "[data-battle-map-selection]": new FakeElement("div"),
  "[data-battle-map-card-list]": new FakeElement("div"),
  "[data-battle-map-card-count]": new FakeElement("span"),
  "[data-battle-map-card-empty]": new FakeElement("p"),
};

const board = elements["[data-battle-map-board]"];
const terrainLayer = elements["[data-battle-map-terrain-layer]"];
const startLayer = elements["[data-battle-map-start-layer]"];
board.append(terrainLayer, startLayer);
board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });

global.document = { createElement: (tagName) => new FakeElement(tagName) };
global.window = { BattleTerrain: require("../ss/terrain-data.js") };
require(path.join(__dirname, "..", "aibp", "battle_map_control.js"));

let map = null;
let activeApostle = "HEKATON";
let zoomedCard = null;
const control = window.BattleMapControl.create({
  root: { querySelector: (selector) => elements[selector] },
  assetBase: "../ss/terrain",
  cardAssetBase: "../ss/terrain-cards",
  openImageZoom: (src, alt) => { zoomedCard = { src, alt }; },
  getApostle: () => activeApostle,
  getLevel: () => 1,
  getMap: () => map,
  setMap: (value) => { map = value; },
});

control.render();
assert.ok([0, 90, 180, 270].includes(map.apostleFacing));
assert.equal(startLayer.children[0].children[0].textContent, "\u25b2");
assert.match(startLayer.children[0].children[0].style.transform, /rotate\((0|90|180|270)deg\)/);
const initialTerrainOptions = elements["[data-battle-map-add-select]"].children.map((option) => option.value);
assert.deepEqual(initialTerrainOptions.slice(0, 6), [
  "Column",
  "City",
  "Labyrinth I",
  "Labyrinth L",
  "Labyrinth O",
  "Labyrinth Z",
]);
assert.equal(new Set(initialTerrainOptions).size, initialTerrainOptions.length);
assert.ok(initialTerrainOptions.includes("Arcology"));
assert.ok(initialTerrainOptions.includes("Irem Tower"));
assert.ok(initialTerrainOptions.includes("Track Tile 4 1x5"));
const initialCardLabels = elements["[data-battle-map-card-list]"].children
  .map((button) => button.children[1].textContent);
assert.deepEqual(initialCardLabels, ["Column", "City"]);
assert.equal(elements["[data-battle-map-card-count]"].textContent, "2 张");
elements["[data-battle-map-card-list]"].children[0].dispatch("click");
assert.equal(zoomedCard.alt, "Column");
assert.match(zoomedCard.src, /terrain-cards\/column\.jpg/);

const prioritizedOrder = window.BattleMapControl.getTerrainOrder({
  terrain: [{ name: "Wishstorm" }, { name: "City" }, { name: "Wishstorm" }],
}, "HEKATON");
assert.deepEqual(prioritizedOrder.slice(0, 6), [
  "Wishstorm",
  "City",
  "Labyrinth I",
  "Labyrinth L",
  "Labyrinth O",
  "Labyrinth Z",
]);

const initialCount = map.terrain.length;
const city = map.terrain.find((placement) => placement.name === "City");
let cityButton = terrainLayer.children.find((button) => button.dataset.terrainId === city.id);
cityButton.dispatch("click", { clientX: 825, clientY: 225 });
assert.equal(elements["[data-battle-map-rotate-right]"].disabled, false);

cityButton = terrainLayer.children.find((button) => button.dataset.terrainId === city.id);
cityButton.dispatch("click", { clientX: 775, clientY: 175 });
assert.equal(map.terrain.find((placement) => placement.id === city.id).column, 16);
assert.equal(map.terrain.find((placement) => placement.id === city.id).row, 11);

elements["[data-battle-map-rotate-right]"].dispatch("click");
assert.equal(map.terrain.find((placement) => placement.id === city.id).rotation, 270);

elements["[data-battle-map-flip]"].dispatch("click");
assert.equal(map.terrain.find((placement) => placement.id === city.id).flipped, true);
cityButton = terrainLayer.children.find((button) => button.dataset.terrainId === city.id);
assert.equal(cityButton.children[0].style.transform, "scaleX(-1)");
assert.deepEqual(
  elements["[data-battle-map-card-list]"].children.map((button) => button.children[1].textContent),
  ["Column", "Ruined City", "City"]
);

elements["[data-battle-map-delete]"].dispatch("click");
assert.equal(map.terrain.length, initialCount - 1);
assert.equal(elements["[data-battle-map-card-count]"].textContent, "2 张");

elements["[data-battle-map-add-select]"].value = "City";
elements["[data-battle-map-add]"].dispatch("click");
assert.equal(map.terrain.length, initialCount);
assert.equal(map.terrain.at(-1).name, "City");
assert.equal(elements["[data-battle-map-card-count]"].textContent, "2 张");

activeApostle = "DAHAKA";
map = null;
control.render();
assert.equal(elements["[data-battle-map-setup-control]"].hidden, false);
assert.deepEqual(
  elements["[data-battle-map-setup-select]"].children.map((option) => option.value),
  ["reap-the-whirlwind", "the-winnowing"]
);
assert.equal(map.setupId, "reap-the-whirlwind");
assert.equal(map.terrain.length, 28);
elements["[data-battle-map-setup-select]"].value = "the-winnowing";
elements["[data-battle-map-setup-select]"].dispatch("change");
assert.equal(map.setupId, "the-winnowing");
assert.equal(map.terrain.length, 27);

activeApostle = "THE_NIETZSCJEAN";
map = null;
control.render();
assert.deepEqual(
  elements["[data-battle-map-setup-select]"].children.map((option) => option.value),
  ["the-cruel-lesson", "what-are-you"]
);
elements["[data-battle-map-setup-select]"].value = "what-are-you";
elements["[data-battle-map-setup-select]"].dispatch("change");
assert.equal(map.setupId, "what-are-you");
assert.equal(map.terrain.length, 18);
assert.deepEqual(
  elements["[data-battle-map-add-select]"].children.slice(0, 4).map((option) => option.value),
  ["Red Anchor", "Blue Anchor", "Green Anchor", "Yellow Anchor"]
);

activeApostle = "THE_BURDEN";
map = null;
control.render();
assert.deepEqual(
  elements["[data-battle-map-setup-select]"].children.map((option) => option.value),
  ["burden-battle", "hardest-to-bear"]
);
elements["[data-battle-map-setup-select]"].value = "hardest-to-bear";
elements["[data-battle-map-setup-select]"].dispatch("change");
assert.equal(map.setupId, "hardest-to-bear");
assert.equal(map.terrain.length, 31);

activeApostle = "HERMESIAN_PURSUER";
map = null;
control.render();
assert.deepEqual(
  elements["[data-battle-map-setup-select]"].children.map((option) => option.value),
  ["pursuer", "pursuits-end"]
);
elements["[data-battle-map-setup-select]"].value = "pursuits-end";
elements["[data-battle-map-setup-select]"].dispatch("change");
assert.equal(map.setupId, "pursuits-end");
assert.equal(map.terrain.length, 19);

activeApostle = "TITAN_X";
map = null;
control.render();
assert.equal(map.setupId, "the-devil-himself");
assert.equal(map.terrain.length, 0);
assert.deepEqual(
  elements["[data-battle-map-add-select]"].children.slice(0, 5).map((option) => option.value),
  [
    "Staircase Entrance",
    "Endless Staircase Track 1 1x5",
    "Endless Staircase Track 2 1x4",
    "Endless Staircase Track 3 1x4",
    "Endless Staircase Track 4 1x5",
  ]
);

console.log("battle-map control tests passed");
