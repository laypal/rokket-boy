// TOOL.1 — the sprite round-trip (shade strings ⇄ PNG). The lib is plain
// JS under scripts/ (node runs it with no build step); the .d.mts beside it
// lets this suite import it under `tsc --noEmit`.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { SPECIES } from '../src/data/mons';
import { OBJ_PAL } from '../src/data/palettes';
import {
  formatSprite, paletteFor, parsePalette, parseSprite, pngToRows, replaceSprite, rowsToPng, validateRows,
} from '../scripts/sprite-io-lib.mjs';

const CHARS = readFileSync(new URL('../src/data/chars.ts', import.meta.url), 'utf8');
const MONS = readFileSync(new URL('../src/data/mons.ts', import.meta.url), 'utf8');
const PALS = readFileSync(new URL('../src/data/palettes.ts', import.meta.url), 'utf8');

describe('sprite-io: round-trip identity', () => {
  it('every species front and back survives rows → PNG → rows byte-identical', () => {
    for (const [key, sp] of Object.entries(SPECIES)) {
      for (const [slot, rows] of [['front', sp.front], ['back', sp.back]] as const) {
        const png = PNG.sync.read(rowsToPng([...rows], sp.pal, 1));
        expect(pngToRows(png, sp.pal), `${key} ${slot}`).toEqual([...rows]);
      }
    }
  });

  it('the 4× contact sheet decodes to the same rows when sampled', () => {
    const rows = [...SPECIES.gastlee.front];
    const png = PNG.sync.read(rowsToPng(rows, SPECIES.gastlee.pal, 4));
    expect(png.width).toBe(28 * 4);
    expect(pngToRows(png, SPECIES.gastlee.pal, 4)).toEqual(rows);
  });
});

describe('sprite-io: quantiser', () => {
  const pal = ['#000000', '#404040', '#808080', '#ffffff'];
  it('snaps off-palette colours to the nearest shade and alpha to transparent', () => {
    const png = new PNG({ width: 16, height: 16 }); // pngjs zero-fills: alpha 0 everywhere else
    // near-black, near-mid-grey, fully transparent white
    png.data.set([0x10, 0x10, 0x10, 255, 0x90, 0x90, 0x90, 255, 255, 255, 255, 0]);
    expect(pngToRows(png, pal)[0]).toBe('02' + '.'.repeat(14));
  });
  it('rejects a non-battle size', () => {
    const png = new PNG({ width: 27, height: 28 });
    expect(() => pngToRows(png, pal)).toThrow(/27×28/);
  });
  it('rejects a scale that is not a positive integer dividing both sides (Codex)', () => {
    expect(() => pngToRows(new PNG({ width: 42, height: 42 }), pal, 1.5)).toThrow(/scale 1.5/);
    expect(() => pngToRows(new PNG({ width: 56, height: 57 }), pal, 2)).toThrow(/scale 2/);
    expect(() => pngToRows(new PNG({ width: 28, height: 28 }), pal, 0)).toThrow(/scale 0/);
  });
});

describe('sprite-io: validator (the spriter agent step 4, as a function)', () => {
  it('passes every shipped sprite', () => {
    for (const sp of Object.values(SPECIES)) {
      expect(validateRows([...sp.front])).toEqual([]);
      expect(validateRows([...sp.back])).toEqual([]);
    }
  });
  it('names the row and the fault', () => {
    const bad = Array.from({ length: 28 }, () => '.'.repeat(28));
    bad[5] = '.'.repeat(27);
    bad[6] = '.'.repeat(27) + '9';
    expect(validateRows(bad)).toEqual(['row 5: width 27 (want 28)', 'row 6: bad char "9"']);
    expect(validateRows(bad.slice(0, 10))).toContain('10 rows (want 28, 20 or 16)');
  });
});

describe('sprite-io: chars.ts / palettes.ts text parsing', () => {
  it('parseSprite returns the same rows the module exports', () => {
    expect(parseSprite(CHARS, 'GASTLEE_FRONT')).toEqual([...SPECIES.gastlee.front]);
    expect(parseSprite(CHARS, 'GRAVLR_BACK')).toEqual([...SPECIES.gravlr.back]);
    expect(() => parseSprite(CHARS, 'NOPE_FRONT')).toThrow(/NOPE_FRONT/);
  });
  it('fails closed on a block it cannot parse whole, instead of truncating (Codex)', () => {
    const src = "export const ODD_FRONT = S(\n'..', // (a comment)\n'01');\nexport const NEXT = S(\n'..');";
    expect(() => parseSprite(src, 'ODD_FRONT')).toThrow(/ODD_FRONT/);
    expect(() => replaceSprite(src, 'ODD_FRONT', ['..', '01'])).toThrow(/ODD_FRONT/);
    expect(parseSprite(src, 'NEXT')).toEqual(['..']);
  });
  it('every S( block in chars.ts and tiles.ts is one the strict matcher accepts', () => {
    const TILES = readFileSync(new URL('../src/data/tiles.ts', import.meta.url), 'utf8');
    for (const [file, src] of [['chars.ts', CHARS], ['tiles.ts', TILES]] as const) {
      const names = [...src.matchAll(/^(?:export const |)(T\.\w+|\w+) = S\(/gm)].map((m) => m[1]);
      expect(names.length, file).toBeGreaterThan(0);
      for (const n of names) expect(parseSprite(src, n).length, `${file} ${n}`).toBeGreaterThan(0);
    }
    expect(validateRows(parseSprite(TILES, 'T.WALL'))).toEqual([]);
    expect(parseSprite(replaceSprite(TILES, 'T.WALL', parseSprite(TILES, 'T.FLOOR')), 'T.WALL')).toEqual(parseSprite(TILES, 'T.FLOOR'));
  });
  it('parsePalette returns OBJ_PAL entries', () => {
    expect(parsePalette(PALS, 'machopp')).toEqual(OBJ_PAL.machopp);
    expect(parsePalette(PALS, 'player')).toEqual(OBJ_PAL.player);
  });
  it('paletteFor follows mons.ts, so evolutions get the line palette', () => {
    expect(paletteFor(MONS, 'GRAVLR_FRONT')).toBe('geodood');
    expect(paletteFor(MONS, 'MACHOKE_BACK')).toBe('machopp');
    expect(() => paletteFor(MONS, 'NOPE_FRONT')).toThrow(/--pal/);
  });
  it('formatSprite + replaceSprite round-trip the source block', () => {
    const rows = parseSprite(CHARS, 'MACHOPP_FRONT');
    const flipped = rows.map((r) => r.split('').reverse().join(''));
    const out = replaceSprite(CHARS, 'MACHOPP_FRONT', flipped);
    expect(parseSprite(out, 'MACHOPP_FRONT')).toEqual(flipped);
    expect(parseSprite(out, 'MACHOPP_BACK')).toEqual(parseSprite(CHARS, 'MACHOPP_BACK'));
    expect(replaceSprite(out, 'MACHOPP_FRONT', rows)).toBe(CHARS);
    expect(formatSprite('X_FRONT', ['..', '01'])).toBe("export const X_FRONT = S(\n'..',\n'01');");
  });
});
