(function () {
  "use strict";

  const target = window.AIBP_BP_RESOURCE_MAP ||= {};

  function add(apostle, levels) {
    const cards = target[apostle] ||= {};
    Object.entries(levels).forEach(([level, resources]) => {
      resources.forEach((resource, index) => {
        cards[`${apostle}_BP_${level}_${String(index + 1).padStart(3, "0")}.jpg`] = resource;
      });
    });
  }

  const repeated = (resource, count = 6) =>
    Array.from({ length: count }, () => ({ ...resource }));

  add("HEKATON", {
    I: repeated({ RA: 1 }),
    II: [{ MC: 1 }, { MC: 1 }, { CKB: 1 }, { CKB: 1 }, { CKB: 1 }, { MC: 1 }],
    III: [
      { MC: 1, RA: 1 }, { CKB: 1, RA: 1 }, { MC: 1, RA: 1 },
      { CKB: 1, RA: 1 }, { MC: 1, RA: 1 }, { CKB: 1, RA: 1 }
    ]
  });

  add("LABYRINTHAUROS", {
    I: repeated({ RA: 1 }),
    II: [{ IM: 1 }, { FM: 1 }, { FM: 1 }, { IM: 1 }, { FM: 1 }, { IM: 1 }],
    III: [
      { RA: 1, FM: 1 }, { RA: 1, FM: 1 }, { RA: 1, FM: 1 },
      { RA: 1, IM: 1 }, { RA: 1, IM: 1 }, { RA: 1, IM: 1 }
    ]
  });

  add("HERMESIAN_PURSUER", {
    I: [{ GB: 2 }, { PW: 2 }, { GB: 2 }, { PW: 2 }, { PW: 2 }, { GB: 2 }],
    II: [
      { PW: 4 }, { GB: 4 }, { PW: 2, GB: 2 },
      { PW: 4 }, { PW: 2, GB: 2 }, { GB: 4 }
    ],
    III: [
      { PW: 4 }, { PW: 4, GB: 2 }, { PW: 4 },
      { PW: 2, GB: 2 }, { PW: 2, GB: 2 }, { GB: 2, PW: 4 }
    ]
  });

  add("ALPHA_TEMENOS", {
    I: [{ RA: 2 }, { RA: 2 }, { RA: 2 }, { FE: 1 }, { MF: 1 }, { RA: 2 }],
    II: [
      { MF: 1 }, { RA: 2 }, { FE: 1, MF: 1 },
      { FE: 1, MF: 1 }, { FE: 1 }, { RA: 2 }
    ],
    III: [
      { FE: 1, RA: 2 }, { FE: 1, MF: 1 }, { MF: 1, RA: 2 },
      { MF: 1, RA: 2 }, { FE: 1, RA: 2 }, { FE: 1, RA: 2 }
    ]
  });

  add("HYPERTIME_ORACLE", {
    I: repeated({ FA: 1 }),
    II: [{ EC: 1 }, { EC: 1 }, { CL: 1 }, { CL: 1 }, { EC: 1 }, { CL: 1 }],
    III: [
      { EC: 1, FA: 1 }, { CL: 1, FA: 1 }, { CL: 1, FA: 1 },
      { EC: 1, FA: 1 }, { EC: 1, FA: 1 }, { CL: 1, FA: 1 }
    ]
  });

  add("ICARIAN_HARPY", {
    I: repeated({ FA: 1 }),
    II: [{ RC: 1 }, { IF: 1 }, { IF: 1 }, { IF: 1 }, { RC: 1 }, { RC: 1 }],
    III: [
      { RC: 1, FA: 1 }, { IF: 1, FA: 1 }, { IF: 1, FA: 1 },
      { RC: 1, FA: 1 }, { IF: 1, FA: 1 }, { RC: 1, FA: 1 }
    ]
  });

  add("SUN_DESCENDANT", {
    I: [
      { SM: 1 }, { WT: 2 }, { WT: 1, SM: 1 },
      { WT: 1 }, { FA: 1, SM: 1 }, { FA: 1, WT: 1 }
    ],
    II: [
      { FA: 2, SM: 1 }, { WT: 1, FA: 2 }, { WT: 1, SM: 1, FA: 1 },
      { FA: 2, WT: 1 }, { WT: 1, SM: 1, FA: 1 }, { FA: 2, SM: 1 }
    ],
    III: [
      { WT: 2, FA: 4 }, { WT: 2, FA: 4 }, { SM: 2, FA: 4 },
      { SM: 2, FA: 4 }, { WT: 2, FA: 4 }, { SM: 2, FA: 4 }
    ]
  });
})();
