// Canvas renderer: sprite decode (pure core + cached canvases), bitmap font,
// window chrome, GB shutter fade. Call initRenderer(canvas) before drawing.
import { FONT_HEX, MINI_GLYPHS } from '../data/font';
import type { SpriteRows } from '../data/sprites';
import type { Palette } from '../data/palettes';
import { G } from '../state';

export const W = 160;
export const H = 144;
export const TILE = 16;

export let ctx: CanvasRenderingContext2D;

export function initRenderer(canvas: HTMLCanvasElement): void {
  ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
}

// ── Sprite decode ────────────────────────────────────────────────────────
export interface DecodedPixel {
  x: number;
  y: number;
  shade: number; // palette index 0..3
}

/** Pure part of decode(): pixel list from rows. Unit-testable without DOM. */
export function decodePixels(rows: readonly string[], flip?: boolean): DecodedPixel[] {
  const h = rows.length;
  const w = rows[0].length;
  const out: DecodedPixel[] = [];
  for (let y = 0; y < h; y++) {
    const r = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = r[x];
      if (ch === '.') continue;
      out.push({ x: flip ? w - 1 - x : x, y, shade: +ch });
    }
  }
  return out;
}

const spriteCache = new Map<string, HTMLCanvasElement>();
export function decode(rows: SpriteRows, pal: Palette, flip?: boolean): HTMLCanvasElement {
  const key = rows._id + '|' + pal.join('') + (flip ? '|f' : '');
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  for (const p of decodePixels(rows, flip)) {
    g.fillStyle = pal[p.shade];
    g.fillRect(p.x, p.y, 1, 1);
  }
  spriteCache.set(key, c);
  return c;
}

// ── Bitmap font ──────────────────────────────────────────────────────────
/** CH6 playtest (2026-08-30): the house-style umlaut names (ARBÖK, HYPNÖZ,
 *  MACHÖKE) had been drawing as "ARB K" since SPR.B — U+00D6 is outside the
 *  8×8 table and glyphRows returned null, so the letter was silently
 *  skipped. One hand-drawn glyph, same LSB-left row format as FONT_HEX: the
 *  two dots, a gap, then a squat O. Add a row here when a name needs another
 *  accent; mon-data-lint refuses any name this table + FONT_HEX can't draw. */
const EXTRA_GLYPHS: Record<string, number[]> = {
  'Ö': [0x36, 0x00, 0x1c, 0x36, 0x63, 0x63, 0x36, 0x1c],
};

/** Pure glyph bitmap: 8 rows of bytes, LSB = leftmost pixel. Null outside
 *  ASCII 32..126 and EXTRA_GLYPHS. */
export function glyphRows(ch: string): number[] | null {
  const extra = EXTRA_GLYPHS[ch];
  if (extra) return extra;
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) return null;
  const off = (code - 32) * 16;
  const rows: number[] = [];
  for (let y = 0; y < 8; y++) rows.push(parseInt(FONT_HEX.substr(off + y * 2, 2), 16));
  return rows;
}

const fontCache = new Map<string, HTMLCanvasElement>();
export function glyph(ch: string, color: string): HTMLCanvasElement | null {
  const rows = glyphRows(ch);
  if (!rows) return null;
  const key = ch.charCodeAt(0) + color;
  let c = fontCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  for (let y = 0; y < 8; y++) {
    const b = rows[y];
    for (let x = 0; x < 8; x++) if (b & (1 << x)) g.fillRect(x, y, 1, 1);
  }
  fontCache.set(key, c);
  return c;
}

// Draw text; spacing 8px fits 18 chars in the dialog box (x 8..152). UX2.3:
// optional scale draws each 8x8 glyph at scale*8px, spaced to match (glyph
// origins stay 8px apart pre-scale, so callers position by unscaled columns).
export function text(str: string, x: number, y: number, color: string, scale = 1): void {
  for (let i = 0; i < str.length; i++) {
    const g = glyph(str[i], color);
    if (g) ctx.drawImage(g, x + i * 8 * scale, y, 8 * scale, 8 * scale);
  }
}
export function textC(str: string, y: number, color: string): void {
  text(str, Math.floor((W - str.length * 8) / 2), y, color);
}

// ── Mini font (3x5 numerals) ─────────────────────────────────────────────
// FLW.3 follow-up: the smaller set for secondary numbers beside 8px text
// (the shop's owned-count column). Pitch MINI_W = 3px glyph + 1px gap.
// Glyphs are MINI_H rows tall; drawn at y + MINI_BASELINE_DY they sit on
// the main font's cap baseline (row 6 of its 8px cell — caps and digits
// ink rows 0..6, row 7 is blank). Characters outside MINI_GLYPHS draw
// nothing, the same stance `text` takes outside ASCII. NOT a scaled-down
// `text`: nearest-neighbour shrinking an 8x8 glyph drops half its pixels.
export const MINI_W = 4;
const MINI_H = 5;
export const MINI_BASELINE_DY = 2;

/** Ink width of a mini string: glyphs at MINI_W pitch, no trailing gap. */
export function miniTextW(str: string): number {
  return str.length ? str.length * MINI_W - 1 : 0;
}

const miniCache = new Map<string, HTMLCanvasElement>();
function miniGlyph(ch: string, color: string): HTMLCanvasElement | null {
  const rows = MINI_GLYPHS[ch];
  if (!rows) return null;
  const key = ch + color;
  let c = miniCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = MINI_W - 1;
  c.height = MINI_H;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  for (let y = 0; y < MINI_H; y++) {
    for (let x = 0; x < MINI_W - 1; x++) if (rows[y][x] === '#') g.fillRect(x, y, 1, 1);
  }
  miniCache.set(key, c);
  return c;
}

export function miniText(str: string, x: number, y: number, color: string): void {
  for (let i = 0; i < str.length; i++) {
    const g = miniGlyph(str[i], color);
    if (g) ctx.drawImage(g, x + i * MINI_W, y);
  }
}

// ── tiny helpers ─────────────────────────────────────────────────────────
export function fill(color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
}
export function rect(x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export function drawWindow(x: number, y: number, w: number, h: number, pal: Palette): void {
  rect(x, y, w, h, pal[3]);
  rect(x + 1, y + 1, w - 2, 1, pal[0]);
  rect(x + 1, y + h - 2, w - 2, 1, pal[0]);
  rect(x + 1, y + 1, 1, h - 2, pal[0]);
  rect(x + w - 2, y + 1, 1, h - 2, pal[0]);
  rect(x + 3, y + 3, w - 6, 1, pal[1]);
  rect(x + 3, y + h - 4, w - 6, 1, pal[1]);
  rect(x + 3, y + 3, 1, h - 6, pal[1]);
  rect(x + w - 4, y + 3, 1, h - 6, pal[1]);
}

// ── Fades (GB shutter) ───────────────────────────────────────────────────
export function startFade(after: (() => void) | null): void {
  G.fadeDir = 1;
  G.afterFade = after;
}
export function drawFade(): void {
  if (G.fadeDir === 0 && G.fade === 0) return;
  if (G.fadeDir === 1) {
    G.fade++;
    if (G.fade >= 9) {
      G.fadeDir = -1;
      if (G.afterFade) {
        G.afterFade();
        G.afterFade = null;
      }
    }
  } else if (G.fadeDir === -1) {
    G.fade--;
    if (G.fade <= 0) {
      G.fade = 0;
      G.fadeDir = 0;
    }
  }
  const n = G.fade;
  ctx.fillStyle = '#000';
  for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, n);
}
