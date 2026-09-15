// F46 ART.5 — the sea past the S.S. ANN's deck: `S` is WATER_A rotated 4 px
// a frame (four frames, a seamless 16 px loop) on the shared tile cycle.
import { describe, it, expect } from 'vitest';
import { T, TILES, WALKABLE } from '../src/data/tiles';
import { S, cycleFrame, rotateRows } from '../src/data/sprites';
import { tileClass } from '../src/systems/mapScreen';
import { dockMap } from '../src/data/maps/dock';
import { deck1Map } from '../src/data/maps/deck1';
import { bridgeMap } from '../src/data/maps/bridge';

const rot = (r: string, n: number): string => r.slice(n) + r.slice(0, n);

describe('rotateRows', () => {
  it('rotates every row left by dx, wrapping, with a fresh cache id', () => {
    const a = S('0123', '3210');
    const b = rotateRows(a, 1);
    expect([...b]).toEqual(['1230', '2103']);
    expect(b._id).not.toBe(a._id);
    expect(rotateRows(a, 1)._id).toBe(b._id); // deterministic: decode() caches by _id
  });
});

describe('the S sea tile', () => {
  it('is four frames, each WATER_A rotated 4 px further left, so the loop is seamless', () => {
    const frames = TILES['S'];
    expect(frames).toHaveLength(4);
    frames.forEach((f, k) => {
      expect(f).toHaveLength(16);
      f.forEach((row, y) => expect(row, `frame ${k} row ${y}`).toBe(rot(T.WATER_A[y], 4 * k)));
    });
  });

  it('blocks like the river and reads as water on the MAP detail view', () => {
    expect(WALKABLE.has('S')).toBe(false);
    expect(tileClass('S')).toBe('water');
  });

  it('is what the ship maps use for the sea; the river keeps `w` (a sideways scroll would flow across it)', () => {
    const chars = (rows: string[]) => new Set(rows.join(''));
    expect(chars(dockMap.grid.map((r) => r.join('')))).toContain('S');
    expect(chars(deck1Map.grid.map((r) => r.join('')))).toContain('S');
    expect(chars(dockMap.grid.map((r) => r.join('')))).not.toContain('w');
    expect(chars(bridgeMap.grid.map((r) => r.join('')))).toContain('w');
  });
});

describe('cycleFrame', () => {
  it('steps every 32 frames and cycles through however many frames a tile has', () => {
    const two = TILES['w'], four = TILES['S'];
    expect(cycleFrame(two, 0)).toBe(two[0]);
    expect(cycleFrame(two, 32)).toBe(two[1]);
    expect(cycleFrame(two, 64)).toBe(two[0]);
    expect([0, 32, 64, 96, 128].map((f) => four.indexOf(cycleFrame(four, f)))).toEqual([0, 1, 2, 3, 0]);
  });
});
