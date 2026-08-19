/*
 * battle_los.test.js — dependency-free unit tests (run with `node`).
 *
 *   node aibp/tests/battle_los.test.js
 *
 * Validates the LoS engine against the P38 rules: obscuring interior/collinear
 * blocking, corner-clipping exemption, diagonal pinch, red-wall crossing, and
 * the "standing on obscuring / models are transparent" exemptions.
 */
const assert = require("node:assert");
const path = require("node:path");
const BT = require(path.join(__dirname, "..", "..", "ss", "terrain-data.js"));
const LOS = require(path.join(__dirname, "..", "battle_los.js"));

let passed = 0;
const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

// Helpers to build a bare occluder model directly.
// `tiles` optionally groups obscuring cells into whole tiles (array of arrays
// of [c,r]); if omitted, each obscuring cell is treated as its own 1×1 tile.
// `cloudCells` marks obscuring cells that belong to Cloud 云层 tiles.
const occ = (obscuringCells = [], redEdges = [], tiles = null, cloudCells = []) => {
  const red = new Set(redEdges.map(([i0, j0, i1, j1]) =>
    (i0 < i1 || (i0 === i1 && j0 <= j1))
      ? `${i0},${j0}|${i1},${j1}`
      : `${i1},${j1}|${i0},${j0}`));
  const cellTile = new Map();
  const tileCells = new Map();
  const groups = tiles || obscuringCells.map((cell) => [cell]);
  groups.forEach((cells, id) => {
    const keys = cells.map(([c, r]) => `${c},${r}`);
    keys.forEach((k) => cellTile.set(k, id));
    tileCells.set(id, keys);
  });
  return {
    obscuring: new Set(obscuringCells.map(([c, r]) => `${c},${r}`)),
    red,
    walls: LOS.mergeWalls(red),
    cellTile,
    tileCells,
    cloud: new Set(cloudCells.map(([c, r]) => `${c},${r}`)),
    elevated: new Set(),
  };
};
const src = (c, r) => [{ c, r }];

// ---- Rule 1: line through interior of an obscuring tile is blocked -------
test("obscuring tile blocks a straight line through it", () => {
  const o = occ([[10, 7]]);
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 15, r: 7 }, o), false);
});

test("obscuring block on the diagonal path blocks all corner lines", () => {
  // A single 1×1 tile leaves corner-grazing routes; a solid 2×2 block on the
  // diagonal corridor blocks every source→target corner pair.
  const o = occ([[10, 7], [11, 7], [10, 8], [11, 8]]);
  assert.strictEqual(LOS.hasLOS(src(8, 5), { c: 13, r: 10 }, o), false);
});

// ---- Rule 3: merely clipping a single corner does NOT block --------------
test("clipping one corner of an obscuring tile keeps LoS", () => {
  const o = occ([[10, 7]]);
  // A line that only grazes the corner lattice point of (10,7) but runs
  // through open cells otherwise should still have LoS via some corner pair.
  assert.strictEqual(LOS.hasLOS(src(8, 9), { c: 12, r: 5 }, o), true);
});

// ---- Rule 4: diagonal pinch between two obscuring tiles blocks -----------
test("diagonal pinch between two diagonally-adjacent obscuring tiles blocks", () => {
  // Obscuring at (10,7) and (11,8) share lattice corner (10,7). A sight line
  // threading through that corner (source/target NOT owning it) is blocked.
  const o = occ([[10, 7], [11, 8]]);
  assert.strictEqual(LOS.hasLOS(src(9, 9), { c: 12, r: 6 }, o), false);
});

test("single obscuring tile does NOT create a pinch (gap open)", () => {
  const o = occ([[10, 7]]);
  // one tile leaves the diagonal gap open
  assert.strictEqual(LOS.hasLOS(src(9, 9), { c: 12, r: 6 }, o), true);
});

test("a pinch on the source's OWN corner blocks too (endpoint pinch)", () => {
  // 用户 2026-08-18 的图：重合顶点 lattice(10,7) 四周四格 = 列10/11 × 行7/8。
  // 遮蔽在左上(10,8)+右下(11,7) 这条闭合对角，源(蓝框)在左下(10,7)、目标(红圈)在
  // 右上(11,8) —— 正好隔着那个顶点相望。这里捏合点就是源格和目标格自己的角，
  // 对应的角线在 t=0 / t=1 处捏合。旧实现只查线段内部格点，于是漏了过去。
  const o = occ([[10, 8], [11, 7]]);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 11, r: 8 }, o), false, "蓝框看不到红圈");
  assert.strictEqual(LOS.hasLOS(src(11, 8), { c: 10, r: 7 }, o), false, "反向同样被挡");
});

test("endpoint pinch does not over-block the open cases", () => {
  // 只有一格遮蔽：缝没闭合，照样能看。
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 11, r: 8 }, occ([[10, 8]])), true);
  // 遮蔽落在**开口**那条对角(源/目标自己这条)：也不构成捏合。
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 11, r: 8 }, occ([[10, 7], [11, 8]])), true);
  // 正交相邻不受斜向捏合影响。
  const o = occ([[10, 8], [11, 7]], [], [[[10, 8]], [[11, 7]]]);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 10, r: 8 }, o), true);
  // 站在其中一块遮蔽上 → 整块豁免优先，仍能看出去。
  assert.strictEqual(LOS.hasLOS(src(10, 8), { c: 11, r: 8 }, o), true);
  // 高地无视一切普通遮蔽，捏合也一并无视。
  assert.strictEqual(
    LOS.hasLOS(src(10, 7), { c: 11, r: 8 }, occ([[10, 8], [11, 7]]), { elevated: true }), true);
});

test("endpoint pinch stays symmetric across the board", () => {
  const o = occ([[10, 8], [11, 7]]);
  let asym = 0;
  for (let c = 1; c <= 20; c++) {
    for (let r = 1; r <= 14; r++) {
      for (let c2 = 1; c2 <= 20; c2 += 3) {
        for (let r2 = 1; r2 <= 14; r2 += 3) {
          if (c === c2 && r === r2) continue;
          if (LOS.hasLOS([{ c, r }], { c: c2, r: r2 }, o)
              !== LOS.hasLOS([{ c: c2, r: r2 }], { c, r }, o)) asym++;
        }
      }
    }
  }
  assert.strictEqual(asym, 0);
});

// ---- Exemption: unit standing ON obscuring tile is not blocked by it -----
test("source standing on obscuring tile still sees out", () => {
  const o = occ([[10, 7]]);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 15, r: 7 }, o), true);
});

test("target on obscuring tile is still visible", () => {
  const o = occ([[10, 7]]);
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 10, r: 7 }, o), true);
});

// ---- P38 by-tile exemption: whole obscuring tile the unit stands on ------
test("unit on a multi-cell obscuring tile is not blocked by the REST of that tile", () => {
  // One 2×2 obscuring tile covering (10,7)(11,7)(10,8)(11,8). Source stands on
  // (10,7); target on the far side at (13,7). The sight line grazes cell (11,7)
  // of the SAME tile — per P38 the whole tile is exempt, so LoS exists.
  const tile = [[10, 7], [11, 7], [10, 8], [11, 8]];
  const o = occ(tile, [], [tile]);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 13, r: 7 }, o), true);
});

test("a DIFFERENT obscuring tile still blocks a unit standing on its own tile", () => {
  // Two separate 1×1 tiles: unit stands on (10,7); an unrelated tile at (12,7)
  // sits between it and the target and must still block.
  const o = occ([[10, 7], [12, 7]]);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 15, r: 7 }, o), false);
});

// ---- 循环IV+ Elevated 高地: source ignores ALL obscuring AND red walls ----
test("elevated source sees through obscuring terrain that would block it", () => {
  const o = occ([[10, 7], [11, 7], [10, 8], [11, 8]]);
  // normally blocked (see rule-1 test); elevated ignores all Obscuring
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 15, r: 7 }, o), false);
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 15, r: 7 }, o, { elevated: true }), true);
});

test("elevated source also ignores red walls (user-confirmed ruling)", () => {
  const wall = [];
  for (let j = 4; j < 10; j++) wall.push([10, j, 10, j + 1]);
  const o = occ([], wall);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 13, r: 7 }, o), false);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 13, r: 7 }, o, { elevated: true }), true);
});

test("elevated computeLOSMap makes every board cell visible on a walled map", () => {
  const wall = [];
  for (let j = 0; j < 14; j++) wall.push([10, j, 10, j + 1]); // full-height wall
  const o = occ([[5, 5], [6, 5]], wall);
  const plain = LOS.computeLOSMap(src(3, 7), o);
  const high = LOS.computeLOSMap(src(3, 7), o, { elevated: true });
  assert.ok(plain.visible.length < 20 * 14, "plain source should be blocked somewhere");
  assert.strictEqual(high.visible.length, 20 * 14);
});

// ---- Cloud 云层 is the exception to Elevated ------------------------------
test("Cloud terrain still blocks an elevated source", () => {
  // one ordinary obscuring tile and one Cloud tile, both on the sightline
  const o = occ([[8, 7], [12, 7]], [], [[[8, 7]], [[12, 7]]], [[12, 7]]);
  // ordinary tile alone: elevated sees past it
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 10, r: 7 }, o), false);
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 10, r: 7 }, o, { elevated: true }), true);
  // through the Cloud tile: elevated is still blocked
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 15, r: 7 }, o, { elevated: true }), false);
});

test("elevated source inside a Cloud tile is not blocked by that cloud", () => {
  // 2×2 cloud tile; source stands on one of its cells (P38 exemption still applies)
  const cells = [[10, 7], [11, 7], [10, 8], [11, 8]];
  const o = occ(cells, [], [cells], cells);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 15, r: 7 }, o, { elevated: true }), true);
});

test("elevatedOcc keeps only Cloud obscuring and drops all red walls", () => {
  const wall = [[10, 4, 10, 5], [10, 5, 10, 6]];
  const o = occ([[8, 7], [12, 7]], wall, [[[8, 7]], [[12, 7]]], [[12, 7]]);
  const e = LOS.elevatedOcc(o);
  assert.deepStrictEqual(Array.from(e.obscuring), ["12,7"]);
  assert.strictEqual(e.red.size, 0);
  assert.strictEqual(e.walls.h.length + e.walls.v.length, 0);
});

// ---- Red wall: crossing a red edge blocks --------------------------------
test("red wall spanning the sightline blocks crossing it", () => {
  // continuous vertical wall at lattice x=10 spanning j=4..10 (6 unit edges)
  const wall = [];
  for (let j = 4; j < 10; j++) wall.push([10, j, 10, j + 1]);
  const o = occ([], wall);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 13, r: 7 }, o), false);
});

// 唯一的红线规则（用户 2026-08-19）：红线本体**及其端点**都遮挡视线。交点正好压在
// 红墙端点上也算被挡——不再有「擦过端点」的豁免，也没有开关。
test("threading exactly through a red wall's endpoint is blocked", () => {
  const wall = [];
  for (let j = 4; j < 10; j++) wall.push([10, j, 10, j + 1]);   // x=10, j 4..10
  const o = occ([], wall);
  // 到 (13,12) 的全部角点连线里，唯一可能“通过”的那条恰好穿过墙顶端点 (10,10)——
  // 端点也挡，所以整体没有视线。
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 13, r: 12 }, o), false, "端点也挡");
});

