(function () {
  if (!window.ATOAndroid || typeof window.ATOAndroid.request !== "function") return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), window.location.href).href;
    const options = init || {};
    const method = String(options.method || request?.method || "GET").toUpperCase();
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
