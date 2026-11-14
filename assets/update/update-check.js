(() => {
  const REPO = "https://api.github.com/repos/banard2049-cpu/ATO_assistant";
  const RAW = "https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant";
  // 拉全部正式版发布，而不是只取 latest：这样能把「当前版本 → 最新版」之间
  // 每一个版本的公告都展示出来，而不是只看到最新一个版本的说明。
  const API = "https://api.github.com/repos/banard2049-cpu/ATO_assistant/releases?per_page=100";
  const RELEASES = "https://github.com/banard2049-cpu/ATO_assistant/releases";
  const CACHE = "ato-update-cache-v1";
  const SKIPPED = "ato-update-skipped-v1";
  const INTERVAL = 6 * 60 * 60 * 1000;
  const TIMEOUT = 8000;
  const RETRY_DELAY = 2000;
  const NO_RELEASE = "仓库暂无正式版发布（可能尚未公开，或只有草稿/预发布版）。";

  function parseVersion(value) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value));
    return match ? { numbers: match.slice(1, 4).map(Number), prerelease: match[4] || "" } : null;
  }
  function isNewer(latest, current) {
    const a = parseVersion(latest), b = parseVersion(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
      if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] > b.numbers[i];
    }
    return !a.prerelease && Boolean(b.prerelease);
  }
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function validRelease(release) {
    return release && !release.draft && !release.prerelease
      && parseVersion(release.tag_name) && !parseVersion(release.tag_name).prerelease;
  }
  // 版本号字符串按数字排序：3.10.2 > 3.9.9 > 3.9.4 这样的自然顺序，不是字典序。
  function versionKey(value) {
    const p = parseVersion(value);
    if (!p) return null;
    return p.numbers.map((n) => String(n).padStart(8, "0")).join(".");
  }
  // 从全部正式版发布里，筛出「比 current 新、且不超过 latest」的那些，按版本升序返回。
  // latest 取发布列表里最大的正式版（GitHub 列表本身按发布时间倒序，但不保证和版本号顺序一致）。
  function collectChanges(current, releases) {
    const currentKey = versionKey(current);
    if (!currentKey) return [];
    const formal = releases.filter(validRelease);
    if (formal.length === 0) return [];
    let latest = formal[0];
    for (const r of formal) {
      if (isNewer(r.tag_name, latest.tag_name)) latest = r;
    }
    const latestKey = versionKey(latest.tag_name);
    if (!latestKey) return [];
    return formal
      .filter((r) => {
        const k = versionKey(r.tag_name);
        return k && k > currentKey && k <= latestKey;
      })
      .sort((a, b) => versionKey(a.tag_name).localeCompare(versionKey(b.tag_name)));
  }
  function header(response, name) {
    return response && response.headers && typeof response.headers.get === "function"
      ? response.headers.get(name)
      : null;
  }
  // GitHub 对未认证请求按出口 IP 限流 60 次/小时。代理或 VPN 会让很多用户共用同一个出口 IP，
  // 一旦额度用尽接口返回 403；这种情况必须如实说明是限流，否则会被误判成"网络不通"。
  function rateLimitNotice(status, remaining, reset, now) {
    if (status !== 403 && status !== 429) return "";
    if (String(remaining) !== "0") return "";
    const resetAt = Number(reset);
    if (!Number.isFinite(resetAt) || resetAt <= 0) return "";
    const minutes = Math.max(1, Math.ceil((resetAt * 1000 - now) / 60000));
    return `GitHub 接口临时限流：当前网络出口 IP 的匿名额度（60 次/小时）已用尽，约 ${minutes} 分钟后自动恢复。也可直接打开 GitHub 发布页查看。`;
  }
  function failure(kind, message, status) {
    const error = new Error(message);
    error.kind = kind;
    if (status) error.status = status;
    return error;
  }
  function messageFor(error) {
    const kind = error && error.kind;
    if (kind === "timeout") return `检查超时：${TIMEOUT / 1000} 秒内没连上 api.github.com。若使用代理或 VPN，请把 api.github.com 设为直连后重试。`;
    if (kind === "ratelimit") return error.message;
    if (kind === "empty") return NO_RELEASE;
    if (kind === "http") return `GitHub 返回 HTTP ${error.status}，暂时无法检查更新，请稍后重试。`;
    return "暂时无法检查更新：网络或代理无法访问 api.github.com，请稍后重试或前往 GitHub 发布页查看。";
  }
  // CommonJS export supports tests without loading the dashboard or contacting GitHub.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseVersion, isNewer, validRelease, versionKey, collectChanges, rateLimitNotice, messageFor, TIMEOUT, RETRY_DELAY };
    return;
  }
  const button = document.querySelector("#checkUpdateButton");
  const status = document.querySelector("#updateStatus");
  const panel = document.querySelector("#updateNotice");
  if (!button || !status || !panel) return;
  // 应用内一键更新的控件。任何一个缺失都不影响纯手动的更新提示：所有绑定和写入
  // 都先判空，页面结构变了也只是少一个按钮，不会把整段脚本带崩。
  const applyButton = document.querySelector("#applyUpdateButton");
  const applyTarget = document.querySelector("#applyUpdateTarget");
  const applyStatus = document.querySelector("#applyUpdateStatus");
  const reloadButton = document.querySelector("#reloadUpdateButton");
  const rollbackButton = document.querySelector("#rollbackUpdateButton");
  const APPLY_API = "./api/app-update.php";
  const current = window.ATO_APP_VERSION || "local";
  document.querySelector("#appVersionLabel").textContent = `当前版本：${current}`;
  let busy = false;
  let shownTag = "";
  let updating = false;
  let reloadRequired = false;
  // 能不能一键更新由服务端说了算（是不是便携版、安装目录是否可写、有没有登录）。
  // 拿不到能力信息就只保留手动下载的说明，绝不显示一个按下去必然失败的按钮。
  // 只探测一次是不够的：服务刚启动或临时没连上时结果会是「不支持」，那种情况下
  // 每次检查更新都重新问一次，用户不用刷新页面才能看到按钮。
  let support = { supported: false };
  async function refreshSupport() {
    support = await loadSupport();
    if (rollbackButton) rollbackButton.hidden = !support.canRollback;
    if (support.needsRecovery) setApplyStatus("上次更新未完成，请先还原上一版，再重新更新。", true);
    return support;
  }
  void refreshSupport();

  function show(releases, manual) {
    panel.hidden = true;
    const formal = releases.filter(validRelease);
    if (formal.length === 0) {
      status.textContent = NO_RELEASE;
      return;
    }
    let latest = formal[0];
    for (const r of formal) if (isNewer(r.tag_name, latest.tag_name)) latest = r;
    const changes = collectChanges(current, releases);
    // 只有「服务端支持 + 确实有新版本」才亮出一键更新的按钮；否则用户点下去只会
    // 收到一句拒绝，不如一开始就不出现。
    void (support.supported ? Promise.resolve(support) : refreshSupport()).then((value) => {
      const usable = !updating && !reloadRequired && !value.needsRecovery
        && Boolean(value && value.supported) && changes.length > 0;
      if (applyButton) applyButton.hidden = !usable;
      if (applyTarget) applyTarget.textContent = latest.tag_name;
      if (rollbackButton) rollbackButton.hidden = !(value && value.canRollback);
    });
    if (!parseVersion(current)) {
      status.textContent = `当前为本地开发版，最新正式版为 ${latest.tag_name}。`;
      return;
    }
    if (changes.length === 0) {
      status.textContent = "当前已是最新版本。";
      return;
    }
    const skipped = read(SKIPPED) === latest.tag_name;
    status.textContent = `发现新版本 ${latest.tag_name}${skipped ? "（已跳过，可手动查看）" : ""}。`;
    if (skipped && !manual) return;
    shownTag = latest.tag_name;
    document.querySelector("#updateHeading").textContent = `发现新版本 ${shownTag}`;
    document.querySelector("#updateVersions").textContent = `${current} → ${shownTag}`;
    // 把「当前版本 → 最新版」之间每个正式版的公告按版本升序拼在一起，让用户一次看清
    // 从自己现在的版本一路到最新版都改了什么。公告是外部内容，一律按纯文本展示，不注入 HTML。
    const report = changes
      .map((r) => `【${r.tag_name}】\n${String(r.body || "").trim() || "（此版本未提供说明）"}`)
      .join("\n\n");
    document.querySelector("#updateReport").textContent = report;
    document.querySelector("#updateGithubLink").href = `${RELEASES}/tag/${encodeURIComponent(shownTag)}`;
    panel.hidden = false;
  }
  async function fetchReleases(signal) {
    let response;
    try {
      response = await fetch(API, {
        signal, credentials: "omit", cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
      });
    } catch (error) {
      if (signal.aborted || (error && error.name === "AbortError")) throw failure("timeout", "timeout");
      throw failure("network", error ? String(error.message || error) : "network");
    }
    const notice = rateLimitNotice(response.status, header(response, "x-ratelimit-remaining"), header(response, "x-ratelimit-reset"), Date.now());
    if (notice) throw failure("ratelimit", notice);
    if (response.status === 404) throw failure("empty", NO_RELEASE);
    if (!response.ok) throw failure("http", `HTTP ${response.status}`, response.status);
    let releases;
    try {
      releases = await response.json();
    } catch {
      throw failure("network", "invalid json");
    }
    if (!Array.isArray(releases)) throw failure("empty", NO_RELEASE);
    return releases;
  }
  // 代理出口 IP 的额度是按小时窗口恢复的，也可能轮换到另一个出口，所以失败后再试一次值得。
  async function loadRelease() {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT);
      try {
        return await fetchReleases(controller.signal);
      } catch (error) {
        lastError = error;
        // 404、HTTP 错误这类结果重试也不会改变，只有网络、超时、限流值得再试。
        if (error && (error.kind === "empty" || error.kind === "http")) break;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || failure("network", "unknown");
  }
  async function check(manual = false) {
    if (busy || updating || reloadRequired) return;
    const cached = read(CACHE);
    if (!manual && cached && Date.now() - cached.at >= 0 && Date.now() - cached.at < INTERVAL && Array.isArray(cached.releases)) {
      show(cached.releases, false);
      return;
    }
    busy = true;
    button.disabled = true;
    status.textContent = "正在检查更新…";
    try {
      const releases = await loadRelease();
      // 只缓存解析出的元数据，缓存体积可控；公告正文按需随每次响应回来。
      const slim = releases.map((r) => ({
        tag_name: r.tag_name, body: String(r.body || ""),
        draft: Boolean(r.draft), prerelease: Boolean(r.prerelease),
      }));
      write(CACHE, { at: Date.now(), releases: slim });
      show(releases, manual);
    } catch (error) {
      status.textContent = messageFor(error);
    } finally {
      busy = false;
      button.disabled = updating || reloadRequired;
    }
  }
  button.addEventListener("click", () => check(true));
  document.querySelector("#skipUpdateButton").addEventListener("click", () => {
    write(SKIPPED, shownTag);
    panel.hidden = true;
    status.textContent = `已跳过 ${shownTag}，下一版本仍会提醒。`;
  });
  document.querySelector("#closeUpdateButton").addEventListener("click", () => { panel.hidden = true; });

  function setApplyStatus(message, failed) {
    if (!applyStatus) return;
    applyStatus.textContent = message;
    applyStatus.classList.toggle("update-error", Boolean(failed));
  }
  // 超时覆盖响应正文读取：网络只发回响应头后停住，也必须恢复按钮让用户重试。
  async function request(url, options = {}, binary = false, timeout = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const data = binary && response.ok ? await response.arrayBuffer() : await readJson(response);
      if (controller.signal.aborted) throw new Error("请求超时，请检查连接后重试。");
      return { response, data };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("请求超时，请检查连接后重试。");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async function loadSupport() {
    try {
      const { response, data } = await request(`${APPLY_API}?action=status`, {
        credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return { supported: false };
      return data && typeof data === "object" ? data : { supported: false };
    } catch {
      return { supported: false };
    }
  }
  // 落盘只能在服务端做（浏览器写不了安装目录），这里只负责发起和把错误原文显示出来。
  async function readJson(response) {
    try { return await response.json(); } catch { return null; }
  }
  async function postAction(action, body, planId = "") {
    // Windows 不能覆盖本次请求正在执行的 PHP 脚本。先取得执行副本，
    // 再通过副本提交或还原，原始更新器和规则文件都可以正常替换。
    const endpoint = action === "commit" || action === "rollback"
      ? (await postAction("prepare")).endpoint : APPLY_API;
    let result;
    try {
      result = await request(`${endpoint}?action=${encodeURIComponent(action)}&plan=${encodeURIComponent(planId)}`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: body === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }, false, action === "commit" || action === "rollback" ? 120000 : 30000);
    } catch (error) {
      throw new Error(`无法确认本地服务的操作结果：${error.message || "连接中断"}。请检查当前版本或还原入口后再操作。`);
    }
    const { response, data } = result;
    if (!response.ok || !data || data.ok !== true) {
      throw new Error((data && data.error) || `操作失败（HTTP ${response.status}）。`);
    }
    return data;
  }
  // 取文件这一步必须由浏览器做：便携包里那份 PHP 没有加载 openssl，自己连不上
  // GitHub；而浏览器本来就在访问 api.github.com，也会走用户配好的代理或 VPN。
  async function loadCompare(target) {
    let result;
    try {
      result = await request(`${REPO}/compare/v${encodeURIComponent(current.replace(/^v/, ""))}...${encodeURIComponent(target)}`, {
        credentials: "omit", cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
      });
    } catch {
      throw new Error("无法访问 api.github.com，请检查网络或代理后重试。");
    }
    const { response, data } = result;
    const notice = rateLimitNotice(response.status, header(response, "x-ratelimit-remaining"), header(response, "x-ratelimit-reset"), Date.now());
    if (notice) throw new Error(notice);
    if (response.status === 404) {
      throw new Error(`找不到当前版本对应的发布标签 v${current}，无法增量更新，请手动下载完整安装包。`);
    }
    if (!response.ok) throw new Error(`GitHub 返回 HTTP ${response.status}，暂时无法更新。`);
    if (!data || typeof data !== "object") throw new Error("GitHub 返回的版本差异无法解析。");
    if (data.status !== "ahead" && data.status !== "identical") {
      throw new Error("当前版本与最新版不在同一条线上（可能改过程序文件），请下载完整安装包。");
    }
    if (!Array.isArray(data.files)) throw new Error("GitHub 返回的文件清单不完整，请稍后重试。");
    return data.files;
  }
  function rawUrl(path, target) {
    return `${RAW}/${encodeURIComponent(target)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
  async function applyUpdate() {
    if (updating || busy || reloadRequired || !shownTag) return;
    const target = shownTag;
    let planId = "";
    let committing = false;
    updating = true;
    button.disabled = true;
    if (applyButton) applyButton.disabled = true;
    if (rollbackButton) rollbackButton.disabled = true;
    if (reloadButton) reloadButton.hidden = true;
    setApplyStatus("正在获取版本差异…");
    try {
      const files = await loadCompare(target);
      // 服务端拿着这份差异再筛一遍：发布包里没有的路径会被剔除，真正要下载的
      // 清单由它给出，客户端不自己决定写哪些文件。
      const plan = await postAction("begin", {
        current,
        target,
        files: files.map((file) => ({
          filename: String(file.filename || ""),
          status: String(file.status || ""),
          sha: String(file.sha || ""),
          previous_filename: String(file.previous_filename || ""),
        })),
      });
      planId = plan.planId;
      const total = plan.fileCount;
      for (let index = 0; index < plan.downloads.length; index++) {
        const entry = plan.downloads[index];
        setApplyStatus(`正在下载 ${index + 1}/${total}：${entry.path}`);
        let downloaded;
        try {
          downloaded = await request(rawUrl(entry.path, target), { cache: "no-store", credentials: "omit" }, true);
        } catch {
          throw new Error(`下载 ${entry.path} 失败：无法访问 raw.githubusercontent.com，请检查网络或代理。`);
        }
        if (!downloaded.response.ok) throw new Error(`下载 ${entry.path} 失败（HTTP ${downloaded.response.status}）。`);
        const bytes = downloaded.data;
        const { response: staged, data: stagedData } = await request(
          `${APPLY_API}?action=stage&plan=${encodeURIComponent(planId)}&path=${encodeURIComponent(entry.path)}&sha=${entry.sha}`,
          {
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: { "Content-Type": "application/octet-stream" },
            body: bytes,
          }
        );
        if (!staged.ok || !stagedData || stagedData.ok !== true) {
          throw new Error((stagedData && stagedData.error) || `暂存 ${entry.path} 失败。`);
        }
      }
      setApplyStatus(`已下载并校验 ${total} 个文件，正在替换程序文件…`);
      committing = true;
      const applied = await postAction("commit", undefined, planId);
      reloadRequired = true;
      const deleted = applied.deleted ? `，删除 ${applied.deleted} 个` : "";
      setApplyStatus(`已更新到 ${applied.target}：写入 ${applied.applied} 个文件${deleted}。刷新页面即可生效。`);
      status.textContent = `已更新到 ${applied.target}，请刷新页面。`;
      if (applyButton) applyButton.hidden = true;
      if (reloadButton) reloadButton.hidden = false;
      if (rollbackButton) rollbackButton.hidden = false;
    } catch (error) {
      // 提交可能已落盘但响应丢失。保留恢复资料，并明确区分下载失败和提交结果未知。
      if (!committing && planId) await postAction("cancel", undefined, planId).catch(() => {});
      const latest = await refreshSupport();
      if (committing && latest.version && latest.version.replace(/^v/, "") === target.replace(/^v/, "") && !latest.needsRecovery) {
        reloadRequired = true;
        setApplyStatus(`已确认安装版本为 ${latest.version}，请刷新页面。`);
        if (applyButton) applyButton.hidden = true;
        if (reloadButton) reloadButton.hidden = false;
      } else {
        setApplyStatus((error && error.message ? error.message : "更新失败。")
          + (committing ? " 若已开始替换文件，请先还原上一版再重试。" : ""), true);
      }
    } finally {
      updating = false;
      button.disabled = reloadRequired;
      if (applyButton) applyButton.disabled = reloadRequired || Boolean(support.needsRecovery);
      if (rollbackButton) rollbackButton.disabled = false;
    }
  }
  async function rollbackUpdate() {
    if (updating) return;
    updating = true;
    button.disabled = true;
    if (applyButton) applyButton.disabled = true;
    if (rollbackButton) rollbackButton.disabled = true;
    setApplyStatus("正在还原…");
    let snapshot;
    try {
      snapshot = await refreshSupport();
      if (!snapshot.canRollback || !snapshot.backupId) throw new Error("没有可用的备份，请刷新页面确认当前版本。");
      const data = await postAction("rollback", { backupId: snapshot.backupId });
      reloadRequired = true;
      setApplyStatus(`已还原${data.from ? `到 ${data.from}` : ""}，刷新页面即可恢复。`);
      status.textContent = `已还原${data.from ? `到 ${data.from}` : ""}，请刷新页面。`;
      if (reloadButton) reloadButton.hidden = false;
      if (applyButton) applyButton.hidden = true;
      if (rollbackButton) rollbackButton.hidden = true;
    } catch (error) {
      const latest = await refreshSupport();
      if (snapshot?.backupId && latest.backupId !== snapshot.backupId && !latest.needsRecovery
          && latest.version === snapshot.rollbackVersion) {
        reloadRequired = true;
        setApplyStatus(`已确认还原到 ${latest.version}，请刷新页面。`);
        status.textContent = `已还原到 ${latest.version}，请刷新页面。`;
        if (reloadButton) reloadButton.hidden = false;
        if (rollbackButton) rollbackButton.hidden = true;
        if (applyButton) applyButton.hidden = true;
      } else {
        setApplyStatus(error && error.message ? error.message : "还原失败。", true);
      }
    } finally {
      updating = false;
      button.disabled = reloadRequired;
      if (applyButton) applyButton.disabled = reloadRequired || Boolean(support.needsRecovery);
      if (rollbackButton) rollbackButton.disabled = false;
    }
  }
  if (applyButton) applyButton.addEventListener("click", () => { void applyUpdate(); });
  if (reloadButton) reloadButton.addEventListener("click", () => { window.location.reload(); });
  if (rollbackButton) rollbackButton.addEventListener("click", () => { void rollbackUpdate(); });

  void check();
  setInterval(() => { if (!document.hidden) void check(); }, INTERVAL);
})();