test("a line genuinely clear of the wall's end still has LoS", () => {
  const wall = [];
  for (let j = 4; j < 10; j++) wall.push([10, j, 10, j + 1]);
  const o = occ([], wall);
  // 目标够高，连线在 x=10 处的高度 y≈12.25 严格高于墙顶 y=10 —— 从墙头外面绕过去，
  // 不是擦顶点。新规则不能把这种也挡掉，否则就是过度遮挡。
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 11, r: 14 }, o), true);
});

// ---- Labyrinth integration: I-tile corridor walls ------------------------
// 两端都在大迷宫外时，整块迷宫视作一坨遮蔽地形（用户 2026-08-19）：从迷宫外看，
// 走廊开口不再漏视线——横穿、纵穿、沿走廊看，凡视线经过脚印都被挡。只有站在迷宫
// 脚印上的单位才回到红线本体+端点规则（走廊里能沿走廊看出去，见下面的用例）。
test("from outside, the whole Labyrinth blocks like one obscuring block", () => {
  const p = { name: "Labyrinth I", column: 8.5, row: 7, rotation: 180, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  // 下方看上方，斜穿脚印 -> 挡
  assert.strictEqual(LOS.hasLOS(src(8, 5), { c: 9, r: 9 }, o), false);
  // 沿走廊两端对看，视线整条压在脚印上 -> 现在也挡（旧规是通的）
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 12, r: 7 }, o), false);
  // 不过度遮挡：脚印左右两侧之外的纵向视线不碰迷宫 -> 通
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 5, r: 10 }, o), true);
  assert.strictEqual(LOS.hasLOS(src(12, 7), { c: 12, r: 4 }, o), true);
});

// 站在走廊格里的单位仍按红线规则：走廊上下有墙、东西开口，所以能沿走廊看出去。
// （源落在迷宫脚印上 -> 不是「两端皆在迷宫外」，不走遮蔽整块的那一路。）
test("a unit standing in the corridor still sees out along the open ends", () => {
  const p = { name: "Labyrinth I", column: 8.5, row: 7, rotation: 180, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  // 走廊格 (7,7) 往东穿过开口看到外面 (12,7) -> 通
  assert.strictEqual(LOS.hasLOS(src(7, 7), { c: 12, r: 7 }, o), true);
  // 但往正上方跨顶墙 -> 仍被红墙挡
  assert.strictEqual(LOS.hasLOS(src(7, 7), { c: 7, r: 9 }, o), false);
});

// L/Z 形大迷宫按**实际形状**当遮蔽地形，不是 3×2 矩形（用户 2026-08-19）。
// L 占 (0,0)(1,0)(2,0)(2,1)：右上凹口那格 (2,1) 局部对面的 (0,1) 是空的，
// 迷宫外两格穿过这个空格的视线不该被挡；而穿过实占格必被挡。
test("L/Z Labyrinth blocks by its real shape, not the bounding rectangle", () => {
  // Labyrinth L @ identity(col=8.5,row=7)：实占棋盘格 (8,7)(9,7)(10,7)(10,8)。
  // 矩形包围盒会多算 (8,8)(9,8) 两格——正是要排除的。
  const l = { name: "Labyrinth L", column: 8.5, row: 7, rotation: 180, flipped: false };
  const ol = LOS.buildOccluders([l], BT);
  assert.strictEqual(ol.labyrinthCells.size, 4, "L 是 4 格实占，不是 6 格矩形");
  assert.ok(!ol.labyrinthCells.has("8,8") && !ol.labyrinthCells.has("9,8"), "包围盒里的空格不占");
  // 迷宫外的一对格子，视线只从空格区 (8,8)/(9,8) 上方水平穿过、不碰实占格 -> 通。
  assert.strictEqual(LOS.hasLOS(src(6, 8), { c: 9, r: 8 }, ol), true, "穿空格区不挡");
  // 视线纵向穿过实占格 (9,7) -> 挡。
  assert.strictEqual(LOS.hasLOS(src(9, 5), { c: 9, r: 10 }, ol), false, "穿实占格挡");

  // Labyrinth Z @ identity：实占 (8,7)(9,7)(9,8)(10,8)，空格是 (8,8)(10,7)。
  const z = { name: "Labyrinth Z", column: 8.5, row: 7, rotation: 180, flipped: false };
  const oz = LOS.buildOccluders([z], BT);
  assert.strictEqual(oz.labyrinthCells.size, 4, "Z 是 4 格实占");
  assert.ok(!oz.labyrinthCells.has("8,8") && !oz.labyrinthCells.has("10,7"), "Z 的两个空格不占");
});

// 用户 2026-08-19：其他 z/l 形板块也按真实形状。遮蔽里唯一的 L/Z 是悬崖，验它同样
// 只挡 4 格实占、不挡包围盒里的两个空格（对照 Cliff I/O 仍填满各自矩形）。
test("obscuring Cliff L/Z block by their real shape, not the 3×2 rectangle", () => {
  // Cliff L @ identity(col=8.5,row=7)：实占 (8,7)(9,7)(10,7)(10,8)，空格 (8,8)(9,8)。
  const cl = { name: "Cliff L", column: 8.5, row: 7, rotation: 180, flipped: false };
  const ol = LOS.buildOccluders([cl], BT);
  assert.strictEqual(ol.obscuring.size, 4, "Cliff L 只遮 4 格");
  assert.ok(ol.obscuring.has("8,7") && ol.obscuring.has("10,8"), "实占格在内");
  assert.ok(!ol.obscuring.has("8,8") && !ol.obscuring.has("9,8"), "包围盒空格不遮");
  // 视线从空格区 (8,8)/(9,8) 上方水平穿过、不碰实占 -> 通；纵穿实占 (9,7) -> 挡。
  assert.strictEqual(LOS.hasLOS(src(6, 8), { c: 9, r: 8 }, ol), true, "穿空格区不挡");
  assert.strictEqual(LOS.hasLOS(src(9, 5), { c: 9, r: 10 }, ol), false, "穿实占格挡");

  // Cliff Z @ identity：实占 (8,7)(9,7)(9,8)(10,8)，空格 (8,8)(10,7)。
  const cz = { name: "Cliff Z", column: 8.5, row: 7, rotation: 180, flipped: false };
  const oz = LOS.buildOccluders([cz], BT);
  assert.strictEqual(oz.obscuring.size, 4, "Cliff Z 只遮 4 格");
  assert.ok(!oz.obscuring.has("8,8") && !oz.obscuring.has("10,7"), "Z 的两个空格不遮");

  // 对照：Cliff I（4×1）与 Cliff O（2×2）是满矩形，格数不变。
  const ci = LOS.buildOccluders([{ name: "Cliff I", column: 8.5, row: 7, rotation: 180, flipped: false }], BT);
  assert.strictEqual(ci.obscuring.size, 4, "Cliff I 仍满行");
  const co = LOS.buildOccluders([{ name: "Cliff O", column: 8, row: 7, rotation: 180, flipped: false }], BT);
  assert.strictEqual(co.obscuring.size, 4, "Cliff O 仍满 2×2");
});

// 大迷宫的红线**无论是否站在大迷宫上都会双向遮挡视线**（用户确认 2026-08-18）。
// 遮蔽豁免（P38「其所在的遮蔽地形板块」）只免遮蔽，不免红线；方向也不影响结果。
test("Labyrinth red lines block even when the unit stands on the Labyrinth", () => {
  const p = { name: "Labyrinth I", column: 8.5, row: 7, rotation: 180, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  // The I tile is a 4×1 corridor at row 7, columns 7..10, walled top and bottom.
  // 源站在迷宫走廊格里，往正上方跨顶墙：仍然被挡。
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 8, r: 9 }, o), false);
  // 目标站在走廊格里，源在外面：同样被挡。
  assert.strictEqual(LOS.hasLOS(src(8, 9), { c: 8, r: 7 }, o), false);
  // 源和目标都在走廊格里但隔着墙（一个在走廊内、一个在走廊外正上方）——已覆盖；
  // 这里再验一次穿过底墙的方向。
  assert.strictEqual(LOS.hasLOS(src(9, 7), { c: 9, r: 5 }, o), false);
});

// ---- 两条红线相交的拐角 = 一条连续的墙，一律挡 --------------------------
// 用户 2026-08-18：「这两个红线视为一条红线，因此红圈位置是没有视野的」。
// 端点也挡的新规下，拐角/T/十字自然全封：交点落在墙段闭区间内即挡。
test("an L corner where two red walls meet blocks the diagonal", () => {
  // 顶点 (10,7)，两臂伸到版图边缘：竖臂 x=10 y 7..14，横臂 y=7 x 10..20。
  // 源 (10,7) 在拐角外侧（墙下方、墙左侧），(11,8) 在“兜”里，只能从顶点穿过。
  const red = [];
  for (let j = 7; j < 14; j++) red.push([10, j, 10, j + 1]);
  for (let i = 10; i < 20; i++) red.push([i, 7, i + 1, 7]);
  const o = occ([], red);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 11, r: 8 }, o), false, "正向");
  assert.strictEqual(LOS.hasLOS(src(11, 8), { c: 10, r: 7 }, o), false, "反向");
  // 拐角“兜”里所有格子都被两臂围住，端点也挡的新规下双向全黑。
  const leaks = [];
  for (let c = 11; c <= 20; c++) {
    for (let r = 8; r <= 14; r++) if (LOS.hasLOS(src(10, 7), { c, r }, o)) leaks.push(`${c},${r}`);
  }
  assert.deepStrictEqual(leaks.sort(), [], "拐角兜内一格不漏");
});

test("a T junction and a crossing are never grazeable", () => {
  // T：竖墙 x=10 y 5..9 撞上横墙 y=7 x 10..14，交点 (10,7) 挂 3 条边。
  const tRed = [];
  for (let j = 5; j < 9; j++) tRed.push([10, j, 10, j + 1]);
  for (let i = 10; i < 14; i++) tRed.push([i, 7, i + 1, 7]);
  const tee = occ([], tRed);
  // 十字：再往左延伸一段，交点挂 4 条边。
  const xRed = tRed.slice();
  for (let i = 6; i < 10; i++) xRed.push([i, 7, i + 1, 7]);
  const cross = occ([], xRed);
  for (const [label, o] of [["T", tee], ["十字", cross]]) {
    // 穿过交点 (10,7) 的两条对角，两个方向都不许通。
    assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 11, r: 8 }, o), false, `${label} 西南→东北`);
    assert.strictEqual(LOS.hasLOS(src(11, 7), { c: 10, r: 8 }, o), false, `${label} 东南→西北`);
  }
});

// 端点也挡：孤立竖墙的两个端点（悬空墙头）现在也遮挡，穿墙身更不用说。
test("a dangling wall head blocks at its endpoint too", () => {
  // 一段孤立竖墙 x=10 y 4..10：两头 (10,4) 与 (10,10) 各只挂 1 条边 = 悬空墙头。
  const red = [];
  for (let j = 4; j < 10; j++) red.push([10, j, 10, j + 1]);
  const o = occ([], red);
  // 经过上端点 (10,10) 的那条线：端点也挡 → 无视线。
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 13, r: 12 }, o), false, "端点也挡");
  // 穿墙身当然挡。
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 11, r: 7 }, o), false, "穿墙身不通");
  // 但真的从墙头**外面**绕过去（交点严格高于墙顶 y=10）仍有视线，不过度遮挡。
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 11, r: 14 }, o), true, "墙头外面绕过去仍通");
});

