// JCE.9 / F46 ART.2 — the rubble kick. Frames are data (tiles.ts), the
// rustle records the walk direction, and the draw path picks 2 px → 1 px →
// settled over one tile of walking.
import { describe, it, expect, beforeEach } from 'vitest';
import { RUBBLE_KICK, T } from '../src/data/tiles';
import { worldUpdate, rustleAt, rustleFrame } from '../src/systems/world';
import { G } from '../src/state';
import type { MapDef, Dir } from '../src/types';

const DIRS: Dir[] = ['left', 'right', 'up', 'down'];

describe('RUBBLE_KICK frames (ART.2)', () => {
  it('eight 16×16 frames, border row/column untouched, each a real move', () => {
    const seen = new Set<string>([T.RUBBLE.join('\n')]);
    for (const d of DIRS) {
      expect(RUBBLE_KICK[d], d).toHaveLength(2);
      for (const f of RUBBLE_KICK[d]) {
        expect(f.length, `${d} rows`).toBe(16);
        expect(f.every((r) => r.length === 16 && /^[0123.]+$/.test(r)), `${d} row width/charset`).toBe(true);
        expect(f[0], `${d} border row`).toBe(T.RUBBLE[0]);
        expect(f.map((r) => r[0]).join(''), `${d} border column`).toBe(T.RUBBLE.map((r) => r[0]).join(''));
        const key = f.join('\n');
        expect(seen.has(key), `${d} frame differs from base and siblings`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('rustleFrame steps 2 px → 1 px → settled over the 16-frame timer', () => {
    expect(rustleFrame({ t: 16, dir: 'left' })).toBe(RUBBLE_KICK.left[0]);
    expect(rustleFrame({ t: 11, dir: 'left' })).toBe(RUBBLE_KICK.left[0]);
    expect(rustleFrame({ t: 10, dir: 'left' })).toBe(RUBBLE_KICK.left[1]);
    expect(rustleFrame({ t: 6, dir: 'left' })).toBe(RUBBLE_KICK.left[1]);
    expect(rustleFrame({ t: 5, dir: 'left' })).toBeUndefined();
  });
});

describe('rustle records the walk direction (JCE.9)', () => {
  beforeEach(() => {
    const grid = ['#######', '# ~~~ #', '#######'].map((r) => r.split(''));
    G.map = { id: 'corner', name: 'T', pal: 'green', music: '', grid, w: 7, h: 3, npcs: [], signs: {}, items: {}, warps: {}, scripts: {} } as unknown as MapDef;
    G.state = 'world';
    G.battle = null;
    G.player.x = 2;
    G.player.y = 1;
    G.player.dir = 'right';
    G.player.moving = true; // mid-step onto (3,1), as tryMove leaves it
    G.player.prog = 0;
    G.player.turnLock = 0;
  });

  it('arriving on `~` records the tile with the step direction', () => {
    for (G.frame = 1; G.frame <= 16 && G.player.moving; G.frame++) worldUpdate();
    expect(G.player.x).toBe(3);
    const r = rustleAt(3, 1);
    expect(r?.dir).toBe('right');
    expect(r?.t).toBe(16);
    expect(rustleAt(2, 1)).toBeUndefined(); // (2,1) is `#`-adjacent floor, never rustles
  });
});
