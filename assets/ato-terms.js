window.ATO_TERMS = [
  { "from": "腐蚀液态", "to": "腐蚀态" },

  // 勘察步骤「定数框」的官方翻译：分支总表 / 分支卡 / R&R 卡里的英文，一律换成
  // 故事书官方版的对应标题（story/data/storybook-official-data.js），不是另起炉灶
  // 重译；战斗地形取官方中文地形卡的卡面名，标签徽章沿用主控台已有的 MNEMOS_TAG_ZH。
  // scope 只覆盖 createSurveyConstantTools 建的定数框，别处的同名英文不受影响。
  // 分支名（冒险中枢总表 + 分支卡标题）：主控台英文 → 故事书章节标题的官方译名
  { "from": "Can't Go Back", "to": "回头无望", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Children of the Sun", "to": "烈日之子", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Coming Of Age", "to": "异时代降临", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Consider the Ant", "to": "何为蝼蚁", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Dreams Laid Bare", "to": "赤裸的梦想", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Fated Conundrum", "to": "宿命的迷境", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "From the Ashes", "to": "死灰复燃", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Hidden in Plain Sight", "to": "暗藏于世", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Intended Purpose", "to": "勿忘初心", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Man of Purpose", "to": "心怀目标之人", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Misery Industry", "to": "苦难工业", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Of Wax And Promises", "to": "蜡与承诺", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Parable of the Butterfly", "to": "蝴蝶寓言", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Plight of the People", "to": "人民的困境", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Road Less Travelled", "to": "未选之路", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Sin of the Fathers", "to": "父辈之罪", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Tears of a Minotaur", "to": "米诺陶洛斯之泪", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Other Thermopylae", "to": "别样的温泉关", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Truth to Weakness", "to": "弱者的真相", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Uneasy Rests the Head", "to": "必承其重", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "What We Left Behind", "to": "遗留问题", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "When the Land Meets the Sea", "to": "山海之交", "scope": "[data-term-scope~=\"survey-record\"]" },

  // 冒险名（分支卡箱名）：故事书同一条目的官方标题
  { "from": "... That Knew No Mercy", "to": "……它毫不容情", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "A City Made of Riddles", "to": "谜语之城", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "A Drone's Reward", "to": "蝼蚁的回报", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "A Knife So Sharp", "to": "锋利的尖刀", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "A Light in the Dark", "to": "黑夜鬼火", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "A Peace for Our Aeon", "to": "当代永世的和平", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "A Peculiar Vessel", "to": "古怪的舰船", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "A War Out There", "to": "战争的序曲", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "A Way Back", "to": "归去之路", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Absent Hunger", "to": "荒芜的渴求", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Abyss Horizon", "to": "深渊地平线", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Abyssdwellers", "to": "深渊居住者", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Agōgē", "to": "战育", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Among Broken Pottery and Trampled Grapes", "to": "破碎的瓦片与被践踏的葡萄", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "An Oath to Take", "to": "立誓", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Ariadne's Love", "to": "阿里阿德涅的爱", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Armorers", "to": "兵械工厂", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Ascension", "to": "升天", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Ashes of Cydonia", "to": "基多尼亚的灰烬", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Balance of Power", "to": "权力之争", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Balance of Terror", "to": "恐怖的平和", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Beachhead", "to": "滩头阵地", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Between Two Fires", "to": "左右为难", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Bitter Seeds", "to": "苦涩的种子", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Black Veins", "to": "黑色血管", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Bloody Butterfly", "to": "血色蝴蝶", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Bones of the Past", "to": "往日之骨", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Breath of the Grave", "to": "坟墓之息", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Burn It Down", "to": "燃烧殆尽", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Canal Runners", "to": "运河奔行者", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Cancel the Eschaton", "to": "消除末世", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Challenge the Sun", "to": "挑战烈日", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Changing of the Guard", "to": "新的守卫", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Comes a Savior", "to": "救世主降临", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Coming of Age", "to": "异时代降临", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Concede to Shadow", "to": "投靠暗影", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Cornerstone of Bones", "to": "尸骨基石", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Cost of Freedom", "to": "自由的代价", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Cost of Progress", "to": "进步的代价", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Crippled Chrysalis", "to": "残破的蝶蛹", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Crosscurrent", "to": "水流交汇", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Cult of the Bull", "to": "公牛教派", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Cult of the Fallen Sun", "to": "陨落烈日教派", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Daedalus's Failsafe", "to": "第达罗斯的保护装置", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Dark Waters", "to": "黑水", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Dead-end Futures", "to": "无望的未来", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Death Seizures", "to": "亡命抓捕", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Decimation", "to": "十一抽杀律", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Defeated by Victory", "to": "因胜而败", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Discarded", "to": "遗弃", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Divine Law", "to": "神界的律法", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Doomed Pasts", "to": "注定的过去", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Dream of the Maw", "to": "巨口之梦", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Erasing History", "to": "抹除历史", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Face of the Enemy", "to": "敌人的面目", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "False Prophet", "to": "假先知", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Flashback", "to": "闪回", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Food Farm", "to": "食物农场", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Forced Perspective", "to": "透视错觉技巧", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Forgiving Child", "to": "宽容的孩子", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Forsaken Aegises", "to": "荒弃的神盾", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Friend of Theseus", "to": "忒修斯的旧友", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Gears of Progress", "to": "前进的齿轮", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Gilded Cage", "to": "镀金囚笼", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Good Deeds", "to": "善行", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Graveyard of Finite Chances", "to": "有限机遇的坟场", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Helios's Halo", "to": "赫利俄斯的光晕", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Homefront", "to": "后方的前线", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Hooves and Saints", "to": "牛蹄与圣徒", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Hyperborean Apocrypha", "to": "北方乐土伪经", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Inevitable", "to": "无可辩驳", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Justice of War", "to": "战争的正义", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Konstantinos", "to": "康斯坦丁诺斯", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Last Stand", "to": "背水一战", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Lie of the Labyrinth", "to": "迷宫的谎言", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Life of Theseus", "to": "忒修斯的生平", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Living Fossils", "to": "活化石", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Market Forces", "to": "市场力量", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Matter of Survival", "to": "生存问题", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Maws of Byzantion", "to": "拜占庭巨口", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Mazed Forest", "to": "迷阵森林", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Mazed Hull", "to": "船体上的迷阵", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Mazed Tree", "to": "迷阵之树", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Merchants of Death", "to": "死亡商人", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Merchants of Hope", "to": "希望商人", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Minotaurites", "to": "米诺陶洛斯信徒", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Nation of Ships", "to": "船上的国家", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Night Trade", "to": "黑夜贸易", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Olympian Commandment", "to": "奥林匹斯诫条", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Oracles Go Silent", "to": "沉默的神谕者", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Orphaned by the Minotaur", "to": "米诺陶洛斯的遗孤", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Path of Regret", "to": "悔恨之路", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Peace of Mind", "to": "内心的安宁", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "People of Burden", "to": "负重的民族", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "People of the Herds", "to": "游牧民族", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Phantom Pain", "to": "幻痛", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Pitiful of the Sun", "to": "悲悯烈日", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Poseidon's Gift", "to": "波塞冬的礼物", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Price of a Promise", "to": "承诺的代价", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Prisoners", "to": "囚徒", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Prodigal Father", "to": "浪荡的父亲", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Rise and Fall", "to": "飞天和坠落", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Rites and Wrongs", "to": "是非仪式", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Rule of Nations", "to": "国家法则", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Runs Deep", "to": "旧恨难消", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Sand and Stone", "to": "沙与石", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Senseless Chain", "to": "无谓的枷锁", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Shadowplay", "to": "暗影诡计", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Siege Eternal", "to": "永恒围城", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Slaves of War", "to": "战争奴隶", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Son of His Father", "to": "父与子", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Sowing", "to": "播种", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Sowing and Reaping", "to": "种瓜得瓜，种豆得豆", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Stalked by the Maze", "to": "迷阵的追击", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Stewards", "to": "理事会", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Submission and Assent", "to": "追从与赞成", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Synoikismos", "to": "塞诺西辛", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Terror Theory", "to": "恐惧管理理论", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Thaw and Frost", "to": "霜融与霜冻", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Alluring Call", "to": "诱人的呼唤", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Catch", "to": "网中物", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Dim", "to": "阴霾", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Feast", "to": "饕餮", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Hand You're Dealt", "to": "手中的牌", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Hand that Feeds", "to": "供养之人", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Hands of Minos", "to": "米诺斯之手", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Just War", "to": "正义的战争", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Last Goodbye", "to": "最后的道别", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Last Great People", "to": "最后的伟大民族", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Living and the Dead", "to": "生者与死者", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Long Dark", "to": "黑海茫茫", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Minos-branded", "to": "米诺斯的烙印", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Old Shepherd", "to": "老牧羊人", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Once Was An Empire...", "to": "曾经，有个帝国……", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Pilgrimage", "to": "朝圣之旅", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Taking", "to": "收获", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Thousandth Ship", "to": "倾国红颜", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Theseus's Light", "to": "忒修斯之光", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Theseus's Shadow", "to": "忒修斯之影", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Those Who Live", "to": "活着的人们", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Till Death", "to": "至死不渝", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "To Right All Wrongs", "to": "拨乱反正", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "To Walk a Mile", "to": "感同身受", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Trial by Bull", "to": "公牛的审判", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Truth to Power", "to": "强者的真相", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Turf Laws", "to": "地盘法", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Unshackled", "to": "解除桎梏", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Virgins for the Horned", "to": "牛角下的孩童", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Waning of the Light", "to": "消逝的光芒", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "War Within", "to": "内部战争", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Wayward", "to": "寄人篱下", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Weaponized Misery", "to": "苦难武器", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Wild at Heart", "to": "狂野之心", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Withered Tree", "to": "凋零的家谱", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Witness of Minos", "to": "米诺斯的目击者", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Words of Love", "to": "情书", "scope": "[data-term-scope~=\"survey-record\"]" },

  // R&R 冒险名：故事书 rr-adventures 同编号条目的官方标题
  { "from": "A Place I'll Return to Someday", "to": "终有一日我会重返之地", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "A Quarter Stadium at a Time", "to": "四分之一场地", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "An Augean Quandary", "to": "奥革阿斯困境", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Argonalia", "to": "阿尔戈农神节", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Artiazein", "to": "奇偶游戏", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Catch of the Day", "to": "今日渔获", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Clothes Make the Argonaut", "to": "人靠衣装", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Denialwatchers", "to": "拒绝凝视者", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Drunken Odyssey", "to": "醉酒之旅", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Eschaton Deniers", "to": "末世否认者", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Falling Stars", "to": "流星雨", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Fete for the Aeons", "to": "千秋盛宴", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Figurehead Measuring Contest", "to": "艏像比拼", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Firstborn of the Argo", "to": "阿尔戈号的首个新生儿", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "For the Fallen", "to": "悼念亡者", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Frozen Nostalgia", "to": "冰封的眷恋", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Lysistrata", "to": "利西翠妲", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Pictophong Hunt", "to": "猎捕图形兽", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Return of the Goats", "to": "山羊归来", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Secret Admirer", "to": "暗恋者", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Argonaut Epic", "to": "阿尔戈英雄史诗", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Burden", "to": "重负", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Chiton Thief", "to": "希顿小偷", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Diogenes Method", "to": "第欧根尼方法", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The New Muse", "to": "新的缪斯", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The One with the Goats", "to": "山羊问题", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "The Stray", "to": "流浪狗", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Unexpected Byproduct", "to": "意外产物", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Vanishing Concerns", "to": "失踪的麻烦", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Zeno's Scheme", "to": "芝诺的诡计", "scope": "[data-term-scope~=\"survey-record\"]" },

  // 标签徽章：沿用主控台已有的 MNEMOS_TAG_ZH
  { "from": "crime", "to": "犯罪", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "curse", "to": "诅咒", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "deed", "to": "事迹", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "dream", "to": "梦境", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "family", "to": "家庭", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "fate", "to": "命运", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "gods", "to": "众神", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "heritage", "to": "传承", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "supernatural", "to": "超自然", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "tragedy", "to": "悲剧", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "voyage", "to": "航程", "scope": "[data-term-scope~=\"survey-record\"]" },

  // 战斗地形：官方中文地形卡的卡面标题（official-assets/terrain-cards/，见 tmp/terrain-cards-zh.json 的对应文件）
  { "from": " (Inner 2)", "to": "（内圈2）", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": " (Inner 3)", "to": "（内圈3）", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": " (Outer 3)", "to": "（外圈3）", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "(Inner 2)", "to": "（内圈2）", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "(Inner 3)", "to": "（内圈3）", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "(Outer 3)", "to": "（外圈3）", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Abandoned Temple", "to": "废弃神庙", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Ambrosia Elephant", "to": "神浆巨象", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Black Lake", "to": "黑色湖泊", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Cyclops Trap", "to": "独眼巨人陷阱", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Giant Shell", "to": "巨型贝壳", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Graveyard of the Frail", "to": "脆弱者坟场", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Hyperborean Ruins", "to": "北方乐土遗迹", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Krypteia Outpost", "to": "克里普提前哨", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Maze Outcrop", "to": "迷阵露头层", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Minos Manos Unit", "to": "米诺斯建筑单元", "scope": "[data-term-scope~=\"survey-record\"]" },
  { "from": "Spot of Nothingness", "to": "虚无场地", "scope": "[data-term-scope~=\"survey-record\"]" },

  // 故事步骤的三个定数框（法洛斯之梦 / 主线故事 / 特殊事件，data-term-scope=step-constants）。
  // C1-C3 走故事书官方标题：主线的落败条目官方正文写作「落败（船体耗尽）」「落败（船员耗尽）」，
  // C3 三条同此（阿尔戈号命运耗尽见 0251）。特殊事件的格子左边那格放的是英文原名、右边是
  // 中文译名，官方翻译下把英文原名整格清空（to 为空串＝不显示），只留一行官方中文。
  // C4-C5 没有官方故事书数据，只清掉英文原名，右边保留故事书里的中文标题。
  { "from": "Hull Depleted", "to": "船体耗尽", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Crew Depleted", "to": "船员耗尽", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "船体失败", "to": "船体耗尽", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "船员失败", "to": "船员耗尽", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "阿尔戈号命运失败", "to": "阿尔戈号命运耗尽", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Rude Awakening", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Unfathomable Aeons", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Cruel Aeons", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Endless Aeons", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Tomorrow's Edge", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Barren Aeons", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Son of Dusk", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Shortages", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Unknown Aeons", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "Fractures", "to": "", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "粗暴的觉醒", "to": "粗暴觉醒", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "深不可测的永恒", "to": "深不可知的永世", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "残酷的万世", "to": "残忍的永世", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "无尽永恒", "to": "无尽的永世", "scope": "[data-term-scope~=\"step-constants\"]" },
  { "from": "明日的边缘", "to": "明日边缘", "scope": "[data-term-scope~=\"step-constants\"]" },

  // 英雄记录表的回忆词条徽章（data-term-scope=mnemos-tag）：平时显示英文 id（deed / voyage），
  // 官方翻译下换成中文。译名取该页 MNEMOS_TAGS 自己的中文，与主控台 MNEMOS_TAG_ZH 一致。
  { "from": "curse", "to": "诅咒", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "fate", "to": "命运", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "family", "to": "家庭", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "tragedy", "to": "悲剧", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "supernatural", "to": "超自然", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "heritage", "to": "传承", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "dream", "to": "梦境", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "voyage", "to": "航程", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "deed", "to": "事迹", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "crime", "to": "犯罪", "scope": "[data-term-scope~=\"mnemos-tag\"]" },
  { "from": "gods", "to": "众神", "scope": "[data-term-scope~=\"mnemos-tag\"]" },

  // C1-C3 record sheet backs (official simplified Chinese edition).
  {
    "from": "循环",
    "to": "循环",
    "scope": ".date-track-panel"
  },
  {
    "from": "Cycle III 航行时间表",
    "to": "循环纪 III 航行时间线",
    "scope": ".date-track-panel"
  },
  {
    "from": "Cycle II 航行时间表",
    "to": "循环纪 II 航行时间线",
    "scope": ".date-track-panel"
  },
  {
    "from": "Cycle I 航行时间表",
    "to": "循环纪 I 航行时间线",
    "scope": ".date-track-panel"
  },
  {
    "from": "Cackle Special Event",
    "to": "特殊事件怪笑",
    "scope": ".date-track-panel"
  },
  {
    "from": "Relentless Adversary Special Event",
    "to": "特殊事件不休夙敌",
    "scope": ".date-track-panel"
  },
  {
    "from": "Vicious Circle (0040)",
    "to": "恶性闭环（查看 0040）",
    "scope": ".date-track-panel"
  },
  {
    "from": "Acclimation",
    "to": "环境顺应",
    "scope": ".date-track-panel"
  },
  {
    "from": "扎根",
    "to": "环境顺应",
    "scope": ".date-track-panel"
  },
  {
    "from": "Day ",
    "to": "日期 ",
    "scope": ".date-track-panel"
  },
  {
    "from": "达哈卡之刃/达哈卡之刃(盲点/云雾)",
    "to": "达哈卡之刃/达哈卡之刃（视野盲区/云层）"
  },
  {
    "from": "梯子盾牌(T)/梯子模式(T)",
    "to": "梯子模式/节梯防卫盾"
  },
  {
    "from": "爆炸长矛(T)/爆炸长杆(T)",
    "to": "爆桁矛/爆桁杆"
  },
  {
    "from": "密码筒栓舱科技",
    "to": "藏秘筒科技"
  },
  {
    "from": "密码箱科技",
    "to": "藏秘筒科技"
  },
  {
    "from": "英雄叙事助具",
    "to": "单神话支援"
  },
  {
    "from": "单一神话支援",
    "to": "单神话支援"
  },
  {
    "from": "烟刃(隐藏)/烟刃(显露)",
    "to": "烟熏之刃（隐藏）/烟熏之刃（显露)"
  },
  {
    "from": "幻影长矛/幻影长矛(反击)",
    "to": "幽影矛/幽影矛（还击）"
  },
  {
    "from": "厄运之右爪/伊卡洛斯匕首",
    "to": "末日右爪/伊卡洛斯拳刃"
  },
  {
    "from": "吞域兽鳞片盾/吞域兽鳞片伞",
    "to": "卫域鳞盾/卫域鳞伞"
  },
  {
    "from": "元剑(T)/元弓(T)",
    "to": "变形剑/变形弓"
  },
  {
    "from": "普罗托马库斯潜水双耳瓶",
    "to": "普罗托马卡斯潜水细颈瓶"
  },
  {
    "from": "赫利俄斯狂信者御光武器",
    "to": "赫利俄斯狂热信徒轻型武器"
  },
  {
    "from": "伊卡洛斯哈尔皮生态研究",
    "to": "伊卡洛斯鹰身妖活体研究"
  },
  {
    "from": "太阳圆盘/太阳切割器",
    "to": "烈日碟/烈日切割器"
  },
  {
    "from": "晒黑拳头/库存密码箱",
    "to": "古铜色拳头/库存藏秘筒"
  },
  {
    "from": "沐浴阳光的卡拉西里斯",
    "to": "日吻贯头衣"
  },
  {
    "from": "伊卡洛斯哈尔皮核心",
    "to": "伊卡洛斯鹰身妖核心"
  },
  {
    "from": "赫尔墨斯追踪者核心",
    "to": "赫尔墨斯追击者核心"
  },
  {
    "from": "隐匿于众目睽睽之下",
    "to": "暗藏于世"
  },
  {
    "from": "宁为玉碎，不为瓦全",
    "to": "宁死不渝"
  },
  {
    "from": "太阳长矛/太阳战斧",
    "to": "烈日矛/烈日斧"
  },
  {
    "from": "螺旋战锤/螺旋长矛",
    "to": "螺旋重头锤/螺旋矛"
  },
  {
    "from": "暗影病毒/暗影甲壳",
    "to": "本影病毒/本影甲壳"
  },
  {
    "from": "坏死病毒/死灵短剑",
    "to": "骨疽病毒/骨疽曲刃剑"
  },
  {
    "from": "球形投射/灼热之柱",
    "to": "投影球体/炙热立柱"
  },
  {
    "from": "小萨福斯/大萨福斯",
    "to": "次等树枝曲刃剑/高等树枝曲刃剑"
  },
  {
    "from": "伊阿珀托斯预警系统",
    "to": "伊阿珀托斯警报系统"
  },
  {
    "from": "蠕变奇美拉生态研究",
    "to": "扩散嵌合体活体研究"
  },
  {
    "from": "赫利俄斯狂信者装备",
    "to": "赫利俄斯狂热信徒设备"
  },
  {
    "from": "超时光先知生态研究",
    "to": "超时间流神谕者活体研究"
  },
  {
    "from": "伊卡洛斯哈尔皮观测",
    "to": "伊卡洛斯鹰身妖观察"
  },
  {
    "from": "伊卡洛斯哈尔皮解剖",
    "to": "伊卡洛斯鹰身妖解剖"
  },
  {
    "from": "须目刻托斯活体研究",
    "to": "美杜莎刻托活体研究"
  },
  {
    "from": "基克拉泽斯信息传播",
    "to": "基克拉泽斯信息流通"
  },
  {
    "from": "亚特兰蒂斯对接程序",
    "to": "亚特兰蒂斯停泊手续"
  },
  {
    "from": "亚特兰蒂斯维护程序",
    "to": "亚特兰蒂斯维护手续"
  },
  {
    "from": "乌尔-弗里斯核心",
    "to": "原初羊毛核心"
  },
  {
    "from": "亚里士多德远征军",
    "to": "亚里士多德党"
  },
  {
    "from": "时间守护者的孩子",
    "to": "钟表之子"
  },
  {
    "from": "另一场温泉关之战",
    "to": "别样的温泉关"
  },
  {
    "from": "当陆地与海洋相遇",
    "to": "山海之交"
  },
  {
    "from": "伊阿珀托斯应急器",
    "to": "伊阿珀托斯护生器"
  },
  {
    "from": "阿里阿德涅的告别",
    "to": "阿里阿德涅的道别"
  },
  {
    "from": "伊索克拉底限制器",
    "to": "隔离式克拉托斯限流器"
  },
  {
    "from": "伊阿珀托斯救急器",
    "to": "伊阿珀托斯救生器"
  },
  {
    "from": "吞域兽短剑/吞域兽鞭",
    "to": "卫域曲刃剑/卫域鞭"
  },
  {
    "from": "伪中枢/朗基努斯",
    "to": "伪金字塔/朗基努斯"
  },
  {
    "from": "阿里斯提亚诱导器",
    "to": "壮举诱导器"
  },
  {
    "from": "战锤剑/隐藏短剑",
    "to": "锤剑/隐匿曲刃剑"
  },
  {
    "from": "带刺锯/带刺刀刃",
    "to": "倒钩锯/倒钩刃"
  },
  {
    "from": "螺旋鞭/螺旋盾牌",
    "to": "螺旋鞭/螺旋防卫盾"
  },
  {
    "from": "层甲先发制人盔甲",
    "to": "层状防危护甲"
  },
  {
    "from": "便携式硬光发生器",
    "to": "便携式硬光生成器"
  },
  {
    "from": "百臂巨人生态研究",
    "to": "百手巨魔活体研究"
  },
  {
    "from": "迷宫机牛生态研究",
    "to": "迷宫机牛活体研究"
  },
  {
    "from": "独眼巨人高级装备",
    "to": "高级独眼巨人装备"
  },
  {
    "from": "独眼巨人生态研究",
    "to": "无眼巨人活体研究"
  },
  {
    "from": "尼采超人面见研究",
    "to": "尼采会面研究"
  },
  {
    "from": "移动贸易舰队码头",
    "to": "游动贸易舰队码头"
  },
  {
    "from": "尼采超人延伸武器",
    "to": "尼采远触武器"
  },
  {
    "from": "阿尔戈线变形武器",
    "to": "阿尔戈制式变形武器"
  },
  {
    "from": "坠落太阳生态研究",
    "to": "烈日后裔活体研究"
  },
  {
    "from": "阿尔戈工程III",
    "to": "阿尔戈工厂III"
  },
  {
    "from": "阿尔戈号时光安保",
    "to": "阿尔戈时间线安保"
  },
  {
    "from": "旧伊雷姆复合商店",
    "to": "古伊赖姆合成车间"
  },
  {
    "from": "半神迪精活体研究",
    "to": "半灯神活体研究"
  },
  {
    "from": "阿尔戈号云层行动",
    "to": "阿尔戈云层行动"
  },
  {
    "from": "阿瑞特追随者装备",
    "to": "至臻追随者装备"
  },
  {
    "from": "深海惧龙活体研究",
    "to": "骇神巨龙活体研究"
  },
  {
    "from": "乌尔-弗里斯目击",
    "to": "原初羊毛观察"
  },
  {
    "from": "阿尔戈号船员重建",
    "to": "阿尔戈船员重建"
  },
  {
    "from": "阿尔法圣域",
    "to": "领首卫域"
  },
  {
    "from": "亚特兰蒂斯技艺",
    "to": "亚特兰蒂斯高科技物"
  },
  {
    "from": "消逝之光构造体",
    "to": "光逝构造体"
  },
  {
    "from": "伊卡洛斯哈尔皮",
    "to": "伊卡洛斯鹰身妖"
  },
  {
    "from": "赫尔墨斯追踪者",
    "to": "赫尔墨斯追击者"
  },
  {
    "from": "蠕变奇美拉核心",
    "to": "扩散嵌合体核心"
  },
  {
    "from": "超时光先知核心",
    "to": "超时间流神谕者核心"
  },
  {
    "from": "巴比伦疯塔核心",
    "to": "巴别疯魔塔核心"
  },
  {
    "from": "须目塞特斯核心",
    "to": "美杜莎刻托核心"
  },
  {
    "from": "沾满鲜血的双手",
    "to": "身背血债"
  },
  {
    "from": "不劳而获的生活",
    "to": "不劳而获"
  },
  {
    "from": "充满遗憾的人生",
    "to": "遗恨终生"
  },
  {
    "from": "时空交错的爱人",
    "to": "穿越时空的恋人"
  },
  {
    "from": "无心插柳的英雄",
    "to": "浪得虚名"
  },
  {
    "from": "我们身后留下的",
    "to": "遗留问题"
  },
  {
    "from": "三列桨战船胸甲",
    "to": "三列桨座战船胸甲"
  },
  {
    "from": "追踪者最后通牒",
    "to": "追击者的最后通牒"
  },
  {
    "from": "阿加索斯煽动者",
    "to": "贤德煽动器"
  },
  {
    "from": "阿尔戈密码箱α",
    "to": "阿尔戈藏秘筒·阿尔法"
  },
  {
    "from": "阿尔戈密码箱β",
    "to": "阿尔戈藏秘筒·贝塔"
  },
  {
    "from": "阿尔戈密码箱γ",
    "to": "阿尔戈藏秘筒·伽马"
  },
  {
    "from": "反弹者/下降者",
    "to": "下放者/屈尊者"
  },
  {
    "from": "迷宫犬·梅泽\"",
    "to": "迷宫教徒小狗迷宝"
  },
  {
    "from": "无法衡量的重量",
    "to": "无可估量的重负"
  },
  {
    "from": "民意/和平过渡",
    "to": "人民之音/和平转变"
  },
  {
    "from": "西西弗斯的重担",
    "to": "西西弗斯的巨石"
  },
  {
    "from": "西西弗斯的胜利",
    "to": "西西弗斯的凯旋"
  },
  {
    "from": "伊卡洛斯的坠落",
    "to": "伊卡洛斯之坠"
  },
  {
    "from": "达摩克利斯之重",
    "to": "Damocles Weight"
  },
  {
    "from": "赫尔墨斯绞盘”",
    "to": "MWE-109a “Hermes Winch”"
  },
  {
    "from": "赫尔墨斯守护者",
    "to": "赫尔墨斯防护器"
  },
  {
    "from": "熔金卡拉西里斯",
    "to": "熔铸黄金贯头衣"
  },
  {
    "from": "金光卡拉哈里斯",
    "to": "纯金贯头衣"
  },
  {
    "from": "重型回收潜水服",
    "to": "重型复现深海服"
  },
  {
    "from": "腕部鱼叉追踪器",
    "to": "腕部鱼叉追捕器"
  },
  {
    "from": "黑色通风口伪装",
    "to": "黑烟喷口伪装器"
  },
  {
    "from": "阿尔戈密码箱δ",
    "to": "阿尔戈藏秘筒·德尔塔"
  },
  {
    "from": "赫尔墨斯高速路",
    "to": "赫尔墨斯高架柱"
  },
  {
    "from": "专家级船材武器",
    "to": "专业三列桨座战船武器"
  },
  {
    "from": "死去神明的火花",
    "to": "亡神火花"
  },
  {
    "from": "阿尔戈号的任务",
    "to": "阿尔戈任务"
  },
  {
    "from": "斯巴达高级武器",
    "to": "高级斯巴达武器"
  },
  {
    "from": "蠕变奇美拉观测",
    "to": "扩散嵌合体观察"
  },
  {
    "from": "蠕变奇美拉解剖",
    "to": "扩散嵌合体解剖"
  },
  {
    "from": "第13缪斯巨炮",
    "to": "第13缪斯主炮"
  },
  {
    "from": "赫菲斯托斯毒蛇",
    "to": "赫淮斯托式锐矢炮"
  },
  {
    "from": "会合三列桨战船",
    "to": "三列桨座战船会合"
  },
  {
    "from": "阿尔戈工坊II",
    "to": "阿尔戈工厂II"
  },
  {
    "from": "阿尔戈号的命运",
    "to": "阿尔戈号的宿命"
  },
  {
    "from": "德尔菲塞壬护具",
    "to": "德尔斐海妖护甲"
  },
  {
    "from": "德尔菲塞壬武器",
    "to": "德尔斐海妖武器"
  },
  {
    "from": "无时间支援装备",
    "to": "非时支援设备"
  },
  {
    "from": "超时光先智观测",
    "to": "超时间流神谕者观察"
  },
  {
    "from": "超时光先知解剖",
    "to": "超时间流神谕者解剖"
  },
  {
    "from": "德尔菲外交关系",
    "to": "德尔斐外交关系"
  },
  {
    "from": "德尔菲人民支援",
    "to": "德尔斐人民支援"
  },
  {
    "from": "帝国贫困军械师",
    "to": "帝国失愿灯神护甲师"
  },
  {
    "from": "帝国贫困装备师",
    "to": "帝国失愿灯神用具商"
  },
  {
    "from": "迈达狮活体研究",
    "to": "米达斯蝎狮活体研究"
  },
  {
    "from": "巴比伦疯塔目击",
    "to": "巴别疯魔塔观察"
  },
  {
    "from": "凡人地图绘制者",
    "to": "凡间绘图师"
  },
  {
    "from": "生命的真正价值",
    "to": "生命价值"
  },
  {
    "from": "摩涅莫绪涅之吻",
    "to": "谟涅摩叙涅之吻"
  },
  {
    "from": "巴比伦远程武器",
    "to": "巴别塔远程武器"
  },
  {
    "from": "亚特兰蒂斯盔甲",
    "to": "亚特兰蒂斯护甲"
  },
  {
    "from": "须目刻托斯目击",
    "to": "美杜莎刻托观察"
  },
  {
    "from": "须目刻托斯解剖",
    "to": "美杜莎刻托解剖"
  },
  {
    "from": "阿尔戈号的未来",
    "to": "阿尔戈的未来"
  },
  {
    "from": "阿尔戈英雄寝园",
    "to": "阿尔戈英雄陵墓"
  },
  {
    "from": "阿尔戈号命运",
    "to": "阿尔戈命运"
  },
  {
    "from": "代达罗斯器械",
    "to": "第达罗斯密械"
  },
  {
    "from": "独眼巨人甲胄",
    "to": "独眼巨人金属"
  },
  {
    "from": "伊卡洛斯之羽",
    "to": "伊卡洛斯羽毛"
  },
  {
    "from": "旧伊雷姆碎片",
    "to": "古伊赖姆碎块"
  },
  {
    "from": "未来承诺残骸",
    "to": "锦绣尸骸"
  },
  {
    "from": "流体力学鳞片",
    "to": "水动力鳞片"
  },
  {
    "from": "杏仁体萃取物",
    "to": "杏仁核提取物"
  },
  {
    "from": "乌尔-弗里斯",
    "to": "原初羊毛"
  },
  {
    "from": "百臂巨人核心",
    "to": "百手巨魔核心"
  },
  {
    "from": "独眼巨人核心",
    "to": "无眼巨人核心"
  },
  {
    "from": "尼采超人核心",
    "to": "尼采核心"
  },
  {
    "from": "坠落太阳核心",
    "to": "烈日后裔核心"
  },
  {
    "from": "半神迪精核心",
    "to": "半灯神核心"
  },
  {
    "from": "深海惧龙核心",
    "to": "骇神巨龙核心"
  },
  {
    "from": "泰坦 X核心",
    "to": "泰坦X核心"
  },
  {
    "from": "阿瑞特追随者",
    "to": "至臻追随者"
  },
  {
    "from": "移动和时间表",
    "to": "移动步骤"
  },
  {
    "from": "R&R 冒险",
    "to": "休整冒险"
  },
  {
    "from": "奥德修斯·零",
    "to": "奥德零号"
  },
  {
    "from": "赫拉克莱德斯",
    "to": "赫拉克莱提斯"
  },
  {
    "from": "DMT的孤儿",
    "to": "达马特的孤儿"
  },
  {
    "from": "阿克提赛俄斯",
    "to": "阿克提萨奥斯"
  },
  {
    "from": "你所持有的梦",
    "to": "怀揣梦想"
  },
  {
    "from": "被蔑视的冠军",
    "to": "冠军迟暮"
  },
  {
    "from": "伊甸园的坠落",
    "to": "失乐园"
  },
  {
    "from": "最后的十字军",
    "to": "最后的圣教军"
  },
  {
    "from": "他说出了真相",
    "to": "真言之子"
  },
  {
    "from": "心理生理障碍",
    "to": "心身障碍"
  },
  {
    "from": "无限增长花园",
    "to": "无尽增长的花园"
  },
  {
    "from": "目标明确的人",
    "to": "心怀目标之人"
  },
  {
    "from": "尘归尘土归土",
    "to": "死灰复燃"
  },
  {
    "from": "真相映照弱点",
    "to": "弱者的真相"
  },
  {
    "from": "鲜为人知的路",
    "to": "未选之路"
  },
  {
    "from": "父辈们的罪孽",
    "to": "父辈之罪"
  },
  {
    "from": "超越契约法则",
    "to": "交易法则尽头"
  },
  {
    "from": "你所不选之人",
    "to": "暗箭难防"
  },
  {
    "from": "真理的半衰期",
    "to": "半真半假"
  },
  {
    "from": "百臂巨人全甲",
    "to": "百手巨魔全身护甲"
  },
  {
    "from": "百臂巨人之祭",
    "to": "百手大祭"
  },
  {
    "from": "赫尔墨斯碎片",
    "to": "赫尔墨斯破衣"
  },
  {
    "from": "远古塞壬全甲",
    "to": "远古海妖全身护甲"
  },
  {
    "from": "阿喀琉斯英雄",
    "to": "阿喀琉斯赫克托耳鞋"
  },
  {
    "from": "独眼巨人弯刀",
    "to": "独眼巨人镰状剑"
  },
  {
    "from": "独眼巨人胸甲",
    "to": "独眼巨人亚麻胸铠"
  },
  {
    "from": "独眼巨人匕首",
    "to": "独眼巨人小刀"
  },
  {
    "from": "独眼巨人面罩",
    "to": "独眼巨人面甲"
  },
  {
    "from": "赫尔墨斯斗篷",
    "to": "赫尔墨斯披肩"
  },
  {
    "from": "塞壬珊瑚全甲",
    "to": "海妖珊瑚全身甲"
  },
  {
    "from": "塞壬重装骑兵",
    "to": "海妖鳞甲"
  },
  {
    "from": "真·塞壬之刃",
    "to": "海妖真刃"
  },
  {
    "from": "原型破限装置",
    "to": "侵入装置原型"
  },
  {
    "from": "攀爬装备原型",
    "to": "登高装备原型"
  },
  {
    "from": "卡科斯植入物",
    "to": "奸恶植入物"
  },
  {
    "from": "不稳定点火器",
    "to": "飘忽留痕鞭"
  },
  {
    "from": "代达罗斯之翼",
    "to": "第达罗斯之扬"
  },
  {
    "from": "忒修斯的利刃",
    "to": "忒修斯的剃刀"
  },
  {
    "from": "腿弯刀/腿矛",
    "to": "腿部镰状剑/腿部矛"
  },
  {
    "from": "伊卡洛斯命运",
    "to": "伊卡洛斯之运"
  },
  {
    "from": "复仇女神鱼叉",
    "to": "Nemesis Harpoon"
  },
  {
    "from": "羽毛重装骑兵",
    "to": "羽毛鳞甲"
  },
  {
    "from": "赫尔墨斯抓钩",
    "to": "赫尔墨斯爪钩"
  },
  {
    "from": "波斯柱状战锤",
    "to": "波斯立柱重头锤"
  },
  {
    "from": "黄金碟环盾牌",
    "to": "金色圆盘防卫盾"
  },
  {
    "from": "点火器投掷器",
    "to": "点火者投矢器"
  },
  {
    "from": "赫尔墨斯弩炮",
    "to": "赫尔墨斯弩炮枪"
  },
  {
    "from": "炼金术士盔甲",
    "to": "炼金师护甲"
  },
  {
    "from": "纳布霍推土机",
    "to": "尼布甲尼撒推土杖"
  },
  {
    "from": "熔融财富之剑",
    "to": "熔铸财富剑"
  },
  {
    "from": "潘多拉密码箱",
    "to": "潘多拉藏秘筒"
  },
  {
    "from": "达哈卡预言者",
    "to": "达哈卡命数器"
  },
  {
    "from": "巴别塔硬质服",
    "to": "巴别塔强化服"
  },
  {
    "from": "涅瑞伊得声呐",
    "to": "海仙声纳"
  },
  {
    "from": "亚特兰蒂斯剑",
    "to": "亚特兰蒂斯斯帕达剑"
  },
  {
    "from": "未来螺旋胸甲",
    "to": "未来螺旋胸铠"
  },
  {
    "from": "微波护盾鳞片",
    "to": "微波盾鳞"
  },
  {
    "from": "火焰硬化板甲",
    "to": "烈焰硬化板甲"
  },
  {
    "from": "死而复生之矛",
    "to": "生死之矛"
  },
  {
    "from": "多朵纳密码箱",
    "to": "多多纳藏秘筒"
  },
  {
    "from": "基础支援装备",
    "to": "基础支援设备"
  },
  {
    "from": "高级船材武器",
    "to": "高级三列桨座战船武器"
  },
  {
    "from": "船材远程武器",
    "to": "三列桨座战船远程武器"
  },
  {
    "from": "船材延伸武器",
    "to": "三列桨座战船远触武器"
  },
  {
    "from": "百臂巨人观测",
    "to": "百手巨魔观察"
  },
  {
    "from": "百臂巨人解剖",
    "to": "百手巨魔解剖"
  },
  {
    "from": "迷宫机牛观测",
    "to": "迷宫机牛观察"
  },
  {
    "from": "抗力制御项目",
    "to": "反克拉托斯项目"
  },
  {
    "from": "强制技力催发",
    "to": "强制克拉托斯反应"
  },
  {
    "from": "出击山门II",
    "to": "远足柱门II"
  },
  {
    "from": "高级船员扩招",
    "to": "高级船员扩张"
  },
  {
    "from": "被遗忘的知识",
    "to": "失传知识"
  },
  {
    "from": "拉科尼亚助具",
    "to": "拉库尼亚支援设备"
  },
  {
    "from": "吞域兽高级装备",
    "to": "高级卫域装备"
  },
  {
    "from": "独眼巨人观测",
    "to": "无眼巨人观察"
  },
  {
    "from": "独眼巨人解剖",
    "to": "无眼巨人解剖"
  },
  {
    "from": "尼采超人观测",
    "to": "尼采观察"
  },
  {
    "from": "船载弩炮射击",
    "to": "三列桨座战船弩炮火力"
  },
  {
    "from": "三幅节高出力",
    "to": "三曲盘威力增幅"
  },
  {
    "from": "强制技力冷却",
    "to": "强制克拉托斯冷却"
  },
  {
    "from": "肾上腺素注射",
    "to": "超能肾上腺素注入"
  },
  {
    "from": "难民救济工作",
    "to": "难民救援工作"
  },
  {
    "from": "移动贸易中心",
    "to": "游动贸易舰队枢纽"
  },
  {
    "from": "水闸系统集成",
    "to": "水闸系统整合"
  },
  {
    "from": "阿尔戈号安保",
    "to": "阿尔戈安保"
  },
  {
    "from": "阿尔戈号维护",
    "to": "阿尔戈维护"
  },
  {
    "from": "神浆泄漏对策",
    "to": "神浆排放方案"
  },
  {
    "from": "尼采超人武器",
    "to": "尼采武器"
  },
  {
    "from": "尼采超人盔甲",
    "to": "尼采护甲"
  },
  {
    "from": "坠落太阳观测",
    "to": "烈日后裔观察"
  },
  {
    "from": "坠落太阳解剖",
    "to": "烈日后裔部分解剖"
  },
  {
    "from": "时轮预警系统",
    "to": "时光球体警报系统"
  },
  {
    "from": "高级时间对策",
    "to": "高级时间方案"
  },
  {
    "from": "泰坦遗传记忆",
    "to": "泰坦通用记忆"
  },
  {
    "from": "余烬远程武器",
    "to": "煤渣远程武器"
  },
  {
    "from": "帝国贫困储备",
    "to": "帝国失愿灯神库存"
  },
  {
    "from": "旧伊雷姆挖掘",
    "to": "古伊赖姆破土"
  },
  {
    "from": "半神迪精目击",
    "to": "半灯神观察"
  },
  {
    "from": "半神迪精解剖",
    "to": "半灯神解剖"
  },
  {
    "from": "高层建筑项目",
    "to": "高层项目"
  },
  {
    "from": "阿基米德弩炮",
    "to": "阿基米德式弩炮"
  },
  {
    "from": "云层侦察舰队",
    "to": "云层哨探舰队"
  },
  {
    "from": "高级泰坦培育",
    "to": "超级泰坦培育"
  },
  {
    "from": "绳索贩子定理",
    "to": "绳贩子定理"
  },
  {
    "from": "工作永无止境",
    "to": "干不完的工作"
  },
  {
    "from": "深海惧龙目击",
    "to": "骇神巨龙观察"
  },
  {
    "from": "深海惧龙解剖",
    "to": "骇神巨龙解剖"
  },
  {
    "from": "把它拖回来！",
    "to": "拖回来！"
  },
  {
    "from": "阿尔戈号哲学",
    "to": "阿尔戈哲学"
  },
  {
    "from": "阿尔戈号计划",
    "to": "阿尔戈主动精神"
  },
  {
    "from": "狭窄空间航行",
    "to": "狭窄空间导航"
  },
  {
    "from": "死亡/退休",
    "to": "死亡与离队"
  },
  {
    "from": "AA 上限",
    "to": "阿尔戈号能力上限"
  },
  {
    "from": "巴比伦债务",
    "to": "巴别债务"
  },
  {
    "from": "巴比伦装置",
    "to": "巴比伦器具"
  },
  {
    "from": "钙化指节骨",
    "to": "钙化指骨"
  },
  {
    "from": "不稳定神浆",
    "to": "烈性神浆"
  },
  {
    "from": "奇美拉焦油",
    "to": "嵌合焦油"
  },
  {
    "from": "染黑阶梯指",
    "to": "黑污梯指"
  },
  {
    "from": "蠕变奇美拉",
    "to": "扩散嵌合体"
  },
  {
    "from": "超时光先知",
    "to": "超时间流神谕者"
  },
  {
    "from": "巴比伦疯塔",
    "to": "巴别疯魔塔"
  },
  {
    "from": "须目塞特斯",
    "to": "美杜莎刻托"
  },
  {
    "from": "迈达狮核心",
    "to": "米达斯蝎狮核心"
  },
  {
    "from": "记忆之回响",
    "to": "往昔回音"
  },
  {
    "from": "深渊凝望者",
    "to": "深渊凝视者"
  },
  {
    "from": "曙光点燃者",
    "to": "黎明燃烧者"
  },
  {
    "from": "迷宫疾行者",
    "to": "迷阵疾步者泰坦"
  },
  {
    "from": "内蕴奥德赛",
    "to": "内部之旅"
  },
  {
    "from": "忒勒巴科斯",
    "to": "忒勒巴克斯"
  },
  {
    "from": "莱奥库勒斯",
    "to": "里奥库勒斯"
  },
  {
    "from": "阿纳克里翁",
    "to": "阿那克里翁"
  },
  {
    "from": "塞壬幸存者",
    "to": "海妖幸存者"
  },
  {
    "from": "有人在等待",
    "to": "在水一方"
  },
  {
    "from": "破碎的承诺",
    "to": "背弃的承诺"
  },
  {
    "from": "米诺斯传承",
    "to": "米诺斯血统"
  },
  {
    "from": "神明的诅咒",
    "to": "众神的诅咒"
  },
  {
    "from": "窝里最弱的",
    "to": "小人物的出路"
  },
  {
    "from": "耻辱的父母",
    "to": "失格的父母"
  },
  {
    "from": "第三个愿望",
    "to": "第三次祈愿"
  },
  {
    "from": "死亡的记忆",
    "to": "死亡记忆"
  },
  {
    "from": "利己主义者",
    "to": "自大"
  },
  {
    "from": "溺水的记忆",
    "to": "溺水记忆"
  },
  {
    "from": "真相诉说者",
    "to": "真言者"
  },
  {
    "from": "宿命的谜题",
    "to": "宿命的迷境"
  },
  {
    "from": "不安的头颅",
    "to": "必承其重"
  },
  {
    "from": "暴露的梦境",
    "to": "赤裸的梦想"
  },
  {
    "from": "破碎的图纹",
    "to": "破碎图案"
  },
  {
    "from": "破碎的锁链",
    "to": "破碎链条"
  },
  {
    "from": "过去的罪孽",
    "to": "往日的罪孽"
  },
  {
    "from": "未来继承者",
    "to": "未来的继承"
  },
  {
    "from": "奎托斯弯刀",
    "to": "克拉托斯斩刀"
  },
  {
    "from": "下颚骨战斧",
    "to": "颚骨斧"
  },
  {
    "from": "长桅杆长矛",
    "to": "长桅矛"
  },
  {
    "from": "阿瑞斯短笛",
    "to": "阿瑞斯阿夫洛斯管"
  },
  {
    "from": "冲力破坏者",
    "to": "冲力制动器"
  },
  {
    "from": "汽转轮引擎",
    "to": "汽转球引擎"
  },
  {
    "from": "追踪者指令",
    "to": "追击者的索命通牒"
  },
  {
    "from": "墨菲斯模块",
    "to": "摩耳甫斯模块"
  },
  {
    "from": "神浆穿刺器",
    "to": "神浆套管针"
  },
  {
    "from": "迷宫粉碎者",
    "to": "迷宫大槌"
  },
  {
    "from": "双耳瓶腰带",
    "to": "双耳细颈瓶腰带"
  },
  {
    "from": "勒忒守护者",
    "to": "遗失防护器"
  },
  {
    "from": "迷宫降落伞",
    "to": "迷阵降落伞"
  },
  {
    "from": "伟大破坏者",
    "to": "制动巨盾"
  },
  {
    "from": "斯巴达弯刀",
    "to": "斯巴达斩刀"
  },
  {
    "from": "巨型拉马克",
    "to": "大撞锤斧"
  },
  {
    "from": "奇美拉短剑",
    "to": "嵌合曲刃剑"
  },
  {
    "from": "翻滚破坏者",
    "to": "滚轮制动器"
  },
  {
    "from": "皮托斯盔甲",
    "to": "陶缸护甲"
  },
  {
    "from": "改造密码箱",
    "to": "改造藏秘筒"
  },
  {
    "from": "征服者之钉",
    "to": "征服者爪钉"
  },
  {
    "from": "悖论守护者",
    "to": "悖论防护器"
  },
  {
    "from": "命运守护者",
    "to": "命运保险器"
  },
  {
    "from": "轮回守护者",
    "to": "轮回者防护器"
  },
  {
    "from": "时间加速器",
    "to": "时间助推器"
  },
  {
    "from": "太阳守护者",
    "to": "烈日防护器"
  },
  {
    "from": "尖刺破坏者",
    "to": "长钉制动鞋"
  },
  {
    "from": "流亡者衣物",
    "to": "流亡者装束"
  },
  {
    "from": "预言者头巾",
    "to": "神谕僧袍"
  },
  {
    "from": "时间的箭矢",
    "to": "时间之箭"
  },
  {
    "from": "回声吞噬者",
    "to": "回音贪食者"
  },
  {
    "from": "注视者之拳",
    "to": "旁观者之拳"
  },
  {
    "from": "外骨骼盔甲",
    "to": "外骨护甲"
  },
  {
    "from": "马头骨肩甲",
    "to": "马颅肩甲"
  },
  {
    "from": "皮托斯胸甲",
    "to": "陶缸亚麻胸铠"
  },
  {
    "from": "米诺斯头颅",
    "to": "米诺斯牛头"
  },
  {
    "from": "曼陀罗轮盘",
    "to": "建筑圆盘"
  },
  {
    "from": "狮子的利齿",
    "to": "雄狮蛮颚"
  },
  {
    "from": "观察者之眼",
    "to": "守望者之眼"
  },
  {
    "from": "未来密码箱",
    "to": "未来藏秘筒"
  },
  {
    "from": "不死鸟短剑",
    "to": "凤凰曲刃剑"
  },
  {
    "from": "鲨鱼灾厄”",
    "to": "MWE-6d “Sharkscourge”"
  },
  {
    "from": "隐形的伤疤",
    "to": "Unseen Scar"
  },
  {
    "from": "折射光灵药",
    "to": "折光灵药"
  },
  {
    "from": "平行守护者",
    "to": "降落防护器"
  },
  {
    "from": "贪婪限制器",
    "to": "贪婪限流器"
  },
  {
    "from": "灯火守护者",
    "to": "神灯护结"
  },
  {
    "from": "愿望抑制器",
    "to": "祈愿阻尼器"
  },
  {
    "from": "诅咒调解者",
    "to": "诅咒调解器"
  },
  {
    "from": "迪精密码箱",
    "to": "灯神藏秘筒"
  },
  {
    "from": "债务守护者",
    "to": "债务防护盾"
  },
  {
    "from": "反愿望盔甲",
    "to": "反祈愿护甲"
  },
  {
    "from": "龙卷风斗篷",
    "to": "飓风披肩"
  },
  {
    "from": "蛇怪吞噬者",
    "to": "石化蜥蜴喷嗝器"
  },
  {
    "from": "花园启动器",
    "to": "花园激活器"
  },
  {
    "from": "奇迹潮拳套",
    "to": "奇迹潮汐护手"
  },
  {
    "from": "反诅咒盔甲",
    "to": "反诅咒护甲"
  },
  {
    "from": "开放性伤口",
    "to": "外伤"
  },
  {
    "from": "巴别塔长矛",
    "to": "巴别塔长枪"
  },
  {
    "from": "口袋许愿灯",
    "to": "口袋祈愿神灯"
  },
  {
    "from": "暗影切割者",
    "to": "暗影砍刀"
  },
  {
    "from": "支架紧身衣",
    "to": "外置托架全身防护服"
  },
  {
    "from": "迪精外骨骼",
    "to": "灯神外骨架"
  },
  {
    "from": "达哈卡糖果",
    "to": "达哈卡外袍"
  },
  {
    "from": "诅咒破坏者",
    "to": "诅咒断破者"
  },
  {
    "from": "阿尔戈火把",
    "to": "阿尔戈火炬"
  },
  {
    "from": "光导潜水服",
    "to": "光导深海服"
  },
  {
    "from": "以太熄灭器",
    "to": "以太灭火器"
  },
  {
    "from": "痛苦保险丝",
    "to": "痛苦引信"
  },
  {
    "from": "焦虑通风器",
    "to": "焦虑换气仪"
  },
  {
    "from": "照明眩光弹",
    "to": "照明眼罩"
  },
  {
    "from": "维里斯图斯",
    "to": "验真拳套"
  },
  {
    "from": "珍珠茎战锤",
    "to": "珍珠梗重头锤"
  },
  {
    "from": "银色呼吸器",
    "to": "白银呼吸器"
  },
  {
    "from": "纵火者之盾",
    "to": "纵火盾"
  },
  {
    "from": "红外信号器",
    "to": "红外线信号枪"
  },
  {
    "from": "水银密码箱",
    "to": "液汞藏秘筒"
  },
  {
    "from": "偷来的刀刃",
    "to": "窃得之刃"
  },
  {
    "from": "恐惧乌鲁米",
    "to": "骇神软剑"
  },
  {
    "from": "行刑者盔甲",
    "to": "处决者护甲"
  },
  {
    "from": "行刑者短剑",
    "to": "处决者短剑"
  },
  {
    "from": "行刑者头盔",
    "to": "处决者头盔"
  },
  {
    "from": "台风密码箱",
    "to": "堤丰藏秘筒"
  },
  {
    "from": "大块头梅泽",
    "to": "大狗迷宝"
  },
  {
    "from": "氧气破坏者",
    "to": "氧气摧毁者"
  },
  {
    "from": "最后的全书",
    "to": "孤本圣典"
  },
  {
    "from": "追踪者观测",
    "to": "追击者观察"
  },
  {
    "from": "远程再启动",
    "to": "隔空复苏"
  },
  {
    "from": "追踪者协议",
    "to": "追击者协议"
  },
  {
    "from": "阿尔戈工坊",
    "to": "阿尔戈工厂"
  },
  {
    "from": "追踪者对策",
    "to": "追击者问题"
  },
  {
    "from": "反教化哲学",
    "to": "反教条哲学"
  },
  {
    "from": "初识阿戈号",
    "to": "阿尔戈就职培训"
  },
  {
    "from": "奇怪的联盟",
    "to": "奇异联盟"
  },
  {
    "from": "试验性装备",
    "to": "实验性装备"
  },
  {
    "from": "运输用战船",
    "to": "运输三列桨座战船"
  },
  {
    "from": "忒修斯方案",
    "to": "忒修斯方法"
  },
  {
    "from": "旧运输系统",
    "to": "古代运输系统"
  },
  {
    "from": "反间谍行动",
    "to": "反情报"
  },
  {
    "from": "最先的全书",
    "to": "初本圣典"
  },
  {
    "from": "叛教者护具",
    "to": "叛教者护甲"
  },
  {
    "from": "命运转换器",
    "to": "命运转化器"
  },
  {
    "from": "可能性编织",
    "to": "可能性矩阵"
  },
  {
    "from": "摩伊赖克服",
    "to": "摩伊拉行动"
  },
  {
    "from": "消除偶然性",
    "to": "灭绝应急措施"
  },
  {
    "from": "时间政治学",
    "to": "光阴政治"
  },
  {
    "from": "德尔菲调查",
    "to": "德尔斐调查"
  },
  {
    "from": "至圣所完缮",
    "to": "内堂竣工"
  },
  {
    "from": "诅咒塑造者",
    "to": "诅咒整形机"
  },
  {
    "from": "科技修复者",
    "to": "高科技物复原器"
  },
  {
    "from": "迈达狮目击",
    "to": "米达斯蝎狮观察"
  },
  {
    "from": "迈达狮解剖",
    "to": "米达斯蝎狮解剖"
  },
  {
    "from": "达哈卡目击",
    "to": "达哈卡观察"
  },
  {
    "from": "伊雷姆规程",
    "to": "伊赖姆协议"
  },
  {
    "from": "愿望偏转器",
    "to": "祈愿偏转器"
  },
  {
    "from": "黄金变形器",
    "to": "黄金幻化器"
  },
  {
    "from": "达哈卡位移",
    "to": "达哈卡相位调整"
  },
  {
    "from": "诅咒抵抗器",
    "to": "诅咒电阻器"
  },
  {
    "from": "法律摩伊赖",
    "to": "律法军部"
  },
  {
    "from": "荒原银行家",
    "to": "荒漠银行家"
  },
  {
    "from": "巴比伦盔甲",
    "to": "巴别塔护甲"
  },
  {
    "from": "巴比伦武器",
    "to": "巴别塔武器"
  },
  {
    "from": "巴比伦支援",
    "to": "巴别塔支援"
  },
  {
    "from": "泰坦X目击",
    "to": "泰坦X观察"
  },
  {
    "from": "最后的愿望",
    "to": "最后祈愿"
  },
  {
    "from": "金缮法洛斯",
    "to": "金缮航标"
  },
  {
    "from": "三幅节重写",
    "to": "三曲盘覆盖"
  },
  {
    "from": "锚点投放舱",
    "to": "船锚投放舱"
  },
  {
    "from": "摩伊赖叛乱",
    "to": "摩伊拉反抗"
  },
  {
    "from": "恐惧心理学",
    "to": "恐惧症心理学"
  },
  {
    "from": "盖亚的庶子",
    "to": "盖亚继子"
  },
  {
    "from": "战役笔记",
    "to": "战役备注"
  },
  {
    "from": "忆识剧场",
    "to": "幻忆剧场"
  },
  {
    "from": "计数标记",
    "to": "正字标注"
  },
  {
    "from": "凝固时光",
    "to": "冰封时间"
  },
  {
    "from": "轮回长度",
    "to": "轮回时长"
  },
  {
    "from": "冻土合金",
    "to": "北方乐土合金"
  },
  {
    "from": "诅咒船骸",
    "to": "诅咒弃船"
  },
  {
    "from": "神浆原液",
    "to": "原始神浆"
  },
  {
    "from": "浸液机件",
    "to": "注能机械"
  },
  {
    "from": "恐惧精华",
    "to": "畏惧精华"
  },
  {
    "from": "迷宫碎片",
    "to": "迷阵碎块"
  },
  {
    "from": "怪异喙片",
    "to": "怪诞鸟喙"
  },
  {
    "from": "粉化奇物",
    "to": "粉状物质"
  },
  {
    "from": "黑色锁链",
    "to": "黑色链条"
  },
  {
    "from": "超固体块",
    "to": "超固态雕塑物质"
  },
  {
    "from": "怨恨之皮",
    "to": "恶意皮肤"
  },
  {
    "from": "伸缩机构",
    "to": "伸缩机械"
  },
  {
    "from": "岩壳碎片",
    "to": "雕塑表层碎块"
  },
  {
    "from": "凝固神浆",
    "to": "冰封神浆"
  },
  {
    "from": "日灼头骨",
    "to": "日灼颅骨"
  },
  {
    "from": "活化黄金",
    "to": "活体黄金"
  },
  {
    "from": "诅咒胀囊",
    "to": "诅咒肿囊"
  },
  {
    "from": "愿望胚胎",
    "to": "祈愿胚胎"
  },
  {
    "from": "愤怒精华",
    "to": "忿怒精华"
  },
  {
    "from": "黑化光环",
    "to": "黑化光晕"
  },
  {
    "from": "燃尽恩典",
    "to": "燃尽天恩"
  },
  {
    "from": "畏光血肉",
    "to": "畏光肉体"
  },
  {
    "from": "黑羊毛丝",
    "to": "黑羊毛缕"
  },
  {
    "from": "百臂巨人",
    "to": "百手巨魔"
  },
  {
    "from": "独眼巨人",
    "to": "无眼巨人"
  },
  {
    "from": "尼采超人",
    "to": "尼采"
  },
  {
    "from": "坠落太阳",
    "to": "烈日后裔"
  },
  {
    "from": "半神迪精",
    "to": "半灯神"
  },
  {
    "from": "深海惧龙",
    "to": "骇神巨龙"
  },
  {
    "from": "泰坦 X",
    "to": "泰坦X"
  },
  {
    "from": "重担核心",
    "to": "巨石核心"
  },
  {
    "from": "邦联同盟",
    "to": "攻守同盟"
  },
  {
    "from": "太阳后裔",
    "to": "烈日继承者"
  },
  {
    "from": "德尔菲人",
    "to": "德尔斐人"
  },
  {
    "from": "暮光守望",
    "to": "日暮守望者"
  },
  {
    "from": "弃民先锋",
    "to": "先锋骑士团"
  },
  {
    "from": "宿命回忆",
    "to": "命业旧忆"
  },
  {
    "from": "破逻辑者",
    "to": "逻辑断破者泰坦原型"
  },
  {
    "from": "上手指南",
    "to": "新手教学"
  },
  {
    "from": "主线故事",
    "to": "主线剧情"
  },
  {
    "from": "冒险中枢",
    "to": "冒险分支对照表"
  },
  {
    "from": "回忆突破",
    "to": "旧忆突破"
  },
  {
    "from": "特殊后果",
    "to": "特殊余波"
  },
  {
    "from": "喀耳刻卫",
    "to": "喀耳刻加德"
  },
  {
    "from": "珀涅罗珀",
    "to": "菲涅罗珀"
  },
  {
    "from": "希帕提亚",
    "to": "希帕蒂娅"
  },
  {
    "from": "安纳忒亚",
    "to": "巴克特里亚的阿纳提娅"
  },
  {
    "from": "欧利安德",
    "to": "奥里安德"
  },
  {
    "from": "欧莫弗斯",
    "to": "奥墨弗斯"
  },
  {
    "from": "家族世仇",
    "to": "家族恩怨"
  },
  {
    "from": "萦绕心头",
    "to": "鬼影萦绕"
  },
  {
    "from": "难忘之夜",
    "to": "难忘今宵"
  },
  {
    "from": "死神追随",
    "to": "死亡相随"
  },
  {
    "from": "被弃为死",
    "to": "弃之不顾"
  },
  {
    "from": "深渊吐出",
    "to": "深渊梦魇"
  },
  {
    "from": "死亡先行",
    "to": "死神化身"
  },
  {
    "from": "禁忌之恋",
    "to": "禁忌的爱恋"
  },
  {
    "from": "风起云涌",
    "to": "梦寄云空"
  },
  {
    "from": "苦难掮客",
    "to": "贫困贩子"
  },
  {
    "from": "千零一夜",
    "to": "一千前一夜"
  },
  {
    "from": "负重之骡",
    "to": "骡子"
  },
  {
    "from": "消失之点",
    "to": "消逝的尽头"
  },
  {
    "from": "神之形象",
    "to": "如出一辙"
  },
  {
    "from": "庇护之所",
    "to": "栖身之地"
  },
  {
    "from": "言行合一",
    "to": "言与行"
  },
  {
    "from": "暮光之刻",
    "to": "夕阳"
  },
  {
    "from": "全然不知",
    "to": "健忘"
  },
  {
    "from": "焦躁不安",
    "to": "躁动"
  },
  {
    "from": "命运诅咒",
    "to": "命运魔咒"
  },
  {
    "from": "精力耗弱",
    "to": "疲乏"
  },
  {
    "from": "一厢情愿",
    "to": "痴心妄想"
  },
  {
    "from": "可牺牲的",
    "to": "牺牲品"
  },
  {
    "from": "迷宫真相",
    "to": "迷宫的真理"
  },
  {
    "from": "冷酷太阳",
    "to": "无情烈日"
  },
  {
    "from": "凝视蝼蚁",
    "to": "何为蝼蚁"
  },
  {
    "from": "初始目标",
    "to": "勿忘初心"
  },
  {
    "from": "痛苦产业",
    "to": "苦难工业"
  },
  {
    "from": "太阳之子",
    "to": "烈日之子"
  },
  {
    "from": "无法回头",
    "to": "回头无望"
  },
  {
    "from": "步入成熟",
    "to": "异时代降临"
  },
  {
    "from": "意外之财",
    "to": "天降之财"
  },
  {
    "from": "公正惠众",
    "to": "人人平等"
  },
  {
    "from": "肉体虚弱",
    "to": "力不足矣"
  },
  {
    "from": "螺旋秘密",
    "to": "螺旋的秘密"
  },
  {
    "from": "帆布碎片",
    "to": "船帆软甲"
  },
  {
    "from": "塞壬全甲",
    "to": "海妖全身护甲"
  },
  {
    "from": "塞壬之盾",
    "to": "海妖盾"
  },
  {
    "from": "塞壬尖牙",
    "to": "海妖之牙"
  },
  {
    "from": "船桨战锤",
    "to": "岩船重头锤"
  },
  {
    "from": "塞壬之刃",
    "to": "海妖之刃"
  },
  {
    "from": "巨木棍棒",
    "to": "巨树棍棒"
  },
  {
    "from": "利齿弯刀",
    "to": "尖牙镰状剑"
  },
  {
    "from": "重型弯刀",
    "to": "重型斩刀"
  },
  {
    "from": "弹簧背带",
    "to": "弹簧挽具"
  },
  {
    "from": "熔炼盾牌",
    "to": "熔炼圆盾"
  },
  {
    "from": "熔炼短剑",
    "to": "熔炼曲刃剑"
  },
  {
    "from": "始徒诱饵",
    "to": "骇物诱饵"
  },
  {
    "from": "柱状战锤",
    "to": "立柱重头锤"
  },
  {
    "from": "帆布伪装",
    "to": "船帆伪装服"
  },
  {
    "from": "本能胸甲",
    "to": "本能亚麻胸铠"
  },
  {
    "from": "公牛盾牌",
    "to": "公牛圆盾"
  },
  {
    "from": "捕鲸标枪",
    "to": "捕鲸船标枪"
  },
  {
    "from": "迷宫魅影",
    "to": "迷阵锤"
  },
  {
    "from": "飞蛾之焰",
    "to": "蛾锦"
  },
  {
    "from": "迷宫盔甲",
    "to": "迷宫护甲"
  },
  {
    "from": "谜题战斧",
    "to": "谜面斧"
  },
  {
    "from": "神庙伪装",
    "to": "神庙伪装服"
  },
  {
    "from": "迷宫拳套",
    "to": "迷阵拳套"
  },
  {
    "from": "鳞片碟环",
    "to": "鳞片轮刃"
  },
  {
    "from": "迷宫岩浆",
    "to": "迷阵盒"
  },
  {
    "from": "石雕盔甲",
    "to": "石料雕塑护甲"
  },
  {
    "from": "浮雕拳套",
    "to": "雕塑拳套"
  },
  {
    "from": "强化护胫",
    "to": "助推厚底鞋"
  },
  {
    "from": "重型长矛",
    "to": "重型矛"
  },
  {
    "from": "雕刻弯刀",
    "to": "雕工斩刀"
  },
  {
    "from": "冲击盔甲",
    "to": "防冲护甲"
  },
  {
    "from": "碰撞盾牌",
    "to": "防撞盾"
  },
  {
    "from": "泥沼盔甲",
    "to": "淤泥护甲"
  },
  {
    "from": "卡塔罗斯",
    "to": "拳刃套"
  },
  {
    "from": "重型战锤",
    "to": "槌型重头锤"
  },
  {
    "from": "泥沼棍棒",
    "to": "淤泥巨棒"
  },
  {
    "from": "泥沼克星",
    "to": "淤泥克星"
  },
  {
    "from": "矮人盔甲",
    "to": "矮胖护甲"
  },
  {
    "from": "黑曜短剑",
    "to": "黑色曲刃剑"
  },
  {
    "from": "阴燃战锤",
    "to": "阴燃重头锤"
  },
  {
    "from": "坚固拳套",
    "to": "硬化拳套"
  },
  {
    "from": "深渊长矛",
    "to": "深渊矛"
  },
  {
    "from": "黑曜标枪",
    "to": "黑色标枪"
  },
  {
    "from": "深渊胸甲",
    "to": "深渊亚麻胸铠"
  },
  {
    "from": "深渊胸膛",
    "to": "深渊胸铠"
  },
  {
    "from": "命运保险",
    "to": "命运保险罐"
  },
  {
    "from": "螺旋盾牌",
    "to": "螺旋盾"
  },
  {
    "from": "塞壬獠牙",
    "to": "海妖獠牙"
  },
  {
    "from": "螺旋碟环",
    "to": "螺旋圆盘"
  },
  {
    "from": "塞壬面具",
    "to": "海妖面具"
  },
  {
    "from": "回响之壳",
    "to": "召回贝壳"
  },
  {
    "from": "冰川织物",
    "to": "冰川布料"
  },
  {
    "from": "回归试剂",
    "to": "退化试剂"
  },
  {
    "from": "黑冰护胫",
    "to": "黑冰厚底鞋"
  },
  {
    "from": "冰块盔甲",
    "to": "冰块护甲"
  },
  {
    "from": "点燃长矛",
    "to": "点火矛"
  },
  {
    "from": "荷马引擎",
    "to": "荷马式引擎"
  },
  {
    "from": "阴影战锤",
    "to": "阴影重头锤"
  },
  {
    "from": "阴影盔甲",
    "to": "阴影护甲"
  },
  {
    "from": "阴影盾牌",
    "to": "阴影盾"
  },
  {
    "from": "羽毛盾牌",
    "to": "羽毛盾"
  },
  {
    "from": "悖论牙齿",
    "to": "悖理"
  },
  {
    "from": "羽毛胸甲",
    "to": "羽毛亚麻胸铠"
  },
  {
    "from": "变形之谜",
    "to": "变形谜团"
  },
  {
    "from": "黑冰之剑",
    "to": "黑冰剑"
  },
  {
    "from": "球形盔甲",
    "to": "球面护甲"
  },
  {
    "from": "护盾之刃",
    "to": "盾刃"
  },
  {
    "from": "迷宫战锤",
    "to": "迷阵重头锤"
  },
  {
    "from": "流光轻纱",
    "to": "幽光裹尸布"
  },
  {
    "from": "冥府陵寝",
    "to": "美杜撒拉"
  },
  {
    "from": "钉刺长矛",
    "to": "爪钉矛"
  },
  {
    "from": "未解之谜",
    "to": "未解谜盒"
  },
  {
    "from": "线团护符",
    "to": "纱线圣符"
  },
  {
    "from": "末日石碑",
    "to": "末世之石"
  },
  {
    "from": "金字塔尖",
    "to": "小金字塔"
  },
  {
    "from": "右巨力拳",
    "to": "右槌拳"
  },
  {
    "from": "左巨力拳",
    "to": "左槌拳"
  },
  {
    "from": "泥沼病毒",
    "to": "淤泥病毒"
  },
  {
    "from": "焦土头巾",
    "to": "焦炭僧袍"
  },
  {
    "from": "红色城邦",
    "to": "赤色都市"
  },
  {
    "from": "贝勒洛丰",
    "to": "柏勒罗丰"
  },
  {
    "from": "塔尖须杖",
    "to": "阿斯克勒庇俄斯金字塔"
  },
  {
    "from": "巨象盔甲",
    "to": "巨象护甲"
  },
  {
    "from": "贝壳圣城",
    "to": "贝壳萨勒姆"
  },
  {
    "from": "鱼叉弩炮",
    "to": "Harpoon Ballista Gun"
  },
  {
    "from": "超前一步",
    "to": "A Head of Time"
  },
  {
    "from": "末日时钟",
    "to": "Doomsday Clock"
  },
  {
    "from": "须鲸斗篷",
    "to": "Baleen Cloak"
  },
  {
    "from": "罪恶余烬",
    "to": "Ember of Guilt"
  },
  {
    "from": "肘关节”",
    "to": "MWE-4 “Keelbow”"
  },
  {
    "from": "日蚀之剑",
    "to": "日蚀剑"
  },
  {
    "from": "羽毛战锤",
    "to": "羽毛重头锤"
  },
  {
    "from": "燃尽之鞭",
    "to": "燃尽鞭"
  },
  {
    "from": "下降战斧",
    "to": "日沉斧"
  },
  {
    "from": "黄昏边缘",
    "to": "薄暮利刃"
  },
  {
    "from": "余烬长矛",
    "to": "余烬矛"
  },
  {
    "from": "日冕碟环",
    "to": "日冕圆盘"
  },
  {
    "from": "被诅咒的",
    "to": "恶咒"
  },
  {
    "from": "日蚀之盾",
    "to": "日蚀盾"
  },
  {
    "from": "反击匕首",
    "to": "还击匕首"
  },
  {
    "from": "玻璃盔甲",
    "to": "玻璃护甲"
  },
  {
    "from": "黄金盔甲",
    "to": "金色护甲"
  },
  {
    "from": "玻璃之剑",
    "to": "玻璃剑"
  },
  {
    "from": "黄金之剑",
    "to": "金色剑"
  },
  {
    "from": "镀金战斧",
    "to": "镀金斧"
  },
  {
    "from": "丝绸盔甲",
    "to": "丝绸护甲"
  },
  {
    "from": "步行工具",
    "to": "行走工具"
  },
  {
    "from": "诺斯替灵",
    "to": "灵知精魂"
  },
  {
    "from": "风神刀盾",
    "to": "阿涅弥伊刃盾"
  },
  {
    "from": "鳞片巨弓",
    "to": "天秤巨弓"
  },
  {
    "from": "炼金长矛",
    "to": "炼金长枪"
  },
  {
    "from": "迈达斯枪",
    "to": "米达斯枪"
  },
  {
    "from": "明日种子",
    "to": "明日之种"
  },
  {
    "from": "变化之鞭",
    "to": "换形鞭"
  },
  {
    "from": "无尽长矛",
    "to": "无境矛"
  },
  {
    "from": "金光斗篷",
    "to": "纯金披风"
  },
  {
    "from": "黄金竖琴",
    "to": "金色竖琴"
  },
  {
    "from": "双角长矛",
    "to": "双角长枪"
  },
  {
    "from": "愿望之刃",
    "to": "祈愿之刃"
  },
  {
    "from": "迪精斗篷",
    "to": "灯神披风"
  },
  {
    "from": "紧急脱险",
    "to": "紧急融资"
  },
  {
    "from": "三叉长矛",
    "to": "三角长枪"
  },
  {
    "from": "不死盔甲",
    "to": "不朽者护甲"
  },
  {
    "from": "不死拳套",
    "to": "不朽者拳套"
  },
  {
    "from": "发光信标",
    "to": "光耀信标"
  },
  {
    "from": "神圣诱饵",
    "to": "神界诱饵"
  },
  {
    "from": "神浆之剑",
    "to": "神浆剑"
  },
  {
    "from": "塔状棍棒",
    "to": "塔柱棍棒"
  },
  {
    "from": "神浆之鞭",
    "to": "神浆鞭"
  },
  {
    "from": "凝固鱼叉",
    "to": "冷凝鱼叉"
  },
  {
    "from": "碎片飞镖",
    "to": "破片飞镖"
  },
  {
    "from": "月之斗篷",
    "to": "疯徒披肩"
  },
  {
    "from": "尖塔全甲",
    "to": "尖柱全身甲"
  },
  {
    "from": "全景盾牌",
    "to": "全知防卫盾"
  },
  {
    "from": "禁锢月光",
    "to": "受锢月光"
  },
  {
    "from": "胀囊坦克",
    "to": "浮肿水罐"
  },
  {
    "from": "龟形盾牌",
    "to": "龟甲护身盾"
  },
  {
    "from": "深渊战斧",
    "to": "深渊斧"
  },
  {
    "from": "掏空尖刺",
    "to": "剜脏扦"
  },
  {
    "from": "防水信标",
    "to": "抗水信标"
  },
  {
    "from": "折射盾牌",
    "to": "折射透镜盾"
  },
  {
    "from": "镁闪光弹",
    "to": "镁光棒"
  },
  {
    "from": "蛋形坦克",
    "to": "卵形水罐"
  },
  {
    "from": "针刺匕首",
    "to": "针片小刀"
  },
  {
    "from": "刀舞盔甲",
    "to": "刃舞护甲"
  },
  {
    "from": "振荡长矛",
    "to": "振荡矛"
  },
  {
    "from": "光墙盾牌",
    "to": "光墙盾"
  },
  {
    "from": "潜航鱼叉",
    "to": "深海桨座战船鱼叉"
  },
  {
    "from": "天窗胸甲",
    "to": "天光胸甲"
  },
  {
    "from": "珊瑚盔甲",
    "to": "珊瑚护甲"
  },
  {
    "from": "光辉头盔",
    "to": "光之头盔"
  },
  {
    "from": "暗光线路",
    "to": "暗光配线"
  },
  {
    "from": "红外模块",
    "to": "红外线模块"
  },
  {
    "from": "众目睽睽",
    "to": "聚光"
  },
  {
    "from": "超越花环",
    "to": "超凡花环"
  },
  {
    "from": "忏悔之鞭",
    "to": "忏悔鞭"
  },
  {
    "from": "信仰弯刀",
    "to": "信仰斩刀"
  },
  {
    "from": "羞耻头巾",
    "to": "羞愧僧袍"
  },
  {
    "from": "神圣长矛",
    "to": "圣化长枪"
  },
  {
    "from": "扭动匕首",
    "to": "蠕动小刀"
  },
  {
    "from": "战壕弯刀",
    "to": "海沟镰状剑"
  },
  {
    "from": "战壕链镰",
    "to": "海沟锁镰"
  },
  {
    "from": "爪角鱼叉",
    "to": "螯角鱼叉"
  },
  {
    "from": "螺旋面罩",
    "to": "螺旋面甲"
  },
  {
    "from": "短暂珍珠",
    "to": "瞬息珍珠"
  },
  {
    "from": "月光护符",
    "to": "银光护身符"
  },
  {
    "from": "银色皮肤",
    "to": "白银皮肤"
  },
  {
    "from": "自作自受",
    "to": "自残"
  },
  {
    "from": "永恒誓言",
    "to": "永恒誓约"
  },
  {
    "from": "恐惧之鞭",
    "to": "骇神鞭"
  },
  {
    "from": "透镜头灯",
    "to": "眼球头灯"
  },
  {
    "from": "面纱包裹",
    "to": "帷幕裹衣"
  },
  {
    "from": "协同盔甲",
    "to": "协同护甲"
  },
  {
    "from": "黑暗典范",
    "to": "黑暗标本"
  },
  {
    "from": "透镜长矛",
    "to": "眼球长枪"
  },
  {
    "from": "战壕王冠",
    "to": "海沟之冠"
  },
  {
    "from": "透镜灯塔",
    "to": "眼球灯塔"
  },
  {
    "from": "始徒黎明",
    "to": "骇物的初晓"
  },
  {
    "from": "船材护具",
    "to": "三列桨座战船护甲"
  },
  {
    "from": "塞壬护具",
    "to": "海妖护甲"
  },
  {
    "from": "熔铸装备",
    "to": "熔炼装备"
  },
  {
    "from": "高级助具",
    "to": "高级支援设备"
  },
  {
    "from": "船材武器",
    "to": "三列桨座战船武器"
  },
  {
    "from": "吞域兽观测",
    "to": "卫域观察"
  },
  {
    "from": "命运沉沦",
    "to": "命运沉降"
  },
  {
    "from": "箭雨掩护",
    "to": "箭矢弹幕"
  },
  {
    "from": "危急协议",
    "to": "危机协议"
  },
  {
    "from": "泰坦起源",
    "to": "泰坦创世"
  },
  {
    "from": "浅水航行",
    "to": "浅水导航"
  },
  {
    "from": "希望之解",
    "to": "希望逻辑"
  },
  {
    "from": "敌后密探",
    "to": "深嵌式间谍"
  },
  {
    "from": "记忆论题",
    "to": "幻忆论文"
  },
  {
    "from": "泰坦捕获",
    "to": "泰坦猎捕"
  },
  {
    "from": "船员扩招",
    "to": "船员扩张"
  },
  {
    "from": "吞域兽护具",
    "to": "卫域护甲"
  },
  {
    "from": "吞域兽助具",
    "to": "卫域支援设备"
  },
  {
    "from": "吞域兽目击",
    "to": "卫域观察"
  },
  {
    "from": "吞域兽盔甲",
    "to": "卫域护甲"
  },
  {
    "from": "吞域兽支援装备",
    "to": "卫域支援设备"
  },
  {
    "from": "吞域兽计划",
    "to": "卫域项目"
  },
  {
    "from": "吞域兽雕刻师",
    "to": "卫域雕塑家"
  },
  {
    "from": "吞域兽深层工坊",
    "to": "深度卫域馆"
  },
  {
    "from": "吞域兽工坊",
    "to": "卫域馆"
  },
  {
    "from": "吞域兽",
    "to": "卫域"
  },
  {
    "from": "奇美拉",
    "to": "扩散嵌合体"
  },
  {
    "from": "超时神谕",
    "to": "超时间流神谕者"
  },
  {
    "from": "伊卡洛斯哈耳庇厄",
    "to": "伊卡洛斯鹰身妖"
  },
  {
    "from": "伊卡洛斯鹰身女妖",
    "to": "伊卡洛斯鹰身妖"
  },
  {
    "from": "岩雕装备",
    "to": "雕塑装备"
  },
  {
    "from": "战争助具",
    "to": "战争支援设备"
  },
  {
    "from": "重担观测",
    "to": "巨石观察"
  },
  {
    "from": "瞬时备战",
    "to": "反射预备训练"
  },
  {
    "from": "神浆收容",
    "to": "神浆抑制"
  },
  {
    "from": "泰坦蜕变",
    "to": "泰坦形态发生"
  },
  {
    "from": "政治庇护",
    "to": "政治保护"
  },
  {
    "from": "招聘项目",
    "to": "招募计划"
  },
  {
    "from": "难民合作",
    "to": "难民吸纳"
  },
  {
    "from": "基层支持",
    "to": "草根支援"
  },
  {
    "from": "同盟联络",
    "to": "联盟线人"
  },
  {
    "from": "运河勘测",
    "to": "运河侦察"
  },
  {
    "from": "上游导航",
    "to": "逆流导航"
  },
  {
    "from": "战争募员",
    "to": "战争招募"
  },
  {
    "from": "战争山门",
    "to": "战争柱门"
  },
  {
    "from": "泰坦生产",
    "to": "泰坦培育"
  },
  {
    "from": "巨型柱廊",
    "to": "大柱廊"
  },
  {
    "from": "创伤复原",
    "to": "创伤后成长"
  },
  {
    "from": "时变助具",
    "to": "时空支援设备"
  },
  {
    "from": "黑冰护具",
    "to": "黑冰护甲"
  },
  {
    "from": "重担解剖",
    "to": "巨石解剖"
  },
  {
    "from": "深渊远征",
    "to": "深渊勘察"
  },
  {
    "from": "时流逆转",
    "to": "逆向时间流"
  },
  {
    "from": "远程医疗",
    "to": "隔空治疗"
  },
  {
    "from": "回光返照",
    "to": "瞬态死亡"
  },
  {
    "from": "量子武库",
    "to": "量子军械库"
  },
  {
    "from": "机会冻结",
    "to": "时机冻结"
  },
  {
    "from": "时间跳转",
    "to": "时间略过"
  },
  {
    "from": "泰坦荣光",
    "to": "泰坦尚德"
  },
  {
    "from": "时间之帆",
    "to": "时光船帆"
  },
  {
    "from": "破限规程",
    "to": "侵入协议"
  },
  {
    "from": "破冰规程",
    "to": "破冰协议"
  },
  {
    "from": "时光裂痕",
    "to": "时间伤口"
  },
  {
    "from": "时间对策",
    "to": "时间方案"
  },
  {
    "from": "时变庇护",
    "to": "时光神盾"
  },
  {
    "from": "时屏协议",
    "to": "灭绝协议"
  },
  {
    "from": "泰坦护理",
    "to": "泰坦看护"
  },
  {
    "from": "太阳防护",
    "to": "烈日盾护"
  },
  {
    "from": "量子山门",
    "to": "量子柱门"
  },
  {
    "from": "余烬武器",
    "to": "煤渣武器"
  },
  {
    "from": "余烬盔甲",
    "to": "煤渣护甲"
  },
  {
    "from": "余烬支援",
    "to": "煤渣支援"
  },
  {
    "from": "迪精宝藏",
    "to": "灯神资金储备"
  },
  {
    "from": "基层项目",
    "to": "草根项目"
  },
  {
    "from": "破产防御",
    "to": "破产壁垒"
  },
  {
    "from": "登升规程",
    "to": "升空协议"
  },
  {
    "from": "泰坦共生",
    "to": "泰坦互生"
  },
  {
    "from": "诅咒交易",
    "to": "诅咒交换"
  },
  {
    "from": "帝国交易",
    "to": "帝国议价"
  },
  {
    "from": "帝国联络",
    "to": "帝国线人"
  },
  {
    "from": "神圣交易",
    "to": "神界买卖"
  },
  {
    "from": "沙暴航行",
    "to": "沙暴导航"
  },
  {
    "from": "沙暴航海",
    "to": "沙暴航行"
  },
  {
    "from": "荒原商人",
    "to": "荒漠商人"
  },
  {
    "from": "梦境环面",
    "to": "梦想环面"
  },
  {
    "from": "分享知识",
    "to": "共享知识"
  },
  {
    "from": "深渊盔甲",
    "to": "深渊护甲"
  },
  {
    "from": "先锋装备",
    "to": "先锋骑士团装备"
  },
  {
    "from": "镀银盔甲",
    "to": "镀银护甲"
  },
  {
    "from": "止痛射击",
    "to": "止痛剂注射"
  },
  {
    "from": "内在之光",
    "to": "内心之光"
  },
  {
    "from": "共享命运",
    "to": "共担命运"
  },
  {
    "from": "模式破译",
    "to": "图案解码"
  },
  {
    "from": "科学驳斥",
    "to": "科学批判"
  },
  {
    "from": "和平使命",
    "to": "和平任务"
  },
  {
    "from": "基层外交",
    "to": "草根外交"
  },
  {
    "from": "水下侦察",
    "to": "水下哨探"
  },
  {
    "from": "改进潜航",
    "to": "进阶下潜"
  },
  {
    "from": "超级潜航",
    "to": "超级下潜"
  },
  {
    "from": "凡人同盟",
    "to": "凡间联盟"
  },
  {
    "from": "记忆训练",
    "to": "幻忆训练"
  },
  {
    "from": "圆桌舰桥",
    "to": "舰桥圆庙"
  },
  {
    "from": "出击山门",
    "to": "远足柱门"
  },
  {
    "from": "时间表",
    "to": "时间线"
  },
  {
    "from": "陌生人",
    "to": "陌路人"
  },
  {
    "from": "变节者",
    "to": "叛变者"
  },
  {
    "from": "总上限",
    "to": "泰坦上限"
  },
  {
    "from": "塞壬壳",
    "to": "海妖贝壳"
  },
  {
    "from": "山铜块",
    "to": "山铜厚块"
  },
  {
    "from": "肌肉簇",
    "to": "肌肉团簇"
  },
  {
    "from": "血肉块",
    "to": "肉体衣幔"
  },
  {
    "from": "眼球簇",
    "to": "眼球团簇"
  },
  {
    "from": "迈达狮",
    "to": "米达斯蝎狮"
  },
  {
    "from": "回归者",
    "to": "归来者"
  },
  {
    "from": "终愿者",
    "to": "祈愿终结者"
  },
  {
    "from": "登月者",
    "to": "疯魔登月者"
  },
  {
    "from": "迷宫徒",
    "to": "迷宫教徒"
  },
  {
    "from": "角誓者",
    "to": "断角誓从"
  },
  {
    "from": "希洛人",
    "to": "黑劳士"
  },
  {
    "from": "浪费者",
    "to": "弃民"
  },
  {
    "from": "撼地者",
    "to": "撼地者泰坦"
  },
  {
    "from": "守战者",
    "to": "战争守护者泰坦"
  },
  {
    "from": "燃火者",
    "to": "纵火者泰坦"
  },
  {
    "from": "翔云者",
    "to": "翔云者泰坦"
  },
  {
    "from": "影舞者",
    "to": "影舞者泰坦"
  },
  {
    "from": "无惧者",
    "to": "恐惧吞食者泰坦"
  },
  {
    "from": "潜渊者",
    "to": "地狱深潜者泰坦"
  },
  {
    "from": "越界者",
    "to": "侵入者泰坦"
  },
  {
    "from": "行刑者",
    "to": "处决者泰坦"
  },
  {
    "from": "故事卡",
    "to": "剧情卡牌"
  },
  {
    "from": "灾祸卡",
    "to": "末日卡牌"
  },
  {
    "from": "阿斯特",
    "to": "艾丝特"
  },
  {
    "from": "被遗弃",
    "to": "抛弃"
  },
  {
    "from": "荣誉盲",
    "to": "盲从荣誉"
  },
  {
    "from": "不情愿",
    "to": "迟疑"
  },
  {
    "from": "被诅咒",
    "to": "诅咒缠身"
  },
  {
    "from": "被剥夺",
    "to": "贫瘠"
  },
  {
    "from": "囤积者",
    "to": "囤积"
  },
  {
    "from": "弥赛亚",
    "to": "救世"
  },
  {
    "from": "鲸鱼刀",
    "to": "鲸刀"
  },
  {
    "from": "鲸骨叉",
    "to": "鲸骨双叉戟"
  },
  {
    "from": "反弹锤",
    "to": "回振锤"
  },
  {
    "from": "渔具鞘",
    "to": "吊索鞘"
  },
  {
    "from": "稳定器",
    "to": "稳步器"
  },
  {
    "from": "迷宫耙",
    "to": "迷阵耙"
  },
  {
    "from": "船首弓",
    "to": "船体弓"
  },
  {
    "from": "极巨干",
    "to": "癸干斯"
  },
  {
    "from": "迷宫化",
    "to": "迷宫"
  },
  {
    "from": "掏空者",
    "to": "开膛对剑"
  },
  {
    "from": "撑跳绳",
    "to": "腾跃绳"
  },
  {
    "from": "琥珀甲",
    "to": "神浆垫护甲"
  },
  {
    "from": "撑跳矛",
    "to": "腾跃矛"
  },
  {
    "from": "挖掘物",
    "to": "开掘"
  },
  {
    "from": "螺旋剑",
    "to": "螺旋斯帕达剑"
  },
  {
    "from": "冰灵药",
    "to": "寒冰灵药"
  },
  {
    "from": "阳光枪",
    "to": "日光枪"
  },
  {
    "from": "破冰者",
    "to": "寒冰制动鞋"
  },
  {
    "from": "祖父的",
    "to": "祖父之物"
  },
  {
    "from": "链刃”",
    "to": "MWE-33b “Chainblade”"
  },
  {
    "from": "园丁”",
    "to": "MWE-33u “Gardeners”"
  },
  {
    "from": "雕像锚",
    "to": "雕像船锚"
  },
  {
    "from": "蒸馏服",
    "to": "蒸馏防护服"
  },
  {
    "from": "固化器",
    "to": "固化剂"
  },
  {
    "from": "责任鞭",
    "to": "债责链枷"
  },
  {
    "from": "杰尔摩",
    "to": "壶甲"
  },
  {
    "from": "气囊矿",
    "to": "气囊地雷"
  },
  {
    "from": "石板矛",
    "to": "石柱矛"
  },
  {
    "from": "液体弓",
    "to": "液态弓"
  },
  {
    "from": "烧焦的",
    "to": "黑灼"
  },
  {
    "from": "型短剑",
    "to": "X曲刃剑"
  },
  {
    "from": "防火服",
    "to": "抗火防护服"
  },
  {
    "from": "月之肺",
    "to": "月肺虫"
  },
  {
    "from": "爪裂器",
    "to": "螯爪碎裂钳"
  },
  {
    "from": "猎杀者",
    "to": "猎人杀手"
  },
  {
    "from": "继承人",
    "to": "法定继承人"
  },
  {
    "from": "时滞论",
    "to": "静态理论"
  },
  {
    "from": "闪回步",
    "to": "闪光退步"
  },
  {
    "from": "新家园",
    "to": "新家户经济"
  },
  {
    "from": "回忆",
    "to": "旧忆"
  },
  {
    "from": "技能",
    "to": "能力"
  },
  {
    "from": "狡黠",
    "to": "机敏"
  },
  {
    "from": "力量",
    "to": "狂怒"
  },
  {
    "from": "武库",
    "to": "军械库"
  },
  {
    "from": "保存",
    "to": "存档"
  },
  {
    "from": "残废",
    "to": "伤残泰坦"
  },
  {
    "from": "氧气",
    "to": "氧气/以太标记"
  },
  {
    "from": "补给",
    "to": "阿尔戈英雄补给"
  },
  {
    "from": "始徒",
    "to": "骇物"
  },
  {
    "from": "船材",
    "to": "三列桨座战船"
  },
  {
    "from": "石筑",
    "to": "纪念碑"
  },
  {
    "from": "军备",
    "to": "军械"
  },
  {
    "from": "舰材",
    "to": "军用三列桨座战船"
  },
  {
    "from": "岩雕",
    "to": "雕塑"
  },
  {
    "from": "战械",
    "to": "战争机器"
  },
  {
    "from": "肉布",
    "to": "织物肉体"
  },
  {
    "from": "利爪",
    "to": "剃刀利爪"
  },
  {
    "from": "重担",
    "to": "巨石"
  },
  {
    "from": "云贼",
    "to": "云盗"
  },
  {
    "from": "宿敌",
    "to": "夙敌"
  },
  {
    "from": "疏泄",
    "to": "净化"
  },
  {
    "from": "故事",
    "to": "剧情"
  },
  {
    "from": "灾祸",
    "to": "末日"
  },
  {
    "from": "探索",
    "to": "探索步骤",
    "scope": "[data-term-scope~=\"step-name\"]"
  },
  {
    "from": "考察",
    "to": "勘察步骤",
    "scope": "[data-term-scope~=\"step-name\"]"
  },
  {
    "from": "遭遇",
    "to": "遭遇步骤",
    "scope": "[data-term-scope~=\"step-name\"]"
  },
  {
    "from": "发展",
    "to": "发展步骤",
    "scope": "[data-term-scope~=\"step-name\"]"
  },
  {
    "from": "故事",
    "to": "剧情步骤",
    "scope": "[data-term-scope~=\"step-name\"]"
  },
  {
    "from": "灾祸",
    "to": "末日步骤",
    "scope": "[data-term-scope~=\"step-name\"]"
  },
  {
    "from": "进展",
    "to": "进度标记"
  },
  {
    "from": "循环",
    "to": "故事集"
  },
  {
    "from": "考察",
    "to": "勘察"
  },
  {
    "from": "监禁",
    "to": "身陷囹圄"
  },
  {
    "from": "错配",
    "to": "门户不当"
  },
  {
    "from": "弃物",
    "to": "被遗弃者"
  },
  {
    "from": "信条",
    "to": "教义"
  },
  {
    "from": "真嗣",
    "to": "碇"
  },
  {
    "from": "懦夫",
    "to": "怯懦"
  },
  {
    "from": "恶心",
    "to": "作呕"
  },
  {
    "from": "妄想",
    "to": "错觉"
  },
  {
    "from": "受辱",
    "to": "羞辱"
  },
  {
    "from": "畏神",
    "to": "敬神"
  },
  {
    "from": "盐路",
    "to": "盐之路"
  },
  {
    "from": "大义",
    "to": "长远利益"
  },
  {
    "from": "撞角",
    "to": "军舰撞锤"
  },
  {
    "from": "弩炮",
    "to": "弩炮枪"
  },
  {
    "from": "护套",
    "to": "人造箭鞘"
  },
  {
    "from": "巨干",
    "to": "癸干"
  },
  {
    "from": "抓钩",
    "to": "爪钩"
  },
  {
    "from": "链鞭",
    "to": "链条鞭"
  },
  {
    "from": "强弩",
    "to": "腹弩"
  },
  {
    "from": "龙吼",
    "to": "龙焰风箱"
  },
  {
    "from": "面甲",
    "to": "人面盾"
  },
  {
    "from": "天坠",
    "to": "坠天"
  },
  {
    "from": "日触",
    "to": "摘天爪"
  },
  {
    "from": "誓约",
    "to": "承诺"
  },
  {
    "from": "终结",
    "to": "终末"
  },
  {
    "from": "语境",
    "to": "千变"
  },
  {
    "from": "金库",
    "to": "纯金储蓄罐"
  },
  {
    "from": "胀囊",
    "to": "肿胀背包"
  },
  {
    "from": "羽刃",
    "to": "飞翼之刃"
  },
  {
    "from": "都城",
    "to": "资本"
  },
  {
    "from": "月刃",
    "to": "疯魔之刃"
  },
  {
    "from": "月焰",
    "to": "月之烈焰"
  },
  {
    "from": "链镰",
    "to": "链条锁镰"
  },
  {
    "from": "热剑",
    "to": "高温剑"
  },
  {
    "from": "弦线",
    "to": "断线"
  },
  {
    "from": "返航",
    "to": "归乡之行"
  }
];