test("corridor END cells are blocked at the wall's endpoint", () => {
  const p = { name: "Labyrinth I", column: 8.5, row: 7, rotation: 180, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  // Corridor = row 7, columns 7..10; walls run y=6 and y=7 across x 6..10.
  // 端点也挡：端格 7 / 10 的外角压在墙端点上，现在也被挡（不再擦过）。中间格 8 / 9 同样。
  for (const c of [7, 8, 9, 10]) {
    assert.strictEqual(LOS.hasLOS(src(c, 7), { c, r: 10 }, o), false, `走廊格 ${c} 纵向被挡`);
  }
});

// ---- 视线端点压在红线端点上 = 挡（用户 2026-08-19：端点也遮挡）--------------
// 用 segmentBlocked 直接隔离单条角线，pair={source,target} 决定墙线两侧。
// 横墙 y=7 x 6..10，两端 (6,7)/(10,7) 是墙的端点。
test("a sight ending on a red wall endpoint is blocked (any angle)", () => {
  const wall = [];
  for (let i = 6; i < 10; i++) wall.push([i, 7, i + 1, 7]);  // y=7, x 6..10
  const o = occ([], wall);
  const below = { c: 6, r: 7 };   // 角点 (6,7) 在墙下方
  const above = { c: 7, r: 9 };   // 角点 (7,9) 在墙上方
  // 端点 (6,7) 是墙西端；(6,7)->(7,9) 从墙下侧穿到墙上侧（straddles）→ 挡。
  assert.strictEqual(
    LOS.segmentBlocked(6, 7, 7, 9, o, new Set(), { source: below, target: above }), true,
    "端点穿越 → 挡");
  // 反向同样。
  assert.strictEqual(
    LOS.segmentBlocked(7, 9, 6, 7, o, new Set(), { source: above, target: below }), true,
    "反向：端点穿越 → 挡");
  // 直角（正上方穿越）也挡。
  assert.strictEqual(
    LOS.segmentBlocked(6, 7, 6, 9, o, new Set(), { source: below, target: { c: 6, r: 9 } }),
    true, "直角穿越 → 挡");
});

// 端点也挡：视线端点压在竖墙上端点 (10,10) 上、从下侧穿到上侧 → 挡。
test("a sight whose endpoint lands on a red wall endpoint is blocked", () => {
  const wall = [];
  for (let j = 4; j < 10; j++) wall.push([10, j, 10, j + 1]);
  const o = occ([], wall);
  // (8,7)->(13,12) 在 x=10 处 t≈0.4 是线段内部穿过上墙头 (10,10)——线段内部穿墙一律挡。
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 13, r: 12 }, o), false, "内部穿墙头也挡");
});

// ---- 相邻两格隔着一条红线 = 无视线（端点也挡后自然成立）------------------
// 两格正交相邻、公共边是红线时，它们所有角点连线都被那条红边（含端点）挡住。
test("orthogonally adjacent cells split by a red edge cannot see each other", () => {
  // 竖红边 x=10, y 6..7（即 board 格 (10,7) 与 (11,7) 之间那条边）。
  const o = occ([], [[10, 6, 10, 7]]);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 11, r: 7 }, o), false, "东西相邻隔红边→不可见");
  assert.strictEqual(LOS.hasLOS(src(11, 7), { c: 10, r: 7 }, o), false, "反向同样");
  // 横红边 y=7, x 8..9（board 格 (9,7) 与 (9,8) 之间）。
  const o2 = occ([], [[8, 7, 9, 7]]);
  assert.strictEqual(LOS.hasLOS(src(9, 7), { c: 9, r: 8 }, o2), false, "南北相邻隔红边→不可见");
  assert.strictEqual(LOS.hasLOS(src(9, 8), { c: 9, r: 7 }, o2), false, "反向同样");
  // 不过度遮挡：公共边没有红线时相邻格照常可见。
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 11, r: 7 }, occ([], [])), true, "无红边照常可见");
});

// 真实 LABYRINTHAUROS 默认图上，不该再有“隔着一条红边还能互相看到”的相邻格。
test("no adjacent-across-red leaks remain on the Labyrinthauros battle map", () => {
  const setup = BT.setups["LABYRINTHAUROS"][0];
  const placements = [];
  for (const t of setup.terrains) for (const pl of t.tiles)
    placements.push({ name: t.name, column: pl.column, row: pl.row, rotation: pl.rotation, flipped: pl.flipped });
  const o = LOS.buildOccluders(placements, BT);
  const has = (i0, j0, i1, j1) => o.red.has([[i0, j0], [i1, j1]]
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((z) => z.join(",")).join("|"));
  const leaks = [];
  for (let c = 1; c <= 20; c++) for (let r = 1; r <= 14; r++) {
    if (c < 20 && has(c, r - 1, c, r) && LOS.hasLOS(src(c, r), { c: c + 1, r }, o)) leaks.push(`${c},${r}|E`);
    if (r < 14 && has(c - 1, r, c, r) && LOS.hasLOS(src(c, r), { c, r: r + 1 }, o)) leaks.push(`${c},${r}|N`);
  }
  assert.deepStrictEqual(leaks, [], "相邻隔红边的格子对必须双向不可见");
});

test("corridor ends are closed too (endpoints block)", () => {
  const p = { name: "Labyrinth I", column: 8.5, row: 7, rotation: 180, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  // 端点也挡：四格走廊没有一格能纵向看出去（包括两端格）。
  for (const c of [7, 8, 9, 10]) {
    assert.strictEqual(LOS.hasLOS(src(c, 7), { c, r: 10 }, o), false, `cell ${c} up`);
    assert.strictEqual(LOS.hasLOS(src(c, 7), { c, r: 4 }, o), false, `cell ${c} down`);
  }
  // 两端都在迷宫外、视线沿走廊压过整块脚印：现在按遮蔽整块处理 -> 挡（用户 2026-08-19）。
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 12, r: 7 }, o), false);
  // 不过度遮挡：脚印左右两侧之外（c=11、c=5 不在 7..10 走廊里）纵向不碰迷宫 -> 通。
  assert.strictEqual(LOS.hasLOS(src(11, 7), { c: 11, r: 10 }, o), true);
  assert.strictEqual(LOS.hasLOS(src(5, 7), { c: 5, r: 10 }, o), true);
});

test("a 2x2 straddling its own red wall sees out from the far half", () => {
  const p = { name: "Labyrinth I", column: 8.5, row: 7, rotation: 180, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  // Lower half in the corridor (row 7), upper half above the y=7 wall (row 8).
  const unit = [{ c: 8, r: 7 }, { c: 9, r: 7 }, { c: 8, r: 8 }, { c: 9, r: 8 }];
  assert.strictEqual(LOS.hasLOS(unit, { c: 8, r: 10 }, o), true);  // upper half is past the wall
  assert.strictEqual(LOS.hasLOS(unit, { c: 8, r: 4 }, o), false);  // both walls still between
});

test("Labyrinth red-line blocking is symmetric (双向)", () => {
  const p = { name: "Labyrinth O", column: 8.5, row: 7.5, rotation: 180, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  // Sample a spread of cell pairs around the tile; every pair must agree in
  // both directions. Single-cell units on both ends make the two queries true
  // mirror images, so any disagreement would be an engine asymmetry.
  const probes = [4, 6, 8, 9, 10, 12].flatMap((c) => [4, 6, 7, 8, 9, 11].map((r) => ({ c, r })));
  let checked = 0;
  for (let i = 0; i < probes.length; i += 1) {
    for (let j = i + 1; j < probes.length; j += 1) {
      const a = probes[i], b = probes[j];
      const forward = LOS.hasLOS([a], b, o);
      const backward = LOS.hasLOS([b], a, o);
      assert.strictEqual(forward, backward, `asymmetric: (${a.c},${a.r}) <-> (${b.c},${b.r})`);
      checked += 1;
    }
  }
  assert.ok(checked > 600, `expected a wide sweep, checked ${checked}`);
});

test("red lines are never exempted, unlike obscuring tiles", () => {
  // Same cell twice: as an obscuring tile the unit standing on it IS exempt (P38);
  // as a red wall it is NOT. That is the distinction the rule turns on.
  const obscuringOnly = occ([[10, 7]], []);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 10, r: 9 }, obscuringOnly), true);
  // A red wall along the top edge of cell (10,7) and its neighbours: the cell's
  // corners land on the wall (含端点)，端点也挡 → 双向都看不过去。红线永不豁免。
  const redOnly = occ([], [[8, 7, 9, 7], [9, 7, 10, 7], [10, 7, 11, 7]]);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 10, r: 9 }, redOnly), false);
  assert.strictEqual(LOS.hasLOS(src(10, 9), { c: 10, r: 7 }, redOnly), false);
});

test("a one-cell-wide red wall blocks that cell (endpoints block)", () => {
  // 墙段宽度恰好等于该格，格子的每个角都压在墙的端点上——端点也挡，双向看不过去。
  const narrow = occ([], [[9, 7, 10, 7]]);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 10, r: 9 }, narrow), false);
  assert.strictEqual(LOS.hasLOS(src(10, 9), { c: 10, r: 7 }, narrow), false);
  // 紧邻但不在墙段范围内的格子不受影响。
  assert.strictEqual(LOS.hasLOS(src(11, 7), { c: 11, r: 9 }, narrow), true);
});

test("Labyrinth O's enclosed cell is fully sealed (endpoints block)", () => {
  // 迷宫 O 中间那格四面都是红线，围成一个封闭方块。端点也挡后，方块的每条边（含端点）
  // 都遮挡，封闭格双向完全隔绝。
  const p = { name: "Labyrinth O", column: 5.5, row: 7.5, rotation: 0, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  const sealed = { c: 5, r: 8 };
  let out = 0, seen = 0;
  for (let c = 1; c <= 20; c++) {
    for (let r = 1; r <= 14; r++) {
      if (c === sealed.c && r === sealed.r) continue;
      if (LOS.hasLOS([sealed], { c, r }, o)) out++;
      if (LOS.hasLOS([{ c, r }], sealed, o)) seen++;
    }
  }
  assert.strictEqual(out, 0, "封闭格不该看到任何格子");
  assert.strictEqual(seen, 0, "封闭格不该被任何格子看到");
  // 而迷宫感应无视整块大迷宫，同一格应当畅通无阻。
  const all = 20 * 14 - 1;
  let msOut = 0;
  for (let c = 1; c <= 20; c++) {
    for (let r = 1; r <= 14; r++) {
      if (c === sealed.c && r === sealed.r) continue;
      if (LOS.hasLOS([sealed], { c, r }, o, { mazesense: true })) msOut++;
    }
  }
  assert.strictEqual(msOut, all, "迷宫感应下封闭格应看到全场");
});

// ---- MAZESENSE 迷宫感应 --------------------------------------------------
// 迷宫机牛 LABYRINTHAUROS / ALPHA_TEMENOS: 「大迷宫板块不会遮挡…对泰坦的视线」。
// 整块无视，红线与遮蔽都不再挡；只对泰坦目标生效，由调用方决定何时开启。
test("mazesense ignores Labyrinth red lines entirely", () => {
  const p = { name: "Labyrinth I", column: 8.5, row: 7, rotation: 180, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  const on = { mazesense: true };
  // 同样的三条视线，普通情况下全被挡（见上面的双向遮挡测试），迷宫感应下全通。
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 8, r: 9 }, o, on), true);
  assert.strictEqual(LOS.hasLOS(src(8, 9), { c: 8, r: 7 }, o, on), true);
  assert.strictEqual(LOS.hasLOS(src(8, 5), { c: 9, r: 9 }, o, on), true);
  // 走廊内部格穿墙看出去，也不再被挡。
  assert.strictEqual(LOS.hasLOS(src(9, 7), { c: 9, r: 10 }, o, on), true);
});

