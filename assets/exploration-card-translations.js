(function (root) {
  "use strict";

  const document = root.document;
  const cards = root.ATO_EXPLORATION_CARD_TRANSLATIONS || {};
  const recordStatIcons = {
    "阿尔戈号命运": "argo-fate",
    "阿尔戈号知识": "argo-knowledge",
    "巴比伦债务": "babelian-debt",
    "凝固时光": "frozen-time",
    "轮回长度": "loop-length",
    "陌生人": "strangers",
    "变节者": "defectors",
    "难民": "refugees",
    "猜忌": "paranoia",
    "悖论": "paradox",
    "人性": "humanity",
    "船员": "crew",
    "船体": "hull",
    "泰坦": "titans",
    "氧气": "oxygen",
  };
  const mapMarkerDir = "./map/images/ui-kit-v1/icons/markers/";
  const heroIconDir = "./hero/assets/";
  const factionIconDir = "./record/assets/ally/";
  const factionIconVersion = ".png?v=apk-33a166d7c1bd-ally-black-fit1";
  const otherIcons = {
    "进展指示物": [mapMarkerDir + "progress.png"],
    "灾祸指示物": [mapMarkerDir + "doom.png"],
    "灾祸": [mapMarkerDir + "doom.png"],
    "仇敌图标": ["./map/tokens/adversary.png"],
    "仇敌符号": ["./map/tokens/adversary.png"],
    "仇敌激活": ["./map/tokens/adversary.png"],
    "宿敌追踪标记": ["./map/tokens/adversary.png"],
    "阿尔戈英雄命运": [heroIconDir + "tri_fate.png", "light"],
    "英雄命运": [heroIconDir + "tri_fate.png", "light"],
    "危险": [heroIconDir + "tri_danger.png", "light"],
    "怒气": [heroIconDir + "tri_rage.png", "light"],
    "迷宫徒派系标记": [factionIconDir + "LABYRINTHIANS" + factionIconVersion, "dark"],
    "太阳后裔标记": [factionIconDir + "SUNHEIRS" + factionIconVersion, "dark"],
    "云贼地图板块": [factionIconDir + "CLOUDTHIEVES" + factionIconVersion, "dark"],
  };
  const iconsByCycle = new Map();
  const diplomacyBadges = new Map([
    ["结盟", "Allied"],
    ["友善", "Friendly"],
    ["友善或更佳", "Friendly+"],
    ["中立", "Neutral"],
    ["交恶", "Unfriendly"],
    ["恶劣", "Denounced"],
    ["恶劣或更差", "Denounced-"],
    ["开战", "At War"],
    ["归顺涅墨西斯号", "Aligned with Nemesis"],
  ]);
  const disposalRule = /^(?:改为\s*)?(?:永久移出(?:卡|牌)组|移出(?:卡|牌)组[，,]?\s*直到下一(?:次|场)定时战斗|洗回破坏卡组)[。.]?$/;
  const panelId = "exploration-card-translation";
  const gap = 10;
  let panel, closeButton, heading, subtitle, content, observer;
  let anchor = null;
  let renderActive;
  let mode = "";
  let leaveTimer;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function iconsForCycle(cycle) {
    if (iconsByCycle.has(cycle)) return iconsByCycle.get(cycle);
    const icons = { ...otherIcons };
    for (const [term, key] of Object.entries(recordStatIcons)) {
      icons[term] = ["./assets/icons/" + key + ".svg?v=apk-ui-a72da92bdf63", "dark"];
    }
    // The settlement catalog and record sheet use the same resource IDs.
    const resources = root.ATO_EXPLORATION_CARD_RESOURCES?.cycles?.[cycle]?.resources || {};
    for (const [key, entry] of Object.entries(resources)) {
      icons[entry.zh] = ["./record/assets/resource-icons/" + key + ".png?v=20261018-apk117-black-white-fit3", "dark"];
    }
    const terms = Object.keys(icons).sort((a, b) => b.length - a.length)
      .map(term => term.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&"));
    const lookup = { icons, pattern: new RegExp(terms.join("|"), "g") };
    iconsByCycle.set(cycle, lookup);
    return lookup;
  }

  function setIconText(node, text, lookup) {
    text = lookup.bossNames?.(text) ?? text;
    let end = 0;
    for (const match of text.matchAll(lookup.pattern)) {
      const name = match[0];
      const [src, tone] = lookup.icons[name];
      const label = element("span", "exploration-translation-icon-label");
      const img = element("img", "exploration-translation-icon");
      img.alt = "";
      if (tone) img.classList.add("is-" + tone);
      img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
      img.addEventListener("error", () => {
        const visible = img.isConnected;
        img.remove();
        if (visible) position();
      }, { once: true });
      img.src = src;
      label.append(img, name);
      node.append(text.slice(end, match.index), label);
      end = match.index + name.length;
    }
    node.append(text.slice(end));
  }

  function ensurePanel() {
    if (panel) return;
    panel = element("aside", "exploration-translation");
    panel.id = panelId;
    panel.hidden = true;
    panel.lang = "zh-Hans";
    panel.setAttribute("data-language-ignore", "");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", panelId + "-heading");
    if (typeof panel.showPopover === "function") panel.popover = "manual";

    const header = element("header", "exploration-translation-header");
    const titles = element("div", "exploration-translation-titles");
    heading = element("h3", "exploration-translation-title");
    heading.id = panelId + "-heading";
    subtitle = element("p", "exploration-translation-subtitle");
    subtitle.lang = "en";
    titles.append(heading, subtitle);
    closeButton = element("button", "exploration-translation-close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "关闭中文译文");
    closeButton.addEventListener("click", () => close(true));
    header.append(titles, closeButton);
    content = element("div", "exploration-translation-content");
    panel.append(header, content);
    panel.addEventListener("pointerenter", clearLeave);
    panel.addEventListener("pointerleave", scheduleLeave);
    document.body.appendChild(panel);

    observer = new MutationObserver(() => {
      if (anchor && !anchor.isConnected) close();
    });
    const languageObserver = new MutationObserver(records => {
      const wasOfficial = records[0].oldValue === "official";
      const isOfficial = document.documentElement.dataset.atoLanguage === "official";
      if (!renderActive || wasOfficial === isOfficial) return;
      const scrollTop = content.scrollTop;
      renderActive();
      position();
      content.scrollTop = scrollTop;
    });
    languageObserver.observe(document.documentElement, {
      attributes: true, attributeOldValue: true, attributeFilter: ["data-ato-language"],
    });
    document.addEventListener("toggle", (event) => {
      if (anchor && event.target.tagName === "DETAILS" && !event.target.open && event.target.contains(anchor)) close();
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (anchor && !anchor.contains(event.target) && !panel.contains(event.target)) close();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (anchor && event.key === "Escape") {
        event.preventDefault();
        close(panel.contains(document.activeElement));
      }
    });
    root.addEventListener("resize", position);
    root.addEventListener("scroll", (event) => {
      if (anchor && (event.target === root || !panel.contains(event.target))) position();
    }, true);
  }

  function thresholdBadge(text) {
    const tracks = text.match(/^若(?:你的)?((?:阿尔戈号命运|巴比伦债务)为\s*\d+\+(?:\s*或\s*难民为\s*\d+\+)?)[，,]/);
    if (tracks) return tracks[1].replaceAll("为", " ");
    const refugees = text.match(/^如果你们有至少\s*(\d+)\s*名难民[，,]/);
    if (refugees) return "难民 " + refugees[1] + "+";
    const paranoia = text.match(/^若你们有\s*(\d+)\s*点或更多猜忌[，,]/);
    return paranoia ? "猜忌 " + paranoia[1] + "+" : "";
  }

  function thresholdMatcher(cycle, id, context) {
    const rules = context?.conditionRules;
    if (!rules || context.cycleId !== cycle) return () => false;
    const resourceRules = context.resourceRules;
    const ruleCard = resourceRules?.getCard(context.dataset, cycle, id);
    const key = cycle + ":" + id;
    return ([badge, text]) => {
      if (/^(?:若|如果)此能力(?:未|没有)触发/.test(text)) return false;
      const diplomacyBadge = diplomacyBadges.get(badge);
      if (diplomacyBadge) {
        const match = [...(ruleCard?.grants || []), ...(ruleCard?.manual || [])]
          .find(({ condition }) => condition?.type === "diplomacy" && condition.badge === diplomacyBadge);
        return Boolean(match && resourceRules.conditionMet(match.condition, context) === true);
      }
      if (key === "c2:13635" && !badge) {
        const band = text.match(/^(\d+)(?:–(\d+)|\+)：/);
        if (band) {
          const stock = rules.recordedNumber(context.record?.resources?.["c2-violentAmbrosia"]);
          return stock !== null && stock >= Number(band[1]) && (!band[2] || stock <= Number(band[2]));
        }
      }
      const condition = rules.conditionFromBadge(badge || thresholdBadge(text), cycle);
      if (!condition) return false;
      // These removal clauses follow a successful Paradox effect.
      if (cycle === "c3" && text.startsWith("改为移出卡组")) {
        if (key === "c3:13541") return rules.simpleConditionalEffects(ruleCard, context)[0]?.removal === "remove";
        if (["c3:13536", "c3:13538", "c3:13540"].includes(key)) {
          return rules.conditionMet(rules.conditionFromBadge("悖论 3+", cycle), context) === true
            && rules.simpleConditionalEffects(ruleCard, context)[0]?.removal === "remove";
        }
      }
      // Check Paradox after the preceding printed effect on these cards.
      if (key === "c3:13535" || key === "c3:13541") {
        const before = rules.recordedNumber(context.stats?.paradox);
        let change = -2;
        if (key === "c3:13541") {
          const [effect] = rules.simpleConditionalEffects(ruleCard, context);
          if (effect?.conditionState !== true) return false;
          change = effect.effects.find((item) => item.type === "paradox")?.amount ?? 0;
        }
        const stats = { ...context.stats, paradox: before === null ? null : Math.max(0, before + change) };
        return rules.conditionMet(condition, { ...context, stats }) === true;
      }
      return rules.conditionMet(condition, context) === true;
    };
  }

  function renderRule(row, lookup, thresholdMet) {
    const [condition, text] = row;
    const rule = element("li", "exploration-translation-rule");
    rule.classList.toggle("is-threshold-met", thresholdMet(row));
    if (condition) {
      const badge = element("span", "exploration-translation-condition");
      setIconText(badge, condition, lookup);
      rule.append(badge);
      rule.classList.add("has-condition");
    }
    const body = element("span", "exploration-translation-rule-text");
    setIconText(body, text, lookup);
    rule.append(body);
    return rule;
  }

  function branchType([condition, text]) {
    if (diplomacyBadges.has(condition)) return "diplomacy";
    if (!condition && text.includes("→")) return "exchange";
    if (condition && text.startsWith("改为")) return "replacement";
    return "";
  }

  function leadsInto([condition, text], next, type) {
    if (condition || !next) return false;
    if (type === "diplomacy" && /外交关系.*结算|结算.*外交关系/.test(text)) return true;
    if (type === "exchange") return /^(?:商人)?交易/.test(text);
    return next[0] && next[1].startsWith("改为");
  }

  function renderRules(rows, lookup, thresholdMet) {
    const list = element("ul", "exploration-translation-rules");
    let index = 0;
    while (index < rows.length) {
      const row = rows[index];
      const next = rows[index + 1];
      const type = branchType(row);
      const nextType = next && branchType(next);
      const hasLead = !type && nextType && leadsInto(row, next, nextType);
      const groupType = type || (hasLead ? nextType : "");
      if (!groupType) {
        list.append(renderRule(row, lookup, thresholdMet));
        index++;
        continue;
      }
      const group = element("li", "exploration-translation-rule-group");
      if (hasLead) {
        const lead = element("div", "exploration-translation-rule-lead");
        lead.classList.toggle("is-threshold-met", thresholdMet(row));
        setIconText(lead, row[1], lookup);
        group.append(lead);
        index++;
      }
      const branches = element("ul", "exploration-translation-branches");
      while (index < rows.length && branchType(rows[index]) === groupType) {
        branches.append(renderRule(rows[index], lookup, thresholdMet));
        index++;
      }
      group.append(branches);
      list.append(group);
    }
    return list;
  }

  function render(card, lookup, thresholdMet) {
    const language = root.ATO_LANGUAGE?.get() || document.documentElement.dataset.atoLanguage;
    const bossNames = root.ATO_THEATRE_TERMS?.bossNameTranslator?.(language);
    lookup = { ...lookup, bossNames };
    heading.textContent = bossNames?.(card.zh) ?? card.zh;
    subtitle.textContent = card.code ? card.en + " · " + card.code : card.en;
    // Older transcriptions can include the printed footer among the rule rows.
    let footerStart = card.rules.length;
    while (footerStart > 0 && disposalRule.test(card.rules[footerStart - 1][1])) footerStart--;
    content.replaceChildren(renderRules(card.rules.slice(0, footerStart), lookup, thresholdMet));
    const footer = element("ul", "exploration-translation-footer");
    for (const row of card.rules.slice(footerStart)) footer.append(renderRule(row, lookup, thresholdMet));
    for (const text of card.footers || []) footer.append(renderRule(["", text], lookup, thresholdMet));
    if (footer.childElementCount) {
      content.append(footer);
    }
  }

  function position() {
    if (!anchor) return;
    const bounds = anchor.getBoundingClientRect();
    const viewport = document.documentElement;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!anchor.isConnected || !bounds.width || bounds.bottom <= 0 || bounds.top >= height) {
      close();
      return;
    }
    const sheet = mode === "touch" || width < 660;
    panel.classList.toggle("is-sheet", sheet);
    if (sheet) {
      panel.style.left = "";
      panel.style.top = "";
      return;
    }
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const right = bounds.right + gap;
    const left = bounds.left - gap - panelWidth;
    const below = bounds.bottom + gap;
    const roomBelow = height - below;
    const side = right + panelWidth <= width - gap ? right : left >= gap ? left : null;
    const x = side ?? bounds.left;
    const y = side !== null ? bounds.top : roomBelow >= panelHeight || roomBelow >= bounds.top ? below : bounds.top - panelHeight - gap;
    panel.style.left = Math.max(gap, Math.min(x, width - panelWidth - gap)) + "px";
    panel.style.top = Math.max(gap, Math.min(y, height - panelHeight - gap)) + "px";
  }

  function clearLeave() {
    root.clearTimeout(leaveTimer);
  }

  function scheduleLeave(event) {
    if (mode !== "hover" || anchor.contains(event.relatedTarget) || panel.contains(event.relatedTarget)) return;
    clearLeave();
    leaveTimer = root.setTimeout(close, 160);
  }

  function close(restoreFocus = false) {
    if (!anchor) return;
    clearLeave();
    observer.disconnect();
    const previous = anchor;
    anchor = null;
    renderActive = null;
    mode = "";
    previous.setAttribute("aria-expanded", "false");
    if (panel.popover) panel.hidePopover();
    panel.hidden = true;
    if (restoreFocus && previous.isConnected) previous.focus({ preventScroll: true });
  }

  function open(face, card, lookup, nextMode, getThresholdMatcher) {
    clearLeave();
    if (anchor !== face) {
      close();
      anchor = face;
      renderActive = () => render(card, lookup, getThresholdMatcher());
      renderActive();
      face.setAttribute("aria-expanded", "true");
      panel.hidden = false;
      if (panel.popover) panel.showPopover();
      content.scrollTop = 0;
      observer.observe(document.body, { subtree: true, childList: true });
    }
    mode = nextMode;
    position();
    if (anchor && mode === "keyboard") closeButton.focus({ preventScroll: true });
  }

  function bind(face, cycle, id, getContext) {
    const card = cards[cycle + ":" + id];
    if (!card) return;
    const lookup = iconsForCycle(cycle);
    const getThresholdMatcher = () => thresholdMatcher(cycle, id, getContext?.(cycle, id));
    ensurePanel();
    face.classList.add("exploration-translation-trigger");
    face.tabIndex = 0;
    face.setAttribute("role", "button");
    face.setAttribute("aria-label", "查看中文译文：" + card.zh);
    face.setAttribute("aria-controls", panelId);
    face.setAttribute("aria-haspopup", "dialog");
    face.setAttribute("aria-expanded", "false");
    face.setAttribute("data-dashboard-readonly-allowed", "");
    face.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && !(anchor && mode !== "hover")) open(face, card, lookup, "hover", getThresholdMatcher);
    });
    face.addEventListener("pointerleave", (event) => {
      if (anchor === face) scheduleLeave(event);
    });
    const toggle = (nextMode) => {
      if (anchor === face && mode !== "hover") close(nextMode === "keyboard");
      else open(face, card, lookup, nextMode, getThresholdMatcher);
    };
    face.addEventListener("click", (event) => {
      const touch = event.pointerType === "touch" || event.pointerType === "pen" || root.matchMedia("(hover: none)").matches;
      // A mouse click still selects a card in pickers. A touch tap reads its translation.
      if (event.detail !== 0 && !touch && face.closest("label")) return;
      event.preventDefault();
      toggle(event.detail === 0 ? "keyboard" : touch ? "touch" : "click");
    });
    face.addEventListener("keydown", (event) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      toggle("keyboard");
    });
  }

  root.ATO_EXPLORATION_TRANSLATION_PREVIEW = { bind };
})(window);
