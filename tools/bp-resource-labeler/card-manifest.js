(function () {
  "use strict";

  const resourcesByCycle = {
    C4: [
      ["cursedDerelict", "CD", "诅咒船骸", "Cursed Derelict"],
      ["blackenedHalo", "BH", "黑化光环", "Blackened Halo"],
      ["burnedOutGrace", "BG", "燃尽恩典", "Burned-out Grace"],
      ["cursedBloatsack", "CB", "诅咒胀囊", "Cursed Bloatsack"],
      ["livingGold", "LG", "活化黄金", "Living Gold"],
      ["imperialScroll", "IS", "帝国卷轴", "Imperial Scroll"],
      ["wishEmbryo", "WE", "愿望胚胎", "Wish Embryo"],
      ["oldIremFragment", "OIF", "旧伊雷姆碎片", "Old Irem Fragment"],
      ["blackTaintedStepfinger", "BTS", "染黑阶梯指", "Black-tainted Stepfinger"],
      ["promisedFuturesCarcass", "PFC", "未来承诺残骸", "Promised Future's Carcass"],
      ["babylonianContraption", "BC", "巴比伦装置", "Babylonian Contraption"],
      ["onyxDust", "OD", "缟玛瑙粉尘", "Onyx Dust"],
      ["ireEssence", "IE", "愤怒精华", "Ire Essence"],
      ["mutableAmbrosia", "MA", "易变神浆", "Mutable Ambrosia"]
    ],
    C5: [
      ["atlanteanTekne", "AT", "亚特兰蒂斯技艺", "Atlantean Tekne"],
      ["orichalcumChunk", "OC", "山铜块", "Orichalcum Chunk"],
      ["liquidAether", "LA", "液态以太", "Liquid Aether"],
      ["promisedFuturesCarcass", "PFC", "未来承诺残骸", "Promised Future's Carcass"],
      ["blackTaintedStepfinger", "BTS", "染黑阶梯指", "Black-tainted Stepfinger"],
      ["hydradynamicScales", "HS", "流体力学鳞片", "Hydradynamic Scales"],
      ["amygdalanExtract", "AE", "杏仁体萃取物", "Amygdalan Extract"],
      ["photophobicFlesh", "PF", "畏光血肉", "Photophobic Flesh"],
      ["microwaveCell", "MC", "微波细胞", "Microwave Cell"],
      ["blackWoolStrand", "BW", "黑羊毛丝", "Black Wool Strand"],
      ["fadingLightConstruct", "FL", "消逝之光构造体", "Fading Light Construct"],
      ["orichalcumAlloy", "OA", "山铜合金", "Orichalcum Alloy"],
      ["slaveMetal", "SM", "奴隶金属", "Slave Metal"],
      ["oxidizedAmbrosia", "OXA", "氧化神浆", "Oxidized Ambrosia"]
    ]
  };
  const resourceKeys = Array.from(new Set(
    Object.values(resourcesByCycle).flatMap((resources) =>
      resources.map(([key]) => key)
    )
  ));

  const apostles = [
    { id: "MIDASCORE", cycle: "C4", label: "MIDASCORE", type: "BP", counts: [6, 6, 6] },
    { id: "DEMIDJINN", cycle: "C4", label: "DEMIDJINN", type: "BP", counts: [6, 6, 6] },
    {
      id: "THE_BABELIAN_LUNACY",
      cycle: "C4",
      label: "THE BABELIAN LUNACY",
      type: "BP",
      counts: [6, 6, 6]
    },
    {
      id: "DAHAKA",
      cycle: "C4",
      label: "DAHAKA AI/BP",
      type: "AI",
      counts: [6, 6, 6],
      combined: true
    },
    {
      id: "DRAGON_OF_PHOBOS",
      cycle: "C5",
      label: "DRAGON OF PHOBOS",
      type: "BP",
      counts: [6, 6, 6]
    },
    { id: "MEDUKETOS", cycle: "C5", label: "MEDUKETOS", type: "BP", counts: [6, 6, 6] },
    { id: "UR_FLEECE", cycle: "C5", label: "UR FLEECE", type: "BP", counts: [6, 6, 6] },
    {
      id: "TITAN_X",
      cycle: "C5",
      label: "TITAN X",
      type: "BP",
      counts: [6, 6, 6],
      indices: {
        I: [2, 3, 4, 5, 6, 7],
        II: [1, 2, 3, 5, 6, 7],
        III: [1, 2, 3, 4, 5, 6]
      }
    }
  ];

  const levels = ["I", "II", "III"];
  const cards = apostles.flatMap((apostle) =>
    levels.flatMap((level, levelIndex) =>
      (apostle.indices?.[level]
        || Array.from({ length: apostle.counts[levelIndex] }, (_, index) => index + 1)
      ).map((cardIndex) => {
        const number = String(cardIndex).padStart(3, "0");
        const fileName = `${apostle.id}_${apostle.type}_${level}_${number}.jpg`;
        return {
          apostle: apostle.id,
          apostleLabel: apostle.label,
          cycle: apostle.cycle,
          level,
          index: cardIndex,
          combined: Boolean(apostle.combined),
          fileName,
          image: `../../aibp/ps/${apostle.id}/${fileName}`
        };
      })
    )
  );

  window.AIBP_C45_BP_CARD_MANIFEST = {
    version: 1,
    apostles,
    resourcesByCycle,
    resourceKeys,
    cards
  };
})();
