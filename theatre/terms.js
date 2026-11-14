(function (root) {
  'use strict';

  // A3 ATO 中文规则书 V1.4 pp. 69–75 and 奥德赛·规则书 pp. 69–75.
  const names = {
    HEKATON: ['百臂巨人', '百手巨魔'], LABYRINTHAUROS: ['迷宫机牛', '迷宫机牛'],
    ALPHA_TEMENOS: ['吞域兽', '领首卫域'], HERMESIAN_PURSUER: ['赫尔墨斯追踪者', '赫尔墨斯追击者'],
    CYCLONUS: ['独眼巨人', '无眼巨人'], CHIMERA_METASTASIOS: ['奇美拉', '扩散嵌合体'],
    THE_NIETZSCJEAN: ['尼采超人', '尼采'], THE_BURDEN: ['重担', '巨石'],
    HYPERTIME_ORACLE: ['先知', '超时间流神谕者'], ICARIAN_HARPY: ['哈尔皮', '伊卡洛斯鹰身妖'],
    SUN_DESCENDANT: ['坠落太阳', '烈日后裔'],
  };
  const materials = {
    c1: { tear: ['迷纹泪珠', '迷宫之泪'], core: ['迷纹登升核心', '迷宫升华核心'] },
    c2: { tear: ['埋藏泪珠', '开掘之泪'], core: ['埋藏登升核心', '开掘升华核心'] },
    c3: { tear: ['诅咒泪珠', '恶咒之泪'], core: ['诅咒登升核心', '恶咒升华核心'] },
    // 四、五循环只在扩展里出现，中文版规则书没有印这两组材料的名字；
    // 沿用前三个循环「官方…之泪/…升华核心、玩家…泪珠/…登升核心」的构词。
    // Blackburned 取装备表里的「烧焦的」（technology/ato_gear_production.json）。
    c4: { tear: ['焦黑泪珠', '焦黑之泪'], core: ['焦黑登升核心', '焦黑升华核心'] },
    c5: { tear: ['月陨泪珠', '月陨之泪'], core: ['月陨登升核心', '月陨升华核心'] },
  };
  const expansionBosses = {
    MIDASCORE: 'Midascore', DEMIDJINN: 'Demidjinn', THE_BABELIAN_LUNACY: 'Babelian Lunacy', DAHAKA: 'Dahaka',
    DRAGON_OF_PHOBOS: 'Dragon of Phobos', MEDUKETOS: 'Meduketos', UR_FLEECE: 'Ur-Fleece', TITAN_X: 'Titan X', HELIOS: 'Old Haunt',
  };
  // 剧场里这位隐藏始徒只用称号出现：树图上直接写「赫利俄斯」等于把身分摊开，
  // 而「旧日幽魂」才是玩家在战场上看到的名字。
  const theatreNames = { HELIOS: '旧日幽魂' };
  const bossSearch = typeof module === 'object' && module.exports ? require('../aibp/boss-search.js') : null;
  function boss(id, language, english) {
    const expansionName = expansionBosses[id];
    if (!expansionName) return names[id]?.[index(language)] || english;
    if (language === 'en') return expansionName;
    if (theatreNames[id]) return theatreNames[id];
    const battleName = (bossSearch || root.AIBP_BOSS_SEARCH)?.entries.find(entry => entry.id === id)?.names;
    return battleName?.[language === 'official' ? 'official' : 'fan'] || expansionName;
  }
  const ui = {
    theatre: ['忆识剧场', '幻忆剧场', 'Mnestis Theatre'],
    tree: ['知识之树', '知识之树', 'Tree of Knowledge'],
    sheet: ['剧场记录表', '幻忆记录表', 'Mnestis Theatre Sheet'],
    cycle: ['循环', '故事集', 'Cycle'],
    boss: ['始徒', '骇物', 'Primordial'],
    level: ['始徒等级', '骇物等级', 'Primordial Level'],
    evolution: ['进化轨', '进化轨道', 'Evolution Tracks'],
    normal: ['剧场战斗', '幻忆战斗', 'Mnestis Battle'],
    loot: ['固定掉落', '保底战利品', 'Guaranteed Loot'],
    reward: ['奖励', '奖赏', 'Reward'],
    material: ['登升材料', '升华材料', 'Ascending Material'],
    core: ['登升核心', '升华核心', 'Ascended Core'],
    skyseer: ['天寻者泰坦、揽月与天涯', '天谕者泰坦、摘天之盔与视野边界', 'Skyseer Titan, Skyreach and Horizon’s Edge'],
    return: ['返回忆识剧场', '返回幻忆剧场', 'Return to Mnestis Theatre'],
  };
  // The fan rulebook prints these loot names in English. Use the printed
  // Chinese names only in the official edition. Keys are secret deck/card IDs.
  const officialLoot = {
    '2:10': '盾刃', '2:12': '迷阵重头锤', '2:13': '幽光裹尸布', '2:17': '爪钉矛', '2:18': '秃鹫面具',
    '5:46': '小金字塔', '5:47': '右槌拳', '5:48': '左槌拳', '5:49': '纪念品', '5:50': '淤泥病毒',
    '5:51': '雄狮蛮颚', '5:52': '腿部镰状剑', '5:53': '焦炭僧袍', '5:54': '终末', '5:60': '西西弗斯的巨石',
    '5:175': '本影病毒', '5:176': '巨象护甲', '5:177': '骨疽曲刃剑', '5:178': '烟熏之刃',
    '8:84': '守望者之眼', '8:85': '悖论', '8:86': '末日右爪', '8:87': '投影球体',
    '8:88': '伊卡洛斯之运', '8:89': '伊卡洛斯之坠',
  };

  const index = language => language === 'official' ? 1 : language === 'en' ? 2 : 0;
  const api = {
    ui: (key, language) => ui[key][index(language)],
    boss,
    material: (cycle, kind, language, english) => materials[cycle]?.[kind]?.[index(language)] || english,
    loot: (reward, language) => (language === 'official' && officialLoot[`${reward.deck}:${reward.card}`]) || reward.name,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_THEATRE_TERMS = api;
})(typeof window === 'object' ? window : globalThis);
