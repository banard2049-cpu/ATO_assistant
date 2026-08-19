/* 解析 Battle Setup Lua：按外层 for 循环块提取每个地形组的摆放（名/位置/旋转） */
const fs = require("node:fs");
const path = require("node:path");

const luaDir = path.join(__dirname, "lua");
const files = fs.readdirSync(luaDir).filter((f) => f.endsWith(".lua") && f !== "Clear.lua");

function parsePositions(body) {
  const out = {};
  const rotMatch = body.match(/local\s+rotation\s*=\s*\{([^}]*)\}/);
  if (rotMatch) out["$rotation"] = rotMatch[1].split(",").map((v) => parseFloat(v.trim()) || 0);
  const re = /local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{([\s\S]*?)\n\s*\}/g;
  let m;
  while ((m = re.exec(body))) {
    const name = m[1];
    const entries = [];
    const entryRe = /\{\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\}/g;
    let e;
    while ((e = entryRe.exec(m[2]))) {
      entries.push([parseFloat(e[1]), parseFloat(e[2]), parseFloat(e[3])]);
    }
    if (entries.length) out[name] = entries;
  }
  return out;
}

function parseRot(raw, positions) {
  const t = raw.trim();
  if (t === "rotation") return positions["$rotation"] || [0, 180, 0];
  return t.split(",").map((v) => parseFloat(v.trim().replace(/[{}]/g, "")) || 0);
}

function parseFunction(fnBody) {
  const positions = parsePositions(fnBody);
  const groups = [];
  // 每个外层 for 块从 "for _,terrainPosition in pairs(X) do" 开始，到下一个外层 for 之前。
  const parts = fnBody.split(/(?=for\s+[_\w, ]*terrainPosition\s*in\s*pairs\(\s*[A-Za-z_][A-Za-z0-9_]*\s*\)\s*do)/);
  for (const part of parts) {
    const head = part.match(/for\s+([_\w, ]*?)\s*terrainPosition\s*in\s*pairs\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*do/);
    if (!head) continue;
    const varName = head[2];
    const hasKey = head[1].includes("key");
    const nameMatch = part.match(/terrainTileInfo\.name\s*==\s*"([^"]+)"/);
    if (!nameMatch) continue;
    const posList = positions[varName] || [];
    const boxMatch = part.match(/takeTile\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*terrainTileInfo\.index/);
    const box = boxMatch ? boxMatch[1] : "";
    if (!hasKey) {
      // 无 key：所有位置同一旋转（通常一个 takeTile）
      const take = part.match(/takeTile\([^,]+,\s*terrainTileInfo\.index\s*,\s*terrainPosition\s*,\s*(\{[^}]*\}|rotation)\s*\)/);
      const rot = take ? parseRot(take[1], positions) : [0, 180, 0];
      groups.push({ ttsName: nameMatch[1], box, entries: posList.map((p) => ({ pos: p, rot })) });
      continue;
    }
    // 有 key：解析 if key == N ... elseif ... else 分支，把旋转分配给对应下标
    const byKey = {};
    let elseRot = null;
    // 捕获形如: (elseif|if) key == 1 or key == 3 then ... takeTile(..., {rot})
    const branchRe = /(?:if|elseif)\s+(key\s*==\s*\d+(?:\s+or\s+key\s*==\s*\d+)*)\s+then([\s\S]*?)(?=elseif|else\b|end)/g;
    let bm;
    while ((bm = branchRe.exec(part))) {
      const take = bm[2].match(/takeTile\([^,]+,\s*terrainTileInfo\.index\s*,\s*terrainPosition\s*,\s*(\{[^}]*\}|rotation)\s*\)/);
      if (!take) continue;
      const rot = parseRot(take[1], positions);
      for (const km of bm[1].matchAll(/key\s*==\s*(\d+)/g)) byKey[Number(km[1])] = rot;
    }
    const elseMatch = part.match(/else\b([\s\S]*?)(?=end)/);
    if (elseMatch) {
      const take = elseMatch[1].match(/takeTile\([^,]+,\s*terrainTileInfo\.index\s*,\s*terrainPosition\s*,\s*(\{[^}]*\}|rotation)\s*\)/);
      if (take) elseRot = parseRot(take[1], positions);
    }
    const entries = posList.map((p, idx) => ({
      pos: p,
      rot: byKey[idx + 1] || elseRot || [0, 180, 0],
    }));
    groups.push({ ttsName: nameMatch[1], box, entries });
  }
  return groups;
}

const result = {};
for (const file of files) {
  const src = fs.readFileSync(path.join(luaDir, file), "utf8");
  const fnRe = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\)([\s\S]*?)\nend/g;
  let m;
  while ((m = fnRe.exec(src))) {
    const fnName = m[1];
    if (fnName === "onload" || fnName === "takeTile") continue;
    const groups = parseFunction(m[2]);
    if (groups.length) result[fnName] = groups;
  }
}
fs.writeFileSync(path.join(__dirname, "tts-parse.json"), JSON.stringify(result, null, 1), "utf8");
console.log("parsed functions:", Object.keys(result).length);
Object.keys(result).forEach((k) => {
  const total = result[k].reduce((s, g) => s + g.entries.length, 0);
  console.log(k, "=>", total, "tiles");
});
