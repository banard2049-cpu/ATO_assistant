// Shared adversary movement and spawn rules for the map and dashboard.
(function () {
"use strict";
const c1AlternateTileConnections = {
  "009": { up: "004", right: "010", down: "014", left: "008" },
  "013": { up: "008", right: "", down: "", left: "012" },
  "014": { up: "009", right: "015", down: "019", left: "" },
  "018": { up: "", right: "019", down: "", left: "017" },
  "022": { up: "017", right: "023", down: "027", left: "021" },
  "023": { up: "", right: "024", down: "", left: "022" },
  "035": { up: "030", right: "071", down: "040", left: "034" },
};

function displayLayout(cycle) {
  const tileWidth = cycle.tileWidth || 1;
  if (cycle.id === "c1") {
    const positions = c1NeighborLayout(cycle);
    return {
      tileWidth,
      width: positions.width,
      height: positions.height,
      position: (tile) => positions.byId.get(tile.id) || { x: 0, y: 0 },
    };
  }

  if (cycle.id !== "c3") {
    return {
      tileWidth,
      width: cycle.width || tileWidth,
      height: cycle.height || tileWidth,
      position: (tile) => ({ x: tile.nx || 0, y: tile.ny || 0 }),
    };
  }

  const positions = cyclePhysicalLayout(cycle);
  return {
    tileWidth,
    width: positions.width,
    height: positions.height,
    position: (tile) => positions.byId.get(tile.id) || { x: 0, y: 0 },
  };
}

function c1NeighborLayout(cycle) {
  const numberedTiles = cycle.tiles.filter((tile) => /^\d{3}$/.test(tile.id));
  const terrainTiles = cycle.tiles.filter((tile) => /^T\d{2}$/.test(tile.id));
  const mainLayout = connectedTileLayout(numberedTiles);
  const terrainLayout = connectedTileLayout(terrainTiles);
  const byIdPosition = new Map();

  mainLayout.byId.forEach((position, id) => {
    byIdPosition.set(id, position);
  });
  terrainLayout.byId.forEach((position, id) => {
    byIdPosition.set(id, {
      x: position.x,
      y: mainLayout.height + 1 + position.y,
    });
  });

  return {
    byId: byIdPosition,
    width: Math.max(mainLayout.width, terrainLayout.width),
    height: mainLayout.height + 1 + terrainLayout.height,
  };
}

function connectedTileLayout(tiles) {
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  const positions = new Map();
  const sortedIds = [...byId.keys()].sort((a, b) => a.localeCompare(b));
  const queue = sortedIds.length ? [sortedIds[0]] : [];
  const directions = {
    right: [1, 0],
    left: [-1, 0],
    down: [0, 1],
    up: [0, -1],
  };

  if (queue.length) positions.set(queue[0], { x: 0, y: 0 });
  while (queue.length) {
    const id = queue.shift();
    const tile = byId.get(id);
    const position = positions.get(id);
    Object.entries(directions).forEach(([direction, [dx, dy]]) => {
      const targetId = tile?.neighbors?.[direction];
      if (!targetId || targetId === id || !byId.has(targetId) || positions.has(targetId)) return;
      positions.set(targetId, { x: position.x + dx, y: position.y + dy });
      queue.push(targetId);
    });
    byId.forEach((candidate) => {
      Object.entries(directions).forEach(([direction, [dx, dy]]) => {
        if (candidate.id === id || candidate.neighbors?.[direction] !== id || positions.has(candidate.id)) return;
        positions.set(candidate.id, { x: position.x - dx, y: position.y - dy });
        queue.push(candidate.id);
      });
    });
  }

  const points = [...positions.values()];
  const minX = Math.min(...points.map((point) => point.x), 0);
  const minY = Math.min(...points.map((point) => point.y), 0);
  const maxX = Math.max(...points.map((point) => point.x), 0);
  const maxY = Math.max(...points.map((point) => point.y), 0);
  const normalized = new Map();
  positions.forEach((position, id) => {
    normalized.set(id, { x: position.x - minX, y: position.y - minY });
  });

  return {
    byId: normalized,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function cyclePhysicalLayout(cycle) {
  const byId = new Map(cycle.tiles.map((tile) => [tile.id, tile]));
  const localPositions = new Map();
  const components = [];
  const directions = {
    right: [1, 0],
    left: [-1, 0],
    down: [0, 1],
    up: [0, -1],
  };

  cycle.tiles.forEach((start) => {
    if (localPositions.has(start.id)) return;
    const component = [];
    const queue = [start.id];
    localPositions.set(start.id, { x: 0, y: 0 });

    while (queue.length) {
      const id = queue.shift();
      const tile = byId.get(id);
      const position = localPositions.get(id);
      component.push(id);

      Object.entries(directions).forEach(([direction, [dx, dy]]) => {
        const targetId = tile?.neighbors?.[direction];
        if (!targetId || !byId.has(targetId) || localPositions.has(targetId)) return;
        localPositions.set(targetId, { x: position.x + dx, y: position.y + dy });
        queue.push(targetId);
      });
    }

    components.push(component);
  });

  if (cycle.id === "c3") {
    const fixedPlacements = [
      { anchor: "034", x: 5, y: 7 },
      { anchor: "067", x: 7, y: 0 },
      { anchor: "008", x: 0, y: 1 },
      { anchor: "079", x: 0, y: 8 },
      { anchor: "065", x: 12, y: 0 },
      { anchor: "333", x: 7, y: 6 },
    ];
    const byIdPosition = new Map();
    components.forEach((component) => {
      const points = component.map((id) => localPositions.get(id));
      const minX = Math.min(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const placement = fixedPlacements.find((item) => component.includes(item.anchor)) || { x: 0, y: 0 };
      component.forEach((id) => {
        const point = localPositions.get(id);
        byIdPosition.set(id, {
          x: placement.x + point.x - minX,
          y: placement.y + point.y - minY,
        });
      });
    });
    return { byId: byIdPosition, width: 15, height: 13 };
  }

  const byIdPosition = new Map();
  const gap = 1;
  const maxRowWidth = 18;
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let width = 1;
  let height = 1;

  components.forEach((component) => {
    const points = component.map((id) => localPositions.get(id));
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;

    if (cursorX > 0 && cursorX + componentWidth > maxRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }

    component.forEach((id) => {
      const point = localPositions.get(id);
      const x = cursorX + point.x - minX;
      const y = cursorY + point.y - minY;
      byIdPosition.set(id, { x, y });
      width = Math.max(width, x + 1);
      height = Math.max(height, y + 1);
    });

    cursorX += componentWidth + gap;
    rowHeight = Math.max(rowHeight, componentHeight);
  });

  return { byId: byIdPosition, width, height };
}


function isAlternate(cycle, cycleState, tileId) {
  return cycle.id === "c1" && cycleState.tileVariants?.[tileId] === "alternate";
}
function effectiveTile(cycle, cycleState, tile) {
  const connections = isAlternate(cycle, cycleState, tile.id) ? c1AlternateTileConnections[tile.id] : null;
  if (!connections) return tile;
  const exits = {};
  if (connections.up) exits.TOP_MIDDLE = connections.up;
  if (connections.right) exits.RIGHT_MIDDLE = connections.right;
  if (connections.down) exits.BOTTOM_MIDDLE = connections.down;
  if (connections.left) exits.LEFT_MIDDLE = connections.left;
  return { ...tile, neighbors: { ...connections, special: "" }, exits };
}
function isFaceUp(cycleState, id) {
  const markers = cycleState.tokens?.markers?.[id] || {};
  return Boolean(cycleState.explored?.[id] || cycleState.previewRevealed?.[id]
    || markers.hs || markers.ENGIN || markers.night_nymph);
}
function placedTiles(cycle, cycleState) {
  return cycle.tiles.filter((tile) => isFaceUp(cycleState, tile.id) || tile.id === cycleState.tokens?.AD)
    .map((tile) => effectiveTile(cycle, cycleState, tile));
}
function connectsTo(tile, targetId) {
  return ["left", "right", "up", "down"].some((direction) => tile.neighbors?.[direction] === targetId)
    || Object.values(tile.exits || {}).includes(targetId);
}
function connectsBack(tile, targetId) {
  return ["left", "right", "up", "down"].some((direction) => tile.neighbors?.[direction] === targetId)
    || Object.entries(tile.exits || {}).some(([exit, destination]) =>
      !String(exit).startsWith("SPECIAL_CYCLE_3") && destination === targetId);
}
function adjacentTiles(cycle, cycleState, tileId, tiles, layout) {
  const tile = tiles.find((item) => item.id === tileId);
  if (!tile) return [];
  const placedById = new Map(tiles.map((item) => [item.id, item]));
  const adjacentIds = new Set();
  ["left", "right", "up", "down"].forEach((direction) => {
    const targetId = tile.neighbors?.[direction];
    if (targetId && placedById.has(targetId)) adjacentIds.add(targetId);
  });
  Object.values(tile.exits || {}).forEach((targetId) => {
    if (targetId && placedById.has(targetId)) adjacentIds.add(targetId);
  });
  tiles.forEach((candidate) => {
    if (candidate.id === tileId) return;
    const tileConnects = connectsTo(tile, candidate.id);
    const candidateConnects = connectsBack(candidate, tile.id);
    const variantAllowsConnection = (!isAlternate(cycle, cycleState, tile.id) || tileConnects)
      && (!isAlternate(cycle, cycleState, candidate.id) || candidateConnects);
    const a = layout.position(tile);
    const b = layout.position(candidate);
    const physicallyAdjacent = Math.abs(Number(a.x) - Number(b.x))
      + Math.abs(Number(a.y) - Number(b.y)) === 1;
    if ((tileConnects && variantAllowsConnection)
      || (candidateConnects && variantAllowsConnection) || physicallyAdjacent) adjacentIds.add(candidate.id);
  });
  return [...adjacentIds].map((id) => placedById.get(id)).filter(Boolean);
}
function manhattan(a, b) {
  return Math.abs(Number(a.nx) - Number(b.nx)) + Math.abs(Number(a.ny) - Number(b.ny));
}
function sortOptions(cycle, fromId, targetId, options) {
  const from = cycle.tiles.find((tile) => tile.id === fromId);
  const target = cycle.tiles.find((tile) => tile.id === targetId);
  if (!from || !target) return options;
  return [...options].sort((a, b) => {
    const preferVertical = cycle.id === "c2";
    const aPreferred = preferVertical ? (Number(a.nx) === Number(from.nx) ? 0 : 1)
      : (Number(a.ny) === Number(from.ny) ? 0 : 1);
    const bPreferred = preferVertical ? (Number(b.nx) === Number(from.nx) ? 0 : 1)
      : (Number(b.ny) === Number(from.ny) ? 0 : 1);
    return aPreferred - bPreferred || manhattan(a, target) - manhattan(b, target)
      || a.id.localeCompare(b.id);
  });
}
function shortestPath(cycle, cycleState, startId, targetId, tiles = placedTiles(cycle, cycleState)) {
  if (startId === targetId) return [startId];
  const placedById = new Map(tiles.map((tile) => [tile.id, tile]));
  if (!placedById.has(startId) || !placedById.has(targetId)) return [];
  const layout = displayLayout(cycle);
  const previous = new Map([[startId, ""]]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    const options = sortOptions(cycle, current, targetId,
      adjacentTiles(cycle, cycleState, current, tiles, layout));
    for (const neighbor of options) {
      if (previous.has(neighbor.id)) continue;
      previous.set(neighbor.id, current);
      if (neighbor.id === targetId) {
        const path = [targetId];
        while (previous.get(path[0])) path.unshift(previous.get(path[0]));
        return path;
      }
      queue.push(neighbor.id);
    }
  }
  return [];
}
function spawnCandidates(cycle, cycleState) {
  const targetId = cycleState.currentTile;
  if (!targetId) return [];
  const revealed = cycle.tiles.filter((tile) => cycleState.explored?.[tile.id] || tile.id === targetId)
    .map((tile) => effectiveTile(cycle, cycleState, tile));
  return revealed.filter((tile) => tile.id !== targetId && cycleState.explored?.[tile.id])
    .filter((tile) => shortestPath(cycle, cycleState, targetId, tile.id, revealed).length === 5);
}
window.ATO_NEMESIS_PATH = { displayLayout, effectiveTile, shortestPath, spawnCandidates, c1AlternateTileConnections };
})();
