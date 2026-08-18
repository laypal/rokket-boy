// ONB.8: shape tests for the assets the cold open adds. Pixel rows are hand
// authored, so a miscounted row is the likeliest bug in the whole card.
import { describe, it, expect } from 'vitest';
import { T, TILES } from '../src/data/tiles';
import { BG_PAL, ALERT } from '../src/data/palettes';
import { MAPS } from '../src/data/maps';
import { ZUBATT_OW_A, ZUBATT_OW_B } from '../src/data/chars';
import { MON_WALKERS } from '../src/systems/world';

const TOWER_TILES = ['FACADE', 'WIN_LIT', 'WIN_DARK', 'ROOF'] as const;

describe('tower tiles', () => {
  it.each(TOWER_TILES)('%s is 16 rows of 16 chars', (name) => {
    const rows = T[name];
    expect(rows, `T.${name} missing`).toBeDefined();
    expect(rows).toHaveLength(16);
    for (const r of rows) expect(r).toHaveLength(16);
  });

  it.each(TOWER_TILES)('%s uses only shades 0-3', (name) => {
    for (const r of T[name]) expect(r).toMatch(/^[0-3]{16}$/);
  });

  it('registers the tower tile chars', () => {
    for (const ch of ['F', 'l', 'k', 'A']) {
      expect(TILES[ch], `tile char "${ch}" unregistered`).toBeDefined();
    }
  });
});

describe('tower palette', () => {
  it('is five slots ending in ALERT, like every other BG palette', () => {
    expect(BG_PAL.tower).toHaveLength(5);
    expect(BG_PAL.tower[4]).toBe(ALERT);
  });
});

describe('tower map', () => {
  it('is tall and exactly one screen wide', () => {
    expect(MAPS.tower.w).toBe(10);
    expect(MAPS.tower.h).toBe(30);
  });

  it('is a backdrop: no npcs, no warps out', () => {
    expect(MAPS.tower.npcs).toEqual([]);
    expect(Object.keys(MAPS.tower.warps)).toEqual([]);
  });

  it('puts the roof and the one lit window where the camera ends (row 5/6)', () => {
    // 2c ends with the camera at the top of the map: rows 0-4 are sky so the
    // roof (row 5) and the lit top floor (row 6) sit BELOW the text band.
    expect(MAPS.tower.grid[5].join('')).toBe('..AAAAAA..');
    expect(MAPS.tower.grid[6].join('')).toBe('..FFlFFF..');
    expect(MAPS.tower.grid[27].join('')).toBe('..FFppFF..'); // R sign
    expect(MAPS.tower.grid[28].join('')).toBe('..FFooFF..'); // door
  });
});

describe('zubatt overworld frames', () => {
  it.each([['A', ZUBATT_OW_A], ['B', ZUBATT_OW_B]] as const)(
    'frame %s is 16 rows of 16 chars',
    (_name, rows) => {
      expect(rows).toHaveLength(16);
      for (const r of rows) expect(r).toHaveLength(16);
    },
  );

  it.each([['A', ZUBATT_OW_A], ['B', ZUBATT_OW_B]] as const)(
    'frame %s uses shades 0-3 and transparency only',
    (_name, rows) => {
      for (const r of rows) expect(r).toMatch(/^[0-3.]{16}$/);
    },
  );

  it('the two frames differ, or the wings do not flap', () => {
    expect(ZUBATT_OW_A.join('')).not.toBe(ZUBATT_OW_B.join(''));
  });

  it('mon walkers are a set, not a chain of name checks', () => {
    expect(MON_WALKERS.has('myowth')).toBe(true);
    expect(MON_WALKERS.has('zubatt')).toBe(true);
    expect(MON_WALKERS.has('grunt')).toBe(false);
  });

  it('a wild zubatt stands on Mt Moon for beat 1a', () => {
    const z = MAPS.moon1.npcs.find((n) => n.char === 'zubatt');
    expect(z).toBeDefined();
    expect(MAPS.moon1.grid[z!.y][z!.x]).toBe(' ');
  });
});
