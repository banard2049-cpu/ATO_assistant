// Android daily archives -> the same replay contract as briefing/api.php.
// Pure data conversion: never read today's state into a historical entry.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_BRIEFING_LOCAL = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  const scalar = (value) => ['string', 'number', 'boolean'].includes(typeof value);
  const text = (value) => typeof value === 'boolean' ? (value ? '1' : '') : scalar(value) ? String(value) : '';
  const array = (value) => Array.isArray(value) ? value : [];
  const strings = (value) => array(value).map(text);
  const normalize = (value) => text(value).trim().replace(/\s+/g, ' ').toLowerCase();
  const label = (id) => ({ c1: '循环 I', c2: '循环 II', c3: '循环 III', c4: '循环 IV', c5: '循环 V' }[id] || id);

  function dayKey(day) {
    const prologue = /^T(\d+)(?:[/-](\d+))?$/.exec(day);
    if (prologue) return [0, Number(prologue[1]), Number(prologue[2] || 0)];
    return /^-?\d+$/.test(day) ? [1, Number(day), 0] : [2, 0, 0];
  }

  function compareDays(a, b) {
    const left = dayKey(a), right = dayKey(b);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
    return 0;
  }

  function dayTitle(day) {
    const prologue = /^T(\d+)(?:[/-](\d+))?$/.exec(day);
    return prologue ? `序章 T${prologue[1]}${prologue[2] == null ? '' : `-${prologue[2]}`}` : `第 ${day} 天`;
  }

  function localTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function extract(campaign, profileId, cycleId) {
    const sections = campaign.sections || {};
    const state = sections.dashboard?.profiles?.[profileId]?.cycles?.[cycleId]?.state || {};
    const map = state.mapSnapshot || {};
    const heroes = sections.heroes || {}, story = sections.story || {};
    const tracks = state.cardTracks && typeof state.cardTracks === 'object' ? {} : null;
    if (tracks) for (const kind of ['story', 'doom', 'inwardOdyssey']) {
      if (!state.cardTracks[kind] || typeof state.cardTracks[kind] !== 'object') continue;
      tracks[kind] = {};
      for (const field of ['position', 'progress', 'doom']) {
        if (scalar(state.cardTracks[kind][field])) tracks[kind][field] = state.cardTracks[kind][field];
      }
    }
    const counters = state.cardCounters && typeof state.cardCounters === 'object' ? {} : null;
    if (counters) for (const field of ['story', 'doom', 'storyCount', 'doomCount', 'inwardOdyssey', 'inwardOdysseyCount']) {
      if (scalar(state.cardCounters[field])) counters[field] = state.cardCounters[field];
    }
    let adventureHubs = null;
    if (state.surveyConstants && typeof state.surveyConstants === 'object') {
      adventureHubs = {
        checked: Object.fromEntries(Object.entries(state.surveyConstants.hubs || {}).map(([id, boxes]) =>
          [id, Object.keys(boxes || {}).filter((key) => text(boxes[key]) !== '' && Boolean(boxes[key]) && boxes[key] !== '0')])),
        activeHub: text(state.surveyConstants.activeHub?.itemId), activeBox: text(state.surveyConstants.activeHub?.boxId),
      };
    }
    const snapshot = {
      day: text(state.day), savedAt: text(map.savedAt ?? state.updatedAt),
      location: text(state.location), objective: text(state.objective).trim(), reminder: text(state.reminder).trim(),
      notes: text(state.notes), dateNotes: array(state.dateNotes),
      surveyActive: text(state.specialEventConstantsActive), pharosActive: text(state.pharosDreamsActive),
      mainStoryActive: text(state.mainStoryConstantsActive), cardTracks: tracks,
      cardTracksVersion: scalar(state.cardTracksVersion) ? Number(state.cardTracksVersion) || 0 : null,
      cardCounters: counters, adventureHubs,
      map: {
        explored: strings(map.exploredIds), scoutCount: Number(map.scoutCount) || 0, totalTiles: Number(map.totalTiles) || 0,
        tileNotes: Object.fromEntries(array(map.tileNotes).filter((entry) => entry && entry.tileId != null && text(entry.note).trim())
          .map((entry) => [text(entry.tileId), text(entry.note).trim()])),
      },
      techKeys: array(state.unlockedTech?.unlockedKeys).map(normalize),
      heroes: {
        names: array(heroes.heroes).filter(Boolean).map((hero) => text(hero.customName).trim() || text(hero.playerName).trim() || text(hero.argonaut).trim() || '未命名英雄'),
        graveyard: array(heroes.graveyard).filter(Boolean).map((hero) => text(hero.customName).trim() || text(hero.argonaut).trim() || '无名英雄'),
      },
      story: Object.fromEntries(['bookTitle', 'section', 'title', 'id'].map((key) => [key, text(story[key])])),
      draws: array(state.exploration?.drawStateByCycle?.[cycleId]?.history),
    };
    for (const key of ['currentTileId', 'latestRevealedTileId', 'adversaryTileId', 'lastCityTileId', 'lastOasisTileId', 'lastSilverRuinTileId', 'scoutTileId']) snapshot.map[key] = text(map[key]);
    for (const key of ['currentTileTagLabels', 'currentTileFactionLabels', 'markers']) snapshot.map[key] = strings(map[key]);
    if (!Object.keys(snapshot.map.tileNotes).length) snapshot.map.tileNotes = [];
    return snapshot;
  }

  function dictionary(data) {
    const cards = new Map(), pages = new Map();
    for (const card of array(data?.cards)) {
      const rawKey = text(card.key).trim(), key = normalize(rawKey);
      if (!key) continue;
      const info = { key, name: text(card.names?.zh).trim() || text(card.names?.en).trim() || key,
        nameEn: text(card.names?.en).trim() || rawKey, category: text(card.category) };
      if (!cards.has(key)) cards.set(key, info);
      for (const node of array(card.nodes)) {
        const page = text(node.page);
        if (!page) continue;
        if (!pages.has(page)) pages.set(page, []);
        pages.get(page).push({ ...info, id: text(node.id), rawKey,
          box: Array.isArray(node.box) ? node.box.slice(0, 4).map(Number) : null,
          requires: strings(node.req), requiresAnyGroups: array(node.requires_any_groups).map(strings), xlsmLeadsTo: strings(node.unlocks) });
      }
    }
    const byName = new Map();
    for (const info of cards.values()) if (!byName.has(normalize(info.name))) byName.set(normalize(info.name), info.key);
    const edges = new Map();
    for (const [page, nodes] of pages) {
      const byKey = new Map(), pageEdges = new Map();
      for (const node of nodes) if (!byKey.has(node.key)) byKey.set(node.key, node);
      const resolve = (ref) => {
        const key = normalize(ref);
        return byKey.get(key) || (!key.includes('@@') && byKey.get(byName.get(key))) || null;
      };
      const add = (from, to, optional) => {
        if (!from || from.id === to.id) return;
        const key = `${from.id}>${to.id}`, previous = pageEdges.get(key);
        pageEdges.set(key, { source: from.id, target: to.id, sourceKey: from.key, targetKey: to.key, optional: previous ? previous.optional && optional : optional });
      };
      for (const node of nodes) {
        node.requires.forEach((ref) => add(resolve(ref), node, false));
        node.requiresAnyGroups.forEach((group) => group.forEach((ref) => add(resolve(ref), node, true)));
      }
      for (const node of nodes) {
        if (node.requires.length || node.requiresAnyGroups.length) continue;
        for (const ref of node.xlsmLeadsTo) {
          const target = resolve(ref);
          if (target && !target.requires.length && !target.requiresAnyGroups.length) add(node, target, false);
        }
      }
      edges.set(page, [...pageEdges.values()]);
    }
    return { cards, pages, edges };
  }

  function progress(value, name) {
    const [id, step] = value.split(':', 2);
    return `${name}推进到 ${id}${step ? `（进度 ${step}）` : ''}`;
  }

  function build(source, mapData, techData) {
    const profileId = source.profileId, cycleId = source.cycleId;
    const profiles = source.campaign?.sections?.dashboard?.profiles || {};
    const cycles = Object.entries(profiles).flatMap(([id, profile]) => Object.entries(profile.cycles || {}).map(([cycle, entry]) =>
      ({ profileId: id, profileName: text(profile.name) || id, cycleId: cycle, label: label(cycle), day: text(entry.state?.day) })));
    const base = { ok: true, version: 2, user: { id: source.user.id },
      cycle: { profileId, cycleId, label: label(cycleId), backupDir: '' }, cycles };
    const snapshots = new Map(array(source.snapshots).map((campaign) => {
      const snapshot = extract(campaign, profileId, cycleId);
      return [snapshot.day, snapshot];
    }));
    if (!snapshots.size) return { ...base, hasData: false,
      message: '这个循环还没有每日备份。推进到下一天后，当天的存档会被保留下来，简报才有内容。',
      timeline: [], map: null, tech: null, summary: { days: 0, recordedDays: 0, explored: 0, unlocked: 0 } };

    const presentDays = [...snapshots.keys()].sort(compareDays), sequence = new Set(presentDays);
    let maxNumeric = 0, maxPrologue = 0;
    for (const day of presentDays) {
      const [kind, n] = dayKey(day);
      if (kind === 0) maxPrologue = Math.max(maxPrologue, n);
      if (kind === 1) maxNumeric = Math.max(maxNumeric, n);
    }
    // A malformed save cannot allocate an unbounded date axis on the phone.
    if (maxNumeric > 10000 || maxPrologue > 10000) throw new Error('存档天数超出可读取范围。');
    if (maxPrologue > 0) for (let n = 0; n <= maxPrologue; n++) sequence.add(`T${n}`);
    if (maxNumeric > 0 || maxPrologue > 0) for (let n = 0; n <= maxNumeric; n++) sequence.add(String(n));
    const cycleDef = array(mapData?.cycles).find((cycle) => cycle.id === cycleId) || { id: cycleId, tiles: [], width: 1, height: 1, tileWidth: 1 };
    const tilesById = new Map(array(cycleDef.tiles).map((tile) => [text(tile.id), tile]));
    const tileLabel = (id) => text(tilesById.get(id)?.label) || id;
    const firstTileDay = new Map(), firstTechDay = new Map(), timeline = [];
    let previous = null;
    for (const [index, day] of [...sequence].sort(compareDays).entries()) {
      const snapshot = snapshots.get(day);
      if (!snapshot) {
        timeline.push({ index, day, title: dayTitle(day), present: false, changes: [] });
        continue;
      }
      const newTiles = snapshot.map.explored.filter((id) => !firstTileDay.has(id));
      const newTech = snapshot.techKeys.filter((key) => !firstTechDay.has(key));
      for (const id of newTiles) if (!firstTileDay.has(id)) firstTileDay.set(id, day);
      for (const key of newTech) if (!firstTechDay.has(key)) firstTechDay.set(key, day);
      const changes = [];
      const add = (kind, description, items = []) => changes.push({ kind, label: description, items });
      if (newTiles.length) add('map', `翻开板块 ${newTiles.length} 格`, newTiles.map(tileLabel));
      if (snapshot.map.currentTileId) add('location', `阿尔戈号在 ${tileLabel(snapshot.map.currentTileId)}${snapshot.map.currentTileTagLabels.length ? `（${snapshot.map.currentTileTagLabels.join('、')}）` : ''}`);
      if (newTech.length) add('tech', `点亮科技 ${newTech.length} 项`, newTech);
      const draws = snapshot.draws.filter((draw) => text(draw.day) === day).map((draw) => text(draw.name) || text(draw.id));
      if (draws.length) add('exploration', `冒险牌 ${draws.length} 张`, draws);
      const previousNotes = previous?.notes || '';
      const mapSync = (previousNotes && snapshot.notes.startsWith(previousNotes) ? snapshot.notes.slice(previousNotes.length) : snapshot.notes)
        .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (mapSync.length) add('mapsync', `地图流水 ${mapSync.length} 条`, mapSync);
      if (snapshot.story.section && snapshot.story.section !== previous?.story.section) add('story', `故事推进到「${snapshot.story.section}」`, snapshot.story.title ? [snapshot.story.title] : []);
      if (snapshot.surveyActive && snapshot.surveyActive !== previous?.surveyActive) add('constant', progress(snapshot.surveyActive, '勘察定数'));
      if (snapshot.pharosActive && snapshot.pharosActive !== previous?.pharosActive) add('constant', `法罗斯梦境进度 ${snapshot.pharosActive}`);
      if (snapshot.mainStoryActive && snapshot.mainStoryActive !== previous?.mainStoryActive) add('constant', progress(snapshot.mainStoryActive, '主线定数'));
      if (previous) {
        const joined = snapshot.heroes.names.filter((name) => !previous.heroes.names.includes(name));
        const left = previous.heroes.names.filter((name) => !snapshot.heroes.names.includes(name));
        if (joined.length) add('hero', `加入英雄 ${joined.length} 名`, joined);
        if (left.length) add('hero', `离队英雄 ${left.length} 名`, left);
      }
      const { techKeys, draws: ignoredDraws, ...entry } = snapshot;
      timeline.push({ ...entry, index, title: dayTitle(day), present: true, savedAtLocal: localTime(snapshot.savedAt),
        mapSync, map: { ...snapshot.map, new: newTiles, exploredCount: snapshot.map.explored.length },
        tech: { unlocked: techKeys, new: newTech }, changes });
      previous = snapshot;
    }
    const dict = dictionary(techData), usedPages = new Set();
    for (const key of firstTechDay.keys()) {
      let found = false;
      for (const [page, nodes] of dict.pages) if (nodes.some((node) => node.key === key)) { usedPages.add(page); found = true; }
      if (!found) usedPages.add('cycle1');
    }
    if (!usedPages.size) usedPages.add('cycle1');
    const order = new Map([...firstTechDay.keys()].map((key, i) => [key, i + 1]));
    return { ...base, hasData: true, timeline,
      map: { cycle: cycleDef, canvas: { width: Number(cycleDef.width) || 1, height: Number(cycleDef.height) || 1, tileWidth: Number(cycleDef.tileWidth) || 1 },
        tiles: [...firstTileDay].map(([id, firstDay]) => {
          const tile = tilesById.get(id);
          return { id, label: tileLabel(id), row: tile?.row ?? null, col: tile?.col ?? null, nx: tile?.nx ?? null, ny: tile?.ny ?? null,
            front: text(tile?.front), back: text(tile?.back), firstDay, known: Boolean(tile) };
        }) },
      tech: { pages: [...usedPages].sort().map((page) => ({ page, cycleId: `c${page.replace(/\D/g, '')}`,
        nodes: (dict.pages.get(page) || []).map((node) => ({ ...node, ...dict.cards.get(node.key), unlocked: firstTechDay.has(node.key), firstDay: firstTechDay.get(node.key) || '', order: order.get(node.key) ?? null })),
        edges: dict.edges.get(page) || [] })),
      unlocked: [...firstTechDay].map(([key, firstDay]) => ({ key, name: dict.cards.get(key)?.name || key,
        category: dict.cards.get(key)?.category || '', firstDay, order: order.get(key) })) },
      summary: { days: timeline.length, recordedDays: snapshots.size, firstDay: presentDays[0], lastDay: presentDays[presentDays.length - 1],
        explored: firstTileDay.size, totalTiles: cycleDef.tiles.length, unlocked: firstTechDay.size } };
  }

  return { build };
});
