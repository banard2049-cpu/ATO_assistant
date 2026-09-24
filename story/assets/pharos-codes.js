(() => {
  const container = document.getElementById("tables");
  const fanBooks = window.STORYBOOK_DATA?.books || [];
  const officialBooks = window.STORYBOOK_OFFICIAL_DATA?.books || [];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const numberInTitle = (title) => String(title || "").match(/\d{6,}/)?.[0] || "";
  const numberInText = (text) => String(text || "").match(/\d{6,}/)?.[0] || "";
  const solved = {
    "c1-12-0": ["mi nuo tao luo si", "Minotaur"],
    "c1-12-1": ["zao chuan shi gong hui", "Shipbuilders Guild"],
    "c1-12-2": ["san qu pan dui hua", "Triskelion Talk"],
    "c1-12-3": ["an de luo ge e si zhi si", "Death of Androgeus"],
    "c1-12-4": ["bai bi ju ren", "Centimanes"],
    "c1-12-5": ["po liu si zhi zi", "The Son of Peleus"],
    "c1-12-6": ["di da luo si de cheng guo", "Providence of Daedalus"],
    "c1-12-7": ["qing tong min zu bu luo", "Tribes of the Bronze People"],
    "c1-12-8": ["hai yao yi shi yi", "Of the Sirens I"],
    "c1-12-9": ["pu luo mi xiu si zhi zui", "Prometheus' Transgression"],
    "c1-12-10": ["shen jie shi", "Kidney Stones"],
    "c2-12-0": ["ao de xiu si yi", "Odysseus I"],
    "c2-12-1": ["qing tong mi zu yi shi yi", "Of Bronze People I"],
    "c2-12-2": ["wei lai de can xiang", "Taste of Things to Come"],
    "c2-12-3": ["mo shi man tan yi", "Of Eschaton I"],
    "c2-12-4": ["xin ya dian", "New Athens"],
    "c2-12-5": ["le lie ge di guo", "The Leleges Empire"],
    "c2-12-6": ["gong shou tong meng lai fang", "Symmachy Visit"],
    "c2-12-7": ["he la ke le si de yuan zui", "Herakles' Sins"],
    "c2-12-8": ["hang biao chuang shi ji", "Pharos Genesis"],
    "c2-12-9": ["ning fu hui ji", "Nymph Convergence"],
    "c3-12-0": ["shen yu zhe jiao tuan", "Order of Oracles"],
    "c3-12-1": ["di feng xian shi", "Typhon Unbound"],
    "c3-12-2": ["ye kong zhi yan", "Eyes in the Night Skies"],
    "c3-12-3": ["mo shi er", "Eschaton II"],
    "c3-12-4": ["ba bie ta", "Tower of Babel"],
    "c3-12-5": ["quan zhi zhe he li e si", "Helios Panoptes"],
    "c3-12-6": ["hai yao yi shi er", "Sirens II"],
    "c3-12-7": ["fo tong dan sheng", "Birth of Photon"],
    "c3-12-8": ["de er fei de da fa ming jia", "Grand Inventor in Delphi"],
    "c3-12-9": ["he er mo si te li si mo ji si te si", "Hermes Trismegistus"],
  };
  // Hanzi are contextual readings of the pinyin; the numbers alone do not distinguish homophones.
  const chinese = {
    "c1-12-0": "米诺陶洛斯", "c1-12-1": "造船师公会", "c1-12-2": "三曲盘对话",
    "c1-12-3": "安德洛革俄斯之死", "c1-12-4": "百臂巨人", "c1-12-5": "珀琉斯之子",
    "c1-12-6": "狄达罗斯的成果", "c1-12-7": "青铜民族部落", "c1-12-8": "海妖轶事（一）",
    "c1-12-9": "普罗米修斯之罪", "c1-12-10": "肾结石",
    "c2-12-0": "奥德修斯（一）", "c2-12-1": "青铜秘族轶事（一）", "c2-12-2": "未来的残像",
    "c2-12-3": "末世漫谈（一）", "c2-12-4": "新雅典", "c2-12-5": "勒列格帝国",
    "c2-12-6": "共守同盟来访", "c2-12-7": "赫拉克勒斯的原罪", "c2-12-8": "航标创世纪",
    "c2-12-9": "宁芙汇集",
    "c3-12-0": "神谕者教团", "c3-12-1": "堤丰现世", "c3-12-2": "夜空之眼",
    "c3-12-3": "末世（二）", "c3-12-4": "巴别塔", "c3-12-5": "全知者赫利俄斯",
    "c3-12-6": "海妖轶事（二）", "c3-12-7": "佛童诞生", "c3-12-8": "德尔斐的大发明家",
    "c3-12-9": "赫尔墨斯·特里斯墨吉斯特斯",
  };
  // These OCR digits differ from the official page images; page images were checked directly.
  const scanCorrections = {
    "c1-12-6": "49411221151994538514772115",
    "c1-12-7": "1791472015147139142621221122115",
    "c2-12-2": "235912194531142491147",
    "c2-12-8": "8114729115382111471989109",
  };
  // The fan text omits one leading digit in each of these two entries.
  const fanCorrections = {
    "c1-12-7": "201892519156208521815142651651516125",
    "c3-12-8": "71811449142251420151891445121689",
  };
  function titleCode(entry, displayEntry, official) {
    if (!entry || !displayEntry) return "";
    const correction = official ? scanCorrections[entry.key] : fanCorrections[entry.key];
    return correction || numberInTitle(displayEntry.title) || numberInText(displayEntry.text);
  }
  window.PHAROS_TITLE_ANSWERS = { solved, chinese, titleCode };
  // The story reader loads this file for the shared answers without rendering this table.
  if (!container) return;
  const sections = [];

  for (const book of fanBooks) {
    const dreams = book.entries?.filter((entry) => entry.chapterKey === "dreams-of-pharos") || [];
    if (!dreams.length) continue;
    const officialByKey = new Map((officialBooks.find((item) => item.id === book.id)?.entries || [])
      .map((entry) => [entry.key, entry]));
    const rows = dreams.map((entry, index) => {
      const official = officialByKey.get(entry.key);
      // C2's fan title is only the sequence number; its code is in the body.
      const fanCode = numberInTitle(entry.title) || numberInText(entry.text);
      // C1/C2 official titles omit the code; C3 titles carry it.
      const officialTitleCode = numberInTitle(official?.officialTitle);
      const officialBodyCode = numberInText(official?.officialText);
      const officialCode = scanCorrections[entry.key] || officialTitleCode || officialBodyCode;
      const discrepancy = !scanCorrections[entry.key] && officialTitleCode && officialBodyCode && officialTitleCode !== officialBodyCode;
      const answer = solved[entry.key] || ["未解出", "未解出"];
      const fanWarning = entry.key === "c1-12-7"
        ? "原数字疑漏开头的 2；补上后整串即为 Tribes of the Bronze People"
        : entry.key === "c3-12-8"
          ? "原数字缺开头的 7（G），此英文解读为推测"
          : "";
      const href = `./index.html?book=${encodeURIComponent(book.id)}&chapter=dreams-of-pharos&id=${encodeURIComponent(entry.id)}`;
      return `<tr><td><a href="${escapeHtml(href)}">${index + 1}</a></td><td>${escapeHtml(official?.officialTitle?.replace(/\s*\d{6,}.*/, "") || "—")}</td><td><code>${escapeHtml(officialCode || "未收录")}</code>${discrepancy ? `<div class="note">正文 OCR 数字不同；以标题及原书图为准</div>` : ""}${scanCorrections[entry.key] ? `<div class="note">已按官方扫描页校正数字</div>` : ""}</td><td>${escapeHtml(chinese[entry.key] || "—")}<div><small>${escapeHtml(answer[0])}</small></div></td><td><code>${escapeHtml(fanCode || "未收录")}</code>${fanWarning ? `<div class="note">${escapeHtml(fanWarning)}</div>` : ""}</td><td>${escapeHtml(answer[1])}</td></tr>`;
    }).join("");
    sections.push(`<h2 class="cycle-heading">${escapeHtml(book.id.toUpperCase())}</h2><div class="table-wrap"><table><thead><tr><th scope="col">序号</th><th scope="col">条目</th><th scope="col">官方数字</th><th scope="col">官方明文 · 拼音</th><th scope="col">民间数字</th><th scope="col">民间明文 · 英文</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  container.innerHTML = sections.join("") || '<p class="empty">本地故事数据未包含法洛斯之梦条目。</p>';
})();
