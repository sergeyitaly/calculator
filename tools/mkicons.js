/* Writes the app icons as real PNGs - a small calculator drawn from
   rounded rectangles, kept inside the maskable safe area. */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function canvas(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  return {
    w, h, buf,
    px(x, y, [r, g, b], a) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      const na = a, ia = 1 - a;
      buf[i] = Math.round(buf[i] * ia + r * na);
      buf[i + 1] = Math.round(buf[i + 1] * ia + g * na);
      buf[i + 2] = Math.round(buf[i + 2] * ia + b * na);
      buf[i + 3] = Math.round(buf[i + 3] * ia + 255 * na);
    },
    /* rounded rectangle with a soft (anti-aliased) edge */
    rr(x0, y0, rw, rh, rad, color) {
      const x1 = x0 + rw, y1 = y0 + rh;
      for (let y = Math.floor(y0) - 1; y <= Math.ceil(y1) + 1; y++) {
        for (let x = Math.floor(x0) - 1; x <= Math.ceil(x1) + 1; x++) {
          const cx = Math.min(Math.max(x + 0.5, x0 + rad), x1 - rad);
          const cy = Math.min(Math.max(y + 0.5, y0 + rad), y1 - rad);
          const inside = x + 0.5 >= x0 && x + 0.5 <= x1 && y + 0.5 >= y0 && y + 0.5 <= y1;
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          const a = rad <= 0 ? (inside ? 1 : 0) : Math.min(1, Math.max(0, rad - d + 0.5));
          if (a > 0) this.px(x, y, color, a);
        }
      }
    }
  };
}

const BODY = [26, 30, 37];
const EDGE = [58, 66, 78];
const LCD = [186, 199, 172];
const LCDINK = [38, 48, 32];
const KEY = [74, 83, 96];
const ACCENT = [56, 118, 186];

function draw(size) {
  const c = canvas(size, size);
  const u = size / 100;                      /* one percent of the icon */
  c.rr(0, 0, size, size, 0, BODY);           /* full bleed, so it masks cleanly */
  c.rr(18 * u, 10 * u, 64 * u, 80 * u, 9 * u, EDGE);
  c.rr(19.2 * u, 11.2 * u, 61.6 * u, 77.6 * u, 8 * u, BODY);

  /* display */
  c.rr(24 * u, 16 * u, 52 * u, 20 * u, 2.5 * u, LCD);
  c.rr(28 * u, 20 * u, 26 * u, 2.6 * u, 1.3 * u, LCDINK);
  c.rr(44 * u, 27 * u, 28 * u, 5 * u, 1.6 * u, LCDINK);

  /* keys: four rows of four, last column highlighted */
  const kx = 24, ky = 42, kw = 10.5, kh = 8.5, gapx = 3.7, gapy = 3.4;
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 4; col++) {
      const x = (kx + col * (kw + gapx)) * u;
      const y = (ky + r * (kh + gapy)) * u;
      const accent = (col === 3 && r >= 2);
      c.rr(x, y, kw * u, kh * u, 2 * u, accent ? ACCENT : KEY);
    }
  }
  return encodePNG(size, size, c.buf);
}

const out = path.join(process.argv[2] || '.', 'icons');
fs.mkdirSync(out, { recursive: true });
[180, 192, 512].forEach(s => {
  const f = path.join(out, 'icon-' + s + '.png');
  fs.writeFileSync(f, draw(s));
  console.log(f, fs.statSync(f).size + ' bytes');
});