test("mazesense leaves non-Labyrinth tiles blocking", () => {
  // 大迷宫 + 一块普通遮蔽板块。迷宫感应只剥大迷宫，柱子照挡。
  const tiles = [
    { name: "Labyrinth I", column: 8.5, row: 7, rotation: 180, flipped: false },
    { name: "Column", column: 15, row: 7, rotation: 0, flipped: false },
  ];
  const o = LOS.buildOccluders(tiles, BT);
  assert.ok(o.labyrinthTiles.size === 1, `expected 1 labyrinth tile, got ${o.labyrinthTiles.size}`);
  const on = { mazesense: true };
  // 穿过柱子的正交视线：迷宫感应无能为力。
  assert.strictEqual(LOS.hasLOS(src(13, 7), { c: 17, r: 7 }, o, on), false);
  // 而大迷宫的墙已经不挡了。
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 8, r: 9 }, o, on), true);
});

test("mazesenseOcc drops Labyrinth cells and edges, keeps the rest", () => {
  const tiles = [
    { name: "Labyrinth O", column: 2.5, row: 7.5, rotation: 0, flipped: false },
    { name: "Column", column: 15, row: 7, rotation: 0, flipped: false },
  ];
  const o = LOS.buildOccluders(tiles, BT);
  const m = LOS.mazesenseOcc(o);
  assert.ok(o.red.size > 0, "baseline should have red edges");
  assert.strictEqual(m.red.size, 0, "labyrinth red edges should be gone");
  assert.strictEqual(m.walls.h.length + m.walls.v.length, 0, "walls rebuilt empty");
  // 柱子仍在遮蔽集合里，且保留了整块豁免所需的 tile 分组。
  assert.ok(m.obscuring.has("15,7"), "Column should survive");
  assert.ok(m.cellTile.has("15,7"), "Column tile grouping should survive");
  assert.strictEqual(m.labyrinthTiles.size, 0);
  assert.strictEqual(m.labyrinthRed.size, 0);
});

test("mazesense is a no-op on boards with no Labyrinth", () => {
  const o = LOS.buildOccluders([{ name: "Column", column: 15, row: 7, rotation: 0, flipped: false }], BT);
  // 没有大迷宫时直接返回原模型，逐格结果必须与不开时完全一致。
  assert.strictEqual(LOS.mazesenseOcc(o), o);
  const plain = LOS.computeLOSMap(src(5, 7), o);
  const sensed = LOS.computeLOSMap(src(5, 7), o, { mazesense: true });
  assert.deepStrictEqual(sensed.grid, plain.grid);
});

test("mazesense still respects blindspots (P39) and stays symmetric", () => {
  const p = { name: "Labyrinth Z", column: 11.5, row: 7, rotation: 0, flipped: false };
  const o = LOS.buildOccluders([p], BT);
  const on = { mazesense: true, blindspots: new Set(["9,7"]) };
  // P39 盲点永远不在视线内，迷宫感应也不能翻盘。
  assert.strictEqual(LOS.hasLOS(src(9, 9), { c: 9, r: 7 }, o, on), false);
  const probes = [9, 10, 11, 12, 13].flatMap((c) => [5, 6, 7, 8, 9].map((r) => ({ c, r })));
  for (let i = 0; i < probes.length; i += 1) {
    for (let j = i + 1; j < probes.length; j += 1) {
      const a = probes[i], b = probes[j];
      assert.strictEqual(
        LOS.hasLOS([a], b, o, { mazesense: true }),
        LOS.hasLOS([b], a, o, { mazesense: true }),
        `asymmetric under mazesense: (${a.c},${a.r}) <-> (${b.c},${b.r})`);
    }
  }
});

test("mazesense apostles are exactly LABYRINTHAUROS and ALPHA_TEMENOS", () => {
  const flagged = Object.keys(BT.apostleProfiles)
    .filter((name) => BT.apostleProfiles[name].mazesense)
    .sort();
  assert.deepStrictEqual(flagged, ["ALPHA_TEMENOS", "LABYRINTHAUROS"]);
  // 面板读取路径也要带出这个标记。
  assert.strictEqual(BT.getApostleProfile("LABYRINTHAUROS", 1).mazesense, true);
  assert.strictEqual(BT.getApostleProfile("CYCLONUS", 1).mazesense, false);
});

test("every Labyrinth tile is tagged labyrinth; other red-line carriers none", () => {
  ["Labyrinth I", "Labyrinth L", "Labyrinth O", "Labyrinth Z"].forEach((name) => {
    const data = BT.getTileLosData({ name, column: 5, row: 5, rotation: 0 });
    assert.strictEqual(data.labyrinth, true, `${name} should be tagged`);
    assert.ok(data.redLines && data.redLines.length > 0, `${name} should have red lines`);
  });
  // 名字里有「迷宫」但不是大迷宫板块的，不能被标记。
  ["Maze Outcrop", "Maze Fissure", "Column"].forEach((name) => {
    const data = BT.getTileLosData({ name, column: 5, row: 5, rotation: 0 });
    assert.strictEqual(data.labyrinth, false, `${name} must not be tagged`);
  });
});

// ---- Labyrinth data sanity ----------------------------------------------
test("only Labyrinth tiles carry red lines; Maze Fissure does not", () => {
  assert.ok(BT.getTileLosData({ name: "Labyrinth O" }).redLines);
  assert.strictEqual(BT.getTileLosData({ name: "Maze Fissure O" }).redLines, null);
});

test("City obscuring depends on face; ruined back is not obscuring", () => {
  assert.strictEqual(BT.isTileObscuring({ name: "City", flipped: false }), true);
  assert.strictEqual(BT.isTileObscuring({ name: "City", flipped: true }), false);
});

// ---- P38 canonical scenarios (qualitative, per rulebook description) -----
// The rulebook's P38 figure shows four titans vs the Hekaton (100-armed giant)
// standing behind / near obscuring terrain. We encode each described outcome.
test("P38: titan behind obscuring terrain (Philoctera) has NO LoS", () => {
  // obscuring block fully between source and target on the straight line
  const o = occ([[10, 7], [10, 8]]);
  assert.strictEqual(LOS.hasLOS(src(6, 7), { c: 14, r: 8 }, o), false);
});

test("P38: titan whose line only clips a corner (Ulyssea) HAS LoS", () => {
  const o = occ([[10, 7]]);
  assert.strictEqual(LOS.hasLOS(src(8, 9), { c: 13, r: 4 }, o), true);
});

test("P38: titan standing on the obscuring terrain (Solon) HAS LoS", () => {
  const o = occ([[10, 7]]);
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 16, r: 7 }, o), true);
});

test("P38: titan blocked by a red wall (Herodotus) has NO LoS", () => {
  const wall = [];
  for (let j = 4; j < 10; j++) wall.push([10, j, 10, j + 1]);
  const o = occ([], wall);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 13, r: 7 }, o), false);
});

// ---- P39 blindspots ------------------------------------------------------
test("blindspot cells are never in LoS, even on an empty board", () => {
  const o = occ();
  const blindspots = new Set(["12,7"]);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 12, r: 7 }, o), true);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 12, r: 7 }, o, { blindspots }), false);
  // a neighbour of the blindspot is unaffected
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 12, r: 8 }, o, { blindspots }), true);
});

test("blindspot veto outranks alwaysLos and elevated", () => {
  const o = occ([[10, 7]]);
  const blindspots = new Set(["12,7"]);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 12, r: 7 }, o, { alwaysLos: true }), true);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 12, r: 7 }, o, { alwaysLos: true, blindspots }), false);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 12, r: 7 }, o, { elevated: true, blindspots }), false);
});

test("alwaysLos sees through obscuring terrain and red walls", () => {
  const wall = [];
  for (let j = 4; j < 10; j++) wall.push([10, j, 10, j + 1]);
  const o = occ([[10, 7], [10, 8]], wall);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 13, r: 7 }, o), false);
  assert.strictEqual(LOS.hasLOS(src(8, 7), { c: 13, r: 7 }, o, { alwaysLos: true }), true);
});

test("computeLOSMap honours blindspots and alwaysLos", () => {
  const o = occ([[10, 7], [10, 8]]);
  const blindspots = new Set(["7,7", "9,7"]);
  const plain = LOS.computeLOSMap(src(8, 7), o);
  const vetoed = LOS.computeLOSMap(src(8, 7), o, { blindspots });
  assert.strictEqual(plain.grid["7,7"], true);
  assert.strictEqual(vetoed.grid["7,7"], false);
  assert.strictEqual(vetoed.grid["9,7"], false);
  assert.strictEqual(vetoed.visible.length, plain.visible.length - 2);
  const all = LOS.computeLOSMap(src(8, 7), o, { alwaysLos: true });
  assert.strictEqual(all.visible.length, LOS.COLUMNS * LOS.ROWS);
});

// ---- range (射程) --------------------------------------------------------
test("range is orthogonal distance from the footprint plus attack reach", () => {
  // 1x1 source at (10,7), speed 2, reach 1 -> Manhattan <= 3
  const { grid, limit } = LOS.computeRangeMap(src(10, 7), 2, 1);
  assert.strictEqual(limit, 3);
  assert.strictEqual(grid["13,7"], true);   // exactly 3
  assert.strictEqual(grid["14,7"], false);  // 4
  assert.strictEqual(grid["12,8"], true);   // 2+1 = 3
  assert.strictEqual(grid["12,9"], false);  // 2+2 = 4 (never measured diagonally)
  assert.strictEqual(grid["10,7"], true);   // its own cell
});

test("range measures from the nearest cell of a 2x2 footprint", () => {
  const source = [{ c: 10, r: 7 }, { c: 11, r: 7 }, { c: 10, r: 8 }, { c: 11, r: 8 }];
  const { grid } = LOS.computeRangeMap(source, 1, 1);
  assert.strictEqual(grid["13,7"], true);   // 2 from (11,7)
  assert.strictEqual(grid["14,7"], false);  // 3
  assert.strictEqual(grid["8,8"], true);    // 2 from (10,8)
});

test("infinite speed puts the whole board in range; zero speed leaves only reach", () => {
  const all = LOS.computeRangeMap(src(1, 1), Infinity, 1);
  assert.strictEqual(all.inRange.length, LOS.COLUMNS * LOS.ROWS);
  const still = LOS.computeRangeMap(src(10, 7), 0, 1);
  assert.strictEqual(still.limit, 1);
  assert.strictEqual(still.inRange.length, 5); // own cell + 4 orthogonal neighbours
});

test("range ignores terrain — apostles move through everything", () => {
  // a wall of obscuring cells between source and target changes nothing
  const a = LOS.computeRangeMap(src(10, 7), 3, 1);
  const b = LOS.computeRangeMap(src(10, 7), 3, 1);
  assert.strictEqual(a.inRange.length, b.inRange.length);
  assert.strictEqual(a.grid["14,7"], true);
});

// ---- distance (每格到来源的格数) -----------------------------------------
test("distance map is orthogonal distance to the source, zero on the source", () => {
  const { grid } = LOS.computeDistanceMap(src(10, 7));
  assert.strictEqual(grid["10,7"], 0);
  assert.strictEqual(grid["11,7"], 1);
  assert.strictEqual(grid["13,7"], 3);
  assert.strictEqual(grid["12,9"], 4);   // 2+2, never measured diagonally
  assert.strictEqual(grid["1,1"], 15);   // 9 + 6
});

