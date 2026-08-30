// TOOL.1 — shade strings ⇄ PNG, pure functions. The CLI is sprite-io.mjs;
// tests/sprite-io.test.ts pins the round-trip on every shipped sprite.
// Sprite grammar: rows of '0'..'3' (palette index) or '.' (transparent);
// fronts 28×28, backs 24×20, tiles 16×16.
import { PNG } from 'pngjs';

const SIZES = [[28, 28], [24, 20], [16, 16]];

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

/** Faults as strings; [] means the rows are drawable. */
export function validateRows(rows) {
  const out = [];
  const want = SIZES.find(([, h]) => h === rows.length);
  if (!want) out.push(`${rows.length} rows (want 28, 20 or 16)`);
  rows.forEach((r, y) => {
    if (want && r.length !== want[0]) out.push(`row ${y}: width ${r.length} (want ${want[0]})`);
    const bad = /[^0123.]/.exec(r);
    if (bad) out.push(`row ${y}: bad char "${bad[0]}"`);
  });
  return out;
}

/** Encode rows as an RGBA PNG buffer at `scale`× (transparent where '.'). */
export function rowsToPng(rows, pal, scale = 1) {
  const w = rows[0].length, h = rows.length;
  const png = new PNG({ width: w * scale, height: h * scale });
  const rgb = pal.map(hex);
  for (let y = 0; y < h * scale; y++) {
    for (let x = 0; x < w * scale; x++) {
      const ch = rows[(y / scale) | 0][(x / scale) | 0];
      if (ch === '.') continue;
      const i = (y * w * scale + x) * 4;
      const [r, g, b] = rgb[+ch];
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** Decode a pngjs PNG to rows: alpha < 128 → '.', else nearest palette shade. */
export function pngToRows(png, pal, scale = 1) {
  if (!Number.isInteger(scale) || scale < 1 || png.width % scale || png.height % scale) {
    throw new Error(`scale ${scale} does not divide ${png.width}×${png.height}`);
  }
  const w = png.width / scale, h = png.height / scale;
  if (!SIZES.some(([sw, sh]) => sw === w && sh === h)) {
    throw new Error(`sprite is ${w}×${h}; want 28×28 (front), 24×20 (back) or 16×16 (tile)`);
  }
  const rgb = pal.map(hex);
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const i = (y * scale * png.width + x * scale) * 4;
      if (png.data[i + 3] < 128) { row += '.'; continue; }
      let best = 0, bd = Infinity;
      rgb.forEach(([r, g, b], k) => {
        const d = (r - png.data[i]) ** 2 + (g - png.data[i + 1]) ** 2 + (b - png.data[i + 2]) ** 2;
        if (d < bd) { bd = d; best = k; }
      });
      row += best;
    }
    rows.push(row);
  }
  return rows;
}

// Matches ONLY a well-formed block — quoted rows, commas, whitespace — so a
// comment, a stray ')' or any other token inside makes the whole constant
// unmatched (parse throws) rather than a truncated replace (Codex, 2026-08-30).
// `export const NAME = S(` in chars.ts; `T.NAME = S(` in tiles.ts (pass 'T.WALL').
const spriteRe = (name) => new RegExp(`(?:export const |^)${name.replace('.', '\\.')} = S\\(((?:\\s*'[0123.]*'\\s*,?)*)\\s*\\)`, 'm');

/** Rows of `export const NAME = S('...', ...)` (chars.ts) or `T.NAME = S(...)` (tiles.ts). */
export function parseSprite(src, name) {
  const m = spriteRe(name).exec(src);
  if (!m) throw new Error(`no sprite constant ${name}`);
  return [...m[1].matchAll(/'([0123.]*)'/g)].map((x) => x[1]);
}

export function formatSprite(name, rows, eol = '\n') {
  return `export const ${name} = S(${eol}${rows.map((r) => `'${r}'`).join(`,${eol}`)});`;
}

/** Replace NAME's rows in place; the rest of the source is untouched. */
export function replaceSprite(src, name, rows) {
  parseSprite(src, name); // throws on a missing constant
  const eol = src.includes('\r\n') ? '\r\n' : '\n'; // keep the file's line endings
  return src.replace(spriteRe(name), (block) =>
    (block.startsWith('export') ? formatSprite(name, rows, eol) : formatSprite(name, rows, eol).replace('export const ', '')).slice(0, -1));
}

/** The OBJ_PAL key of the species whose `front:`/`back:` is CONST, from
 *  mons.ts source — evolutions share the base form's palette (GRAVLR →
 *  geodood), so the constant's own name is the wrong default. */
export function paletteFor(monsSrc, constName) {
  const at = monsSrc.search(new RegExp(`(front|back): ${constName}\\b`));
  const m = at >= 0 && /pal: OBJ_PAL\.(\w+)/.exec(monsSrc.slice(at, at + 400));
  if (!m) throw new Error(`no species uses ${constName}; pass --pal`);
  return m[1];
}

/** `OBJ_PAL.<name>` from palettes.ts source. */
export function parsePalette(src, name) {
  const m = new RegExp(`^\\s*${name}:\\s*\\[([^\\]]*)\\]`, 'm').exec(src);
  if (!m) throw new Error(`no palette ${name}`);
  return [...m[1].matchAll(/'(#[0-9a-f]{6})'/g)].map((x) => x[1]);
}
