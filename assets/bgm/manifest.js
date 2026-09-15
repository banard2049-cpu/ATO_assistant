/* ATO Assistant 背景音乐（BGM）清单
 *
 * 这个文件只有程序逻辑，不含任何音频。音频由使用者自行准备，放进本目录。
 * 每个阶段的 files 是候选文件名，按优先级依次尝试：默认 .mp3（各平台通用，
 * 含 Safari / iOS），其次 .ogg。两种后缀可以任选其一，甚至同时放（先命中的生效），
 * 不必改代码。
 *
 * baseDir 相对**本文件所在目录**（不是页面）：主控台 /index.html、story/index.html、
 * 第二屏幕等不同层级的页面都会解析到同一个音频目录，音频跟着本文件一起移动即可。
 */
(function () {
  // 记下本脚本的绝对目录，交给 bgm.js 把 baseDir 解析成绝对地址。
  // 取不到时（老浏览器、测试替身）会退化为页面相对路径。
  var script = document.currentScript;
  var src = script && script.src ? script.src : "";
  if (!src) return;
  try {
    window.ATO_BGM_SCRIPT_DIR = new URL(".", src).href;
  } catch (error) {
    /* 忽略 */
  }
})();

window.ATO_BGM_MANIFEST = {
  version: 1,
  baseDir: "./",
  defaults: {
    volume: 0.5,
    stageGain: 0.6,
    crossfadeMs: 1000,
    duckDb: -14,
    duckRampMs: 400,
    fadeRampMs: 160,
    stingerMinGapMs: 20000,
  },
  // 主控台「今日流程」步骤 → 阶段。步骤 id 来自 index.html 的 flowSteps。
  flowStageMap: {
    move: "voyage",
    explore: "explore",
    survey: "adventure",
    encounter: "encounter",
    development: "development",
    story: "story",
    doom: "doom",
  },
  defaultStage: "voyage",
  stages: {
    voyage: {
      label: "航行 · 时间表推进",
      short: "航行",
      files: ["LB_Bridge_Tholos_2.mp3", "LB_Bridge_Tholos_2.ogg"],
      gain: 0.5,
      note: "每日移动板块、时间表前进时的常驻曲，音量压低，别盖住说话声。",
    },
    tension: {
      label: "航行 · 紧迫（追猎/计时）",
      short: "紧迫",
      files: ["LB_Argo_Rush_Theme.mp3", "LB_Argo_Rush_Theme.ogg"],
      gain: 0.6,
      note: "被仇敌追猎、灾祸计时逼近时手动切换。",
    },
    explore: {
      label: "探索",
      short: "探索",
      files: ["LB_Exploration_Step.mp3", "LB_Exploration_Step.ogg"],
      gain: 0.55,
      bed: {
        files: ["XX_LB_Expedition_Step_Ambience.mp3", "XX_LB_Expedition_Step_Ambience.ogg"],
        gain: 0.25,
      },
      stinger: {
        files: ["XX_LB_Expedition_Step_Anchor.mp3", "XX_LB_Expedition_Step_Anchor.ogg"],
        gain: 0.5,
      },
      note: "探索阶段主曲 + 长氛围垫底；anchor 是进入探索的短转场音。",
    },
    adventure: {
      label: "考察 · 冒险出发",
      short: "考察",
      files: ["LB_Excursion_Propylon.mp3", "LB_Excursion_Propylon.ogg"],
      gain: 0.55,
    },
    hub: {
      label: "冒险中枢 · 城邦",
      short: "城邦",
      files: ["LB_Grand_Agora.mp3", "LB_Grand_Agora.ogg"],
      gain: 0.55,
    },
    encounter: {
      label: "遭遇 · 战斗",
      short: "战斗",
      files: ["LB_Primordial_Encounter_Theme.mp3", "LB_Primordial_Encounter_Theme.ogg"],
      gain: 0.65,
    },
    armory: {
      label: "战斗准备 · 军械库",
      short: "军械库",
      files: ["LB_Armory.mp3", "LB_Armory.ogg"],
      gain: 0.5,
    },
    development: {
      label: "发展 · 打造与训练",
      short: "发展",
      files: ["LB_Crafting_and_Training.mp3", "LB_Crafting_and_Training.ogg"],
      gain: 0.55,
    },
    titanStoa: {
      label: "泰坦柱廊",
      short: "泰坦柱廊",
      files: ["LB_Titan_Stoa.mp3", "LB_Titan_Stoa.ogg"],
      gain: 0.55,
    },
    story: {
      label: "故事 · 主线剧情",
      short: "主线",
      files: ["LB_Old_Priest_Theme.mp3", "LB_Old_Priest_Theme.ogg"],
      gain: 0.5,
      note: "朗读故事正文时建议 duck（ATO_BGM.duck(true)）。",
    },
    mnemos: {
      label: "回忆突破",
      short: "回忆突破",
      files: ["LB_Last_Academy_2.mp3", "LB_Last_Academy_2.ogg"],
      gain: 0.5,
    },
    inward: {
      label: "内蕴奥德赛",
      short: "内蕴",
      files: ["LB_Nymph_Addyton.mp3", "LB_Nymph_Addyton.ogg"],
      gain: 0.5,
    },
    pharos: {
      label: "法洛斯之梦",
      short: "法洛斯",
      files: ["LB_Dreams_of_Pharos.mp3", "LB_Dreams_of_Pharos.ogg"],
      gain: 0.5,
    },
    doom: {
      label: "灾祸",
      short: "灾禍",
      files: ["LB_Foreboding_Theme.mp3", "LB_Foreboding_Theme.ogg"],
      gain: 0.55,
    },
    lament: {
      label: "低谷 · 失败剧情",
      short: "低谷",
      files: ["LB_Forlorn_Naos.mp3", "LB_Forlorn_Naos.ogg"],
      gain: 0.5,
    },
    aftermath: {
      label: "战斗结算 · 特殊后果",
      short: "结算",
      files: ["LB_Aftermath_2_nocrows.mp3", "LB_Aftermath_2_nocrows.ogg"],
      gain: 0.5,
    },
    rest: {
      label: "休整 · 过场",
      short: "休整",
      files: ["LB_Bridge_Tholos_2.mp3", "LB_Bridge_Tholos_2.ogg"],
      gain: 0.45,
    },
    mausoleum: {
      label: "阿尔戈英雄寝园 · 终局",
      short: "终局",
      files: ["LB_Argonaut_Mausoleum.mp3", "LB_Argonaut_Mausoleum.ogg"],
      gain: 0.5,
      note: "留给英雄死亡 / 退役 / 战役收尾，别在日常流程里消耗掉。",
    },
  },
};
