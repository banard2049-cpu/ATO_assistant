(function (root) {
  "use strict";

  const entries = [
    ["HEKATON", "百手巨魔", "百臂巨人", "赫卡同"],
    ["LABYRINTHAUROS", "迷宫机牛", "迷宫牛", "迷宫陶洛斯"],
    ["HERMESIAN_PURSUER", "赫尔墨斯追击者", "赫尔墨斯追踪者", "赫尔墨斯追猎者", "追猎者"],
    ["ALPHA_TEMENOS", "领首卫域", "卫域", "阿尔法圣域", "吞域兽", "阿尔法神庙"],
    ["CHIMERA_METASTASIOS", "扩散嵌合体", "蠕变奇美拉", "奇美拉"],
    ["CYCLONUS", "无眼巨人", "独眼巨人", "赛克洛诺斯"],
    ["THE_BURDEN", "巨石", "重担", "重负"],
    ["THE_NIETZSCJEAN", "尼采", "尼采超人", "尼采人"],
    ["HYPERTIME_ORACLE", "超时间流神谕者", "超时神谕", "超时光先知"],
    ["ICARIAN_HARPY", "伊卡洛斯鹰身妖", "伊卡洛斯鹰身女妖", "伊卡洛斯哈尔皮", "伊卡洛斯哈比", "伊卡洛斯哈耳庇厄"],
    ["SUN_DESCENDANT", "烈日后裔", "坠落太阳", "太阳后裔", "烈日继承者"],
    ["MIDASCORE", "米达斯蝎狮", "迈达狮", "米达斯核"],
    ["DEMIDJINN", "半灯神", "半神迪精", "半神灯"],
    ["THE_BABELIAN_LUNACY", "巴别疯魔塔", "巴比伦疯塔", "巴别疯癫"],
    ["DAHAKA", "达哈卡"],
    ["DRAGON_OF_PHOBOS", "骇神巨龙", "深海惧龙", "恐惧之龙"],
    ["MEDUKETOS", "美杜莎刻托", "须目塞特斯", "梅杜克托斯"],
    ["UR_FLEECE", "原初羊毛", "乌尔-弗里斯", "乌尔弗里斯", "乌尔羊毛"],
    ["TITAN_X", "泰坦 X", "泰坦十"],
    ["TITAN_X_GROUP", "万事皆休", "天下没有不散的筵席", "好事成三", "All Good Things",
      "泰坦 X 三人组", "三台泰坦 X", "7539"],
    ["HELIOS", "赫利俄斯", "赫利奥斯", "海利欧斯", "旧日幽魂", "旧日幽灵",
      "旧日幻影", "旧日魅影", "无情者", "无情之日", "太阳神赫利俄斯",
      "Old Haunt", "Pitiless", "Pitiless Sun"],
    ["BLACKBEAK", "黑喙", "黑喙追踪者", "黑喙追猎者", "黑嘴",
      "Blackbeak", "Black Beak", "Blackbeak Pursuer"],
  ].map(([id, label, ...aliases]) => ({ id, label, aliases: [id.replaceAll("_", " "), label, ...aliases] }));

  // Keep the display names separate from IDs used by saves, cards and URLs.
  const fanLabels = {
    HEKATON: "百臂巨人",
    LABYRINTHAUROS: "迷宫机牛",
    HERMESIAN_PURSUER: "赫尔墨斯追击者",
    ALPHA_TEMENOS: "吞域兽",
    CHIMERA_METASTASIOS: "蠕变奇美拉",
    CYCLONUS: "独眼巨人",
    THE_BURDEN: "重担",
    THE_NIETZSCJEAN: "尼采超人",
    HYPERTIME_ORACLE: "超时光先知",
    ICARIAN_HARPY: "伊卡洛斯哈尔皮",
    SUN_DESCENDANT: "坠落太阳",
    MIDASCORE: "迈达狮",
    DEMIDJINN: "半神迪精",
    THE_BABELIAN_LUNACY: "巴比伦疯塔",
    DAHAKA: "达哈卡",
    DRAGON_OF_PHOBOS: "深海惧龙",
    MEDUKETOS: "须目刻托斯",
    UR_FLEECE: "乌尔-弗里斯",
    TITAN_X: "泰坦 X",
    TITAN_X_GROUP: "天下没有不散的筵席",
    HELIOS: "赫利俄斯",
    BLACKBEAK: "黑喙",
  };
  const englishLabels = { THE_NIETZSCJEAN: "THE NIETZSCHEAN", TITAN_X_GROUP: "All Good Things", BLACKBEAK: "BLACK BEAK" };
  for (const entry of entries) {
    entry.names = {
      fan: fanLabels[entry.id],
      official: entry.id === "TITAN_X" ? "泰坦X" : entry.label,
      en: englishLabels[entry.id] || entry.id.replaceAll("_", " "),
    };
    entry.aliases = [...new Set([...entry.aliases, ...Object.values(entry.names)])];
  }

  function normalize(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase()
      .replace(/[\s_\-·•'’.,，。:：]+/g, "");
  }

  // 隐藏 BOSS → AIBP 模式名
  const SECRET_MODE_BY_ID = { HELIOS: "normal", BLACKBEAK: "blackbeak", TITAN_X_GROUP: "titan-x-group" };
  const secrets = entries
    .filter((entry) => SECRET_MODE_BY_ID[entry.id])
    .map((entry) => ({ ...entry, mode: SECRET_MODE_BY_ID[entry.id] }));
  const secretNames = new Set(secrets.flatMap((entry) => entry.aliases.map(normalize)));

  const api = {
    entries,
    normalize,
    renderLabel(element, id, suffix = "") {
      const names = entries.find((entry) => entry.id === id)?.names;
      if (!names) { element.textContent = id.replaceAll("_", " ") + suffix; return; }
      let language = root.ATO_LANGUAGE?.get() || root.document.documentElement.dataset.atoLanguage;
      if (!language) {
        try { language = root.localStorage.getItem("ato-term-language-v1"); } catch {}
      }
      language = ["fan", "official", "en"].includes(language) ? language : "fan";
      const variants = Object.entries(names).map(([variant, label]) => {
        const span = root.document.createElement("span");
        // The shared language adapter switches variants, including changes
        // received from the console in another tab. Names are already final.
        span.dataset.termVariant = variant;
        span.setAttribute("data-language-ignore", "");
        span.hidden = variant !== language;
        span.textContent = root.document.body?.dataset?.theatreBattle && root.ATO_THEATRE_TERMS
          ? root.ATO_THEATRE_TERMS.boss(id, variant, names.en) : label;
        return span;
      });
      element.replaceChildren(...variants, suffix);
    },
    isSecretQuery(query) { return secretNames.has(normalize(query)); },
    // 命中隐藏 BOSS 时返回对应的 AIBP 模式（"normal" / "blackbeak"），否则 null。
    secretMode(query) {
      const needle = normalize(query);
      const hit = secrets.find((entry) => entry.aliases.some((alias) => normalize(alias) === needle));
      return hit ? hit.mode : null;
    },
    canUnlockCycle(cycleId) {
      const match = /^c(\d+)$/i.exec(String(cycleId || ""));
      // 隐藏 BOSS（赫利俄斯 / 黑喙）都是 C3 及之后才会遇到的内容。
      return Boolean(match && Number(match[1]) >= 3);
    },
    find(query, includeSecret = false) {
      const needle = normalize(query);
      if (!needle || (secretNames.has(needle) && !includeSecret)) return [];
      return entries.filter((entry) => {
        if (SECRET_MODE_BY_ID[entry.id] && !includeSecret) return false;
        return entry.aliases.some((alias) => normalize(alias).includes(needle));
      });
    },
  };
  root.AIBP_BOSS_SEARCH = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
