/* 提取 3458296558.json 中所有 Battle Setup Lua 脚本到 tools/lua/ */
const fs = require("node:fs");
const path = require("node:path");

const data = JSON.parse(fs.readFileSync(
  "E:\\Document\\My Games\\Tabletop Simulator\\Mods\\Workshop\\3458296558.json", "utf8"));

const outDir = path.join(__dirname, "lua");
fs.mkdirSync(outDir, { recursive: true });

const targets = ["Battle Setup Cycle I", "Battle Setup Cycle II", "Battle Setup Cycle III",
  "Battle Setup Cycle IV", "Battle Setup Cycle V", "Battle Setup Other",
  "Battle Setup Envelope Y", "Battle Setup Envelope S", "Clear"];

const walk = (obj) => {
  const nick = obj.Nickname || "";
  if (targets.includes(nick) && obj.LuaScript) {
    const safe = nick.replace(/[^a-zA-Z0-9]+/g, "_");
    fs.writeFileSync(path.join(outDir, `${safe}.lua`), obj.LuaScript, "utf8");
    console.log("wrote", safe, obj.LuaScript.length);
  }
  for (const key of ["ObjectStates", "ContainedObjects", "States"]) {
    const val = obj[key];
    if (Array.isArray(val)) val.forEach(walk);
    else if (val && typeof val === "object") Object.values(val).forEach(walk);
  }
};
walk(data);
