/* The story sidebar edits only record.centimanes. Keep the rest of the record
 * from the latest campaign read, with the same account and revision guards.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./centimanes.js"), require("./cryptic-manual.js"));
  else {
    root.ATO_CENTIMANES_STORE = factory(root.ATO_CENTIMANES, root.ATO_CRYPTIC_MANUAL);
    root.ATO_CENTIMANES_STORE.mountSidebar(root);
  }
})(typeof window === "object" ? window : this, function (cent, manual) {
  "use strict";
  const plain = value => value && typeof value === "object" && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }
  function merge(base, local, remote, path = "") {
    if (equal(local, base)) return { value: remote, conflicts: [] };
    if (equal(remote, base) || equal(local, remote)) return { value: local, conflicts: [] };
    if (plain(local) && plain(remote) && (plain(base) || base === undefined)) {
      const value = {}, conflicts = [];
      const keys = new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)]);
      for (const key of keys) {
        const result = merge(base?.[key], local[key], remote[key], path ? `${path}.${key}` : key);
        if (result.value !== undefined) value[key] = result.value;
        conflicts.push(...result.conflicts);
      }
      return { value, conflicts };
    }
    return { value: local, conflicts: [path] };
  }

  const workspace = {
    normalize: value => ({ centimanes: cent.normalize(value?.centimanes), babelian: manual.normalize(value?.babelian, "babelian"), siren: manual.normalize(value?.siren, "siren") }),
    readRecord: record => ({ centimanes: record.centimanes, babelian: record.crypticLanguages?.babelian, siren: record.crypticLanguages?.siren }),
    writeRecord: (record, state) => ({ ...record, centimanes: state.centimanes,
      crypticLanguages: { ...record.crypticLanguages, version: 1, babelian: state.babelian, siren: state.siren } }),
  };
  function create({ request, session, onUpdate = () => {}, normalize = cent.normalize,
    readRecord = record => record.centimanes, writeRecord = (record, value) => ({ ...record, centimanes: value }) }) {
    let state = normalize(), baseline = normalize(), ready = false;
    let profileId = "", cycle = "c1", running = null, conflict = null;
    let message = "正在读取密语记录…", failed = false;
    const snapshot = () => ({ state: clone(state), ready, message, failed, conflict: Boolean(conflict), cycle,
      context: session.changed ? "signed-out" : `${session.accountId}:${profileId}` });
    const emit = () => onUpdate(snapshot());
    async function readLatest() {
      session.assertCurrent();
      const response = await request();
      const payload = session.accept(await response.json());
      if (!response.ok || !payload?.ok) throw Error(payload?.error || `HTTP ${response.status}`);
      const campaign = payload.campaign || {}, dashboard = campaign.sections?.dashboard;
      if (!profileId) profileId = dashboard?.activeProfileId || "default";
      if (dashboard?.profiles && !Object.hasOwn(dashboard.profiles, profileId)
        && (profileId !== "default" || Object.keys(dashboard.profiles).length)) throw Error("原战役档案已不存在，请刷新故事页。");
      cycle = dashboard?.profiles?.[profileId]?.activeCycleId || "c1";
      const section = campaign.sections?.record;
      const record = section?.users ? section.users[profileId] : section;
      return { record: plain(record) ? clone(record) : {}, revision: Math.max(0, Number(campaign.sectionRevisions?.record || 0)) };
    }
    async function performSync() {
      if (conflict) return;
      failed = false; message = ready ? "正在同步…" : "正在读取密语记录…"; emit();
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const latest = await readLatest(), remote = normalize(readRecord(latest.record));
          if (!ready) { state = remote; baseline = clone(remote); ready = true; }
          const merged = merge(baseline, state, remote);
          if (merged.conflicts.length) {
            conflict = { remote };
            message = "另一页面修改了相同的字符对应或输入，请选择保留本页冲突值或采用存档版本。";
            emit(); return;
          }
          state = normalize(merged.value);
          baseline = clone(remote);
          if (equal(state, remote)) {
            message = "已读取密语记录"; emit(); return;
          }
          const sent = clone(state);
          session.assertCurrent();
          const response = await request({ method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ section: "record", userId: profileId, state: writeRecord(latest.record, sent),
              expectedRevision: latest.revision, expectedAccountId: session.accountId }) });
          const payload = session.accept(await response.json());
          if (response.status === 409 && payload?.code === "SAVE_CONFLICT") continue;
          if (!response.ok || !payload?.ok) throw Error(payload?.error || `HTTP ${response.status}`);
          // A click while POST was pending belongs to the next save, never the
          // baseline for this one. It must survive both success and a retry.
          baseline = sent;
          message = "已保存到当前战役"; emit();
          if (equal(state, baseline)) return;
        }
        throw Error("存档正被其他页面更新，请稍后重试。");
      } catch (error) {
        failed = true;
        message = error?.code === "ACCOUNT_MISMATCH"
          ? "登录账号已切换，已停止保存，请刷新故事页。"
          : ready ? `同步失败：${error.message}。修改保留在本页，刷新前请重试。`
            : `读取失败：${error.message}。请先在主控台登录，再重试。`;
        emit();
      }
    }
    return {
      snapshot,
      change(next) {
        session.assertCurrent();
        if (!ready) return;
        state = normalize(next);
        if (!conflict) message = "等待保存…";
        emit();
      },
      sync() {
        if (!running) running = performSync().finally(() => { running = null; });
        return running;
      },
      resolve(keepLocal) {
        if (!conflict) return;
        state = normalize(keepLocal ? merge(baseline, state, conflict.remote).value : conflict.remote);
        baseline = clone(conflict.remote); conflict = null; message = "等待同步…"; emit();
      },
    };
  }

  function mountSidebar(win) {
    const doc = win.document, host = doc.querySelector("#centimanesPanel");
    if (!host || !cent || !win.ATO_CAMPAIGN_SESSION) return;
    const fields = doc.querySelector("#centimanesFields"), status = doc.querySelector("#centimanesSync");
    const retry = doc.querySelector("#centimanesRetry"), keep = doc.querySelector("#centimanesKeep"), remote = doc.querySelector("#centimanesRemote");
    const session = win.ATO_CAMPAIGN_SESSION.create();
    const panels = [];
    let timer;
    const campaignFetch = win.ATO_CAMPAIGN_NOTES.createFetch(win.fetch.bind(win), { source: "故事" });
    const store = create({ ...workspace, session, request: options => campaignFetch("../api/campaign-state.php", { cache: "no-store", ...options }),
      onUpdate: info => {
        fields.disabled = !info.ready || session.changed;
        status.textContent = info.message;
        retry.hidden = !info.failed || session.changed;
        keep.hidden = remote.hidden = !info.conflict || session.changed;
        panels.forEach(panel => panel.render());
      } });
    function scheduleSave() { win.clearTimeout(timer); timer = win.setTimeout(() => { void store.sync(); }, 260); }
    function options(language) {
      return {
        read: () => store.snapshot().state[language],
        change: next => { const value = store.snapshot().state; value[language] = next; store.change(value); scheduleSave(); },
        cycle: () => doc.body.dataset.cycle || store.snapshot().cycle,
        context: () => store.snapshot().context,
      };
    }
    panels.push(cent.mount(host, options("centimanes")));
    for (const language of ["babelian", "siren"]) {
      const target = doc.querySelector(`#${language}Panel`);
      if (target && win.ATO_CRYPTIC_MANUAL_UI) panels.push(win.ATO_CRYPTIC_MANUAL_UI.mount(target, language, options(language)));
    }
    const tabs = doc.querySelectorAll("[data-cryptic-language]");
    tabs.forEach(tab => tab.addEventListener("click", () => {
      const language = tab.dataset.crypticLanguage;
      tabs.forEach(button => { button.setAttribute("aria-selected", String(button === tab)); });
      for (const name of ["centimanes", "babelian", "siren"]) doc.querySelector(`#${name}Panel`).hidden = name !== language;
    }));
    retry.addEventListener("click", () => { void store.sync(); });
    keep.addEventListener("click", () => { store.resolve(true); void store.sync(); });
    remote.addEventListener("click", () => { store.resolve(false); void store.sync(); });
    win.addEventListener("online", () => { void store.sync(); });
    doc.addEventListener("visibilitychange", () => { if (!doc.hidden) void store.sync(); });
    win.setInterval(() => { if (!doc.hidden) void store.sync(); }, 15000);
    void store.sync();
  }
  return { create, merge, mountSidebar, workspace };
});
