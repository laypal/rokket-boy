// PKG.2 — PWA icons from the title-screen R emblem (same rows favicon-lib
// composes), as PNG. Pure: rows in, bytes out. No dependency: a PNG is a
// signature plus CRC'd chunks, and node:zlib does the IDAT deflate. Only
// 8-bit RGB with filter 0 per scanline — all this project ever needs.
// tests/pwa.test.ts regenerates public/icon-*.png through this and asserts
// the committed bytes match, so a redrawn emblem fails there, not on a phone.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

/** @param {Buffer} buf @returns {number} */
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {string} type 4 ASCII chars @param {Buffer} data @returns {Buffer} */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * @param {number} width @param {number} height
 * @param {Buffer} rgb width*height*3 bytes, row-major
 * @returns {Buffer} PNG file bytes
 */
export function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  // compression 0, filter 0, interlace 0 already zero
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** @param {string} hex '#rrggbb' @returns {number[]} */
function rgbOf(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/**
 * Draw `rows` (square grid of shade chars '0'-'3') scaled by `scale`,
 * nearest-neighbour, centred on a size×size canvas filled with the grid's
 * dominant shade (the favicon's own background rule).
 * @param {string[]} rows @param {readonly string[]} palette 4+ CSS colours
 * @param {number} size @param {number} scale @returns {Buffer} PNG
 */
export function renderIcon(rows, palette, size, scale) {
  const counts = [0, 0, 0, 0];
  for (const row of rows) for (const ch of row) counts[Number(ch)]++;
  const bg = rgbOf(palette[counts.indexOf(Math.max(...counts))]);
  const pal = [0, 1, 2, 3].map((i) => rgbOf(palette[i]));
  const rgb = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) rgb.set(bg, i * 3);
  const off = Math.floor((size - rows.length * scale) / 2);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = pal[Number(rows[y][x])];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          rgb.set(c, ((off + y * scale + dy) * size + off + x * scale + dx) * 3);
        }
      }
    }
  }
  return encodePng(size, size, rgb);
}
