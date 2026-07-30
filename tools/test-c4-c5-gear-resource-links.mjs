import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";


const technologySource = fs.readFileSync("technology/index.html", "utf8")
  .replace(/\r\n/g, "\n");
const recordSource = fs.readFileSync("record/index.html", "utf8")
  .replace(/\r\n/g, "\n");
const production = JSON.parse(
  fs.readFileSync("technology/ato_gear_production.json", "utf8"),
);

function sourceLiteral(name, prefix, suffix) {
  const start = technologySource.indexOf(`${prefix}${name}`);
  assert.notEqual(start, -1, `${name} declaration not found`);
  const valueStart = technologySource.indexOf("=", start) + 1;
  const valueEnd = technologySource.indexOf(suffix, valueStart);
  assert.notEqual(valueEnd, -1, `${name} declaration end not found`);
  return technologySource.slice(valueStart, valueEnd).trim();
}

function sourceObject(name) {
  return vm.runInNewContext(
    `(${sourceLiteral(name, "const ", "\n};")}\n})`,
  );
}

function sourceSet(name) {
  return new Set(vm.runInNewContext(
    sourceLiteral(name, "const ", ";\nconst").replace(/^new Set\(/, "("),
  ));
}

function recordCycleBlock(cycle) {
  const startToken = `\n      ${cycle}: {`;
  const start = recordSource.indexOf(startToken);
  assert.notEqual(start, -1, `${cycle} record definition not found`);
  const nextCycle = Number(cycle.slice(1)) + 1;
  const endToken = nextCycle <= 5
    ? `\n      c${nextCycle}: {`
    : "\n    };\n\n    const sharedResourceKeys";
  const end = recordSource.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `${cycle} record definition end not found`);
  return recordSource.slice(start, end);
}

function recordResourceKeys(cycle) {
  const block = recordCycleBlock(cycle);
  const start = block.indexOf("\n        resources: [");
  const end = block.indexOf("\n        ],\n        events:", start);
  assert.notEqual(start, -1, `${cycle} resource list not found`);
  assert.notEqual(end, -1, `${cycle} resource list end not found`);
  return new Set(
    [...block.slice(start, end).matchAll(/\["([A-Za-z][A-Za-z0-9]*)",/g)]
      .map((match) => match[1]),
  );
}

function recordEnemyKeys(cycle) {
  const block = recordCycleBlock(cycle);
  const end = block.indexOf("\n        adventures:");
  return new Set(
    [...block.slice(0, end).matchAll(/\bkey: "([A-Za-z][A-Za-z0-9]*)"/g)]
      .map((match) => match[1]),
  );
}

const resourceMap = sourceObject("RECORD_RESOURCE_KEYS");
const coreMap = sourceObject("RECORD_CORE_KEYS");
const sharedKeys = sourceSet("SHARED_RECORD_RESOURCE_KEYS");
const resourcesByCycle = Object.fromEntries(
  ["c1", "c2", "c3", "c4", "c5"].map((cycle) => [
    cycle,
    recordResourceKeys(cycle),
  ]),
);
const usedCounts = { CYCLE_04: 0, CYCLE_05: 0 };
const problems = [];

for (const productionCycle of ["CYCLE_04", "CYCLE_05"]) {
  const recordCycle = productionCycle === "CYCLE_04" ? "c4" : "c5";
  const recordResources = resourcesByCycle[recordCycle];
  const recordEnemies = recordEnemyKeys(recordCycle);
  const entries = production.techProduction.filter(
    (entry) => entry.cycle === productionCycle,
  );

  for (const entry of entries) {
    for (const gear of entry.produces || []) {
      usedCounts[productionCycle] += 1;
      for (const cost of gear.cost || []) {
        for (const rawPart of String(cost).split(/\|\||&&/)) {
          const match = rawPart.trim().match(/^\d+x(.+)$/);
          assert.ok(match, `${entry.techId}/${gear.gearId}: invalid cost ${rawPart}`);
          const rawKey = match[1].trim().toUpperCase();
          if (/^[A-Z]J\d+$/.test(rawKey) || rawKey === "TITAN" || rawKey.startsWith("T:")) {
            continue;
          }
          if (rawKey.startsWith("CORE_")) {
            const enemyKey = coreMap[rawKey.slice(5)];
            if (!enemyKey) {
              problems.push(`${rawKey}: missing core mapping`);
              continue;
            }
            if (!recordEnemies.has(enemyKey)) {
              problems.push(`${rawKey}: ${enemyKey} is not a ${recordCycle} record enemy`);
            }
            continue;
          }

          const resourceKey = resourceMap[rawKey];
          if (!resourceKey) {
            problems.push(`${rawKey}: missing resource mapping`);
            continue;
          }
          if (!recordResources.has(resourceKey)) {
            problems.push(`${rawKey}: ${resourceKey} is not a ${recordCycle} record resource`);
          }

          const appearsIn = Object.values(resourcesByCycle)
            .filter((keys) => keys.has(resourceKey)).length;
          if (sharedKeys.has(resourceKey) !== (appearsIn > 1)) {
            problems.push(`${rawKey}: shared-resource status does not match the record`);
          }
        }
      }
    }
  }
}

assert.deepEqual([...new Set(problems)], [], problems.join("\n"));
console.log(
  `C4/C5 gear resource links verified: ${usedCounts.CYCLE_04} + `
  + `${usedCounts.CYCLE_05} produced items`,
);
