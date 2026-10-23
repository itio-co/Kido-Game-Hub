import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');

const BG = [0x10, 0x14, 0x1c, 255];
const CYAN = [0x39, 0xe0, 0xff, 255];
const WOOD = [0xe0, 0xa0, 0x60, 255];
const BOOKS = [
  [0xd4, 0x65, 0x4a, 255],
  [0xe6, 0xc1, 0x5a, 255],
  [0x6f, 0xbf, 0x8a, 255],
  [0x7e, 0xb6, 0xd6, 255],
];

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function blend(img, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
  const i = (y * size + x) * 4;
  const srcA = a / 255;
  const dstA = img[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  img[i] = Math.round((r * srcA + img[i] * dstA * (1 - srcA)) / outA);
  img[i + 1] = Math.round((g * srcA + img[i + 1] * dstA * (1 - srcA)) / outA);
  img[i + 2] = Math.round((b * srcA + img[i + 2] * dstA * (1 - srcA)) / outA);
  img[i + 3] = Math.round(outA * 255);
}

function fillRoundRect(img, size, x, y, w, h, rad, color) {
  const [r, g, b, a] = color;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(size - 1, Math.ceil(x + w));
  const y1 = Math.min(size - 1, Math.ceil(y + h));
  const cx = x + w / 2;
  const cy = y + h / 2;
  const hx = Math.max(0, w / 2 - rad);
  const hy = Math.max(0, h / 2 - rad);
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const qx = Math.abs(px + 0.5 - cx) - hx;
      const qy = Math.abs(py + 0.5 - cy) - hy;
      const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
      const cover = Math.max(0, Math.min(1, 0.5 - dist));
      if (cover > 0) blend(img, size, px, py, r, g, b, a * cover);
    }
  }
}

function paint(size, maskable) {
  const img = new Uint8ClampedArray(size * size * 4);
  if (maskable) fillRoundRect(img, size, 0, 0, size, size, 0, BG);
  else fillRoundRect(img, size, 0, 0, size, size, size * 0.22, BG);

  const inset = maskable ? 0.26 : 0.12;
  const ox = size * inset;
  const oy = size * inset;
  const w = size * (1 - inset * 2);

  const barH = w * 0.07;
  fillRoundRect(img, size, ox + w * 0.14, oy + w * 0.06, w * 0.72, barH, barH / 2, CYAN);

  const plankH = w * 0.09;
  const plankY = oy + w * 0.78;
  fillRoundRect(img, size, ox + w * 0.08, plankY, w * 0.84, plankH, size * 0.02, WOOD);

  const heights = [0.4, 0.52, 0.46, 0.36];
  const bookW = w * 0.14;
  const gap = w * 0.04;
  const total = heights.length * bookW + (heights.length - 1) * gap;
  let bx = ox + (w - total) / 2;
  for (let i = 0; i < heights.length; i++) {
    const bh = w * heights[i];
    fillRoundRect(img, size, bx, plankY - bh + size * 0.008, bookW, bh, size * 0.018, BOOKS[i]);
    bx += bookW + gap;
  }
  return img;
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(path.join(OUT, `icon-${size}.png`), encodePng(size, paint(size, false)));
  writeFileSync(path.join(OUT, `icon-maskable-${size}.png`), encodePng(size, paint(size, true)));
}
console.log('wrote icons to', OUT);