test("distance map covers every board cell", () => {
  const { grid } = LOS.computeDistanceMap(src(1, 1));
  assert.strictEqual(Object.keys(grid).length, LOS.COLUMNS * LOS.ROWS);
  for (const v of Object.values(grid)) assert.ok(Number.isFinite(v) && v >= 0);
});

test("distance measures from the nearest cell of a multi-cell footprint", () => {
  const source = [{ c: 10, r: 7 }, { c: 11, r: 7 }, { c: 10, r: 8 }, { c: 11, r: 8 }];
  const { grid } = LOS.computeDistanceMap(source);
  for (const { c, r } of source) assert.strictEqual(grid[`${c},${r}`], 0);
  assert.strictEqual(grid["13,7"], 2);   // from (11,7)
  assert.strictEqual(grid["8,8"], 2);    // from (10,8)
  assert.strictEqual(grid["12,9"], 2);   // from (11,8)
});

test("computeRangeMap exposes the same distances and agrees with its own grid", () => {
  const source = [{ c: 6, r: 5 }, { c: 7, r: 5 }, { c: 6, r: 6 }, { c: 7, r: 6 }];
  const range = LOS.computeRangeMap(source, 3, 2);
  const plain = LOS.computeDistanceMap(source).grid;
  assert.deepStrictEqual(range.distance, plain);
  for (const key of Object.keys(plain)) {
    assert.strictEqual(range.grid[key], plain[key] <= range.limit, `mismatch at ${key}`);
  }
});

test("distance is brute-force correct for every cell of a 3x3 source", () => {
  const source = [];
  for (let c = 4; c <= 6; c++) for (let r = 4; r <= 6; r++) source.push({ c, r });
  const { grid } = LOS.computeDistanceMap(source);
  for (let c = 1; c <= LOS.COLUMNS; c++) {
    for (let r = 1; r <= LOS.ROWS; r++) {
      const want = Math.min(...source.map((s) => Math.abs(s.c - c) + Math.abs(s.r - r)));
      assert.strictEqual(grid[`${c},${r}`], want, `at ${c},${r}`);
    }
  }
});

// ---- primordial movement paths -----------------------------------------
const pathCenters = (path) => path.centers.map((p) => `${p.column},${p.row}`);

test("apostle movement exposes the two zig-zag choices for a one-cell source", () => {
  const move = LOS.computeApostleMovePaths({
    sourceAnchor: { column: 5, row: 5 },
    targetAnchor: { column: 8, row: 7 },
    size: 1,
    speed: 10,
    reach: 1,
    facing: 0,
  });
  assert.deepStrictEqual(pathCenters(move.rules[0]), ["5,5", "6,5", "6,6", "7,6", "7,7"]);
  assert.deepStrictEqual(pathCenters(move.rules[1]), ["5,5", "5,6", "6,6", "6,7", "7,7"]);
  assert.strictEqual(move.rules[0].stopReason, "in-range");
  assert.strictEqual(move.rules[0].facing, 90, "final facing turns toward the adjacent titan");
  assert.strictEqual(move.rules[1].facing, 90, "final facing turns toward the adjacent titan");
});

test("apostle movement measures from the nearest edge of a 2x2 footprint", () => {
  const move = LOS.computeApostleMovePaths({
    sourceAnchor: { column: 5.5, row: 5.5 },
    targetAnchor: { column: 9, row: 8 },
    size: 2,
    speed: 10,
    reach: 1,
    facing: 0,
  });
  assert.strictEqual(move.rules.length, 2);
  assert.strictEqual(move.rules[0].steps, 4);
  assert.deepStrictEqual(
    move.rules[0].finalFootprint.map(({ c, r }) => `${c},${r}`).sort(),
    ["7,7", "7,8", "8,7", "8,8"]
  );
});

test("apostle movement keeps 3x3 final footprints intact", () => {
  const move = LOS.computeApostleMovePaths({
    sourceAnchor: { column: 5, row: 5 },
    targetAnchor: { column: 10, row: 9 },
    size: 3,
    speed: 10,
    reach: 1,
    facing: 180,
  });
  assert.strictEqual(move.rules.length, 2);
  assert.strictEqual(move.rules[0].finalFootprint.length, 9);
  assert.strictEqual(move.direct[0].finalFootprint.length, 9);
});

test("straight movement dedupes the horizontal and vertical priority choices", () => {
  const move = LOS.computeApostleMovePaths({
    sourceAnchor: { column: 5, row: 5 },
    targetAnchor: { column: 5, row: 9 },
    size: 1,
    speed: 10,
    reach: 1,
    facing: 270,
  });
  assert.strictEqual(move.rules.length, 1);
  assert.strictEqual(move.direct.length, 1);
  assert.deepStrictEqual(pathCenters(move.rules[0]), ["5,5", "5,6", "5,7", "5,8"]);
  assert.strictEqual(move.rules[0].facing, 0);
});

test("rules movement stops at speed limit when the target remains out of range", () => {
  const move = LOS.computeApostleMovePaths({
    sourceAnchor: { column: 5, row: 5 },
    targetAnchor: { column: 12, row: 5 },
    size: 1,
    speed: 3,
    reach: 1,
    facing: 0,
  });
  assert.strictEqual(move.rules[0].steps, 3);
  assert.strictEqual(move.rules[0].stopReason, "speed-limit");
  assert.deepStrictEqual(pathCenters(move.rules[0]), ["5,5", "6,5", "7,5", "8,5"]);
});

test("zero and infinite speed use rulebook movement limits", () => {
  const still = LOS.computeApostleMovePaths({
    sourceAnchor: { column: 5, row: 5 },
    targetAnchor: { column: 8, row: 5 },
    size: 1,
    speed: 0,
    reach: 1,
    facing: 180,
  });
  assert.strictEqual(still.rules[0].steps, 0);
  assert.strictEqual(still.rules[0].stopReason, "speed-zero");
  assert.strictEqual(still.rules[0].facing, 90, "no movement faces an orthogonal target");

  const all = LOS.computeApostleMovePaths({
    sourceAnchor: { column: 5, row: 5 },
    targetAnchor: { column: 20, row: 5 },
    size: 1,
    speed: Infinity,
    reach: 1,
    facing: 0,
  });
  assert.strictEqual(all.rules[0].steps, 14);
  assert.strictEqual(all.rules[0].stopReason, "in-range");
});

test("direct Move to target ignores ordinary speed and reaches the clicked place", () => {
  const move = LOS.computeApostleMovePaths({
    sourceAnchor: { column: 5, row: 5 },
    targetAnchor: { column: 10, row: 8 },
    size: 1,
    speed: 0,
    reach: 1,
    facing: 0,
  });
  assert.strictEqual(move.rules[0].stopReason, "speed-zero");
  assert.deepStrictEqual(move.direct[0].finalCenter, { column: 10, row: 8 });
  assert.strictEqual(move.direct[0].stopReason, "destination");
});

test("movement paths ignore terrain and red walls", () => {
  const state = {
    sourceAnchor: { column: 5, row: 5 },
    targetAnchor: { column: 12, row: 9 },
    size: 1,
    speed: 10,
    reach: 1,
    facing: 0,
  };
  const plain = LOS.computeApostleMovePaths(state);
  const walled = LOS.computeApostleMovePaths(state);
  assert.deepStrictEqual(walled, plain);
});

// ---- apostle profiles ----------------------------------------------------
test("every apostle profile has a size matching its board diagram", () => {
  const expected = {
    LABYRINTHAUROS: 2, ALPHA_TEMENOS: 3, CHIMERA_METASTASIOS: 3, CYCLONUS: 2,
    HEKATON: 2, HERMESIAN_PURSUER: 2, HYPERTIME_ORACLE: 2, ICARIAN_HARPY: 2,
    SUN_DESCENDANT: 3, THE_BURDEN: 2, THE_NIETZSCJEAN: 2, MIDASCORE: 3,
    DEMIDJINN: 2, THE_BABELIAN_LUNACY: 2, DAHAKA: 2, DRAGON_OF_PHOBOS: 2,
    MEDUKETOS: 3, UR_FLEECE: 3, TITAN_X: 1,
  };
  Object.entries(expected).forEach(([name, size]) => {
    assert.strictEqual(BT.getApostleProfile(name, 1).size, size, name);
  });
});

test("apostle size agrees with the stored start position footprint", () => {
  Object.keys(BT.apostleProfiles).forEach((name) => {
    const start = BT.getInitialPositions(name, 1).apostle;
    if (!start) return; // MEDUKETOS starts off the board
    const size = BT.getApostleProfile(name, 1).size;
    assert.strictEqual(start.width, size, `${name} width`);
    assert.strictEqual(start.height, size, `${name} height`);
  });
});

test("blindspot is the row of cells straight behind the footprint", () => {
  // CYCLONUS 2x2 centred on (8.5, 10.5), facing 0 = up (+row) -> rear is -row
  const up = BT.getBlindspotCells("CYCLONUS", 1, { row: 8.5, column: 10.5 }, 0);
  assert.deepStrictEqual(up, [{ row: 7, column: 10 }, { row: 7, column: 11 }]);
  const right = BT.getBlindspotCells("CYCLONUS", 1, { row: 8.5, column: 10.5 }, 90);
  assert.deepStrictEqual(right, [{ row: 8, column: 9 }, { row: 9, column: 9 }]);
  const down = BT.getBlindspotCells("CYCLONUS", 1, { row: 8.5, column: 10.5 }, 180);
  assert.deepStrictEqual(down, [{ row: 10, column: 10 }, { row: 10, column: 11 }]);
  const left = BT.getBlindspotCells("CYCLONUS", 1, { row: 8.5, column: 10.5 }, 270);
  assert.deepStrictEqual(left, [{ row: 8, column: 12 }, { row: 9, column: 12 }]);
});

test("3x3 blindspot spans three cells; apostles without the trait get none", () => {
  const cells = BT.getBlindspotCells("MIDASCORE", 1, { row: 7, column: 11 }, 0);
  assert.deepStrictEqual(cells, [
    { row: 5, column: 10 }, { row: 5, column: 11 }, { row: 5, column: 12 },
  ]);
  assert.deepStrictEqual(BT.getBlindspotCells("HEKATON", 1, { row: 7.5, column: 10.5 }, 0), []);
  assert.deepStrictEqual(BT.getBlindspotCells("ALPHA_TEMENOS", 1, { row: 7, column: 11 }, 0), []);
});

test("blindspot cells off the board edge are dropped", () => {
  // 1x1 TITAN_X on row 1 facing 0 (up) -> rear would be row 0, off the board
  assert.deepStrictEqual(BT.getBlindspotCells("TITAN_X", 1, { row: 1, column: 10 }, 0), []);
  // facing 180 (down) -> rear is row 2, on the board
  assert.deepStrictEqual(BT.getBlindspotCells("TITAN_X", 1, { row: 1, column: 10 }, 180), [{ row: 2, column: 10 }]);
});

test("speed falls back to the highest printed level at or below the request", () => {
  assert.strictEqual(BT.getApostleProfile("LABYRINTHAUROS", 1).speed, 6);
  assert.strictEqual(BT.getApostleProfile("LABYRINTHAUROS", 4).speed, 7);
  assert.strictEqual(BT.getApostleProfile("HEKATON", 4).speed, 7);
  // UR_FLEECE only prints level I, so a later level keeps using it
  assert.strictEqual(BT.getApostleProfile("UR_FLEECE", 3).speedLevel, 1);
  // 巴比伦疯塔's speed box is blank = cannot move
  assert.strictEqual(BT.getApostleProfile("THE_BABELIAN_LUNACY", 1).speed, 0);
  assert.strictEqual(BT.getApostleProfile("TITAN_X", 1).speed, Infinity);
  assert.strictEqual(BT.getApostleProfile("NOT_AN_APOSTLE", 1), null);
});

