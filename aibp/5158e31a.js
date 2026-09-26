// 黑喙（Blackbeak）—— C5 的独立追猎者 BOSS。
// 规则写在信封 Beta：换用黑喙面板、禁用「玩闹 / 挑逗」、永久移除黑血密码筒 BP 卡，
// 并多一张「以太吸取」闪粉卡；其余 AI / BP / 随命 / 标志 / 闪粉沿用赫尔墨斯追踪者。
//
// 卡图来源：
//   - 追踪者那套 → 明文直引 aibp/ps/HERMESIAN_PURSUER/（不加密）
//   - 黑喙专属 3 张（面板 / 特性 / 以太吸取）→ 加密，走 ps/other/3b6e9d20/*.bin
(function (root) {
  "use strict";

  const pursuerFile = (file) => `ps/HERMESIAN_PURSUER/${file}`;
  const sealed = (file) => root.HeliosAssets.path(`ENVELOPES/Blackbeak/${file}`);

  const pursuerCard = (type, level, index, stem) => ({
    type, level, index,
    src: pursuerFile(`${stem}.jpg`),
    backSrc: pursuerFile(`${stem}_BACK.jpg`),
  });
  const pursuerRange = (type, level, prefix, count) =>
    Array.from({ length: count }, (_, offset) => {
      const stem = `HERMESIAN_PURSUER_${prefix}_${String(offset + 1).padStart(3, "0")}`;
      return pursuerCard(type, level, offset + 1, stem);
    });

  // 只有正面（闪粉卡是消耗品，没有独立卡背）
  const flare = (stem, index) => ({ type: "FL", level: "X", index, src: pursuerFile(`${stem}.jpg`), backSrc: null });

  const panel = sealed("BLACKBEAK_PANEL_F.jpg");

  const extraCards = [
    {
      label: "特性：黑喙（替换属性；禁用 Toying / Tease）",
      src: panel,
      backSrc: sealed("BLACKBEAK_PANEL_B.jpg"),
    },
    {
      label: "特性：拟态黑暗 / 血腥同盟 / 直取首级",
      src: sealed("BLACKBEAK_TRAIT_F.jpg"),
      backSrc: sealed("BLACKBEAK_TRAIT_B.jpg"),
    },
  ];

  const list = {
    panel: pursuerFile("HERMESIAN_PURSUER.jpg"),
    panelBack: sealed("BLACKBEAK_PANEL_B.jpg"),
    extraCards,
    AI: {
      I: pursuerRange("AI", "I", "AI_I", 6),
      II: pursuerRange("AI", "II", "AI_II", 6),
      III: pursuerRange("AI", "III", "AI_III", 6),
    },
    BP: {
      I: pursuerRange("BP", "I", "BP_I", 6),
      II: pursuerRange("BP", "II", "BP_II", 6),
      III: pursuerRange("BP", "III", "BP_III", 6).filter((card) => card.index !== 6),
    },
    routine: pursuerCard("ROUTINE", "X", 1, "HERMESIAN_PURSUER_ROUTINE_X_001"),
    signature: pursuerCard("SIGNATURE", "X", 1, "HERMESIAN_PURSUER_SIGNATURE_X_001"),
    flares: [
      flare("HERMESIAN_PURSUER_FL_X_001", 1),
      flare("HERMESIAN_PURSUER_FL_X_002", 2),
      flare("HERMESIAN_PURSUER_FL_X_003", 3),
      flare("HERMESIAN_PURSUER_FL_X_004", 4),
      { type: "FL", level: "X", index: 5,
        src: sealed("BLACKBEAK_FLARE_AETHER_SUCK_F.jpg"),
        backSrc: sealed("BLACKBEAK_FLARE_AETHER_SUCK_B.jpg") },
    ],
    // 预加载用：所有加密资源的来源名（明文图交给浏览器自己取）
    sealedSources: [
      "ENVELOPES/Blackbeak/BLACKBEAK_PANEL_F.jpg",
      "ENVELOPES/Blackbeak/BLACKBEAK_PANEL_B.jpg",
      "ENVELOPES/Blackbeak/BLACKBEAK_TRAIT_F.jpg",
      "ENVELOPES/Blackbeak/BLACKBEAK_TRAIT_B.jpg",
      "ENVELOPES/Blackbeak/BLACKBEAK_FLARE_AETHER_SUCK_F.jpg",
      "ENVELOPES/Blackbeak/BLACKBEAK_FLARE_AETHER_SUCK_B.jpg",
    ],
  };

  root.BlackbeakCardList = list;

  // 与 HeliosConfig.cards(mode, type, level) 同签名，方便入口层统一调用。
  root.BlackbeakConfig = {
    cards(_mode, type, level) { return list[type]?.[level] || []; },
    panel: list.panel,
    extras() { return list.extraCards; },
    normalize(state, shuffle) {
      let changed = false;
      const forbidden = (card) => card?.type === "BP" && card.level === "III" && card.index === 6;
      const bp = state.BP;
      bp.removed ||= [];
      let removed = null;
      for (const cards of [bp.deck, bp.discard, bp.damage, bp.damage1, bp.damage2, ...Object.values(bp.supply || {})]) {
        if (!Array.isArray(cards)) continue;
        for (let i = cards.length - 1; i >= 0; i--) {
          if (forbidden(cards[i])) {
            removed = cards.splice(i, 1)[0];
            changed = true;
          }
        }
      }
      if (forbidden(bp.pending)) {
        removed = bp.pending;
        bp.pending = null;
        changed = true;
      }
      if (removed && !bp.removed.some(forbidden)) bp.removed.push(removed);
      // 补齐早期存档的明文卡图路径，保留牌堆顺序和已抽取状态。
      for (const type of ["AI", "BP"]) {
        const pile = state[type];
        for (const cards of [pile.deck, pile.discard, pile.removed, pile.damage, ...Object.values(pile.supply || {}), [pile.pending]]) {
          for (const card of cards || []) {
            if (!card || card.special) continue;
            const source = list[type][card.level]?.find((item) => item.index === card.index);
            if (source && (card.src !== source.src || card.backSrc !== source.backSrc)) {
              Object.assign(card, { src: source.src, backSrc: source.backSrc });
              changed = true;
            }
          }
        }
      }
      state.blackbeak ||= {};
      // 撤掉自动攻击结算，清理旧存档的待确认状态和自动战败标记。
      for (const key of ["pendingAttack", "defeated", "notice"]) {
        if (key in state.blackbeak) {
          delete state.blackbeak[key];
          changed = true;
        }
      }
      if (state.blackbeak.flareVersion !== 1) {
        state.flare ||= { deck: [], discard: [] };
        for (const key of ["deck", "discard"]) {
          state.flare[key] = (state.flare[key] || []).map((card) => ({ ...card, ...list.flares.find((item) => item.index === card.index) }));
        }
        if (![...state.flare.deck, ...state.flare.discard].some((card) => card.index === 5)) {
          state.flare.deck.push({ ...list.flares[4] });
          state.flare.deck = shuffle(state.flare.deck);
        }
        state.blackbeak.flareVersion = 1;
        changed = true;
      }
      return changed;
    },
  };
})(window);
