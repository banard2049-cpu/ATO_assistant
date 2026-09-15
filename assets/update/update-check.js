(() => {
  const API = "https://api.github.com/repos/banard2049-cpu/ATO_assistant/releases/latest";
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
    module.exports = { parseVersion, isNewer, validRelease, rateLimitNotice, messageFor, TIMEOUT, RETRY_DELAY };
    return;
  }
  const button = document.querySelector("#checkUpdateButton");
  const status = document.querySelector("#updateStatus");
  const panel = document.querySelector("#updateNotice");
  if (!button || !status || !panel) return;
  const current = window.ATO_APP_VERSION || "local";
  document.querySelector("#appVersionLabel").textContent = `当前版本：${current}`;
  let busy = false;
  let shownTag = "";

  function show(release, manual) {
    panel.hidden = true;
    if (!parseVersion(current)) {
      status.textContent = `当前为本地开发版，最新正式版为 ${release.tag_name}。`;
      return;
    }
    if (!isNewer(release.tag_name, current)) {
      status.textContent = "当前已是最新版本。";
      return;
    }
    const skipped = read(SKIPPED) === release.tag_name;
    status.textContent = `发现新版本 ${release.tag_name}${skipped ? "（已跳过，可手动查看）" : ""}。`;
    if (skipped && !manual) return;
    shownTag = release.tag_name;
    document.querySelector("#updateHeading").textContent = `发现新版本 ${shownTag}`;
    document.querySelector("#updateVersions").textContent = `${current} → ${shownTag}`;
    // Release notes are external content: display as plain text, never as HTML.
    document.querySelector("#updateReport").textContent = release.body || "此版本未提供更新说明，请前往 GitHub 查看。";
    document.querySelector("#updateGithubLink").href = `${RELEASES}/tag/${encodeURIComponent(shownTag)}`;
    panel.hidden = false;
  }
  async function fetchRelease(signal) {
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
    let release;
    try {
      release = await response.json();
    } catch {
      throw failure("network", "invalid json");
    }
    if (!validRelease(release)) throw failure("empty", NO_RELEASE);
    return release;
  }
  // 代理出口 IP 的额度是按小时窗口恢复的，也可能轮换到另一个出口，所以失败后再试一次值得。
  async function loadRelease() {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT);
      try {
        return await fetchRelease(controller.signal);
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
    if (busy) return;
    const cached = read(CACHE);
    if (!manual && cached && Date.now() - cached.at >= 0 && Date.now() - cached.at < INTERVAL && validRelease(cached.release)) {
      show(cached.release, false);
      return;
    }
    busy = true;
    button.disabled = true;
    status.textContent = "正在检查更新…";
    try {
      const release = await loadRelease();
      write(CACHE, { at: Date.now(), release: { tag_name: release.tag_name, body: String(release.body || "") } });
      show(release, manual);
    } catch (error) {
      status.textContent = messageFor(error);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }
  button.addEventListener("click", () => check(true));
  document.querySelector("#skipUpdateButton").addEventListener("click", () => {
    write(SKIPPED, shownTag);
    panel.hidden = true;
    status.textContent = `已跳过 ${shownTag}，下一版本仍会提醒。`;
  });
  document.querySelector("#closeUpdateButton").addEventListener("click", () => { panel.hidden = true; });
  void check();
  setInterval(() => { if (!document.hidden) void check(); }, INTERVAL);
})();
