import { describe, it, expect } from 'vitest';
import { decodePixels, glyphRows } from '../src/engine/renderer';
import { T } from '../src/data/tiles';
import { BTN_A } from '../src/data/sprites';

describe('decodePixels', () => {
  it('maps shade chars to pixels and skips transparency', () => {
    const px = decodePixels(['01.', '.23']);
    expect(px).toEqual([
      { x: 0, y: 0, shade: 0 },
      { x: 1, y: 0, shade: 1 },
      { x: 1, y: 1, shade: 2 },
      { x: 2, y: 1, shade: 3 },
    ]);
  });

  it('mirrors x coordinates when flipped', () => {
    const px = decodePixels(['01.', '.23'], true);
    expect(px).toEqual([
      { x: 2, y: 0, shade: 0 },
      { x: 1, y: 0, shade: 1 },
      { x: 1, y: 1, shade: 2 },
      { x: 0, y: 1, shade: 3 },
    ]);
  });

  it('golden counts: FLOOR tile is fully opaque 16×16', () => {
    const px = decodePixels(T.FLOOR);
    expect(px).toHaveLength(256);
    expect(px.every((p) => p.shade === 1 || p.shade === 2)).toBe(true);
  });

  it('golden counts: a sprite with transparent corners decodes only its ink', () => {
    // F46 ART.4: PLANT lost its transparent corners (they showed the canvas
    // fill on the map), so the fixture is inline now.
    const rows = ['..00..', '.0330.', '033330', '033330', '.0330.', '..00..'];
    const px = decodePixels(rows);
    // independent count of non-'.' chars in the source rows
    const expected = rows.join('').replace(/\./g, '').length;
    expect(px).toHaveLength(expected);
    expect(px.length).toBeLessThan(256);
    expect(px.some((p) => p.x === 0 && p.y === 0)).toBe(false); // corner transparent
  });
});

describe('BTN_A — the press-A key (2026-09-09)', () => {
  it('is 10×10, ink on paper only, with an A that reads (crossbar row is solid ink)', () => {
    expect(BTN_A).toHaveLength(10);
    for (const row of BTN_A) {
      expect(row).toHaveLength(10);
      expect(row).toMatch(/^[03.]+$/);
    }
    expect(BTN_A[5]).toBe('0300000030');
    expect(BTN_A[0]).toBe('..000000..');
  });
});

describe('glyphRows', () => {
  it('returns 8 row bytes for printable ASCII', () => {
    const rows = glyphRows('A');
    expect(rows).toHaveLength(8);
    expect(rows!.some((b) => b > 0)).toBe(true);
  });
  it('space is blank', () => {
    expect(glyphRows(' ')!.every((b) => b === 0)).toBe(true);
  });
  it('returns null outside ASCII 32..126', () => {
    expect(glyphRows('')).toBeNull();
    expect(glyphRows('é')).toBeNull(); // é has no bitmap; Ö gained one in CH6 (EXTRA_GLYPHS) — pinned below
  });
});

// CH6 playtest (2026-08-30): the umlaut names had rendered with a gap since
// SPR.B — glyphRows returned null for Ö. Pin the hand-drawn glyph: two dots,
// a gap row, a squat O; anything else non-ASCII still falls out as null.
describe('glyphRows — the Ö umlaut (EXTRA_GLYPHS)', () => {
  it('draws Ö as 8 rows with the dots on top and nothing for other accents', () => {
    const o = glyphRows('Ö');
    expect(o).toEqual([0x36, 0x00, 0x1c, 0x36, 0x63, 0x63, 0x36, 0x1c]);
    expect(glyphRows('é')).toBeNull();
    expect(glyphRows('O')).not.toBeNull();
  });
});
