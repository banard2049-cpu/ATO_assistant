/* C4-C5 BP resource labels. Maintained by tools/bp-resource-labeler/. */
(function () {
  "use strict";

  const target = window.AIBP_BP_RESOURCE_MAP ||= {};
  window.AIBP_C45_BP_RESOURCE_PREFILL = true;
  const data = {
    "MIDASCORE": {},
    "DEMIDJINN": {},
    "THE_BABELIAN_LUNACY": {},
    "DAHAKA": {},
    "DRAGON_OF_PHOBOS": {},
    "MEDUKETOS": {},
    "UR_FLEECE": {},
    "TITAN_X": {}
  };

  function addLevel(apostle, type, level, resources, cardIndices = null) {
    resources.forEach((entry, index) => {
      const cardIndex = cardIndices?.[index] ?? index + 1;
      const fileName = `${apostle}_${type}_${level}_${String(cardIndex).padStart(3, "0")}.jpg`;
      data[apostle][fileName] = entry;
    });
  }

  const MA = "mutableAmbrosia";
  const OXA = "oxidizedAmbrosia";

  addLevel("MIDASCORE", "BP", "I", [
    { [MA]: 1 }, { [MA]: 1 }, { [MA]: 1 },
    { [MA]: 1 }, { [MA]: 1 }, { [MA]: 1 },
  ]);
  addLevel("MIDASCORE", "BP", "II", [
    { burnedOutGrace: 1 }, { livingGold: 1 },
    { burnedOutGrace: 1 }, { livingGold: 1 },
    { burnedOutGrace: 1 }, { livingGold: 1 },
  ]);
  addLevel("MIDASCORE", "BP", "III", [
    { [MA]: 1, burnedOutGrace: 1 },
    { [MA]: 1, burnedOutGrace: 1 },
    { [MA]: 1, burnedOutGrace: 1 },
    { [MA]: 1, livingGold: 1 },
    { [MA]: 1, livingGold: 1 },
    { [MA]: 1, livingGold: 1 },
  ]);

  addLevel("DEMIDJINN", "BP", "I", [
    { [MA]: 1 }, { [MA]: 1 }, { [MA]: 1 },
    { [MA]: 1 }, { [MA]: 1 }, { [MA]: 1 },
  ]);
  addLevel("DEMIDJINN", "BP", "II", [
    { oldIremFragment: 1 }, { wishEmbryo: 1 },
    { oldIremFragment: 1 }, { wishEmbryo: 1 },
    { oldIremFragment: 1 }, { wishEmbryo: 1 },
  ]);
  addLevel("DEMIDJINN", "BP", "III", [
    { [MA]: 1, wishEmbryo: 1 },
    { [MA]: 1, oldIremFragment: 1 },
    { [MA]: 1, wishEmbryo: 1 },
    { [MA]: 1, oldIremFragment: 1 },
    { [MA]: 1, oldIremFragment: 1 },
    { [MA]: 1, wishEmbryo: 1 },
  ]);

  addLevel("THE_BABELIAN_LUNACY", "BP", "I", [
    { promisedFuturesCarcass: 1 },
    { [MA]: 2 },
    { [MA]: 2 },
    { [MA]: 2 },
    { blackTaintedStepfinger: 1 },
    { blackTaintedStepfinger: 1 },
  ]);
  addLevel("THE_BABELIAN_LUNACY", "BP", "II", [
    { promisedFuturesCarcass: 1 },
    { [MA]: 2 },
    { blackTaintedStepfinger: 1 },
    { [MA]: 2 },
    { promisedFuturesCarcass: 1 },
    { blackTaintedStepfinger: 1 },
  ]);
  addLevel("THE_BABELIAN_LUNACY", "BP", "III", [
    { blackTaintedStepfinger: 2 },
    { [MA]: 2, promisedFuturesCarcass: 1 },
    { promisedFuturesCarcass: 2 },
    { [MA]: 2, promisedFuturesCarcass: 1 },
    { blackTaintedStepfinger: 1, promisedFuturesCarcass: 1 },
    { blackTaintedStepfinger: 2 },
  ]);

  addLevel("DAHAKA", "AI", "I", [
    { onyxDust: 1 }, { onyxDust: 1 }, { ireEssence: 1 },
    { onyxDust: 1 }, { ireEssence: 1 }, { onyxDust: 1 },
  ]);
  addLevel("DAHAKA", "AI", "II", [
    { onyxDust: 1 }, { ireEssence: 1 }, { onyxDust: 1 },
    { ireEssence: 1 }, { ireEssence: 1 }, { ireEssence: 1 },
  ]);
  addLevel("DAHAKA", "AI", "III", [
    { onyxDust: 2, ireEssence: 1 },
    { onyxDust: 1, ireEssence: 2 },
    { onyxDust: 1, ireEssence: 2 },
    { ireEssence: 3 },
    { onyxDust: 2, ireEssence: 1 },
    { onyxDust: 3 },
  ]);

  addLevel("DRAGON_OF_PHOBOS", "BP", "I", [
    { [OXA]: 1 }, { [OXA]: 1 }, { [OXA]: 1 },
    { [OXA]: 1 }, { [OXA]: 1 }, { [OXA]: 1 },
  ]);
  addLevel("DRAGON_OF_PHOBOS", "BP", "II", [
    { hydradynamicScales: 1 }, { amygdalanExtract: 1 },
    { hydradynamicScales: 1 }, { amygdalanExtract: 1 },
    { hydradynamicScales: 1 }, { amygdalanExtract: 1 },
  ]);
  addLevel("DRAGON_OF_PHOBOS", "BP", "III", [
    { [OXA]: 1, hydradynamicScales: 1 },
    { [OXA]: 1, amygdalanExtract: 1 },
    { [OXA]: 1, amygdalanExtract: 1 },
    { [OXA]: 1, hydradynamicScales: 1 },
    { [OXA]: 1, amygdalanExtract: 1 },
    { [OXA]: 1, hydradynamicScales: 1 },
  ]);

  addLevel("MEDUKETOS", "BP", "I", [
    { [OXA]: 1 }, { [OXA]: 1 }, { [OXA]: 1 },
    { [OXA]: 1 }, { [OXA]: 1 }, { [OXA]: 1 },
  ]);
  addLevel("MEDUKETOS", "BP", "II", [
    { microwaveCell: 1 }, { photophobicFlesh: 1 },
    { microwaveCell: 1 }, { photophobicFlesh: 1 },
    { microwaveCell: 1 }, { photophobicFlesh: 1 },
  ]);
  addLevel("MEDUKETOS", "BP", "III", [
    { [OXA]: 1, photophobicFlesh: 1 },
    { [OXA]: 1, microwaveCell: 1 },
    { [OXA]: 1, photophobicFlesh: 1 },
    { [OXA]: 1, photophobicFlesh: 1 },
    { [OXA]: 1, microwaveCell: 1 },
    { [OXA]: 1, microwaveCell: 1 },
  ]);

  addLevel("UR_FLEECE", "BP", "I", [
    { [OXA]: 2, blackWoolStrand: 1 },
    { fadingLightConstruct: 1 },
    { [OXA]: 2, fadingLightConstruct: 1 },
    { [OXA]: 1, blackWoolStrand: 1 },
    { [OXA]: 2, fadingLightConstruct: 1 },
    { blackWoolStrand: 1 },
  ]);
  addLevel("UR_FLEECE", "BP", "II", [
    { fadingLightConstruct: 1 },
    { blackWoolStrand: 1 },
    { fadingLightConstruct: 1 },
    { [OXA]: 2, blackWoolStrand: 1 },
    { blackWoolStrand: 1 },
    { [OXA]: 2, fadingLightConstruct: 1 },
  ]);
  addLevel("UR_FLEECE", "BP", "III", [
    { blackWoolStrand: 1, fadingLightConstruct: 1 },
    { [OXA]: 2, fadingLightConstruct: 1 },
    { [OXA]: 2, fadingLightConstruct: 1 },
    { [OXA]: 2, blackWoolStrand: 1 },
    { [OXA]: 2, fadingLightConstruct: 1 },
    { [OXA]: 2, blackWoolStrand: 1 },
  ]);

  addLevel("TITAN_X", "BP", "I", [
    { orichalcumAlloy: 1 },
    { slaveMetal: 1 },
    { orichalcumAlloy: 1 },
    { slaveMetal: 1 },
    { orichalcumAlloy: 1 },
    { orichalcumAlloy: 1 },
  ], [2, 3, 4, 5, 6, 7]);
  addLevel("TITAN_X", "BP", "II", [
    { slaveMetal: 1 },
    { slaveMetal: 1 },
    { slaveMetal: 1 },
    { orichalcumAlloy: 1 },
    { slaveMetal: 1 },
    { orichalcumAlloy: 1 },
  ], [1, 2, 3, 5, 6, 7]);
  addLevel("TITAN_X", "BP", "III", [
    { orichalcumAlloy: 2, slaveMetal: 1 },
    { orichalcumAlloy: 3 },
    { orichalcumAlloy: 1, slaveMetal: 2 },
    { orichalcumAlloy: 2, slaveMetal: 1 },
    { slaveMetal: 3 },
    { orichalcumAlloy: 1, slaveMetal: 2 },
  ]);

  Object.entries(data).forEach(([apostle, cards]) => {
    Object.assign(target[apostle] ||= {}, cards);
  });
})();
