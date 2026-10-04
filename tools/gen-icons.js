#!/usr/bin/env node
// Generuje ikony PWA (PNG) bez żadnych zależności: node tools/gen-icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const C1 = hex("#4f46e5"), C2 = hex("#6d28d9"), PINK = hex("#ec4899"), WHITE = [255, 255, 255];

// signed distance do zaokrąglonego prostokąta o środku (cx,cy) i połowach boków (hx,hy)
const sdRound = (x, y, cx, cy, hx, hy, r) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

function background(x, y) {
  let c = mix(C1, C2, (x + y) / 2);
  const d = Math.hypot(x - 1, y) / 0.9;
  return mix(c, PINK, Math.max(0, 1 - d) * 0.85);
}

// jeden próbkowany punkt → [r,g,b,a] w układzie 0..1; scale = rozmiar glifu (1 = pełny, <1 = strefa bezpieczna)
function sample(x, y, { rounded, scale }) {
  let a = 1;
  if (rounded && sdRound(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return [0, 0, 0, 0];
  let col = background(x, y);
  // glif kalendarza (współrzędne względem środka, skalowane)
  const gx = 0.5 + (x - 0.5) / scale, gy = 0.5 + (y - 0.5) / scale;
  const body = sdRound(gx, gy, 0.5, 0.56, 0.25, 0.22, 0.05);
  const ring = [0.38, 0.62].map(rx => sdRound(gx, gy, rx, 0.33, 0.028, 0.065, 0.028));
  if (body < 0 || ring.some(d => d < 0)) {
    col = WHITE;
    if (body < 0 && gy < 0.43) col = mix(WHITE, C2, 0.18); // pasek nagłówka
    // kropki-dni
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
      if (sdCircle(gx, gy, 0.385 + k * 0.115, 0.535 + r * 0.115, 0.032) < 0) col = mix(C1, C2, k / 2);
    }
    // wycięcie wokół uchwytów
  }
  return [...col, a];
}

function render(size, opts) {
  const SS = 3, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const s = sample((px + (sx + .5) / SS) / size, (py + (sy + .5) / SS) / size, opts);
        r += s[0] * s[3]; g += s[1] * s[3]; b += s[2] * s[3]; a += s[3];
      }
      const o = py * (size * 4 + 1) + 1 + px * 4, n = SS * SS;
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0; raw[o + 3] = Math.round(255 * a / n);
    }
  }
  return png(size, raw);
}

function png(size, raw) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });
const jobs = [
  ["icon-192.png", 192, { rounded: true, scale: 1 }],
  ["icon-512.png", 512, { rounded: true, scale: 1 }],
  ["icon-maskable-512.png", 512, { rounded: false, scale: 0.72 }], // pełne tło + glif w strefie bezpiecznej
  ["apple-touch-icon.png", 180, { rounded: false, scale: 0.9 }],   // iOS sam zaokrągla rogi
];
for (const [name, size, opts] of jobs) {
  fs.writeFileSync(path.join(out, name), render(size, opts));
  console.log("zapisano icons/" + name);
}
