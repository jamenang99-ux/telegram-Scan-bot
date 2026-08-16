// gen-thumb.js — dependency-free 640x360 PNG generator for the "Mod Panel" web app.
// Produces a dark-slate, teal shield logo with "MOD PANEL" text. No external deps.
const fs = require('fs');
const zlib = require('zlib');

const W = 640, H = 360;
const buf = Buffer.alloc(W * H * 3); // RGB

function setPx(x, y, r, g, b) {
  x = x | 0; y = y | 0;
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
}

// ---- Background: vertical dark-slate gradient + subtle center teal glow ----
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  let r = 15 + (30 - 15) * t;
  let g = 23 + (41 - 23) * t;
  let b = 42 + (59 - 42) * t;
  for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const d2 = dx * dx + dy * dy;
    const glow = Math.max(0, 0.10 * (1 - d2));
    setPx(x, y,
      Math.min(255, r + glow * 34),
      Math.min(255, g + glow * 211),
      Math.min(255, b + glow * 238));
  }
}

// ---- Shield (polygon fill, vertical teal gradient) ----
const cx = 320;
const shield = [[cx - 78, 58], [cx + 78, 58], [cx + 78, 150], [cx, 248], [cx - 78, 150]];
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
for (let y = 48; y <= 250; y++) {
  for (let x = cx - 92; x <= cx + 92; x++) {
    if (inPoly(x, y, shield)) {
      const t = (y - 58) / (248 - 58);
      const r = Math.round(34 + (14 - 34) * t);
      const g = Math.round(211 + (165 - 211) * t);
      const b = Math.round(238 + (233 - 238) * t);
      // top-left highlight for a little depth
      const hl = Math.max(0, 1 - (Math.abs(x - (cx - 30)) + Math.abs(y - 100)) / 220);
      setPx(x, y,
        Math.min(255, r + hl * 40),
        Math.min(255, g + hl * 30),
        Math.min(255, b + hl * 18));
    }
  }
}

// ---- Checkmark (thick white polyline) ----
function line(x0, y0, x1, y1, col, w) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = Math.round(x0), y = Math.round(y0);
  const off = Math.floor(w / 2);
  while (true) {
    for (let ox = -off; ox <= off; ox++)
      for (let oy = -off; oy <= off; oy++)
        setPx(x + ox, y + oy, col[0], col[1], col[2]);
    if (x === Math.round(x1) && y === Math.round(y1)) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
line(cx - 35, 158, cx, 188, [255, 255, 255], 9);
line(cx, 188, cx + 35, 142, [255, 255, 255], 9);

// ---- Bitmap font (5x7) for the letters we need ----
const FONT = {
  M: ['11111', '10001', '10101', '11011', '10101', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
function drawText(str, centerX, topY, scale, col) {
  const chars = [...str.toUpperCase()];
  const adv = 7 * scale;
  const total = chars.length * adv - scale;
  let x0 = Math.round(centerX - total / 2);
  for (const ch of chars) {
    const g = FONT[ch] || FONT[' '];
    for (let row = 0; row < 7; row++)
      for (let c2 = 0; c2 < 5; c2++)
        if (g[row][c2] === '1')
          for (let sx = 0; sx < scale; sx++)
            for (let sy = 0; sy < scale; sy++)
              setPx(x0 + c2 * scale + sx, topY + row * scale + sy, col[0], col[1], col[2]);
    x0 += adv;
  }
}
// "MOD PANEL" in slate-200, with a teal accent underline sized to the text
const TEXT_SCALE = 6, TEXT_TOP = 296, TEXT_STR = 'MOD PANEL';
drawText(TEXT_STR, cx, TEXT_TOP, TEXT_SCALE, [226, 232, 240]);
const tAdv = 7 * TEXT_SCALE;
const tTotal = TEXT_STR.length * tAdv - TEXT_SCALE;
const tLeft = Math.round(cx - tTotal / 2);
line(tLeft, TEXT_TOP + 7 * TEXT_SCALE + 6, tLeft + tTotal, TEXT_TOP + 7 * TEXT_SCALE + 6, [34, 211, 238], 3);

// ---- PNG encode (RGB, 8-bit, filter 0) with manual CRC32 ----
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, y * W * 3 + W * 3);
}
const idat = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync('mod-panel-640x360.png', png);
console.log('WROTE mod-panel-640x360.png', W + 'x' + H, png.length + ' bytes');