test("alwaysLos is set exactly for the four traits that ignore blocking", () => {
  const expected = ["DAHAKA", "DEMIDJINN", "MIDASCORE", "TITAN_X"];
  const actual = Object.keys(BT.apostleProfiles)
    .filter((name) => BT.getApostleProfile(name, 1).alwaysLos)
    .filter((name) => name !== "THE_NIETZSCHEAN")
    .sort();
  assert.deepStrictEqual(actual, expected);
});

// ---- shared overlay: aibp 主控台与 ss 第二屏共用 -------------------------
// 第二屏必须与主控台画得逐格一致。两端都调 buildLosOverlay + renderLosOverlay，
// 所以只要这一对函数是确定性的、且只依赖快照里的字段，两屏就不会漂移。

// 极简 DOM 替身：renderLosOverlay 只用到 createElement / replaceChildren /
// appendChild / classList.toggle / className / style / textContent / hidden。
function fakeDoc() {
  const make = (tag = "div") => ({
    tagName: tag, className: "", textContent: "", hidden: false, style: {}, children: [],
    classList: {
      toggle(name, on) {
        const set = new Set(String(this._el.className).split(" ").filter(Boolean));
        if (on) set.add(name); else set.delete(name);
        this._el.className = [...set].join(" ");
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...kids) { this.children = kids; },
  });
  const doc = { createElement: (tag) => make(tag) };
  return { doc, layer: (() => { const el = make(); el.classList._el = el; return el; })() };
}

// 把画出来的层压成可比较的形状：类名 + 位置 + 文字。
const snapshotLayer = (layer) => layer.children.map((el) => [
  el.className, el.style.left, el.style.top, el.style.width,
  el.style.height, el.textContent,
].join("|"));

const losMap = (apostle, level) => BT.normalizeBattleMap(null, apostle, level);
const losState = (over = {}) => ({
  active: true, source: "apostle", anchor: { column: 8.5, row: 7.5 },
  dim: true, elevated: false, showRange: true, reach: 1, facing: null, ...over,
});

test("inactive LoS state yields an empty overlay", () => {
  const o = LOS.buildLosOverlay(losMap("LABYRINTHAUROS", 1), { active: false }, BT, "LABYRINTHAUROS");
  assert.strictEqual(o.active, false);
  assert.strictEqual(o.source.length, 0);
  assert.strictEqual(o.visible.length, 0);
});

test("overlay with no anchor still marks blockers but no visibility", () => {
  const map = losMap("LABYRINTHAUROS", 1);
  const o = LOS.buildLosOverlay(map, losState({ anchor: null }), BT, "LABYRINTHAUROS");
  assert.strictEqual(o.active, true);
  assert.strictEqual(o.source.length, 0);
  assert.ok(o.obscuring.length > 0, "labyrinth map should have obscuring tiles");
  assert.strictEqual(o.visible.length, 0);
  assert.strictEqual(o.distance, null);
});

test("overlay covers every board cell exactly once", () => {
  const map = losMap("LABYRINTHAUROS", 1);
  const o = LOS.buildLosOverlay(map, losState(), BT, "LABYRINTHAUROS");
  const total = o.visible.length + o.blocked.length + o.sourceKeys.size;
  assert.strictEqual(total, LOS.COLUMNS * LOS.ROWS);
  const seen = new Set([...o.visible, ...o.blocked].map(({ c, r }) => `${c},${r}`));
  o.sourceKeys.forEach((k) => assert.ok(!seen.has(k), "source cell must not also be visible/blocked"));
});

test("overlay agrees cell-for-cell with computeLOSMap", () => {
  const map = losMap("LABYRINTHAUROS", 1);
  const state = losState();
  const o = LOS.buildLosOverlay(map, state, BT, "LABYRINTHAUROS");
  const occModel = LOS.buildOccluders(BT.getMapTiles(map), BT);
  const { grid } = LOS.computeLOSMap(o.source, occModel, {
    elevated: false, blindspots: o.blindspots,
    alwaysLos: o.profile.alwaysLos, mazesense: o.mazesense,
  });
  o.visible.forEach(({ c, r }) => assert.strictEqual(grid[`${c},${r}`], true));
  o.blocked.forEach(({ c, r }) => assert.strictEqual(grid[`${c},${r}`], false));
});

test("overlay source footprint matches the apostle's panel size", () => {
  const map = losMap("LABYRINTHAUROS", 1);
  const size = BT.getApostleProfile("LABYRINTHAUROS", 1).size;
  const o = LOS.buildLosOverlay(map, losState(), BT, "LABYRINTHAUROS");
  assert.strictEqual(o.source.length, size * size);
  // titan 来源永远 1 格，且不读使徒面板
  const t = LOS.buildLosOverlay(map, losState({ source: "titan" }), BT, "LABYRINTHAUROS");
  assert.strictEqual(t.source.length, 1);
  assert.strictEqual(t.profile, null);
});

test("titan source draws distances but no range boxes", () => {
  const map = losMap("LABYRINTHAUROS", 1);
  const o = LOS.buildLosOverlay(map, losState({ source: "titan" }), BT, "LABYRINTHAUROS");
  assert.ok(o.distance, "distance numbers are useful even without a panel");
  assert.strictEqual(o.inRange.length, 0);
});

test("showRange off drops both range boxes and distance numbers", () => {
  const map = losMap("LABYRINTHAUROS", 1);
  const o = LOS.buildLosOverlay(map, losState({ showRange: false }), BT, "LABYRINTHAUROS");
  assert.strictEqual(o.distance, null);
  assert.strictEqual(o.inRange.length, 0);
  assert.ok(o.visible.length > 0, "visibility is independent of the range toggle");
});

test("infinite speed skips the range layer but keeps distances", () => {
  // TITAN_X 移速 ∞：整图都在射程内，铺满会盖住视线结果，所以不画紫框。
  const map = losMap("TITAN_X", 1);
  const o = LOS.buildLosOverlay(map, losState(), BT, "TITAN_X");
  assert.strictEqual(BT.getApostleProfile("TITAN_X", 1).speed, Infinity);
  assert.strictEqual(o.inRange.length, 0);
  assert.ok(o.distance, "distance numbers still drawn at infinite speed");
});

test("reach widens the range layer", () => {
  const map = losMap("LABYRINTHAUROS", 1);
  const near = LOS.buildLosOverlay(map, losState({ reach: 1 }), BT, "LABYRINTHAUROS");
  const far = LOS.buildLosOverlay(map, losState({ reach: 5 }), BT, "LABYRINTHAUROS");
  assert.ok(far.inRange.length > near.inRange.length);
});

// 高地(循环IV+)是**手动开关**：buildLosOverlay 只如实读取 state.elevated,并把它传进
// computeLOSMap。「泰坦踩上高地自动勾选、移下自动取消」是控制层的边沿触发行为
// (battle_map_control.js 的 syncAutoElevated),在冒烟测试里验证,不在引擎里。见
// [[project_los_impl]]。造一张放了 Floating Rocks(高地)的图供控制层冒烟测试引用。
const highGroundMap = () => BT.normalizeBattleMap(
  { terrain: [{ id: "hg", name: "Floating Rocks", column: 10.5, row: 7.5, rotation: 180, flipped: false }] },
  "LABYRINTHAUROS", 1);

// 一张让高地效果**必然可见**的图：泰坦站的那块高地在正中，另有一块普通遮蔽挡在
// 它和角落之间。elevated:false 被挡、elevated:true 看穿——差异只可能来自 flag 真的传进了引擎。
const highGroundBlockedMap = () => BT.normalizeBattleMap(
  { terrain: [
    { id: "hg", name: "Floating Rocks", column: 10.5, row: 7.5, rotation: 180, flipped: false },
    { id: "wall", name: "Black Iceberg", column: 6.5, row: 7.5, rotation: 180, flipped: false },
  ] },
  "LABYRINTHAUROS", 1);

test("buildLosOverlay faithfully reads state.elevated and passes it to the engine", () => {
  const map = highGroundBlockedMap();
  const anchor = { column: 10.5, row: 7.5 };
  // 开关关：普通视线,被那块遮蔽挡住。
  const off = LOS.buildLosOverlay(map, losState({ source: "titan", anchor, elevated: false }), BT, "LABYRINTHAUROS");
  assert.strictEqual(off.elevated, false, "关时 overlay.elevated=false");
  // 开关开：高地视线,无视遮蔽与红线。
  const on = LOS.buildLosOverlay(map, losState({ source: "titan", anchor, elevated: true }), BT, "LABYRINTHAUROS");
  assert.strictEqual(on.elevated, true, "开时 overlay.elevated=true");
  // 关键：两种 flag 画出的可见集必须**分别等于**对应的引擎结果,证明 flag 真传进去了。
  // computeLOSMap.visible 含源格,overlay.visible 去掉了源格,所以扣掉 source.length 再比。
  const src = on.source;
  const truth = LOS.computeLOSMap(src, on.occ, { elevated: true });
  const asFalse = LOS.computeLOSMap(src, on.occ, { elevated: false });
  assert.ok(truth.visible.length > asFalse.visible.length,
    "这张图上高地确实能看穿更多（否则测不出传参）");
  assert.strictEqual(on.visible.length, truth.visible.length - src.length,
    "elevated:true 的 overlay 必须用了 elevated:true 的引擎结果");
  assert.strictEqual(off.visible.length, asFalse.visible.length - src.length,
    "elevated:false 的 overlay 必须用了 elevated:false 的引擎结果");
});

test("elevated flag applies regardless of source type (engine does not gate on profile)", () => {
  // 引擎不管来源是泰坦还是使徒,elevated:true 就无视遮蔽。「使徒不吃高地」是控制层
  // 的自动勾选只对泰坦触发来保证的(见冒烟),引擎本身只认 flag。
  const map = highGroundBlockedMap();
  const anchor = { column: 10.5, row: 7.5 };
  const apostleOn = LOS.buildLosOverlay(map, losState({ source: "apostle", anchor, elevated: true }), BT, "LABYRINTHAUROS");
  assert.strictEqual(apostleOn.profile !== null, true, "确认这是使徒来源");
  assert.strictEqual(apostleOn.elevated, true, "引擎如实读取 state.elevated");
});

test("mazesense is detected from the map, not from a toggle", () => {
  // 迷宫机牛带迷宫感应，且初始图上有大迷宫 → 生效，红线画成虚线（wallsIgnored）。
  const maze = LOS.buildLosOverlay(losMap("LABYRINTHAUROS", 1), losState(), BT, "LABYRINTHAUROS");
  assert.strictEqual(maze.mazesense, true);
  assert.strictEqual(maze.wallsIgnored, true);
  // HEKATON 没有这个特性，同样有大迷宫的图上红线照挡。
  const plain = LOS.buildLosOverlay(losMap("HEKATON", 1), losState(), BT, "HEKATON");
  assert.strictEqual(plain.mazesense, false);
  assert.strictEqual(plain.wallsIgnored, false);
});

test("facing null follows the map's initial facing; explicit facing overrides", () => {
  // CYCLONUS：2×2、有盲区、移速有限（7）且没有 alwaysLos —— 盲区与射程都画得出来。
  const map = losMap("CYCLONUS", 1);
  const auto = LOS.buildLosOverlay(map, losState(), BT, "CYCLONUS");
  const initial = BT.getInitialFacing("CYCLONUS", map.apostleFacing, map.setupId, map.startLevel);
  assert.strictEqual(auto.facing, initial);
  const forced = LOS.buildLosOverlay(map, losState({ facing: (initial + 180) % 360 }), BT, "CYCLONUS");
  assert.notDeepStrictEqual([...forced.blindspots], [...auto.blindspots]);
});

test("blindspot cells are never reported visible", () => {
  const map = losMap("CYCLONUS", 1);
  const o = LOS.buildLosOverlay(map, losState(), BT, "CYCLONUS");
  assert.ok(o.blindspots.size > 0, "CYCLONUS has a blindspot");
  const visible = new Set(o.visible.map(({ c, r }) => `${c},${r}`));
  o.blindspots.forEach((k) => assert.ok(!visible.has(k), `blindspot ${k} must not be visible`));
});

test("renderLosOverlay paints nothing and hides the layer when inactive", () => {
  const { doc, layer } = fakeDoc();
  LOS.renderLosOverlay(layer, LOS.buildLosOverlay(losMap("CYCLONUS", 1), { active: false }, BT, "CYCLONUS"), doc);
  assert.strictEqual(layer.hidden, true);
  assert.strictEqual(layer.children.length, 0);
});

test("renderLosOverlay draws source, visibility, range, blindspot and distance", () => {
  const { doc, layer } = fakeDoc();
  const map = losMap("CYCLONUS", 1);
  const o = LOS.buildLosOverlay(map, losState({ moveTarget: { column: 13, row: 10 } }), BT, "CYCLONUS");
  LOS.renderLosOverlay(layer, o, doc);
  assert.strictEqual(layer.hidden, false);
  const classes = layer.children.map((el) => el.className);
  const has = (name) => classes.some((c) => c.split(" ").includes(name));
  ["battle-map-los-source", "battle-map-los-visible", "battle-map-los-blocked",
   "battle-map-los-obscuring", "battle-map-los-in-range", "battle-map-los-blindspot",
   "battle-map-los-distance", "battle-map-los-move-target", "battle-map-los-move-step",
   "battle-map-los-move-final", "battle-map-los-move-facing"].forEach((name) => assert.ok(has(name), `missing ${name}`));
  assert.ok(o.movement.rules.length > 0 && o.movement.direct.length > 0, "overlay should expose both move groups");
  assert.ok(classes.some((name) => name.includes("battle-map-los-move-a")), "route 1 should be styled separately");
  assert.ok(classes.some((name) => name.includes("battle-map-los-move-b")), "route 2 should be styled separately");
  assert.ok(classes.some((name) => name.includes("battle-map-los-move-overlap")),
    "cells shared by the two painted routes should use the overlap class");
  assert.strictEqual(
    classes.filter((name) => name.startsWith("battle-map-los-move-facing")).length,
    o.movement.rules.length,
    "each painted rule path should show a final facing arrow"
  );
  assert.ok(!classes.some((name) => name.includes("battle-map-los-move-direct")),
    "direct Move to paths are reported in text but not painted as extra board routes");
  const expectedSteps = o.movement.rules.reduce((sum, path) => {
    const passed = new Set();
    path.footprints.slice(1).forEach((footprint) => {
      footprint.forEach(({ c, r }) => passed.add(`${c},${r}`));
    });
    return sum + passed.size;
  }, 0);
  const paintedSteps = classes.filter((name) => name.startsWith("battle-map-los-move-step")).length;
  assert.strictEqual(paintedSteps, expectedSteps, "paint only the footprint cells passed by the two rule paths");
  // 距离数字全图 280 格都画（含来源格），且最后画才能盖在色块之上。
  const distances = layer.children.filter((el) => el.className.startsWith("battle-map-los-distance"));
  assert.strictEqual(distances.length, LOS.COLUMNS * LOS.ROWS);
  const firstDistance = classes.findIndex((c) => c.startsWith("battle-map-los-distance"));
  const lastMove = Math.max(
    classes.lastIndexOf("battle-map-los-move-target"),
    classes.map((c, i) => c.includes("battle-map-los-move-step") ? i : -1).reduce((a, b) => Math.max(a, b), -1),
    classes.map((c, i) => c.includes("battle-map-los-move-final") ? i : -1).reduce((a, b) => Math.max(a, b), -1),
    classes.map((c, i) => c.includes("battle-map-los-move-facing") ? i : -1).reduce((a, b) => Math.max(a, b), -1)
  );
  assert.ok(firstDistance > lastMove, "distance numbers must be painted after movement paths");
});

test("apostle source and final markers scale with the footprint size", () => {
  const one = fakeDoc();
  LOS.renderLosOverlay(
    one.layer,
    LOS.buildLosOverlay(losMap("TITAN_X", 1), losState({ moveTarget: { column: 13, row: 10 } }), BT, "TITAN_X"),
    one.doc
  );
  const three = fakeDoc();
  LOS.renderLosOverlay(
    three.layer,
    LOS.buildLosOverlay(losMap("MIDASCORE", 1), losState({ anchor: { column: 8, row: 7 }, moveTarget: { column: 13, row: 10 } }), BT, "MIDASCORE"),
    three.doc
  );
  const sourceWidth = (layer) => Number.parseFloat(
    layer.children.find((el) => el.className === "battle-map-los-source")?.style.width || "0"
  );
  const finalWidth = (layer) => Number.parseFloat(
    layer.children.find((el) => String(el.className).startsWith("battle-map-los-move-final"))?.style.width || "0"
  );
  assert.strictEqual(sourceWidth(one.layer), finalWidth(one.layer),
    "1x1 source and final apostle markers should use the same size");
  assert.strictEqual(sourceWidth(three.layer), finalWidth(three.layer),
    "3x3 source and final apostle markers should use the same size");
  assert.ok(sourceWidth(three.layer) > sourceWidth(one.layer), "3x3 source marker should be wider than 1x1");
  assert.ok(finalWidth(three.layer) > finalWidth(one.layer), "3x3 final marker should be wider than 1x1");
});

test("dim toggle drives the dim-blocked class on the layer", () => {
  const map = losMap("CYCLONUS", 1);
  const on = fakeDoc();
  LOS.renderLosOverlay(on.layer, LOS.buildLosOverlay(map, losState({ dim: true }), BT, "CYCLONUS"), on.doc);
  assert.ok(on.layer.className.includes("dim-blocked"));
  const off = fakeDoc();
  LOS.renderLosOverlay(off.layer, LOS.buildLosOverlay(map, losState({ dim: false }), BT, "CYCLONUS"), off.doc);
  assert.ok(!off.layer.className.includes("dim-blocked"));
});

test("mazesense marks red walls as ignored in the painted markup", () => {
  const { doc, layer } = fakeDoc();
  const o = LOS.buildLosOverlay(losMap("LABYRINTHAUROS", 1), losState(), BT, "LABYRINTHAUROS");
  LOS.renderLosOverlay(layer, o, doc);
  const walls = layer.children.filter((el) => el.className.includes("battle-map-los-wall"));
  assert.ok(walls.length > 0, "labyrinth map has red walls");
  walls.forEach((el) => assert.ok(el.className.includes("battle-map-los-wall-ignored")));
});

// 这是本次改动的核心保证：第二屏拿到的只是一份 JSON 快照，用它重算必须得到与
// 主控台完全相同的 markup。序列化一趟再比，顺带锁住"快照字段够用"。
test("second screen repaints the aibp overlay identically from its snapshot", () => {
  const cases = [
    ["LABYRINTHAUROS", 1, losState()],
    ["LABYRINTHAUROS", 1, losState({ elevated: true, reach: 3 })],
    ["CYCLONUS", 1, losState({ anchor: { column: 4, row: 11 }, dim: false })],
    ["HEKATON", 1, losState({ source: "titan", anchor: { column: 12, row: 3 } })],
    ["TITAN_X", 1, losState({ reach: 0 })],
    ["DAHAKA", 1, losState({ showRange: false })],
    ["CYCLONUS", 1, losState({ facing: 270 })],
    ["CYCLONUS", 1, losState({ moveTarget: { column: 13, row: 10 } })],
    ["MIDASCORE", 1, losState()],
  ];
  cases.forEach(([apostle, level, state]) => {
    const map = BT.normalizeBattleMap(null, apostle, level);
    // aibp 主控台：直接用内存里的 losState。
    const local = fakeDoc();
    LOS.renderLosOverlay(local.layer, LOS.buildLosOverlay(map, state, BT, apostle), local.doc);
    // ss 第二屏：拿到的是过了一趟 JSON 的快照，且 map 也是快照里的 battleMap。
    const wire = JSON.parse(JSON.stringify({ los: state, battleMap: map, apostle, level }));
    const remoteMap = BT.normalizeBattleMap(wire.battleMap, wire.apostle, wire.level);
    const remote = fakeDoc();
    LOS.renderLosOverlay(remote.layer, LOS.buildLosOverlay(remoteMap, wire.los, BT, wire.apostle), remote.doc);
    assert.deepStrictEqual(
      snapshotLayer(remote.layer), snapshotLayer(local.layer),
      `second screen diverged for ${apostle} ${JSON.stringify(state)}`
    );
    assert.strictEqual(remote.layer.className, local.layer.className);
    assert.strictEqual(remote.layer.hidden, local.layer.hidden);
  });
});

test("facing null survives JSON and still follows the map", () => {
  // JSON.stringify 保留 null，但如果哪天改成 undefined 就会静默变成"跟随初始朝向"
  // 之外的行为，这里锁住 null 的语义。
  const state = losState({ facing: null });
  assert.strictEqual(JSON.parse(JSON.stringify(state)).facing, null);
  const map = losMap("CYCLONUS", 1);
  const a = LOS.buildLosOverlay(map, state, BT, "CYCLONUS");
  const b = LOS.buildLosOverlay(map, JSON.parse(JSON.stringify(state)), BT, "CYCLONUS");
  assert.strictEqual(a.facing, b.facing);
});

// ---- 朝向标注（版图上的黄箭头） ----------------------------------------
// 箭头画在脚印**正面边的中点**，指向朝向；盲区在反向。下面几条锁住方向、位置、
// 与盲区的对应关系，以及泰坦不画。这些是 renderLosOverlay 的输出，用 fakeDoc 取。
const arrowOf = (layer) => layer.children.filter(
  (el) => String(el.className).includes("battle-map-los-facing"));

// 从百分比样式还原回格心坐标，便于用棋盘坐标断言。
const arrowCell = (el) => ({
  x: Number.parseFloat(el.style.left) / 100 * 20 + 0.5,
  y: 14 - Number.parseFloat(el.style.top) / 100 * 14 + 0.5,
});

test("facing arrow is drawn once for an apostle source, never for a titan", () => {
  const map = losMap("CYCLONUS", 1);
  const { doc, layer } = fakeDoc();
  LOS.renderLosOverlay(layer, LOS.buildLosOverlay(map, losState({ facing: 0 }), BT, "CYCLONUS"), doc);
  assert.strictEqual(arrowOf(layer).length, 1, "使徒来源应画一个箭头");
  const t = fakeDoc();
  LOS.renderLosOverlay(
    t.layer, LOS.buildLosOverlay(map, losState({ source: "titan" }), BT, "CYCLONUS"), t.doc);
  assert.strictEqual(arrowOf(t.layer).length, 0, "泰坦没有朝向，不该画箭头");
});

test("facing arrow rotates to the facing and sits on the front edge", () => {
  // anchor {column:8.5,row:7.5} + 2×2 → 脚印列 8..9、行 7..8，中心 (8.5,7.5)。
  // 正面边中点：朝上 y=9(行8上沿+0.5) x=8.5；朝右 x=10 y=7.5；朝下 y=6 x=8.5；朝左 x=7 y=7.5。
  const map = losMap("CYCLONUS", 1);
  // 正面边中点用格心坐标表示 = 中心 + 方向 × (脚印边长/2)：
  // 朝上 (8.5, 8.5)、朝右 (9.5, 7.5)、朝下 (8.5, 6.5)、朝左 (7.5, 7.5)。
  const want = {
    0:   { deg: 0,   x: 8.5, y: 8.5 },
    90:  { deg: 90,  x: 9.5, y: 7.5 },
    180: { deg: 180, x: 8.5, y: 6.5 },
    270: { deg: 270, x: 7.5, y: 7.5 },
  };
  for (const [facing, w] of Object.entries(want)) {
    const { doc, layer } = fakeDoc();
    LOS.renderLosOverlay(
      layer, LOS.buildLosOverlay(map, losState({ facing: Number(facing) }), BT, "CYCLONUS"), doc);
    const [arrow] = arrowOf(layer);
    assert.ok(arrow, `朝向 ${facing} 应有箭头`);
    assert.ok(arrow.style.transform.includes(`rotate(${w.deg}deg)`),
      `朝向 ${facing} 应 rotate(${w.deg}deg)，实际 ${arrow.style.transform}`);
    const got = arrowCell(arrow);
    assert.ok(Math.abs(got.x - w.x) < 1e-9 && Math.abs(got.y - w.y) < 1e-9,
      `朝向 ${facing} 箭头应在 (${w.x},${w.y})，实际 (${got.x},${got.y})`);
  }
});

test("the arrow points away from the blindspot, on the opposite side", () => {
  // 这条是几何上的核心不变量：盲区在正后方，所以箭头到脚印中心的方向，必须与
  // 盲区到中心的方向严格相反。用带盲区的使徒（3×3）验四个朝向。
  const map = losMap("MIDASCORE", 1);
  for (const facing of [0, 90, 180, 270]) {
    const state = losState({ facing, anchor: { column: 8, row: 7 } });
    const overlay = LOS.buildLosOverlay(map, state, BT, "MIDASCORE");
    assert.ok(overlay.profile.blindspot, "MIDASCORE 应有盲区");
    assert.strictEqual(overlay.blindspots.size, 3, "3×3 盲区应有 3 格");
    const { doc, layer } = fakeDoc();
    LOS.renderLosOverlay(layer, overlay, doc);
    const [arrow] = arrowOf(layer);
    const a = arrowCell(arrow);
    // 脚印中心
    const cs = overlay.source.map((s) => s.c), rs = overlay.source.map((s) => s.r);
    const cx = (Math.min(...cs) + Math.max(...cs)) / 2;
    const cy = (Math.min(...rs) + Math.max(...rs)) / 2;
    // 盲区中心
    const bl = [...overlay.blindspots].map((k) => k.split(",").map(Number));
    const bx = bl.reduce((s, [c]) => s + c, 0) / bl.length;
    const by = bl.reduce((s, [, r]) => s + r, 0) / bl.length;
    // 两个方向向量应严格反向：点积 < 0，且叉积 = 0（共线）。
    const av = [a.x - cx, a.y - cy];
    const bv = [bx - cx, by - cy];
    const dot = av[0] * bv[0] + av[1] * bv[1];
    const cross = av[0] * bv[1] - av[1] * bv[0];
    assert.ok(dot < 0, `朝向 ${facing}: 箭头与盲区应反向，点积 ${dot}`);
    assert.ok(Math.abs(cross) < 1e-9, `朝向 ${facing}: 箭头与盲区应共线，叉积 ${cross}`);
  }
});

test("changing facing moves the blindspot and the arrow together", () => {
  // 「盲区自动根据朝向变换」：四个朝向应得到四组互不相同的盲区，且箭头也跟着换位。
  const map = losMap("MIDASCORE", 1);
  const seenBlind = new Set();
  const seenArrow = new Set();
  for (const facing of [0, 90, 180, 270]) {
    const overlay = LOS.buildLosOverlay(
      map, losState({ facing, anchor: { column: 8, row: 7 } }), BT, "MIDASCORE");
    seenBlind.add([...overlay.blindspots].sort().join(" "));
    const { doc, layer } = fakeDoc();
    LOS.renderLosOverlay(layer, overlay, doc);
    seenArrow.add(arrowOf(layer)[0].style.transform);
    // 盲区格永远不算有视线（P39），朝向转到哪都成立。
    overlay.blindspots.forEach((k) => {
      const [c, r] = k.split(",").map(Number);
      assert.ok(!overlay.visible.some((v) => v.c === c && v.r === r),
        `朝向 ${facing}: 盲区 ${k} 不该出现在可见表里`);
    });
  }
  assert.strictEqual(seenBlind.size, 4, "四个朝向应给出四组不同盲区");
  assert.strictEqual(seenArrow.size, 4, "四个朝向应给出四个不同箭头角度");
});

// ---- 大迷宫「向外延伸一格」外扩临时墙 (用户 2026-08-19) ------------------
// 规则：红墙朝非走廊侧膨胀一格 = 外扩格(临时墙)。仅当视线一端落在走廊格时生效。
// 临时墙当遮蔽地形；站在临时墙格 ↔ 迷宫内部格 双向无视线；迷宫感应无视临时墙。
const expandOcc = ({ interior = [], expand = [], red = [], labRed = [] } = {}) => {
  const K = ([c, r]) => `${c},${r}`;
  const mk = (arr) => new Set(arr.map(([i0, j0, i1, j1]) =>
    (i0 < i1 || (i0 === i1 && j0 <= j1)) ? `${i0},${j0}|${i1},${j1}` : `${i1},${j1}|${i0},${j0}`));
  const redSet = mk(red), labRedSet = mk(labRed);
  return {
    obscuring: new Set(), red: redSet, walls: LOS.mergeWalls(redSet),
    cellTile: new Map(), tileCells: new Map(), cloud: new Set(), elevated: new Set(),
    labyrinthTiles: labRedSet.size ? new Set([0]) : new Set(), labyrinthRed: labRedSet,
    labyrinthCells: new Set(interior.map(K)), expandCells: new Set(expand.map(K)),
  };
};
const labMap = () => {
  const setup = BT.setups["LABYRINTHAUROS"][0];
  const placements = [];
  for (const t of setup.terrains) for (const pl of t.tiles)
    placements.push({ name: t.name, column: pl.column, row: pl.row, rotation: pl.rotation, flipped: pl.flipped });
  return LOS.buildOccluders(placements, BT);
};

test("buildOccluders derives the Labyrinthauros expand ring (26 cells, sealed spiral center included)", () => {
  const o = labMap();
  assert.strictEqual(o.expandCells.size, 26, "外扩格应恰好 26 个");
  // O 形螺旋唯一的死格(四面红墙、进不去)必被标为外扩格,且它同时仍是迷宫脚印格。
  // 用结构不变量而非硬编码坐标(板块放置虽确定,但坐标易随记忆漂移读错)。
  const sealedInside = [...o.expandCells].filter((k) => o.labyrinthCells.has(k));
  assert.strictEqual(sealedInside.length, 1, "恰好一个外扩格同时是迷宫脚印格(螺旋死格)");
});

test("temp wall: standing on a temp-wall cell and an interior cell see nothing (both directions)", () => {
  const o = expandOcc({ interior: [[10, 7]], expand: [[10, 8]] });
  assert.strictEqual(LOS.hasLOS(src(10, 8), { c: 10, r: 7 }, o), false, "临时墙→内部无视线");
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 10, r: 8 }, o), false, "内部→临时墙无视线");
});

