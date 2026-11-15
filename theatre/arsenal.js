(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./catalog.js'), require('./state.js'), require('../technology/gear-inventory.js'));
  } else {
    root.ATO_THEATRE_ARSENAL = factory(root.ATO_THEATRE_CATALOG, root.ATO_THEATRE_STATE, root.ATO_GEAR_INVENTORY);
  }
})(typeof window === 'object' ? window : globalThis, function (catalog, rules, inventory) {
  'use strict';

  const api = '../api/campaign-state.php';
  const recordObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const receiptKey = (nodeId, gearId) => `${nodeId}/${gearId}`;

  function wasAdded(snapshot, nodeId, gearId) {
    return snapshot?.record._theatreGearReceipts?.[receiptKey(nodeId, gearId)] === true;
  }

  function create(session, request) {
    async function read() {
      if (!session.accountId) throw new Error('剧场存档尚未读取。');
      const response = await request(api, { cache: 'no-store' });
      const result = session.accept(await response.json());
      if (!response.ok || !result?.ok || !result.campaign) throw new Error(result?.error || '无法读取军械库。');
      const { sections = {}, sectionRevisions = {} } = result.campaign;
      const profileId = sections.dashboard?.activeProfileId || 'default';
      const store = sections.record;
      const record = store?.users || store?.accounts
        ? store.users?.[profileId] ?? store.accounts?.[profileId]
        : store;
      return { profileId, record: recordObject(record), theatre: sections.theatre, revisions: sectionRevisions };
    }

    async function add(nodeId, gearId, profileId) {
      const accountId = session.accountId;
      const node = catalog.byId[nodeId];
      for (let attempt = 0; attempt < 4; attempt++) {
        const latest = await read();
        profileId ??= latest.profileId;
        if (latest.profileId !== profileId) throw new Error('当前战役档案已切换，请重新操作。');
        const theatre = rules.normalize(latest.theatre);
        if (!node || !theatre.completed[node.cycle] || !catalog.rewardGear(node, theatre.wins[nodeId]).includes(gearId)) {
          throw new Error('该装备奖励尚未领取或已变更，请刷新剧场。');
        }
        if (wasAdded(latest, nodeId, gearId)) return { snapshot: latest };

        const record = {
          ...latest.record,
          arsenal: inventory.adjust(latest.record.arsenal, gearId, 1),
          _theatreGearReceipts: {
            ...recordObject(latest.record._theatreGearReceipts),
            [receiptKey(nodeId, gearId)]: true,
          },
        };
        try {
          const response = await request(`${api}?action=import-sections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: profileId,
              expectedAccountId: accountId,
              // The active profile and earned reward are read dependencies.
              expectedRevisions: Object.fromEntries(['dashboard', 'record', 'theatre'].map(section =>
                [section, latest.revisions[section] ?? 0])),
              sections: { record },
            }),
          });
          const result = session.accept(await response.json());
          if (response.status === 409 && result?.code === 'SAVE_CONFLICT') continue;
          if (!response.ok || !result?.ok) throw new Error(result?.error || '无法保存军械库。');
          const revision = result.sections.record;
          return { snapshot: { ...latest, record, revisions: { ...latest.revisions, record: revision } }, revision };
        } catch (error) {
          // The receipt and stock are committed together even if the response is lost.
          const recovered = session.changed ? null : await read().catch(() => null);
          if (recovered?.profileId === profileId && wasAdded(recovered, nodeId, gearId)) {
            return { snapshot: recovered, revision: recovered.revisions.record };
          }
          throw error;
        }
      }
      throw new Error('存档正在另一页面更新，请重试。');
    }

    return { read, add };
  }

  return { create, wasAdded };
});
