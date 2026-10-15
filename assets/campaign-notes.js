/* Campaign events travel with the section write. The API appends them while
 * holding its save lock; a failed/conflicting write never leaves a stray note. */
(function () {
  const sources = { record: "记录表", technology: "科技", heroes: "英雄", aibp: "AIBP", story: "故事" };
  const fields = {
    resources: "资源", matrix: "选择矩阵", adventures: "冒险", diplomacy: "外交", enemies: "敌人轨道",
    crewBoxes: "船员", hull: "船体", crew: "船员", cycleStats: "循环记录", cycleDays: "天数",
    storyCard: "故事卡", doomCard: "厄运卡", mapTiles: "地图板块", fate: "命运", aaLimit: "AA 上限",
    strangers: "陌生人", humanity: "人性", renegade: "叛徒", loopLength: "回环长度", frozenTime: "冻结时间",
    paradox: "悖论", babelianDebt: "巴比伦债务", oxygenCurrent: "氧气", oxygenLimit: "氧气上限",
    reapMarkNotes: "收获标记", sowMarkNotes: "播种标记", paranoia: "偏执", supply: "补给",
    titanLimit: "泰坦上限", deadTitans: "死亡泰坦", titans: "泰坦", crippled: "残废", count: "数量",
    boons: "恩赐", afflictions: "苦难", counters: "计数标记", namedCounters: "计数标记", notes: "笔记",
    arsenal: "装备库存", maxUnlocked: "资源上限", pygmalion: "皮格马利翁", godforms: "神躯",
    nymphCards: "宁芙", godformUsedCards: "已使用神躯", nymphUsedCards: "已使用宁芙",
    summonLimit: "召唤上限", godformLimit: "神躯上限", godformUsed: "神躯使用次数",
    nymphLimit: "宁芙上限", nymphUsed: "宁芙使用次数", nymphCharges: "宁芙充能", nymph: "宁芙",
    unlocked: "已解锁科技", conditions: "科技条件", unimportant: "不重要科技",
    heroes: "英雄", graveyard: "墓园", name: "名称", argonaut: "阿尔戈英雄", basicSkill: "基础技能",
    baseSkills: "技能", courage: "勇气", wisdom: "智慧", will: "意志", endurance: "耐力", cunning: "狡诈",
    fury: "愤怒", danger: "危险", triskelion: "三曲腿", mnemos: "回忆", fatedMnemos: "宿命回忆",
    mnemosProgress: "回忆进度", mnemosNodeProgress: "回忆节点", mnemosTags: "回忆标签", fatedProgress: "宿命进度",
    retireReason: "死亡或退休原因", katharsisCode: "疏泄代码", centimanes: "百臂语言", crypticLanguages: "密语",
    babelian: "巴比伦语", siren: "塞壬语", nemesisSelections: "涅墨西斯", noteAttachments: "笔记图片",
    quantity: "持有数量", manufactured: "制造总数", wounds: "伤口", mapping: "字符对应", records: "译文记录",
    title: "标题", glyphs: "符号", digits: "译文", version: "版本", trireme: "船材", monument: "石筑",
    armament: "军备", sisyphusTears: "西西弗斯之泪", refugees: "难民", captives: "俘虏",
    customName: "自定义名称", playerName: "玩家名称", abilities: "能力", total: "合计",
    rawAmbrosia: "神浆原液", muscleCluster: "肌肉簇", fearEssence: "恐惧精华", calcifiedKnuckle: "钙化指节骨",
    mazeFragment: "迷宫碎片", grotesqueBeak: "怪异喙片", infusedMechanism: "浸液机件", fleshyMantle: "血肉块",
    powderedMatter: "粉化奇物", core: "核心", blackChain: "黑色锁链", cyclopeanMetal: "独眼巨人甲胄",
    chimericTar: "奇美拉焦油", cyclopeanTooth: "独眼巨人牙齿", ancientShell: "远古贝壳", rare: "稀有资源",
  };
  const ignored = new Set(["id", "cycle", "day", "location", "profileName", "activeHeroId", "currentCycle",
    "skillsExpanded", "retiredAt", "syncLog", "nemesisResourceHistory", "treeLanguage", "hideUnknownTech",
    "hideTreeImage", "counterLocks", "matrixLocked", "createdAt", "updatedAt", "version", "draft"]);
  const cycles = new Set(["c1", "c2", "c3", "c4", "c5"]);
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const empty = value => value == null || value === "" || value === false || value === 0 || value === "0"
    || (typeof value === "object" && Object.keys(value).length === 0);
  const text = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const preview = value => { const s = text(value); return s.length > 240 ? s.slice(0, 240) + "…" : s; };
  const cycleInKey = key => String(key).match(/^(c[1-5])(?:[-._:]|$)/)?.[1];

  function recordView(value = {}) {
    const copy = { ...value, cycleStats: { ...value.cycleStats } };
    // The record page exposes legacy aliases for the selected cycle. Comparing
    // them as well as cycleStats would log each edit twice (and log tab changes).
    const scoped = ["hull", "crew", "storyCard", "doomCard", "mapTiles", "fate", "aaLimit", "strangers", "humanity",
      "renegade", "loopLength", "frozenTime", "paradox", "babelianDebt", "oxygenCurrent", "oxygenLimit",
      "reapMarkNotes", "sowMarkNotes", "paranoia", "supply", "boons", "afflictions", "counters", "notes"];
    if (cycles.has(value.cycle)) {
      copy.cycleStats[value.cycle] = { ...copy.cycleStats[value.cycle] };
      scoped.forEach(key => {
        if (copy.cycleStats[value.cycle][key] === undefined && value[key] !== undefined) copy.cycleStats[value.cycle][key] = value[key];
      });
    }
    scoped.forEach(key => delete copy[key]);
    return copy;
  }

  function describe(section, before, after, { cycleId = "c2", label, source } = {}) {
    const events = [];
    function add(cycle, message) { events.push({ cycleId: cycle, source: source && source !== sources[section] ? `${source}·${sources[section]}` : sources[section], text: message }); }
    function name(key, path, value) { return text(label?.(section, key, path, value) || fields[key] || fields[String(key).replace(/^c[1-5]-/, "")] || key); }
    function walk(a, b, path = [], title = "", cycle = cycleId) {
      if (equal(a, b) || (empty(a) && empty(b))) return;
      if (path.length && cycles.has(b?.cycle || a?.cycle)) cycle = b?.cycle || a?.cycle;
      if (object(a) || object(b)) {
        for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
          if (ignored.has(key) || key.startsWith("_") || key.endsWith("Expanded")) continue;
          const nextCycle = cycles.has(key) ? key : cycleInKey(key) || cycle;
          const part = cycles.has(key) ? "" : name(key, path, b?.[key] ?? a?.[key]);
          walk(a?.[key], b?.[key], [...path, key], [title, part].filter(Boolean).join(" / "), nextCycle);
        }
      } else if (Array.isArray(a) || Array.isArray(b)) {
        const old = Array.isArray(a) ? a : [], next = Array.isArray(b) ? b : [];
        const keyed = list => new Map(list.map(item => [object(item) ? item.id || item.blobId || JSON.stringify(item) : String(item), item]));
        const left = keyed(old), right = keyed(next);
        for (const key of new Set([...left.keys(), ...right.keys()])) {
          const previous = left.get(key), current = right.get(key), item = current ?? previous;
          const itemName = object(item) ? item.customName || item.name || item.label || item.title || name(key, path, item) : name(key, path, item);
          const nextCycle = cycleInKey(key) || cycle;
          if (!left.has(key) || !right.has(key)) {
            add(nextCycle, `${title}：${right.has(key) ? "添加" : "移除"} ${preview(itemName)}`
              + (current?.retireReason ? `（${preview(current.retireReason)}）` : ""));
          } else if (object(item)) walk(previous, current, [...path, key], `${title} / ${itemName}`, nextCycle);
        }
      } else {
        const display = value => typeof value === "boolean" ? (value ? "已标记" : "未标记") : value == null || value === "" ? "空"
          : ["argonaut", "basicSkill"].includes(path[path.length - 1]) ? name(String(value), path, value) : preview(value);
        add(cycle, `${title}：${display(a)} → ${display(b)}`);
      }
    }
    if (section === "story") {
      // Opening an entry is meaningful even with second screen disabled. Text,
      // image preferences and refreshed timestamps are rendering details.
      const identity = value => value?.entryKey && value?.bookId ? `${value.bookId}:${value.entryKey}` : `${value?.bookTitle}:${value?.section}:${value?.id}`;
      if (after && identity(before) !== identity(after)) {
        add(cycleId, `阅读 ${[after.bookTitle, after.section, after.id, after.title].filter(Boolean).map(text).join(" · ")}`);
      }
    } else if (section === "aibp") {
      if (!after) return events;
      const boss = preview(`${after.title || after.apostle || "敌人"} ${after.level || ""}`);
      // A new opponent is setup, not a change to every card and counter.
      if (!before || before.apostle !== after.apostle || before.level !== after.level) {
        add(cycleId, `战斗对象：${boss}`);
        return events;
      }
      const old = before?.apostle === after.apostle ? before : {};
      for (const [key, title] of [["aiPending", "AI 抽牌"], ["bpPending", "BP 抽牌"]]) {
        const card = after[key];
        if (card && !equal(old?.[key], card)) add(cycleId, `${title}：${preview(card.label || card.id || card.src)}`);
      }
      walk(old?.damageSummary || {}, after.damageSummary || {}, [], "损伤");
      const damageCards = snapshot => (snapshot?.damage || []).map(card => ({ id: card.id || card.src, label: card.label || card.id || card.src }));
      walk(damageCards(old), damageCards(after), ["damage"], "损伤卡");
      for (const [key, title] of [["aiDeckCount", "AI 牌堆"], ["aiDiscardCount", "AI 弃牌"], ["bpDeckCount", "BP 牌堆"], ["bpDiscardCount", "BP 弃牌"]]) {
        // A draw already explains the accompanying deck/discard count changes.
        const pending = key.startsWith("ai") ? "aiPending" : "bpPending";
        if (!after[pending] || equal(old[pending], after[pending])) walk(old?.[key], after[key], [key], title);
      }
      const traits = snapshot => (snapshot?.traits || []).map(card => ({ id: card.label || card.src, label: card.label || card.src }));
      walk(traits(old), traits(after), ["traits"], "特性");
      // Counters are aggregated by identity; dragging them never writes notes.
      const tokens = snapshot => (snapshot?.tokens || []).reduce((result, token) => {
        const key = token.text || token.label || String(token.file || "").split("/").pop();
        result[key] = (result[key] || 0) + Number(token.count || 1); return result;
      }, {});
      walk(tokens(old), tokens(after), ["tokens"], "标记");
      if (!events.length) return [];
      // One bounded summary per save, even when a reset changes many cards.
      let summary = boss;
      let included = 0;
      for (const event of events) {
        if (summary.length + event.text.length + 1 > 560) break;
        summary += `${included ? "；" : " / "}${event.text}`;
        included++;
      }
      if (included < events.length) summary += `；另 ${events.length - included} 项变化`;
      return [{ ...events[0], text: summary }];
    } else if (section === "record") walk(recordView(before || {}), recordView(after || {}));
    else if (section === "technology") {
      for (const key of ["unlocked", "conditions", "unimportant"]) walk(before?.[key], after?.[key], [key], fields[key]);
    } else if (section === "heroes") {
      walk(before?.heroes, after?.heroes, ["heroes"], fields.heroes);
      walk(before?.graveyard, after?.graveyard, ["graveyard"], fields.graveyard);
    }
    // Keep each entry bounded without discarding changes in a large edit.
    const grouped = [];
    for (const event of events) {
      const last = grouped[grouped.length - 1];
      if (last?.cycleId === event.cycleId && last.text.length + event.text.length < 3000) last.text += `；${event.text}`;
      else grouped.push({ ...event });
    }
    return grouped;
  }

  function userState(section, profileId) {
    return object(section) && ("users" in section || "accounts" in section)
      ? section.users?.[profileId] || section.accounts?.[profileId] || null : section;
  }

  function createFetch(transport, options = {}) {
    return async function campaignFetch(input, init) {
      const url = new URL(String(input), window.location.href);
      if (!url.pathname.endsWith("/api/campaign-state.php") || url.searchParams.has("action")
        || String(init?.method || "GET").toUpperCase() !== "POST" || typeof init.body !== "string") return transport(input, init);
      const payload = JSON.parse(init.body);
      const section = payload.section || url.searchParams.get("section");
      if (!sources[section]) return transport(input, init);
      payload.section = section;
      // Read the committed baseline, including other pages' changes. Replaying
      // the same state after a lost response then produces no duplicate entry.
      const readUrl = new URL(url); readUrl.search = "";
      const response = await transport(readUrl.href, { cache: "no-store", signal: init.signal });
      const latest = await response.json();
      if (!response.ok || !latest?.ok) throw new Error(latest?.error || "读取战役日志上下文失败");
      if (payload.expectedAccountId && payload.expectedAccountId !== latest.user?.id) {
        const error = new Error("登录账号已切换，请刷新页面。"); error.code = "ACCOUNT_MISMATCH"; throw error;
      }
      const campaign = latest.campaign;
      const revision = Number(campaign?.sectionRevisions?.[section] || 0);
      // Preserve the module's existing conflict/merge handling.
      if (payload.expectedRevision != null && Number(payload.expectedRevision) !== revision) return transport(input, init);
      const context = options.context?.(section, payload) || {};
      const profileId = payload.userId || context.profileId || campaign?.sections?.dashboard?.activeProfileId;
      const profile = campaign?.sections?.dashboard?.profiles?.[profileId];
      if (!profile) throw new Error("原战役档案已不存在，请返回主控台后重试。");
      const cycleId = (section === "record" && payload.state?.cycle) || context.cycleId || profile.activeCycleId || "c2";
      let before = userState(campaign.sections[section], profileId), after = payload.state;
      if (options.normalize) { before = options.normalize(section, before); after = options.normalize(section, after); }
      const entries = describe(section, before, after, { cycleId, label: options.label, source: options.source });
      payload.expectedRevision = revision;
      payload.expectedAccountId ||= latest.user.id;
      if (entries.length) payload.campaignNotes = { profileId, entries };
      return transport(input, { ...init, body: JSON.stringify(payload) });
    };
  }
  window.ATO_CAMPAIGN_NOTES = { createFetch, describe };
})();