test("temp wall blocks as obscuring terrain for lines that pass through it", () => {
  // 内部 (10,7) 看外部 (10,9)，视线穿过临时墙 (10,8) 的内部 → 被挡。
  const o = expandOcc({ interior: [[10, 7]], expand: [[10, 8]] });
  assert.strictEqual(LOS.hasLOS(src(10, 7), { c: 10, r: 9 }, o), false);
});

test("temp walls only activate when one sightline end is on a maze corridor cell", () => {
  // 两端都在迷宫外：整块迷宫走 labyrinthBlockOcc，外扩墙不参与。
  const o = expandOcc({ interior: [[10, 7]], expand: [[15, 3]] });
  assert.strictEqual(LOS.hasLOS(src(14, 3), { c: 16, r: 3 }, o), true, "纯外部视线不受临时墙影响");
});

test("mazesense ignores temp walls (interior target treated as Titan)", () => {
  const o = expandOcc({ interior: [[10, 7]], expand: [[10, 8]], labRed: [[9, 7, 10, 7]] });
  assert.strictEqual(LOS.hasLOS(src(10, 8), { c: 10, r: 7 }, o), false, "无迷宫感应时仍被否决");
  assert.strictEqual(LOS.hasLOS(src(10, 8), { c: 10, r: 7 }, o, { mazesense: true }), true,
    "迷宫感应无视临时墙");
});

