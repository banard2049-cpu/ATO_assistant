/* Visually reviewed printed Titan icons, 2026-10-16. Cities, battle and faction icons are excluded. */
(function (root) {
  const tiles = {
    c1: ["002", "004", "010", "016", "019", "023", "030", "034", "036", "042", "045", "054", "061", "063", "065", "069", "077", "079", "T03"],
    c2: ["001", "005", "013", "017", "019", "027", "028", "030", "036", "037", "038", "040", "049", "050", "053", "059", "062", "064", "068", "072", "074", "076"],
    c3: ["001", "003", "016", "017", "019", "021", "029", "031", "032", "034", "041", "044", "051", "059", "060", "061", "068", "070", "076", "082", "084", "086"],
    c4: ["001", "003", "006", "008", "013", "019", "023", "026", "034", "036", "038", "040", "055", "059", "061", "065", "067", "072", "078"],
    c5: ["003", "006", "009", "012", "017", "019", "021", "024", "031", "039", "044", "045", "051", "058", "060", "062", "064", "067", "073", "077"],
  };
  const markers = {};
  for (const [cycle, ids] of Object.entries(tiles)) {
    for (const id of ids) {
      if (cycle === "c5") { markers[`${cycle}:${id}:A`] = true; markers[`${cycle}:${id}:B`] = true; }
      else markers[`${cycle}:${id}`] = true;
    }
  }
  // C1 alternate artwork retains these icons; both C5 faces were checked separately.
  const data = { version: 1, markers };
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.ATO_MAP_TITANS = data;
})(typeof window === "object" ? window : globalThis);
