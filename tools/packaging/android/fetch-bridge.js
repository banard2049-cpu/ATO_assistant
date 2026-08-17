(function () {
  if (!window.ATOAndroid || typeof window.ATOAndroid.request !== "function") return;
  window.ATO_ANDROID_SINGLE_WINDOW = true;
  const nativeFetch = window.fetch.bind(window);

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.protocol !== "file:" || !url.pathname.startsWith("/android_asset/web/")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = url.href;
  }, true);

  window.fetch = async function (input, init) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), window.location.href).href;
    const options = init || {};
    const method = String(options.method || request?.method || "GET").toUpperCase();
    if (method === "GET" && url.startsWith("file:///android_asset/web/") && new URL(url).pathname.toLowerCase().endsWith(".json")) {
      const relative = decodeURIComponent(new URL(url).pathname.slice("/android_asset/web/".length));
      const body = window.ATOAndroid.readBundledJson(relative);
      return new Response(body || "", {
        status: body ? 200 : 404,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    if (url.includes("/api/campaign-state.php")) {
      let body = typeof options.body === "string" ? options.body : "";
      if (!body && request && method !== "GET" && method !== "HEAD") {
        body = await request.clone().text();
      }
      const result = JSON.parse(window.ATOAndroid.request(url, method, body));
      return new Response(result.body, {
        status: Number(result.status) || 500,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return nativeFetch(input, init);
  };
})();
