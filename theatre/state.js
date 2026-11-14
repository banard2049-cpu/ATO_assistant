(function (root, factory) {
  const catalog = typeof module !== 'undefined' && module.exports
    ? require('./catalog.js') : root.ATO_THEATRE_CATALOG;
  const api = factory(catalog);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ATO_THEATRE_STATE = api;
})(typeof window !== 'undefined' ? window : globalThis, function (catalog) {
  'use strict';

  const cycles = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const editions = { core: cycles.slice(0, 3), expansion: cycles.slice(3) };
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const modes = ['normal', 'cursed', 'custom'];
  const byId = new Map(catalog.nodes.map(node => [node.id, node]));
  const bossCycles = new Map(catalog.nodes.filter(node => node.boss !== 'HELIOS').map(node => [node.boss, node.cycle]));
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value);
  const amount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const note = value => typeof value === 'string' ? value.slice(0, 6000) : '';
  const entries = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
  const keyFor = (boss, level) => `${boss}:${level}`;
  const editionFor = cycle => editions.core.includes(cycle) ? 'core' : 'expansion';
  const canShowEdition = (edition, dashboardCycle) => edition === 'core'
    || (edition === 'expansion' && editions.expansion.includes(dashboardCycle));

  function battleTarget(boss, level) {
    if (!Number.isInteger(level) || level < 1 || level > 9) return null;
    const node = byId.get(keyFor(boss, level));
    const cycle = node?.cycle || bossCycles.get(boss) || (boss === 'HELIOS' ? 'c4' : null);
    return cycle ? { boss, level, cycle } : null;
  }

  function normalizeBattle(value) {
    if (!validId(value?.id) || !modes.includes(value.mode)) return null;
    const target = battleTarget(value.boss, value.level);
    if (!target || value.cycle !== target.cycle) return null;
    const node = byId.get(keyFor(value.boss, value.level));
    if (value.mode !== 'custom' && !node) return null;
    const trait = value.mode === 'cursed' ? value.trait : null;
    if (value.mode === 'cursed' && (!node.cursed || !Number.isInteger(trait) || trait < 1 || trait > 6)) return null;
    return { id: value.id, ...target, mode: value.mode, trait };
  }

  function normalizeReward(value) {
    if (!value || !['loot', 'secret', 'skyseer'].includes(value.type)) return null;
    const reward = { type: value.type, carry: value.carry === true };
    if (typeof value.name === 'string') reward.name = value.name.slice(0, 250);
    if (Number.isInteger(value.deck)) reward.deck = value.deck;
    if (Number.isInteger(value.card)) reward.card = value.card;
    return reward;
  }

  function normalizeSheet(value) {
    if (value?.sheet) return { notes: note(value.sheet.notes), knockouts: amount(value.sheet.knockouts) };
    // Older saves kept one sheet per edition. Fold them into the single sheet so
    // nothing written before the merge is lost.
    const parts = Object.keys(editions).map(edition => note(value?.sheets?.[edition]?.notes)).filter(Boolean);
    return {
      notes: note(parts.join('\n\n')),
      knockouts: Object.keys(editions).reduce((sum, edition) => sum + amount(value?.sheets?.[edition]?.knockouts), 0),
    };
  }

  function normalize(value) {
    const wins = {};
    for (const [id, win] of entries(value?.wins)) {
      const node = byId.get(id);
      if (!node || !win?.normal) continue;
      const earned = win.earned === true;
      wins[id] = {
        normal: true,
        cursed: node.cursed && win.cursed === true,
        // Older saves could settle this first win with the expansion switched off.
        reward: normalizeReward(win.reward ?? (earned && node.reward?.type === 'skyseer' ? node.reward : null)),
        earned,
        cursedEarned: node.cursed && win.cursed === true && win.cursedEarned === true,
      };
    }
    const settled = {};
    for (const [id, result] of entries(value?.settled)) {
      if (!validId(id) || !['victory', 'defeat', 'abandoned'].includes(result?.outcome)) continue;
      settled[id] = { outcome: result.outcome, knockouts: amount(result.knockouts) };
    }
    return {
      version: 1,
      completed: Object.fromEntries(cycles.map(cycle => [cycle, value?.completed?.[cycle] === true])),
      wins,
      campaignWins: Object.fromEntries(entries(value?.campaignWins).filter(([id, won]) => {
        const [boss, level] = id.split(':');
        return won === true && id === keyFor(boss, Number(level)) && battleTarget(boss, Number(level));
      })),
      sheet: normalizeSheet(value),
      hold: Object.fromEntries(cycles.map(cycle => [cycle, Object.fromEntries(['tear', 'core'].map(kind => [kind, {
        count: amount(value?.hold?.[cycle]?.[kind]?.count),
        notes: note(value?.hold?.[cycle]?.[kind]?.notes),
      }]))])),
      activeBattle: normalizeBattle(value?.activeBattle),
      settled,
    };
  }

  function blockers(state, node) {
    const missing = [];
    if (!state.completed[node.cycle]) missing.push({ cycle: node.cycle });
    for (const id of node.prerequisites) {
      if (!state.wins[id]?.normal) missing.push({ node: id });
    }
    return missing;
  }

  function canReplay(state, boss, level) {
    const target = battleTarget(boss, level);
    if (!target || !state.completed[target.cycle]) return false;
    const id = keyFor(boss, level);
    return Boolean(state.wins[id]?.normal || state.campaignWins[id]);
  }

  function start(state, input) {
    const battle = normalizeBattle(input);
    if (!battle) throw new Error('始徒、等级或剧场模式无效。');
    if (state.activeBattle) throw new Error('请先结算或放弃当前战斗。');
    if (state.settled[battle.id]) throw new Error('该场战斗已结算。');
    const id = keyFor(battle.boss, battle.level);
    const node = byId.get(id);
    const won = state.wins[id];
    const available = battle.mode === 'custom' ? canReplay(state, battle.boss, battle.level)
      : !blockers(state, node).length && (battle.mode === 'normal' ? !won?.normal : won?.normal && !won.cursed);
    if (!available) throw new Error('这场战斗尚未解锁或首胜已结算。');
    state.activeBattle = battle;
    return state;
  }

  function rewardFor(node, roll) {
    const reward = node.reward;
    if (!reward) return null;
    if (reward.type !== 'loot') return normalizeReward(reward);
    const pool = catalog.loot[node.boss] || [];
    if (!pool.length) throw new Error('这场战斗的必得战利品清单缺失。');
    return normalizeReward({ ...pool[Math.floor(roll * pool.length)], type: 'loot', carry: true });
  }

  function settle(state, { id, outcome, knockouts, roll }) {
    if (state.settled[id]) return state;
    const battle = state.activeBattle;
    if (!battle || id !== battle.id) throw new Error('这场战斗已变更，请刷新后重试。');
    if (!['victory', 'defeat', 'abandoned'].includes(outcome) || amount(knockouts) !== knockouts
      || !Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('战果或阵亡数无效。');
    const idOnTree = keyFor(battle.boss, battle.level);
    const node = byId.get(idOnTree);
    state.sheet ||= { notes: '', knockouts: 0 };
    const sheet = state.sheet;
    if (!Number.isSafeInteger(sheet.knockouts + knockouts)) throw new Error('阵亡累计数过大。');
    if (outcome === 'victory' && battle.mode !== 'custom') {
      const win = state.wins[idOnTree];
      const first = battle.mode === 'normal' ? !win?.normal : win?.normal && !win.cursed;
      if (first) {
        const hold = state.hold[node.cycle];
        if (battle.mode === 'normal') {
          const reward = rewardFor(node, roll);
          state.wins[idOnTree] = { normal: true, cursed: false, reward, earned: true };
        } else {
          win.cursed = true;
          win.cursedEarned = true;
        }
        hold.tear.count++;
        if (node.core) hold.core.count++;
      }
    }
    sheet.knockouts += knockouts;
    state.settled[id] = { outcome, knockouts };
    state.activeBattle = null;
    return state;
  }

  function setRecordedWin(state, id, mode, won) {
    const node = byId.get(id);
    if (!node || !['normal', 'cursed'].includes(mode) || (mode === 'cursed' && !node.cursed)) return state;
    const previous = state.wins[id];
    if (mode === 'cursed') {
      if (previous?.normal && !previous.cursedEarned) previous.cursed = won;
    } else if (won) {
      state.wins[id] ||= { normal: true, cursed: false, reward: null };
    } else if (previous) {
      // Correct paper transcription without undoing actual first-win settlement.
      if (!previous.earned && !previous.cursedEarned) delete state.wins[id];
    }
    return state;
  }

  return { cycles, editions, roman, byId, keyFor, editionFor, canShowEdition, battleTarget, normalize, blockers,
    canReplay, start, settle, setRecordedWin };
});
