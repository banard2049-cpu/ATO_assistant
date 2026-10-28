/* Reuse the existing story-reader SHA-256 fallback for HTTP LAN previews. */
(() => {
  "use strict";
  const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  function rotateRight32(value, bits) {
    return ((value >>> bits) | (value << (32 - bits))) >>> 0;
  }

  function sha256Bytes(bytes) {
    const length = bytes.length;
    const paddedLength = Math.ceil((length + 9) / 64) * 64;
    const buffer = new Uint8Array(paddedLength);
    buffer.set(bytes);
    buffer[length] = 0x80;
    const view = new DataView(buffer.buffer);
    // 位长度写成 64 位大端：高位用除法取，低位交给 >>> 0，避免 32 位移位丢位。
    view.setUint32(paddedLength - 8, Math.floor((length * 8) / 4294967296), false);
    view.setUint32(paddedLength - 4, (length * 8) >>> 0, false);

    const h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotateRight32(w[i - 15], 7) ^ rotateRight32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotateRight32(w[i - 2], 17) ^ rotateRight32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (let i = 0; i < 64; i += 1) {
        const sum1 = rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25);
        const choose = (e & f) ^ (~e & g);
        const temp1 = (hh + sum1 + choose + SHA256_K[i] + w[i]) >>> 0;
        const sum0 = rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (sum0 + majority) >>> 0;
        hh = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, h[i], false);
    return out;
  }

  const hex = bytes => [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  const fallback = bytes => hex(sha256Bytes(new Uint8Array(bytes)));
  const digest = async bytes => window.crypto?.subtle
    ? hex(new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes)))
    : fallback(bytes);
  digest.fallback = fallback;
  window.ATO_PREVIEW_SHA256 = digest;
})();
