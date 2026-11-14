(function (root) {
  "use strict";

  const modes = ["normal", "cursed", "custom"];

  function parse(search) {
    const params = new URLSearchParams(search);
    if (!params.has("theatreBattle")) return null;
    const id = params.get("theatreBattle");
    const boss = params.get("apostle") || "";
    const level = params.get("level") || "";
    const cycle = params.get("cycle") || "";
    const mode = params.get("mode") || "";
    const trait = params.get("trait");
    const valid = /^[\w-]{16,80}$/.test(id) && /^[A-Z][A-Z_]+$/.test(boss)
      && /^[1-9]$/.test(level) && /^c[1-5]$/.test(cycle) && modes.includes(mode)
      && (mode === "cursed" ? cycle === "c4" && /^[1-6]$/.test(trait) : trait === null);
    return { id, boss, level: Number(level), cycle, mode, trait: trait === null ? null : Number(trait), valid };
  }

  function verify(request, payload, apostles) {
    const active = payload?.state?.activeBattle;
    const account = payload?.user?.id;
    if (!request?.valid || !payload?.ok || typeof account !== "string" || !account
      || (["c4", "c5"].includes(request.cycle) && !["c4", "c5"].includes(payload.dashboardCycle))
      || !apostles.includes(request.boss) || request.boss === "BLACKBEAK"
      || !active || request.id !== active.id || request.boss !== active.boss
      || request.level !== active.level || request.cycle !== active.cycle
      || request.mode !== active.mode || request.trait !== (active.trait ?? null)) return null;
    return { ...request, account };
  }

  function storageKey(battle) {
    return `aibp-theatre-battle-v1:${encodeURIComponent(battle.account)}:${battle.id}`;
  }

  function setupId(terrain, boss) {
    // The first public preset is the standard battle. Passing it explicitly
    // also keeps Titan X IX off the three-Titan-X narrative scenario.
    return terrain.getSetupOptions(boss)[0]?.id;
  }

  const api = { parse, verify, storageKey, setupId };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AIBP_THEATRE_BATTLE = api;
})(typeof window === "object" ? window : globalThis);