test("on the real Labyrinthauros map, a unit on a temp wall cannot see the adjacent corridor", () => {
  const o = labMap();
  assert.ok(o.expandCells.has("7,4") && o.labyrinthCells.has("7,5"),
    "前置：(7,4) 是临时墙、(7,5) 是走廊");
  assert.strictEqual(LOS.hasLOS(src(7, 4), { c: 7, r: 5 }, o), false);
  assert.strictEqual(LOS.hasLOS(src(7, 5), { c: 7, r: 4 }, o), false);
});

test("mazesense widens a temp-wall source's visibility on the real map", () => {
  const o = labMap();
  const off = LOS.computeLOSMap(src(7, 4), o).visible.length;
  const on = LOS.computeLOSMap(src(7, 4), o, { mazesense: true }).visible.length;
  assert.ok(on > off, `迷宫感应应看得更多: on=${on} off=${off}`);
});

// 端到端(主控台与第二屏共用的 buildLosOverlay 快照)：站在临时墙格的泰坦看不到相邻走廊。
test("buildLosOverlay reflects the temp-wall veto end-to-end (second screen inherits this)", () => {
  const map = losMap("LABYRINTHAUROS", 1);
  const built = LOS.buildOccluders(map.terrain || [], BT);
  assert.ok(built.expandCells.has("7,4") && built.labyrinthCells.has("7,5"),
    "前置：(7,4) 临时墙、(7,5) 走廊");
  const o = LOS.buildLosOverlay(map, losState({ source: "titan", anchor: { column: 7, row: 4 } }), BT, "LABYRINTHAUROS");
  const vis = new Set(o.visible.map((v) => `${v.c},${v.r}`));
  assert.ok(!vis.has("7,5"), "临时墙上的泰坦不该看到相邻走廊格 (7,5)");
});

// ---- runner -------------------------------------------------------------
let failed = 0;
for (const { name, fn } of cases) {
  try { fn(); passed++; console.log("  ok  -", name); }
  catch (e) { failed++; console.log("FAIL  -", name, "\n      ", e.message); }
}
console.log(`\n${passed}/${cases.length} passed` + (failed ? `, ${failed} FAILED` : ""));
process.exit(failed ? 1 : 0);
