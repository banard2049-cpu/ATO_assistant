(function (root) {
  "use strict";

  // This key only hides spoilers from casual file browsing. A browser that can
  // show the cards also has everything needed to decode them.
  const keyHex = "a9559b06b854bce0432a50a26a9fc0fa2e6779d498071c1dbf7b08db54e2a728";
  const key = Uint8Array.from(keyHex.match(/../g), (part) => parseInt(part, 16));
  const magic = Uint8Array.from([65, 84, 79, 72, 69, 76, 73, 49]); // ATOHELI1
  const cache = new Map();
  let loading = null;
  let loaded = false;

  function path(source) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index++) {
      hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193) >>> 0;
    }
    return `ps/other/3b6e9d20/${hash.toString(16).padStart(8, "0")}.bin`;
  }

  function rotate(value, count) {
    return (value << count) | (value >>> (32 - count));
  }

  function quarter(words, a, b, c, d) {
    words[a] = (words[a] + words[b]) | 0; words[d] = rotate(words[d] ^ words[a], 16);
    words[c] = (words[c] + words[d]) | 0; words[b] = rotate(words[b] ^ words[c], 12);
    words[a] = (words[a] + words[b]) | 0; words[d] = rotate(words[d] ^ words[a], 8);
    words[c] = (words[c] + words[d]) | 0; words[b] = rotate(words[b] ^ words[c], 7);
  }

  function word(bytes, offset) {
    return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) | 0;
  }

  function transform(input, nonce) {
    const output = new Uint8Array(input.length);
    const state = new Int32Array(16);
    state.set([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);
    for (let index = 0; index < 8; index++) state[4 + index] = word(key, index * 4);
    for (let index = 0; index < 3; index++) state[13 + index] = word(nonce, index * 4);
    for (let offset = 0, counter = 1; offset < input.length; offset += 64, counter++) {
      state[12] = counter;
      const block = new Int32Array(state);
      for (let round = 0; round < 10; round++) {
        quarter(block, 0, 4, 8, 12); quarter(block, 1, 5, 9, 13);
        quarter(block, 2, 6, 10, 14); quarter(block, 3, 7, 11, 15);
        quarter(block, 0, 5, 10, 15); quarter(block, 1, 6, 11, 12);
        quarter(block, 2, 7, 8, 13); quarter(block, 3, 4, 9, 14);
      }
      for (let index = 0; index < 16; index++) {
        const value = (block[index] + state[index]) | 0;
        for (let byte = 0; byte < 4; byte++) {
          const position = offset + index * 4 + byte;
          if (position < input.length) output[position] = input[position] ^ (value >>> (byte * 8) & 255);
        }
      }
    }
    return output;
  }

  function decode(bytes) {
    if (bytes.length < 20 || !magic.every((value, index) => bytes[index] === value)) {
      throw new Error("赫利俄斯资源格式不正确");
    }
    return transform(bytes.subarray(20), bytes.subarray(8, 20));
  }

  function urls(config) {
    const result = new Set(Object.values(config.common || {}));
    for (const mode of Object.values(config.modes || {})) {
      result.add(mode.panel);
      if (mode.panelHigh) result.add(mode.panelHigh);
      for (const type of ["AI", "BP"]) {
        for (const level of ["I", "II", "III"]) {
          for (const card of mode.decks[type][level] || []) {
            result.add(card.src);
            result.add(card.backSrc);
          }
        }
      }
    }
    for (const mode of Object.keys(config.modes || {})) {
      for (const card of config.extras(mode)) {
        result.add(card.src);
        result.add(card.backSrc);
      }
    }
    // 独立配置（例如黑喙）：面板 + 额外卡 + 显式声明的加密来源。
    if (!config.modes) {
      if (config.panel) result.add(config.panel);
      if (config.panelBack) result.add(config.panelBack);
      for (const card of config.extraCards || []) {
        result.add(card.src);
        if (card.backSrc) result.add(card.backSrc);
      }
    }
    for (const source of config.sealedSources || []) {
      result.add(path(source));
    }
    return [...result];
  }

  // 单个资源最多等这么久；超时/失败都汇总成一条可读的错误，避免一直卡在「正在加载资源」。
  const RESOURCE_TIMEOUT_MS = 20000;

  async function fetchBytes(url) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer = null;
    try {
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
          controller?.abort();
          resolve(null);
        }, RESOURCE_TIMEOUT_MS);
      });
      const request = (async () => {
        const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
        if (!response.ok) return { error: `HTTP ${response.status}` };
        try {
          return { plain: decode(new Uint8Array(await response.arrayBuffer())) };
        } catch (error) {
          return { error: `解密失败：${error?.message || error}` };
        }
      })().catch((error) => ({ error: String(error?.message || error) }));
      return await Promise.race([request, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function encryptedUrls(config, extraConfigs) {
    return [...new Set([config, ...(extraConfigs || [])].flatMap(urls))].filter(
      (url) => typeof url === "string" && /^ps\/other\/3b6e9d20\/[0-9a-f]+\.bin$/.test(url));
  }

  async function ready(config, extraConfigs) {
    const required = encryptedUrls(config, extraConfigs);
    if (required.every((url) => cache.has(url))) return;
    if (loading) {
      await loading;
      return ready(config, extraConfigs);
    }
    const added = [];
    loading = (async () => {
      // 只有加密资源（ps/other/3b6e9d20/*.bin）需要预取+解密。
      // 直接引用的明文卡图（例如黑喙复用 ps/HERMESIAN_PURSUER/）交给浏览器自己加载。
      const pending = required.filter((url) => !cache.has(url));
      const failures = [];
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
        while (next < pending.length) {
          const url = pending[next++];
          const result = await fetchBytes(url);
          if (!result || result.error) {
            failures.push(`${url}（${result ? result.error : "超时"}）`);
            continue;
          }
          const plain = result.plain;
          const png = plain[0] === 137 && plain[1] === 80 && plain[2] === 78 && plain[3] === 71;
          cache.set(url, URL.createObjectURL(new Blob([plain], { type: png ? "image/png" : "image/jpeg" })));
          added.push(url);
        }
      }));
      if (failures.length) {
        throw new Error(`有 ${failures.length}/${pending.length} 个资源读取失败：${failures.slice(0, 3).join("；")}`);
      }
      loaded = true;
    })().catch((error) => {
      for (const url of added) {
        URL.revokeObjectURL(cache.get(url));
        cache.delete(url);
      }
      throw error;
    }).finally(() => { loading = null; });
    return loading;
  }

  const api = {
    path,
    transform,
    decode,
    ready,
    isReady: (config, extraConfigs) => config
      ? encryptedUrls(config, extraConfigs).every((url) => cache.has(url)) : loaded,
    resolve: (url) => {
      // Existing local battle saves may still contain the former image paths.
      const encrypted = typeof url === "string" && url.startsWith("ps/ENVELOPES/")
        ? path(url.slice(3)) : url;
      return cache.get(encrypted) || encrypted;
    },
    magic,
  };
  root.HeliosAssets = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
