(function () {
  // Bind a page's in-memory edits to the login that supplied its first read.
  // Never adopt a different login during a conflict retry or reconnect.
  function create() {
    let accountId = "";
    let changed = false;
    function invalidate() { changed = true; }
    function assertCurrent() {
      if (!changed) return;
      const error = new Error("登录账号已切换，已停止保存。请刷新页面读取当前账号。");
      error.code = "ACCOUNT_MISMATCH";
      throw error;
    }
    function accept(payload) {
      if (payload?.code === "ACCOUNT_MISMATCH") invalidate();
      const receivedId = payload?.user?.id;
      if (receivedId) {
        if (accountId && accountId !== receivedId) invalidate();
        assertCurrent();
        accountId = receivedId;
      }
      assertCurrent();
      return payload;
    }
    let channel = null;
    try {
      if (typeof BroadcastChannel === "function") channel = new BroadcastChannel("ato-dashboard-writer-v1");
    } catch { /* Account validation also works when broadcasts are unavailable. */ }
    channel?.addEventListener("message", (event) => {
      if (event.data?.type === "session-logout" && accountId) invalidate();
    });
    return {
      get accountId() { assertCurrent(); return accountId; },
      get changed() { return changed; },
      accept,
      assertCurrent,
    };
  }
  window.ATO_CAMPAIGN_SESSION = { create };
})();
