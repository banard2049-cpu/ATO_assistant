(function (root) {
  "use strict";

  const envelope = (name, file) => root.HeliosAssets.path(`ENVELOPES/${name}/${file}`);
  const card = (type, level, index, folder, stem, sharedBack = false) => ({
    type, level, index,
    src: envelope(folder, `${stem}_F.jpg`),
    backSrc: envelope(folder, `${stem}_${sharedBack ? "B_shared" : "B"}.jpg`),
  });
  const range = (type, level, folder, stem, count, start = 0, sharedBack = false) =>
    Array.from({ length: count }, (_, offset) =>
      card(type, level, start + offset + 1, folder, `${stem}_${String(offset).padStart(2, "0")}`, sharedBack));

  const base = {
    AI: {
      I: range("AI", "I", "Alpha", "card64", 4),
      II: range("AI", "II", "G", "card64", 4, 0, true),
    },
    BP: {
      I: [card("BP", "I", 1, "Alpha", "card64_04"), ...range("BP", "I", "1", "card64", 3, 1)],
      II: range("BP", "II", "2", "card64", 4, 0, true),
    },
  };
  const oldHaunt = {
    AI: {
      I: [...base.AI.I, card("AI", "I", 5, "Y", "card110_00", true), card("AI", "I", 6, "Y", "card111_00", true)],
      II: [...base.AI.II, card("AI", "II", 5, "Y", "card108_00", true), card("AI", "II", 6, "Y", "card109_00", true)],
      III: range("AI", "III", "Y", "deck113", 6, 0, true),
    },
    BP: {
      I: [...base.BP.I, card("BP", "I", 5, "Y", "card105_00", true), card("BP", "I", 6, "Y", "card106_00", true)],
      II: [...base.BP.II, card("BP", "II", 5, "Y", "card103_00", true), card("BP", "II", 6, "Y", "card104_00", true)],
      III: range("BP", "III", "Y", "deck112", 6, 0, true),
    },
  };

  const common = {
    routine: envelope("1", "card64_04_F.jpg"),
    routineBack: envelope("1", "card64_04_B.jpg"),
    signature: envelope("1", "card64_03_F.jpg"),
    signatureBack: envelope("1", "card64_03_B.jpg"),
  };
  const modes = {
    normal: {
      label: "Old Haunt",
      panel: root.HeliosAssets.path("9a10b8d7/5c73e2a1.png"),
      panelHigh: root.HeliosAssets.path("9a10b8d7/27f3ab90.png"),
      decks: oldHaunt,
      extras: [
        ["无情之日", "Y", "card107_00_F.jpg", "card107_00_B_shared.jpg"],
        ["有利位置 VP", "Y", "card114_00_F.jpg", "card114_00_B.jpg"],
      ],
    },
    c4: {
      label: "C4 · Old Haunt",
      panel: envelope("Y", "card114_03_F.jpg"),
      decks: oldHaunt,
      extras: [
        ["战斗设置", "Y", "card114_03_B.jpg", "card114_03_F.jpg"],
        ["有利位置 / 旧伤", "Y", "card114_00_F.jpg", "card114_00_B.jpg"],
        ["Glass It All / 所需地形", "Y", "card114_01_F.jpg", "card114_01_B.jpg"],
        ["God Among Men / 版图", "Y", "card114_02_F.jpg", "card114_02_B.jpg"],
        ["Pitiless Sun / 版图", "Y", "card114_04_F.jpg", "card114_04_B.jpg"],
        ["无情之日", "Y", "card107_00_F.jpg", "card107_00_B_shared.jpg"],
      ],
    },
  };

  root.HeliosConfig = {
    common,
    modes,
    panelFor(mode, level) {
      return mode === "normal" && level >= 5 ? modes.normal.panelHigh : modes[mode].panel;
    },
    cards(mode, type, level) { return modes[mode]?.decks[type]?.[level] || []; },
    extras(mode) {
      return (modes[mode]?.extras || []).map(([label, folder, front, back]) => ({
        label, src: envelope(folder, front), backSrc: envelope(folder, back),
      }));
    },
  };
})(window);
