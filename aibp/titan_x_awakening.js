(function (root) {
  "use strict";
  const source = "ENVELOPES/X/TITAN_X_TRAIT_ATTACK_F.jpg";
  root.TitanXAwakeningConfig = {
    panel: root.HeliosAssets.path(source),
    sealedSources: [source],
    card() {
      return { type: "BP", level: "X", index: 305, titanXAwakening: true,
        src: this.panel, woundThreshold: 20 };
    },
  };
  const groupFront = "SECRET_DECKS/15/TITAN_X_ALL_GOOD_THINGS_323_F.jpg";
  const groupBack = "SECRET_DECKS/15/TITAN_X_ALL_GOOD_THINGS_323_B.jpg";
  root.TitanXGroupConfig = {
    sealedSources: [groupFront, groupBack],
    trait: {
      label: "特性：好事成三（All Good Things）· 秘密卡 323",
      src: root.HeliosAssets.path(groupFront),
      backSrc: root.HeliosAssets.path(groupBack),
    },
  };
})(window);
