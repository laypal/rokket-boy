// FLW.3 follow-up: the 3x5 mini numerals the shop's owned-count column
// draws. Pure data + the width helper — no canvas. Pins the shape contract
// (exactly 5 rows x 3 columns, '#'/'.' only) so a mistyped glyph fails
// here instead of drawing a smear, and the character set the count column
// relies on (digits, the 'x' prefix, the '+1' flash).
import { describe, it, expect } from 'vitest';
import { MINI_GLYPHS } from '../src/data/font';
import { MINI_W, MINI_BASELINE_DY, miniTextW } from '../src/engine/renderer';

describe('mini font (3x5 numerals)', () => {
  it('every glyph is exactly 5 rows of 3 cells, drawn only with # and .', () => {
    for (const [ch, rows] of Object.entries(MINI_GLYPHS)) {
      expect(rows, `glyph "${ch}" row count`).toHaveLength(5);
      for (const r of rows) {
        expect(r, `glyph "${ch}" row "${r}"`).toMatch(/^[#.]{3}$/);
      }
    }
  });

  it('covers the characters the count column draws: 0-9, x, +', () => {
    for (const ch of '0123456789x+') {
      expect(MINI_GLYPHS[ch], `missing mini glyph "${ch}"`).toBeDefined();
    }
  });

  it('no two digits share a bitmap', () => {
    const seen = new Map<string, string>();
    for (const ch of '0123456789') {
      const key = MINI_GLYPHS[ch].join('/');
      expect(seen.get(key), `"${ch}" duplicates "${seen.get(key)}"`).toBeUndefined();
      seen.set(key, ch);
    }
  });

  it('pins the metrics the shop row budget derives from', () => {
    expect(MINI_W).toBe(4); // 3px glyph + 1px gap
    expect(MINI_BASELINE_DY).toBe(2); // rows 2..6 of the 8px cell = the main font's cap baseline
    expect(miniTextW('x99')).toBe(11); // 3 glyphs, no trailing gap
    expect(miniTextW('x1')).toBe(7);
    expect(miniTextW('')).toBe(0);
  });
});
