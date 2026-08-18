// Map integrity lints (CH2.2): every map ships a grid that agrees with its
// own w/h, only uses registered tile chars, isn't an orphan (has a warp
// out), and never puts a warp on a tile you can't stand on. Warp TARGET
// existence/walkability is already covered by world.test.ts ("every static
// warp target exists and lands on a walkable tile") — this file only checks
// sources, so the two suites don't overlap.
import { describe, it, expect } from 'vitest';
import { MAPS } from '../src/data/maps';
import { TILES, WALKABLE } from '../src/data/tiles';

const CAVE_MAX_W = 28;
const CAVE_MAX_H = 20;
const CAVE_IDS = ['moon1', 'moon2', 'moonDig', 'outskirts', 'bridge'];

describe('map lints', () => {
  it('every map grid is rectangular: row count matches h, every row length matches w', () => {
    for (const map of Object.values(MAPS)) {
      expect(map.grid.length, `${map.id} row count`).toBe(map.h);
      for (const [y, row] of map.grid.entries()) {
        expect(row.length, `${map.id} row ${y} width`).toBe(map.w);
      }
    }
  });

  it('every grid char is a registered tile', () => {
    for (const map of Object.values(MAPS)) {
      for (const [y, row] of map.grid.entries()) {
        for (const [x, ch] of row.entries()) {
          expect(TILES[ch], `${map.id} (${x},${y}) unregistered tile "${ch}"`).toBeDefined();
        }
      }
    }
  });

  it('rubble shimmers: `~` carries two rectangular 16×16 frames (QOL.3)', () => {
    const frames = TILES['~'];
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame.length).toBe(16);
      for (const row of frame) expect(row.length).toBe(16);
    }
  });

  it('every map has at least one warp (no orphan maps)', () => {
    for (const map of Object.values(MAPS)) {
      if (map.id === 'tower') continue; // ONB.8 backdrop — nothing walks it
      expect(Object.keys(map.warps).length, `${map.id} has no warps`).toBeGreaterThan(0);
    }
  });

  it('every warp source tile is walkable (a warp you cannot stand on is dead)', () => {
    for (const map of Object.values(MAPS)) {
      for (const key of Object.keys(map.warps)) {
        const [xs, ys] = key.split(',');
        const x = Number(xs);
        const y = Number(ys);
        const tile = map.grid[y]?.[x];
        expect(WALKABLE.has(tile), `${map.id} warp source ${key} tile "${tile}"`).toBe(true);
      }
    }
  });

  it('cave maps + CH3.2 span maps stay within the 28x20 build cap', () => {
    for (const id of CAVE_IDS) {
      const map = MAPS[id as keyof typeof MAPS];
      expect(map.w, `${id} width`).toBeLessThanOrEqual(CAVE_MAX_W);
      expect(map.h, `${id} height`).toBeLessThanOrEqual(CAVE_MAX_H);
    }
  });
});

// ONB.8: the tower is scenery. If something ever warps there the player can
// walk around inside a backdrop that has no collision design and no way out.
describe('tower is a backdrop', () => {
  it('no map warps to it', () => {
    for (const map of Object.values(MAPS)) {
      for (const [from, w] of Object.entries(map.warps)) {
        expect(w[0], `${map.id} (${from}) warps to the tower backdrop`).not.toBe('tower');
      }
    }
  });
});
