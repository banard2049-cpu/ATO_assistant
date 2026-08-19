/*
 * battle_los.js — Line-of-sight (视线 / LoS) engine for the aibp battle map.
 *
 * Implements the rulebook's P38 LoS rules. A source unit (Titan = 1 cell,
 * Apostle = 2×2 or 3×3 cells) has LoS to a target cell if AT LEAST ONE line
 * drawn from any corner of the source's cells to any corner of the target cell
 * is not blocked. A line is blocked when it:
 *   (1) passes through the interior of an Obscuring tile, or crosses a red wall;
 *   (2) runs collinear with the edge of an Obscuring tile or a red wall;
 *   (4) passes through the shared corner of two diagonally-adjacent Obscuring
 *       tiles / red walls (a diagonal "pinch").
 * Merely clipping a single corner point (3) does NOT block.
 *
 * Exemptions: models never block each other; the Obscuring tile a unit stands
 * ON does not block that unit's own lines (so source and target cells are
 * exempt from Obscuring blocking).
 *
 * Geometry uses an integer "corner lattice": board cell (column c, row r)
 * occupies the unit square with corners (c-1, r-1) .. (c, r). Lattice indices
 * i in 0..COLUMNS, j in 0..ROWS. All source/target corners and red-wall edges
 * fall on integer lattice points, so the math is exact.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BattleLOS = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  const COLUMNS = 20;
  const ROWS = 14;

  const edgeKey = (i0, j0, i1, j1) =>
    i0 < i1 || (i0 === i1 && j0 <= j1)
      ? `${i0},${j0}|${i1},${j1}`
      : `${i1},${j1}|${i0},${j0}`;
  const cellKey = (c, r) => `${c},${r}`;

  // ---- tile transform --------------------------------------------------
  // Rotation matches the renderer: visible angle = (rotation - 180)°, applied
  // as a CSS rotate (clockwise on screen). In board coordinates (y up) that is
  // a counter-clockwise rotation by β = (rotation - 180). Flip mirrors x.
  const QUARTER = {
    // β (mod 360) -> [cos, sin] with y-up (CCW positive)
    0: [1, 0],
    90: [0, 1],
    180: [-1, 0],
    270: [0, -1],
  };

  function normAngle(deg) {
    return ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  }

  // Footprint size after rotation (quarter turns swap width/height).
  function footprintSize(width, height, rotation) {
    return normAngle(rotation) % 180 === 90
      ? { width: height, height: width }
      : { width, height };
  }

  // Transform a local tile-frame point (lx, ly) — origin at bottom-left of the
  // catalog width×height footprint, x right, y up — into board coordinates,
  // then to corner-lattice indices. `placement` has {column,row,rotation,
  // flipped}; catalog {width,height} is the un-rotated footprint.
  function localPointToLattice(lx, ly, width, height, placement) {
    const rot = normAngle(placement.rotation != null ? placement.rotation : 180);
    const beta = ((rot - 180) % 360 + 360) % 360;
    const [cos, sin] = QUARTER[beta];
    // Center the local point about the footprint center.
    let cx = lx - width / 2;
    let cy = ly - height / 2;
    if (placement.flipped) cx = -cx; // mirror x
    // Rotate (CCW, y-up).
    const rx = cx * cos - cy * sin;
    const ry = cx * sin + cy * cos;
    // Board center of the tile is (column, row); board cell centers are at
    // integer coords, cell corners at half-integers. Lattice index = board+0.5
    // shifted so corner (i,j) sits at board (i+0.5, j+0.5): i = boardX - 0.5.
    const boardX = placement.column + rx;
    const boardY = placement.row + ry;
    const i = boardX - 0.5;
    const j = boardY - 0.5;
    return { i: Math.round(i), j: Math.round(j) };
  }

  // Transform a local tile-frame CELL (lx,ly = the cell's bottom-left corner in
  // the un-rotated width×height footprint) into a board cell {c,r}. Same rotation
  // /flip math as localPointToLattice, but maps the cell CENTER (lx+0.5,ly+0.5)
  // to a board column/row. Used to place a Labyrinth's real (possibly L/Z-shaped)
  // footprint — not its bounding rectangle.
  function localCellToBoard(lx, ly, width, height, placement) {
    const rot = normAngle(placement.rotation != null ? placement.rotation : 180);
    const beta = ((rot - 180) % 360 + 360) % 360;
    const [cos, sin] = QUARTER[beta];
    let cx = (lx + 0.5) - width / 2;
    let cy = (ly + 0.5) - height / 2;
    if (placement.flipped) cx = -cx; // mirror x
    const rx = cx * cos - cy * sin;
    const ry = cx * sin + cy * cos;
    return { c: Math.round(placement.column + rx), r: Math.round(placement.row + ry) };
  }

  // ---- occluders --------------------------------------------------------
  // Real footprint cells of a placement: if the tile carries a `cells` shape
  // (local coords, for L/Z tetromino tiles), map each cell through the rotation
  // /flip transform; otherwise fall back to the full bounding rectangle. This is
  // the single source of truth for which board cells a tile actually covers.
  function footprintCells(placement, width, height, shape) {
    if (shape && shape.length) {
      const out = [];
      shape.forEach(([lx, ly]) => {
        const { c, r } = localCellToBoard(lx, ly, width, height, placement);
        if (c >= 1 && c <= COLUMNS && r >= 1 && r <= ROWS) out.push({ c, r });
      });
      return out;
    }
    return occupiedCells(placement, width, height);
  }

  // Board cells occupied by a placement (integer column/row centers).
  function occupiedCells(placement, width, height) {
    const size = footprintSize(width, height, placement.rotation != null ? placement.rotation : 180);
    const cells = [];
    const c0 = placement.column - (size.width - 1) / 2;
    const r0 = placement.row - (size.height - 1) / 2;
    for (let dx = 0; dx < size.width; dx++) {
      for (let dy = 0; dy < size.height; dy++) {
        const c = Math.round(c0 + dx);
        const r = Math.round(r0 + dy);
        if (c >= 1 && c <= COLUMNS && r >= 1 && r <= ROWS) cells.push({ c, r });
      }
    }
    return cells;
  }

  // Build the occluder model from a battle map's terrain list. `terrain` is an
  // array of placements; catalog/getTileLosData come from BattleTerrain.
  function buildOccluders(terrain, terrainApi) {
    const obscuring = new Set(); // cellKey
    const red = new Set();       // edgeKey
    // Per-tile bookkeeping so the P38 exemption can be applied by whole tile
    // (a unit on any cell of an obscuring tile is not blocked by that tile).
    const cellTile = new Map();  // cellKey -> tileId
    const tileCells = new Map(); // tileId -> [cellKey]
    // Cloud 云层 tiles keep their Obscuring keyword against an Elevated source
    // (they sit at the same altitude as high ground), so track them separately.
    const cloud = new Set();     // cellKey, obscuring cells belonging to Cloud tiles
    const elevated = new Set();  // cellKey, cells of Elevated (高地) tiles
    // 大迷宫板块，供 MAZESENSE 迷宫感应整块剥除。今天只有大迷宫带红线，所以 mazesense
    // 下 red 会被清空；仍按板块记录，将来若有别的板块带红线也不会误伤。
    const labyrinthTiles = new Set(); // tileId
    const labyrinthRed = new Set();   // edgeKey
    // 大迷宫脚印格（含 O 形中间的空洞）。两端都在迷宫外时，整块脚印按遮蔽地形处理。
    const labyrinthCells = new Set(); // cellKey
    const api = terrainApi || (typeof window !== "undefined" ? window.BattleTerrain : null);
    (terrain || []).forEach((placement, tileId) => {
      const def = api && api.catalog ? api.catalog[placement.name] : null;
      if (!def) return;
      const los = api.getTileLosData ? api.getTileLosData(placement) : (def.los || {});
      // 实际占格：有 los.cells 形状（L/Z 四联骨牌）就按真实形状，否则用矩形包围盒。
      // 遮蔽/高地/大迷宫三条路径共用同一份脚印，L/Z 不再被当成 3×2 矩形。
      const shape = los.cells || (def.los && def.los.cells);
      const cells = footprintCells(placement, def.width, def.height, shape);
      if (los.obscuring) {
        const keys = [];
        cells.forEach(({ c, r }) => {
          const k = cellKey(c, r);
          obscuring.add(k);
          cellTile.set(k, tileId);
          keys.push(k);
          if (los.cloud) cloud.add(k);
        });
        tileCells.set(tileId, keys);
      }
      if (los.elevated) {
        cells.forEach(({ c, r }) => elevated.add(cellKey(c, r)));
      }
      const isLabyrinth = los.labyrinth || (def.los && def.los.labyrinth);
      if (isLabyrinth) {
        labyrinthTiles.add(tileId);
        cells.forEach(({ c, r }) => labyrinthCells.add(cellKey(c, r)));
      }
      const redLines = los.redLines || (def.los && def.los.redLines);
      if (redLines) {
        redLines.forEach(([lx0, ly0, lx1, ly1]) => {
          const p0 = localPointToLattice(lx0, ly0, def.width, def.height, placement);
          const p1 = localPointToLattice(lx1, ly1, def.width, def.height, placement);
          const k = edgeKey(p0.i, p0.j, p1.i, p1.j);
          red.add(k);
          if (isLabyrinth) labyrinthRed.add(k);
        });
      }
    });
    // 大迷宫「向外延伸一格」外扩格(临时墙)。规则(用户 2026-08-19 手绘敲定,逐格验证)：
    // 对每一条大迷宫红墙(单位边),看它两侧两格——恰好一侧是"可进入的走廊格"、另一侧不是,
    // 则"另一侧"那格成为外扩格。等价于把红墙朝非走廊侧膨胀一格。
    //  · 可进入走廊格 = 大迷宫脚印格里,四条边未被红墙完全封死的格(O 形螺旋死格四面红墙→不可进入)。
    //  · 死格本身会被标为外扩格(它是相邻走廊格红墙的非走廊侧),但它自己四面都朝走廊→不再外扩。
    //  · 外扩格仅在"视线一端落在走廊格"时才生效,见 hasLOS。
    const expandCells = computeExpandCells(labyrinthRed, labyrinthCells);
    return {
      obscuring, red, walls: mergeWalls(red), cellTile, tileCells, cloud, elevated,
      labyrinthTiles, labyrinthRed, labyrinthCells, expandCells,
    };
  }

  // 一条红边(lattice 边 key)两侧的两个板格 {c,r}。
  // 水平边 "i,j|i+1,j": 分隔下格 (i+1, j) 与上格 (i+1, j+1)。
  // 垂直边 "i,j|i,j+1": 分隔左格 (i, j+1) 与右格 (i+1, j+1)。
  function edgeNeighborCells(key) {
    const [a, b] = key.split("|");
    const [i0, j0] = a.split(",").map(Number);
    const [i1, j1] = b.split(",").map(Number);
    if (j0 === j1) {                 // horizontal edge at y=j0
      const i = Math.min(i0, i1), j = j0;
      return [{ c: i + 1, r: j }, { c: i + 1, r: j + 1 }];
    }
    const i = i0, j = Math.min(j0, j1); // vertical edge at x=i0
    return [{ c: i, r: j + 1 }, { c: i + 1, r: j + 1 }];
  }

  // 大迷宫外扩格集合。见 buildOccluders 里的说明。
  function computeExpandCells(labyrinthRed, labyrinthCells) {
    const expand = new Set();
    if (!labyrinthRed || !labyrinthRed.size) return expand;
    // 可进入走廊格：脚印格里,四条边未被红墙全封死的。
    const enter = new Set();
    labyrinthCells.forEach((k) => {
      const [c, r] = k.split(",").map(Number);
      const bottom = edgeKey(c - 1, r - 1, c, r - 1);
      const top = edgeKey(c - 1, r, c, r);
      const left = edgeKey(c - 1, r - 1, c - 1, r);
      const right = edgeKey(c, r - 1, c, r);
      const sealed = labyrinthRed.has(bottom) && labyrinthRed.has(top)
        && labyrinthRed.has(left) && labyrinthRed.has(right);
      if (!sealed) enter.add(k);
    });
    const inBoard = (c, r) => c >= 1 && c <= COLUMNS && r >= 1 && r <= ROWS;
    labyrinthRed.forEach((key) => {
      const [a, b] = edgeNeighborCells(key);
      const ain = enter.has(cellKey(a.c, a.r));
      const bin = enter.has(cellKey(b.c, b.r));
      if (ain && !bin && inBoard(b.c, b.r)) expand.add(cellKey(b.c, b.r));
      else if (bin && !ain && inBoard(a.c, a.r)) expand.add(cellKey(a.c, a.r));
    });
    return expand;
  }

  // Merge unit red edges into maximal straight wall segments so that a point
  // interior to a continuous wall is not mistaken for a wall endpoint.
  function mergeWalls(redSet) {
    const hEdges = new Map(); // y -> Set of x0 (edge x0..x0+1)
    const vEdges = new Map(); // x -> Set of y0 (edge y0..y0+1)
    redSet.forEach((key) => {
      const [a, b] = key.split("|");
      const [i0, j0] = a.split(",").map(Number);
      const [i1, j1] = b.split(",").map(Number);
      if (j0 === j1) { // horizontal
        const y = j0, x0 = Math.min(i0, i1);
        if (!hEdges.has(y)) hEdges.set(y, new Set());
        hEdges.get(y).add(x0);
      } else { // vertical
        const x = i0, y0 = Math.min(j0, j1);
        if (!vEdges.has(x)) vEdges.set(x, new Set());
        vEdges.get(x).add(y0);
      }
    });
    const h = [], v = [];
    hEdges.forEach((xs, y) => {
      const arr = [...xs].sort((a, b) => a - b);
      let s = arr[0], p = arr[0];
      for (let k = 1; k <= arr.length; k++) {
        if (k < arr.length && arr[k] === p + 1) { p = arr[k]; continue; }
        h.push({ y, x0: s, x1: p + 1 });
        if (k < arr.length) { s = arr[k]; p = arr[k]; }
      }
    });
    vEdges.forEach((ys, x) => {
      const arr = [...ys].sort((a, b) => a - b);
      let s = arr[0], p = arr[0];
      for (let k = 1; k <= arr.length; k++) {
        if (k < arr.length && arr[k] === p + 1) { p = arr[k]; continue; }
        v.push({ x, y0: s, y1: p + 1 });
        if (k < arr.length) { s = arr[k]; p = arr[k]; }
      }
    });
    return { h, v };
  }

  // Which side of a wall line does a board cell lie on? Cell (c,r) spans lattice
  // x in [c-1,c] and y in [r-1,r], so a cell never straddles a lattice line: it
  // is wholly below/above (horizontal wall) or left/right (vertical wall), and
  // returns 0 only if the wall line runs along the far edge in the other axis.
  //   axis "h": wall at y = value  ->  -1 = cell below, +1 = cell above
  //   axis "v": wall at x = value  ->  -1 = cell left,  +1 = cell right
  function wallSide(cell, axis, value) {
    const hi = axis === "h" ? cell.r : cell.c;   // cell's upper lattice bound
    if (hi <= value) return -1;
    if (hi - 1 >= value) return 1;
    return 0; // impossible for integer cells, kept for safety
  }

  // 大迷宫红线遮挡视野（唯一的红线规则，用户 2026-08-19）：
  // 红线本体**及其端点**都遮挡视线——任何落在红墙线段闭区间 [x0,x1] / [y0,y1] 内的
  // 交点（含正好压在墙头端点上）都算被挡。要绕过一堵墙，交点必须落在墙段之外（真的从
  // 墙头外面绕过去）。共线重叠（正长度）也挡。红线永不豁免（唯一例外是迷宫感应，在
  // 上游把红线整块剥掉）。
  //
  // 唯一的几何细节 `straddles`（**不是**额外规则，是正确性所必需）：单位站在走廊格里
  // 时，该格的角点恰好落在墙线上，交点参数 t 会等于 0 或 1。这时靠一条线段分不出这是
  // 「贴着墙沿走廊看」（同侧、不该自己挡自己）还是「从墙上出发穿到另一侧」（该挡）。
  // 于是由调用方传入这条视线所属的源格与目标格 `pair`：只有两格严格分处墙线两侧
  // (straddles) 才把端点交点算作穿越。线段内部(0<t<1)的交点无此歧义，一律挡。
  function redBlocks(ai, aj, bi, bj, occ, pair) {
    const walls = occ.walls || { h: [], v: [] };
    const di = bi - ai, dj = bj - aj;
    // 两格是否严格分处墙线两侧？没有 pair 时退回「端点不算穿越」。
    const straddles = (axis, value) => {
      if (!pair) return false;
      const a = wallSide(pair.source, axis, value);
      const b = wallSide(pair.target, axis, value);
      return a !== 0 && b !== 0 && a !== b;
    };
    // horizontal walls y=Y, x in [x0,x1]
    for (const w of walls.h) {
      if (dj === 0) {
        if (aj === w.y) { // collinear: overlap on x
          const lo = Math.min(ai, bi), hi = Math.max(ai, bi);
          const ov = Math.min(hi, w.x1) - Math.max(lo, w.x0);
          if (ov > 0) return true;
        }
        continue;
      }
      const t = (w.y - aj) / dj;
      if (t < 0 || t > 1) continue;
      // 交点压在视线自身端点(t=0/1)上：只有源/目标严格分处墙线两侧才算穿越，否则是
      // 沿墙走（同侧），不挡。线段内部的交点无歧义。
      if ((t === 0 || t === 1) && !straddles("h", w.y)) continue;
      const x = ai + di * t;
      if (x < w.x0 || x > w.x1) continue;   // 完全在墙段之外 → 绕过去了
      return true;                          // 段内(含端点)一律挡
    }
    // vertical walls x=X, y in [y0,y1]
    for (const w of walls.v) {
      if (di === 0) {
        if (ai === w.x) {
          const lo = Math.min(aj, bj), hi = Math.max(aj, bj);
          const ov = Math.min(hi, w.y1) - Math.max(lo, w.y0);
          if (ov > 0) return true;
        }
        continue;
      }
      const t = (w.x - ai) / di;
      if (t < 0 || t > 1) continue;
      if ((t === 0 || t === 1) && !straddles("v", w.x)) continue;
      const y = aj + dj * t;
      if (y < w.y0 || y > w.y1) continue;
      return true;
    }
    return false;
  }

  const hasObscuring = (occ, c, r) => occ.obscuring.has(cellKey(c, r));
  const hasRed = (occ, i0, j0, i1, j1) => occ.red.has(edgeKey(i0, j0, i1, j1));

  // ---- segment blocking core -------------------------------------------
  // `pair` (optional) = {source, target} board cells this corner line belongs to.
  // Only redBlocks needs it, to tell "starts on the wall and crosses" apart from
  // "starts on the wall and runs alongside it".
  function segmentBlocked(ai, aj, bi, bj, occ, exempt, pair) {
    const di = bi - ai, dj = bj - aj;
    if (di === 0 && dj === 0) return true; // degenerate: not a valid sight line
    // Red walls (any orientation) — maximal-segment crossing test.
    if (redBlocks(ai, aj, bi, bj, occ, pair)) return true;
    if (di === 0 || dj === 0) {
      return axisBlocked(ai, aj, bi, bj, occ, exempt);
    }
    const steps = gatherCrossings(ai, aj, di, dj);
    // (1) interior obscuring cells: sample each sub-interval midpoint.
    for (let k = 0; k < steps.length - 1; k++) {
      const tm = (steps[k] + steps[k + 1]) / 2;
      const c = Math.floor(ai + di * tm); // lattice cell x
      const r = Math.floor(aj + dj * tm); // lattice cell y
      if (hasObscuring(occ, c + 1, r + 1) && !exempt(c + 1, r + 1)) return true;
    }
    // (2) diagonal pinch at every lattice point on the segment, **端点也算**。
    // 这里原来是 k=1..length-2（只查内部格点），漏掉了 t=0 / t=1。但重合顶点常常
    // 正好是源格或目标格自己的角：源在缝的一侧、目标在另一侧时，连接两者的那条角线
    // 就是从这个顶点出发（t=0）或到这个顶点结束（t=1）的，于是 rule 4 被跳过，
    // 视线漏了过去。用户 2026-08-18 指出：「视线经过了两个遮蔽地形的重合顶点，
    // 则认为视线被阻断」——经过就算，不区分是端点还是中途。
    // 不需要 redBlocks 那样的 straddles 门控：斜线穿过一个顶点没有「沿着走」的
    // 歧义，且 pinchBlocked 已按 di*dj 的符号挑对应的那条闭合对角。
    for (let k = 0; k < steps.length; k++) {
      const t = steps[k];
      const x = ai + di * t, y = aj + dj * t;
      if (Number.isInteger(x) && Number.isInteger(y)) {
        if (pinchBlocked(x, y, di, dj, occ, exempt)) return true;
      }
    }
    // (3) red walls crossed transversally.
    if (redCrossed(ai, aj, di, dj, steps, occ)) return true;
    return false;
  }

  // Collect sorted unique crossing parameters t in [0,1] where the segment
  // crosses a vertical (x integer) or horizontal (y integer) grid line.
  function gatherCrossings(ai, aj, di, dj) {
    const ts = new Set([0, 1]);
    const addRange = (start, delta, add) => {
      if (delta === 0) return;
      const lo = Math.min(start, start + delta);
      const hi = Math.max(start, start + delta);
      for (let v = Math.ceil(lo); v <= Math.floor(hi); v++) {
        const t = (v - start) / delta;
        if (t > 0 && t < 1) add(t);
      }
    };
    addRange(ai, di, (t) => ts.add(t));
    addRange(aj, dj, (t) => ts.add(t));
    return Array.from(ts).sort((a, b) => a - b);
  }

  // Diagonal pinch at interior lattice point (x,y): the segment squeezes
  // between the two cells on the "closed" diagonal. For a segment heading
  // up-right or down-left (di*dj > 0) the closed pair is top-left + bottom-right
  // of the corner; for up-left / down-right (di*dj < 0) it is bottom-left +
  // top-right. Blocked if BOTH cells are obscuring (non-exempt), or if the two
  // red edges forming that corner are both present.
  function pinchBlocked(x, y, di, dj, occ, exempt) {
    // Cells meeting at corner (x,y): board columns x and x+1, rows y and y+1.
    const cLeft = x, cRight = x + 1, rBot = y, rTop = y + 1;
    let a, b, ea, eb;
    if (di * dj > 0) {
      // closed pair = top-left & bottom-right
      a = { c: cLeft, r: rTop }; b = { c: cRight, r: rBot };
      // red edges forming the TL/BR corner gap:
      // top-left cell's bottom+right meet, i.e. edges around (x,y):
      ea = [x - 1, y, x, y];       // horizontal edge left of corner (TL bottom)
      eb = [x, y, x, y + 1];       // vertical edge above corner (TL right)
    } else {
      // closed pair = bottom-left & top-right
      a = { c: cLeft, r: rBot }; b = { c: cRight, r: rTop };
      ea = [x, y - 1, x, y];       // vertical edge below corner
      eb = [x, y, x + 1, y];       // horizontal edge right of corner
    }
    const obsc =
      hasObscuring(occ, a.c, a.r) && !exempt(a.c, a.r) &&
      hasObscuring(occ, b.c, b.r) && !exempt(b.c, b.r);
    if (obsc) return true;
    const redPinch =
      hasRed(occ, ea[0], ea[1], ea[2], ea[3]) &&
      hasRed(occ, eb[0], eb[1], eb[2], eb[3]);
    return redPinch;
  }

  // Axis-aligned segment along a grid line: blocked if a red wall lies on any
  // unit edge it covers, or an obscuring (non-exempt) cell touches that line.
  function axisBlocked(ai, aj, bi, bj, occ, exempt) {
    if (aj === bj) { // horizontal along y = aj
      const j = aj;
      const lo = Math.min(ai, bi), hi = Math.max(ai, bi);
      for (let i = lo; i < hi; i++) {
        if (hasRed(occ, i, j, i + 1, j)) return true;
        // cells above (col i+1,row j+1) and below (col i+1,row j)
        const cAbove = { c: i + 1, r: j + 1 };
        const cBelow = { c: i + 1, r: j };
        if (hasObscuring(occ, cAbove.c, cAbove.r) && !exempt(cAbove.c, cAbove.r)) return true;
        if (hasObscuring(occ, cBelow.c, cBelow.r) && !exempt(cBelow.c, cBelow.r)) return true;
      }
    } else { // vertical along x = ai
      const i = ai;
      const lo = Math.min(aj, bj), hi = Math.max(aj, bj);
      for (let j = lo; j < hi; j++) {
        if (hasRed(occ, i, j, i, j + 1)) return true;
        const cRight = { c: i + 1, r: j + 1 };
        const cLeft = { c: i, r: j + 1 };
        if (hasObscuring(occ, cRight.c, cRight.r) && !exempt(cRight.c, cRight.r)) return true;
        if (hasObscuring(occ, cLeft.c, cLeft.r) && !exempt(cLeft.c, cLeft.r)) return true;
      }
    }
    return false;
  }

  // Red wall crossed transversally: for each sub-interval the diagonal passes
  // from one cell to an edge-adjacent cell; if that shared unit edge is red,
  // the line is blocked. We detect a shared edge when consecutive crossing
  // midpoints differ by exactly one cell in x or y (not a pure corner step).
  function redCrossed(ai, aj, di, dj, steps, occ) {
    for (let k = 0; k < steps.length - 1; k++) {
      const tm0 = (steps[k] + steps[k + 1]) / 2;
      const c0 = { c: Math.floor(ai + di * tm0), r: Math.floor(aj + dj * tm0) };
      if (k + 2 > steps.length - 1) break;
      const tm1 = (steps[k + 1] + steps[k + 2]) / 2;
      const c1 = { c: Math.floor(ai + di * tm1), r: Math.floor(aj + dj * tm1) };
      const t = steps[k + 1];
      const x = ai + di * t, y = aj + dj * t;
      const dc = c1.c - c0.c, dr = c1.r - c0.r;
      if (dc !== 0 && dr === 0 && Number.isInteger(x)) {
        // vertical edge crossed at x, spanning y in [floor,ceil]
        const jj = Math.floor(y);
        if (hasRed(occ, x, jj, x, jj + 1)) return true;
      } else if (dr !== 0 && dc === 0 && Number.isInteger(y)) {
        const ii = Math.floor(x);
        if (hasRed(occ, ii, y, ii + 1, y)) return true;
      }
    }
    return false;
  }

  // ---- public LoS API ---------------------------------------------------
  // Corners of a set of board cells (integer lattice points), de-duplicated.
  function cornersOf(cells) {
    const set = new Map();
    cells.forEach(({ c, r }) => {
      [[c - 1, r - 1], [c, r - 1], [c - 1, r], [c, r]].forEach(([i, j]) => {
        set.set(`${i},${j}`, { i, j });
      });
    });
    return Array.from(set.values());
  }

  const EMPTY_WALLS = { h: [], v: [] };

  // Derive the occluder model an Elevated (高地) source sees: every ordinary
  // tile's Obscuring/Obstacle and every red wall is ignored, but Cloud 云层
  // tiles keep their Obscuring keyword ("此地形板块不受其他高地地形板块影响"),
  // because a cloud sits at the same altitude as high ground.
  function elevatedOcc(occ) {
    const cloud = (occ && occ.cloud) || new Set();
    if (!cloud.size) {
      return { obscuring: new Set(), red: new Set(), walls: EMPTY_WALLS,
               cellTile: new Map(), tileCells: new Map(), cloud, elevated: (occ && occ.elevated) || new Set() };
    }
    // Keep only the Cloud tiles' cells and their tile grouping, so the P38
    // "standing on it" exemption still works for a unit inside a cloud.
    const cellTile = new Map();
    const tileCells = new Map();
    cloud.forEach((k) => {
      const id = occ.cellTile ? occ.cellTile.get(k) : undefined;
      if (id === undefined) return;
      cellTile.set(k, id);
      if (!tileCells.has(id)) tileCells.set(id, []);
      tileCells.get(id).push(k);
    });
    return { obscuring: new Set(cloud), red: new Set(), walls: EMPTY_WALLS,
             cellTile, tileCells, cloud, elevated: occ.elevated || new Set() };
  }

  // Derive the occluder model a MAZESENSE 迷宫感应 source sees: the whole 大迷宫
  // 板块 is ignored — both its cells' Obscuring and its red lines — while every
  // other tile blocks as usual. Board text (迷宫机牛 / ALPHA_TEMENOS):
  // 「大迷宫板块不会遮挡…对泰坦的视线」, so the caller is responsible for only
  // enabling this when the target is a Titan.
  function mazesenseOcc(occ) {
    const tiles = (occ && occ.labyrinthTiles) || new Set();
    const labRed = (occ && occ.labyrinthRed) || new Set();
    if (!tiles.size && !labRed.size) return occ;
    const drop = new Set();
    tiles.forEach((id) => {
      const cells = occ.tileCells ? occ.tileCells.get(id) : null;
      if (cells) cells.forEach((k) => drop.add(k));
    });
    const obscuring = new Set();
    (occ.obscuring || new Set()).forEach((k) => { if (!drop.has(k)) obscuring.add(k); });
    const cellTile = new Map();
    const tileCells = new Map();
    (occ.cellTile || new Map()).forEach((id, k) => {
      if (tiles.has(id)) return;
      cellTile.set(k, id);
      if (!tileCells.has(id)) tileCells.set(id, []);
      tileCells.get(id).push(k);
    });
    const cloud = new Set();
    (occ.cloud || new Set()).forEach((k) => { if (!drop.has(k)) cloud.add(k); });
    const red = new Set();
    (occ.red || new Set()).forEach((k) => { if (!labRed.has(k)) red.add(k); });
    return {
      obscuring, red, walls: mergeWalls(red), cellTile, tileCells, cloud,
      elevated: (occ.elevated) || new Set(),
      // 大迷宫已被剥除，别再让下游以为还在。迷宫感应无视临时墙(用户 2026-08-19)。
      labyrinthTiles: new Set(), labyrinthRed: new Set(), labyrinthCells: new Set(),
      expandCells: new Set(),
    };
  }

  // 两个格子都在大迷宫外时，大迷宫整体视作一块遮蔽地形，完全按通用（遮蔽）规则判定
  // （用户 2026-08-19）：红线几何不再适用——从迷宫外看，走廊开口不再漏视线，整块脚印
  // （含 O 形空洞）就是一坨遮蔽物。实现：把大迷宫脚印格并入 obscuring、把大迷宫红线
  // 从 red 中剥掉（其余红线——今天没有——保留）。迷宫格不进 cellTile：两端都在迷宫外，
  // 谁也不站在迷宫上，本就不该豁免。派生模型只用于「两端皆在迷宫外」这一路。
  function labyrinthBlockOcc(occ) {
    const cells = (occ && occ.labyrinthCells) || new Set();
    const labRed = (occ && occ.labyrinthRed) || new Set();
    if (!cells.size) return occ;
    if (occ.__labyrinthBlock) return occ.__labyrinthBlock;
    const obscuring = new Set(occ.obscuring || new Set());
    cells.forEach((k) => obscuring.add(k));
    const red = new Set();
    (occ.red || new Set()).forEach((k) => { if (!labRed.has(k)) red.add(k); });
    const model = {
      obscuring, red, walls: mergeWalls(red),
      cellTile: occ.cellTile || new Map(),
      tileCells: occ.tileCells || new Map(),
      cloud: occ.cloud || new Set(),
      elevated: occ.elevated || new Set(),
      // 迷宫在这个模型里已当作普通遮蔽地形，下游无需再走「迷宫外」分支。
      labyrinthTiles: new Set(), labyrinthRed: new Set(), labyrinthCells: new Set(),
      expandCells: new Set(),
    };
    try { Object.defineProperty(occ, "__labyrinthBlock", { value: model, enumerable: false }); }
    catch (_e) { /* occ 冻结时忽略缓存 */ }
    return model;
  }

  // 视线一端落在大迷宫走廊格时(往里看/往外看),外扩格(临时墙)当作遮蔽地形参与几何判定
  // (用户 2026-08-19)。做法:把 expandCells 并入 obscuring,但**不**进 cellTile/tileCells——
  // 临时墙不是"板块",不享受 P38 整块豁免;不过 hasLOS 里 addUnitExemption 仍会豁免单位
  // 自身所站的那一格(站在临时墙上往外看不被自己那格挡)。红线本体+端点规则照旧生效。
  // 「站在临时墙格 ↔ 迷宫内部格 双向无视线」这条硬规则在 hasLOS 里单独短路,不走几何。
  function labyrinthExpandOcc(occ) {
    const expand = (occ && occ.expandCells) || new Set();
    if (!expand.size) return occ;
    if (occ.__labyrinthExpand) return occ.__labyrinthExpand;
    const obscuring = new Set(occ.obscuring || new Set());
    expand.forEach((k) => obscuring.add(k));
    const model = {
      obscuring, red: occ.red || new Set(), walls: occ.walls || EMPTY_WALLS,
      cellTile: occ.cellTile || new Map(),
      tileCells: occ.tileCells || new Map(),
      cloud: occ.cloud || new Set(),
      elevated: occ.elevated || new Set(),
      labyrinthTiles: occ.labyrinthTiles || new Set(),
      labyrinthRed: occ.labyrinthRed || new Set(),
      labyrinthCells: occ.labyrinthCells || new Set(),
      expandCells: expand,
    };
    try { Object.defineProperty(occ, "__labyrinthExpand", { value: model, enumerable: false }); }
    catch (_e) { /* occ 冻结时忽略缓存 */ }
    return model;
  }

  // Does the source (array of {c,r} cells) have LoS to target cell {c,r}?
  // options.elevated (循环IV+ 高地): the source stands on a high-ground cell, so
  // it ignores every ordinary tile's Obscuring/Obstacle AND all red walls. Cloud
  // 云层 tiles are the exception and still block (see elevatedOcc).
  // options.blindspots: Set of cellKeys that are the apostle's blindspots or
  // vantage points. P39 — 盲点与攀爬点永远都不视作在始徒的视线内 — so these are a
  // hard target-side veto, checked before any geometry and even when the source
  // ignores blocking entirely.
  // options.alwaysLos: the apostle's trait says 忽略视线遮挡规则（即总是有视线）,
  // so nothing on the board blocks it (DAHAKA / DEMIDJINN / MIDASCORE / TITAN_X).
  // options.mazesense (迷宫感应): 大迷宫板块整块不遮挡。Board text scopes this to
  // 对泰坦的视线, so the caller enables it only when the target is a Titan.
  // 红线（大迷宫）：本体及其端点都遮挡视线，永不豁免（除迷宫感应在上游剥离）。
  function hasLOS(sourceCells, target, occ, options) {
    if (options && options.blindspots && options.blindspots.has(cellKey(target.c, target.r))) return false;
    if (options && options.alwaysLos) return true;
    if (options && options.mazesense) occ = mazesenseOcc(occ);
    if (options && options.elevated) occ = elevatedOcc(occ);
    // 两端都在大迷宫外：整块迷宫按遮蔽地形处理，红线几何让位给通用遮蔽规则。
    // （只要源或目标有一格落在迷宫脚印上，就仍走红线本体+端点规则。）
    const labCells = occ.labyrinthCells;
    const expandCells = occ.expandCells;
    if (labCells && labCells.size) {
      const outside = (c, r) => !labCells.has(cellKey(c, r));
      const bothOutside =
        sourceCells.every(({ c, r }) => outside(c, r)) && outside(target.c, target.r);
      if (bothOutside) {
        // 两端都在迷宫外:整块迷宫按遮蔽地形,外扩墙不参与(纯外部视线不受影响)。
        occ = labyrinthBlockOcc(occ);
      } else if (expandCells && expandCells.size) {
        // 视线一端落在走廊格(往里看/往外看)→ 启用这圈外扩临时墙。
        // 硬规则(用户 2026-08-19):站在临时墙格 ↔ 迷宫内部格,双向视为无视线。
        const onExpand = (c, r) => expandCells.has(cellKey(c, r));
        const onInterior = (c, r) => labCells.has(cellKey(c, r));
        const srcOnExpand = sourceCells.some(({ c, r }) => onExpand(c, r));
        const srcOnInterior = sourceCells.some(({ c, r }) => onInterior(c, r));
        const tgtOnExpand = onExpand(target.c, target.r);
        const tgtOnInterior = onInterior(target.c, target.r);
        if ((srcOnExpand && tgtOnInterior) || (tgtOnExpand && srcOnInterior)) return false;
        // 其余情形:临时墙当遮蔽地形并入几何判定。
        occ = labyrinthExpandOcc(occ);
      }
    }
    // P38: a unit standing on an obscuring tile is not blocked by that tile.
    // Exempt the ENTIRE footprint of any obscuring tile the source/target
    // occupies (not merely the cells the unit stands on).
    const exemptSet = new Set();
    const cellTile = occ.cellTile;
    const tileCells = occ.tileCells;
    const addUnitExemption = (c, r) => {
      const k = cellKey(c, r);
      exemptSet.add(k);
      if (cellTile && tileCells && cellTile.has(k)) {
        const cells = tileCells.get(cellTile.get(k));
        if (cells) cells.forEach((ck) => exemptSet.add(ck));
      }
    };
    sourceCells.forEach(({ c, r }) => addUnitExemption(c, r));
    addUnitExemption(target.c, target.r);
    const exempt = (c, r) => exemptSet.has(cellKey(c, r));
    // Corner lines are grouped by the (source cell, target cell) they connect so
    // redBlocks can tell which side of a wall each end stands on. A shared corner
    // between two source cells is tried under each of them, which is what we want:
    // the rulebook draws lines from the unit's corners, and the same corner can be
    // a legal start for one of the unit's cells and a wall-crossing for another.
    const tgtCorners = cornersOf([target]);
    for (const cell of sourceCells) {
      const pair = { source: cell, target };
      for (const s of cornersOf([cell])) {
        for (const t of tgtCorners) {
          if (!segmentBlocked(s.i, s.j, t.i, t.j, occ, exempt, pair)) return true;
        }
      }
    }
    return false;
  }

  // Compute LoS to every board cell. Returns a 2D lookup and a flat list.
  function computeLOSMap(sourceCells, occ, options) {
    const visible = [];
    const grid = {};
    const blindspots = (options && options.blindspots) || null;
    const alwaysLos = !!(options && options.alwaysLos);
    // Derive the stripped occluder models once instead of per cell.
    let model = occ;
    if (options && options.mazesense) model = mazesenseOcc(model);
    if (options && options.elevated) model = elevatedOcc(model);
    for (let c = 1; c <= COLUMNS; c++) {
      for (let r = 1; r <= ROWS; r++) {
        const k = cellKey(c, r);
        const v = blindspots && blindspots.has(k)
          ? false
          : (alwaysLos || hasLOS(sourceCells, { c, r }, model));
        grid[k] = v;
        if (v) visible.push({ c, r });
      }
    }
    return { grid, visible };
  }

  // 射程内的格子 —— "始徒在移动不超过自己移速的格数之内可以抵达并执行攻击的目标"。
  // 距离一律按正交格数算，从不斜向计（P37），而始徒移动可以穿过其他游戏配件（包括
  // 泰坦与地形板块，P38），所以地形不限制射程：射程 = 到脚印任一格的曼哈顿距离
  // ≤ 移速 + 攻击距离。speed = Infinity 时全图都在射程内；speed = 0（不可移动的
  // 巴比伦疯塔）则只剩攻击距离。
  // 每格到来源脚印的正交（曼哈顿）距离，多格来源取各格中的最小值，来源自身为 0。
  // 纯几何距离，不做寻路：始徒可穿过一切配件移动，地形不限制步数。
  function computeDistanceMap(sourceCells) {
    const grid = {};
    for (let c = 1; c <= COLUMNS; c++) {
      for (let r = 1; r <= ROWS; r++) {
        let best = Infinity;
        for (const cell of sourceCells) {
          const d = Math.abs(cell.c - c) + Math.abs(cell.r - r);
          if (d < best) best = d;
        }
        grid[cellKey(c, r)] = best;
      }
    }
    return { grid };
  }

  function computeRangeMap(sourceCells, speed, reach) {
    const move = Number.isFinite(speed) ? Math.max(0, speed) : Infinity;
    const attack = Number.isFinite(reach) ? Math.max(0, reach) : 0;
    const limit = move === Infinity ? Infinity : move + attack;
    const distance = computeDistanceMap(sourceCells).grid;
    const inRange = [];
    const grid = {};
    for (let c = 1; c <= COLUMNS; c++) {
      for (let r = 1; r <= ROWS; r++) {
        const key = cellKey(c, r);
        const v = distance[key] <= limit;
        grid[key] = v;
        if (v) inRange.push({ c, r });
      }
    }
    return { grid, inRange, limit, distance };
  }

  // ---- primordial movement paths ---------------------------------------
  // P38 movement uses orthogonal steps, ignores terrain/models for movement,
  // and zigs/zags between the two axes until the target lies on a straight path.
  function targetCellFromAnchor(anchor) {
    if (!anchor) return null;
    const c = Math.max(1, Math.min(COLUMNS, Math.round(Number(anchor.column))));
    const r = Math.max(1, Math.min(ROWS, Math.round(Number(anchor.row))));
    return Number.isFinite(c) && Number.isFinite(r) ? { c, r } : null;
  }

  function centerKey(center) {
    return `${center.column},${center.row}`;
  }

  function pathKey(centers) {
    return centers.map(centerKey).join(">");
  }

  function facingFromStep(axis, sign) {
    if (axis === "h") return sign > 0 ? 90 : 270;
    return sign > 0 ? 0 : 180;
  }

  function footprintDeltaToTarget(center, size, target) {
    const cells = losSourceCells(center, size);
    if (!cells.length || !target) {
      return { dx: 0, dy: 0, h: 0, v: 0, distance: Infinity, cells };
    }
    const cs = cells.map((cell) => cell.c);
    const rs = cells.map((cell) => cell.r);
    const c0 = Math.min(...cs), c1 = Math.max(...cs);
    const r0 = Math.min(...rs), r1 = Math.max(...rs);
    const dx = target.c < c0 ? target.c - c0 : (target.c > c1 ? target.c - c1 : 0);
    const dy = target.r < r0 ? target.r - r0 : (target.r > r1 ? target.r - r1 : 0);
    return { dx, dy, h: Math.abs(dx), v: Math.abs(dy), distance: Math.abs(dx) + Math.abs(dy), cells };
  }

  function directDeltaToCenter(center, destination) {
    const dx = Math.round((destination?.column || 0) - center.column);
    const dy = Math.round((destination?.row || 0) - center.row);
    return { dx, dy, h: Math.abs(dx), v: Math.abs(dy), distance: Math.abs(dx) + Math.abs(dy) };
  }

  function noMoveFacing(kind, center, size, target, destination, fallback) {
    const delta = kind === "direct"
      ? directDeltaToCenter(center, destination)
      : footprintDeltaToTarget(center, size, target);
    if (delta.h > 0 && delta.v === 0) return facingFromStep("h", Math.sign(delta.dx));
    if (delta.v > 0 && delta.h === 0) return facingFromStep("v", Math.sign(delta.dy));
    return fallback;
  }

  function facingToTargetFromFootprint(center, size, target, fallback) {
    const delta = footprintDeltaToTarget(center, size, target);
    if (delta.h > 0 && delta.v === 0) return facingFromStep("h", Math.sign(delta.dx));
    if (delta.v > 0 && delta.h === 0) return facingFromStep("v", Math.sign(delta.dy));
    return fallback;
  }

  function buildMovementPath({ kind, firstAxis, sourceCenter, size, target, destination, limit, reach, facing }) {
    const centers = [{ column: sourceCenter.column, row: sourceCenter.row }];
    let current = { column: sourceCenter.column, row: sourceCenter.row };
    let nextAxis = firstAxis;
    let steps = 0;
    let lastFacing = null;
    const maxSteps = limit === Infinity ? COLUMNS + ROWS + size : Math.max(0, Math.floor(Number(limit) || 0));
    const stopReach = Math.max(0, Math.floor(Number(reach) || 0));
    const done = () => {
      const delta = kind === "direct"
        ? directDeltaToCenter(current, destination)
        : footprintDeltaToTarget(current, size, target);
      return kind === "direct" ? delta.distance === 0 : delta.distance <= stopReach;
    };
    while (steps < maxSteps && !done()) {
      const delta = kind === "direct"
        ? directDeltaToCenter(current, destination)
        : footprintDeltaToTarget(current, size, target);
      const hasH = delta.h > 0;
      const hasV = delta.v > 0;
      let axis = hasH && hasV ? nextAxis : (hasH ? "h" : "v");
      if (axis === "h" && !hasH) axis = "v";
      if (axis === "v" && !hasV) axis = "h";
      const sign = axis === "h" ? Math.sign(delta.dx) : Math.sign(delta.dy);
      if (!sign) break;
      current = axis === "h"
        ? { column: current.column + sign, row: current.row }
        : { column: current.column, row: current.row + sign };
      centers.push({ column: current.column, row: current.row });
      lastFacing = facingFromStep(axis, sign);
      steps += 1;
      if (hasH && hasV) nextAxis = axis === "h" ? "v" : "h";
    }
    const finalDelta = kind === "direct"
      ? directDeltaToCenter(current, destination)
      : footprintDeltaToTarget(current, size, target);
    const stopReason = kind === "direct"
      ? (steps === 0 ? "already-there" : "destination")
      : (finalDelta.distance <= stopReach
        ? (steps === 0 ? "already-in-range" : "in-range")
        : (limit === 0 ? "speed-zero" : "speed-limit"));
    const finalFacing = kind === "rules" && finalDelta.distance <= stopReach
      ? facingToTargetFromFootprint(current, size, target, lastFacing ?? facing)
      : (lastFacing ?? noMoveFacing(kind, current, size, target, destination, facing));
    return {
      id: firstAxis === "h" ? "horizontal-first" : "vertical-first",
      label: firstAxis === "h" ? "横向优先" : "纵向优先",
      kind,
      centers,
      footprints: centers.map((center) => losSourceCells(center, size)),
      steps,
      finalCenter: current,
      finalFootprint: losSourceCells(current, size),
      facing: finalFacing,
      stopReason,
    };
  }

  function uniquePaths(paths) {
    const seen = new Set();
    return paths.filter((path) => {
      const key = pathKey(path.centers);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function computeApostleMovePaths({ sourceAnchor, targetAnchor, size, speed, reach, facing } = {}) {
    const sourceCenter = losSourceCenter(sourceAnchor, Math.max(1, Math.floor(Number(size) || 1)));
    const target = targetCellFromAnchor(targetAnchor);
    if (!sourceCenter || !target) return null;
    const footprintSize = Math.max(1, Math.floor(Number(size) || 1));
    const ruleLimit = Number.isFinite(speed) ? Math.max(0, Math.floor(Number(speed) || 0)) : Infinity;
    const directDestination = losSourceCenter(targetAnchor, footprintSize);
    const options = { sourceCenter, size: footprintSize, target, reach, facing };
    const rules = uniquePaths([
      buildMovementPath({ ...options, kind: "rules", firstAxis: "h", limit: ruleLimit }),
      buildMovementPath({ ...options, kind: "rules", firstAxis: "v", limit: ruleLimit }),
    ]);
    const direct = uniquePaths([
      buildMovementPath({ ...options, kind: "direct", firstAxis: "h", limit: Infinity, destination: directDestination }),
      buildMovementPath({ ...options, kind: "direct", firstAxis: "v", limit: Infinity, destination: directDestination }),
    ]);
    return { target, sourceCenter, directDestination, size: footprintSize, rules, direct };
  }

  // ---- shared overlay (aibp 主控台 + ss 第二屏共用) ----------------------
  // aibp 的视线面板与第二屏必须画得一模一样，所以「算哪些格子」与「怎么画」都
  // 只留一份实现放在这里，两端各自只负责取状态和给容器。
  //
  // losState 就是 battle_map_control 里那个对象的可序列化快照：
  //   { active, source:"apostle"|"titan", anchor:{column,row}|null,
  //     dim, elevated, showRange, reach, facing:number|null }

  // 脚印中心：点击点即中心，偶数尺寸把中心吸到半格格点上。
  function losSourceCenter(anchor, size) {
    if (!anchor) return null;
    const offset = size % 2 === 0 ? 0.5 : 0;
    return {
      column: Math.round(Number(anchor.column) - offset) + offset,
      row: Math.round(Number(anchor.row) - offset) + offset,
    };
  }

  function losSourceCells(anchor, size) {
    const center = losSourceCenter(anchor, size);
    if (!center) return [];
    const half = (size - 1) / 2;
    const cells = [];
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        const c = Math.round(center.column - half + dx);
        const r = Math.round(center.row - half + dy);
        if (c >= 1 && c <= COLUMNS && r >= 1 && r <= ROWS) cells.push({ c, r });
      }
    }
    return cells;
  }

  // 算出一份「该画什么」的描述，不碰 DOM。terrainApi = window.BattleTerrain。
  function buildLosOverlay(map, losState, terrainApi, apostle) {
    const state = losState || {};
    const empty = {
      active: false, source: [], sourceKeys: new Set(), obscuring: [], walls: { h: [], v: [] },
      wallsIgnored: false, visible: [], blocked: [], inRange: [], blindspots: new Set(),
      distance: null, profile: null, mazesense: false, occ: null, dim: state.dim !== false,
      facing: null, elevated: false, movement: null,
    };
    if (!state.active || !map || !terrainApi) return empty;

    const profile = state.source === "apostle"
      ? (terrainApi.getApostleProfile(apostle, map.startLevel) || null)
      : null;
    const size = profile ? profile.size : 1;
    const occ = buildOccluders(terrainApi.getMapTiles(map), terrainApi);
    const mazesense = !!(profile && profile.mazesense
      && occ.labyrinthTiles && occ.labyrinthTiles.size);

    const source = losSourceCells(state.anchor, size);
    const sourceKeys = new Set(source.map(({ c, r }) => cellKey(c, r)));

    // 高地(循环IV+)：无视遮蔽与红线(云层仍挡)。这是**手动开关**(state.elevated)，
    // 引擎只如实读取。「泰坦踩上高地自动勾选、移下自动取消」由控制层做边沿触发
    // (battle_map_control.js 的 syncAutoElevated)，改的也是这个 state.elevated，
    // 所以第二屏拿到快照里的 elevated 后画出来与主屏一致，无需在引擎里按位置重算。
    const elevated = !!state.elevated;

    const obscuring = [];
    occ.obscuring.forEach((key) => {
      const [c, r] = key.split(",").map(Number);
      obscuring.push({
        c, r,
        cloud: !!(elevated && occ.cloud && occ.cloud.has(key)),
      });
    });

    // 朝向：未手动指定时跟随该图的初始朝向。0/90/180/270 = 上/右/下/左。
    // 只有使徒有朝向（泰坦是单格、无盲区，也没有面板朝向），所以泰坦来源给 null，
    // 渲染层据此不画箭头。盲区由朝向推出（正后方一排），改朝向盲区自动跟着转。
    const facing = profile
      ? (state.facing === null || state.facing === undefined
        ? (terrainApi.getInitialFacing(apostle, map.apostleFacing, map.setupId, map.startLevel, map.startPositionId) ?? 0)
        : Number(state.facing))
      : null;

    const base = {
      active: true, source, sourceKeys, obscuring, occ, profile, mazesense, facing, elevated,
      walls: occ.walls || { h: [], v: [] },
      wallsIgnored: mazesense,
      dim: state.dim !== false,
      visible: [], blocked: [], inRange: [], blindspots: new Set(), distance: null,
    };
    if (!source.length) return base;

    const center = losSourceCenter(state.anchor, size);
    const blindspots = new Set(
      (profile && profile.blindspot
        ? terrainApi.getBlindspotCells(apostle, map.startLevel, center, facing)
        : []
      ).map(({ row, column }) => cellKey(column, row))
    );

    const { grid } = computeLOSMap(source, occ, {
      elevated,
      blindspots,
      alwaysLos: profile ? profile.alwaysLos : false,
      mazesense,
    });
    // 移速 ∞ 时全图都在射程内，铺满一层反而盖住视线结果，所以不画射程框。
    const reach = Number.isFinite(Number(state.reach)) ? Number(state.reach) : 1;
    const range = profile && state.showRange && Number.isFinite(profile.speed)
      ? computeRangeMap(source, profile.speed, reach)
      : null;
    // 距离数字跟着同一个开关但**不**依赖射程层：泰坦与移速 ∞ 的使徒画不出紫框，
    // 数字仍然有用，所以单独算一份。
    const distance = state.showRange
      ? (range ? range.distance : computeDistanceMap(source).grid)
      : null;

    const visible = [];
    const blocked = [];
    const inRange = [];
    for (let c = 1; c <= COLUMNS; c++) {
      for (let r = 1; r <= ROWS; r++) {
        const key = cellKey(c, r);
        if (sourceKeys.has(key)) continue;
        const isVisible = !!grid[key];
        (isVisible ? visible : blocked).push({ c, r });
        if (range && range.grid[key]) inRange.push({ c, r, hasLos: isVisible });
      }
    }
    const movement = profile && state.source === "apostle" && state.moveTarget
      ? computeApostleMovePaths({
        sourceAnchor: state.anchor,
        targetAnchor: state.moveTarget,
        size,
        speed: profile.speed,
        reach,
        facing,
      })
      : null;
    return { ...base, facing, blindspots, visible, blocked, inRange, distance, range, movement };
  }

  // 把 overlay 描述画进容器。两端共用，保证第二屏与主控台逐格一致。
  // 渲染次序即层次：遮蔽黄框 → 红墙 → 可见/被挡 → 射程紫框 → 盲区斜纹 →
  // 来源蓝框 → 距离数字（数字最后画才盖在所有色块之上读得清）。
  function renderLosOverlay(layer, overlay, doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!layer || !d) return;
    layer.replaceChildren();
    layer.hidden = !overlay.active;
    layer.classList.toggle("dim-blocked", !!overlay.dim);
    if (!overlay.active) return;

    const cell = (c, r, className) => {
      const el = d.createElement("div");
      el.className = className;
      el.style.left = `${(c - 1) / COLUMNS * 100}%`;
      el.style.top = `${(ROWS - r) / ROWS * 100}%`;
      el.style.width = `${100 / COLUMNS}%`;
      el.style.height = `${100 / ROWS}%`;
      return el;
    };

    const marker = (column, row, className, size = 1) => {
      const el = d.createElement("div");
      el.className = className;
      el.style.left = `${(column - 0.5) / COLUMNS * 100}%`;
      el.style.top = `${(ROWS - row + 0.5) / ROWS * 100}%`;
      el.style.width = `${size / COLUMNS * 100}%`;
      el.style.height = `${size / ROWS * 100}%`;
      return el;
    };

    const facingArrow = (footprint, facing, className, titlePrefix = "") => {
      if (facing === null || facing === undefined || !footprint.length) return null;
      const cs = footprint.map((s) => s.c);
      const rs = footprint.map((s) => s.r);
      const c0 = Math.min(...cs), c1 = Math.max(...cs);
      const r0 = Math.min(...rs), r1 = Math.max(...rs);
      const cc = (c0 + c1) / 2;
      const rc = (r0 + r1) / 2;
      const deg = ((Number(facing) % 360) + 360) % 360;
      const dir = { 0: [0, 1], 90: [1, 0], 180: [0, -1], 270: [-1, 0] }[deg] || [0, 1];
      const fx = cc + dir[0] * ((c1 - c0 + 1) / 2);
      const fy = rc + dir[1] * ((r1 - r0 + 1) / 2);
      const faceLabel = { 0: "上", 90: "右", 180: "下", 270: "左" }[deg] || "上";
      const arrow = d.createElement("div");
      arrow.className = className;
      arrow.textContent = "▲";
      arrow.title = `${titlePrefix}朝${faceLabel}`;
      arrow.style.left = `${(fx - 0.5) / COLUMNS * 100}%`;
      arrow.style.top = `${(ROWS - fy + 0.5) / ROWS * 100}%`;
      arrow.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
      return arrow;
    };

    overlay.obscuring.forEach(({ c, r, cloud }) => {
      layer.appendChild(cell(c, r, cloud
        ? "battle-map-los-obscuring battle-map-los-cloud"
        : "battle-map-los-obscuring"));
    });

    const extra = overlay.wallsIgnored ? " battle-map-los-wall-ignored" : "";
    (overlay.walls.h || []).forEach((w) => {
      const el = d.createElement("div");
      el.className = `battle-map-los-wall horizontal${extra}`;
      el.style.left = `${w.x0 / COLUMNS * 100}%`;
      el.style.width = `${(w.x1 - w.x0) / COLUMNS * 100}%`;
      el.style.top = `${(ROWS - w.y) / ROWS * 100}%`;
      layer.appendChild(el);
    });
    (overlay.walls.v || []).forEach((w) => {
      const el = d.createElement("div");
      el.className = `battle-map-los-wall vertical${extra}`;
      el.style.top = `${(ROWS - w.y1) / ROWS * 100}%`;
      el.style.height = `${(w.y1 - w.y0) / ROWS * 100}%`;
      el.style.left = `${w.x / COLUMNS * 100}%`;
      layer.appendChild(el);
    });

    if (!overlay.source.length) return;

    overlay.visible.forEach(({ c, r }) => layer.appendChild(cell(c, r, "battle-map-los-visible")));
    overlay.blocked.forEach(({ c, r }) => layer.appendChild(cell(c, r, "battle-map-los-blocked")));
    overlay.inRange.forEach(({ c, r, hasLos }) => {
      layer.appendChild(cell(c, r, hasLos
        ? "battle-map-los-in-range has-los"
        : "battle-map-los-in-range"));
    });
    overlay.blindspots.forEach((key) => {
      const [c, r] = key.split(",").map(Number);
      if (!overlay.sourceKeys.has(key)) layer.appendChild(cell(c, r, "battle-map-los-blindspot"));
    });
    const sourceCenter = overlay.source.length
      ? {
        column: overlay.source.reduce((sum, item) => sum + item.c, 0) / overlay.source.length,
        row: overlay.source.reduce((sum, item) => sum + item.r, 0) / overlay.source.length,
      }
      : null;
    if (sourceCenter) {
      const sourceColumns = overlay.source.map((item) => item.c);
      const sourceRows = overlay.source.map((item) => item.r);
      const sourceSize = overlay.profile && overlay.profile.size
        ? Math.max(1, Math.floor(Number(overlay.profile.size) || 1))
        : Math.max(
          Math.max(...sourceColumns) - Math.min(...sourceColumns) + 1,
          Math.max(...sourceRows) - Math.min(...sourceRows) + 1
        );
      layer.appendChild(marker(sourceCenter.column, sourceCenter.row, "battle-map-los-source", sourceSize));
    }

    if (overlay.movement) {
      const target = overlay.movement.target;
      layer.appendChild(marker(target.c, target.r, "battle-map-los-move-target"));
      const paintPath = (paths) => {
        const list = paths || [];
        const passedSets = list.map((path) => {
          const set = new Set();
          path.footprints.slice(1).forEach((footprint) => {
            footprint.forEach(({ c, r }) => set.add(cellKey(c, r)));
          });
          return set;
        });
        list.forEach((path, index) => {
          const suffix = index === 0 ? "a" : "b";
          const other = passedSets[index === 0 ? 1 : 0] || new Set();
          passedSets[index].forEach((key) => {
            const [c, r] = key.split(",").map(Number);
            const routeClass = other.has(key) ? "overlap" : suffix;
            layer.appendChild(cell(c, r, `battle-map-los-move-step battle-map-los-move-${routeClass}`));
          });
        });
        list.forEach((path, index) => {
          const suffix = index === 0 ? "a" : "b";
          const finalKey = centerKey(path.finalCenter);
          const other = list[index === 0 ? 1 : 0];
          const routeClass = other && centerKey(other.finalCenter) === finalKey ? "overlap" : suffix;
          layer.appendChild(marker(
            path.finalCenter.column,
            path.finalCenter.row,
            `battle-map-los-move-final battle-map-los-move-${routeClass}`,
            Math.max(1, Math.floor(Number(overlay.movement.size) || 1))
          ));
          const arrow = facingArrow(
            path.finalFootprint,
            path.facing,
            `battle-map-los-move-facing battle-map-los-move-facing-${routeClass}`,
            `路线 ${index + 1} 终点`
          );
          if (arrow) layer.appendChild(arrow);
        });
      };
      paintPath(overlay.movement.rules);
    }

    // 朝向标注：在脚印**正面那条边**的中点画一个箭头，指向朝向。盲区在正后方，
    // 所以箭头尾端就是盲区那侧，一眼能对上。泰坦没有朝向（facing=null），不画。
    if (overlay.facing !== null && overlay.facing !== undefined && overlay.source.length) {
      const arrow = facingArrow(overlay.source, overlay.facing, "battle-map-los-facing");
      if (arrow) layer.appendChild(arrow);
    }

    if (overlay.distance) {
      for (let c = 1; c <= COLUMNS; c++) {
        for (let r = 1; r <= ROWS; r++) {
          const key = cellKey(c, r);
          const el = cell(c, r, overlay.sourceKeys.has(key)
            ? "battle-map-los-distance is-source"
            : (overlay.range && overlay.range.grid[key]
              ? "battle-map-los-distance in-range"
              : "battle-map-los-distance"));
          el.textContent = String(overlay.distance[key]);
          layer.appendChild(el);
        }
      }
    }
  }

  return {
    COLUMNS,
    ROWS,
    buildOccluders,
    buildLosOverlay,
    renderLosOverlay,
    losSourceCells,
    losSourceCenter,
    occupiedCells,
    footprintSize,
    localPointToLattice,
    hasLOS,
    computeLOSMap,
    computeRangeMap,
    computeDistanceMap,
    computeApostleMovePaths,
    elevatedOcc,
    mazesenseOcc,
    segmentBlocked,
    cornersOf,
    mergeWalls,
  };
});
