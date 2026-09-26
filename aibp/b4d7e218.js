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
    const result = new Set(Object.values(config.common));
    for (const mode of Object.values(config.modes)) {
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
    for (const mode of Object.keys(config.modes)) {
      for (const card of config.extras(mode)) {
        result.add(card.src);
        result.add(card.backSrc);
      }
    }
    return [...result];
  }

  async function ready(config) {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      const pending = urls(config);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
        while (next < pending.length) {
          const url = pending[next++];
          const response = await fetch(url);
          if (!response.ok) throw new Error(`无法读取赫利俄斯资源：${url}`);
          const plain = decode(new Uint8Array(await response.arrayBuffer()));
          const png = plain[0] === 137 && plain[1] === 80 && plain[2] === 78 && plain[3] === 71;
          cache.set(url, URL.createObjectURL(new Blob([plain], { type: png ? "image/png" : "image/jpeg" })));
        }
      }));
      loaded = true;
    })().catch((error) => {
      for (const value of cache.values()) URL.revokeObjectURL(value);
      cache.clear();
      loading = null;
      throw error;
    });
    return loading;
  }

  const api = {
    path,
    transform,
    decode,
    ready,
    isReady: () => loaded,
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
