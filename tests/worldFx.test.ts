// World FX tests (F38 JCE.0, .paul/PLAN.md "PLAN — 2026-09-07"). Red-phase:
// src/systems/worldFx.ts does not exist yet. The table + worldFxFrame are
// pure (the battleFx.test idiom); the queue's draw side runs against a
// mocked renderer so ageing/dropping can be asserted without a canvas.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const drawn: { x: number; y: number }[] = [];
vi.mock('../src/engine/renderer', () => ({
  ctx: { drawImage: (_img: unknown, x: number, y: number) => drawn.push({ x, y }) },
  decode: vi.fn(() => ({})),
  TILE: 16,
}));

import {
  WORLD_FX, WORLD_FX_IDS, worldFxFrame, playWorldFx, clearWorldFx, activeWorldFx, drawWorldFx, alertPop, shakeOffset,
  type WorldFxId,
} from '../src/systems/worldFx';
import { FX_SPRITES } from '../src/data/sprites';
import { OBJ_PAL, BG_PAL } from '../src/data/palettes';

beforeEach(() => {
  clearWorldFx();
  drawn.length = 0;
});

describe('WORLD_FX table', () => {
  it('ids are exactly the four JCE.0 froze (alert is a glyph schedule, not a queued fx)', () => {
    expect([...WORLD_FX_IDS]).toEqual(['poof', 'heal', 'spark', 'dust']);
    expect(Object.keys(WORLD_FX).sort()).toEqual([...WORLD_FX_IDS].sort());
  });

  it('every part sits inside 0..len, from < to, on a real FX_SPRITES id and a real palette', () => {
    for (const id of WORLD_FX_IDS) {
      const fx = WORLD_FX[id];
      expect(fx.len, `${id}.len`).toBeGreaterThan(0);
      expect(fx.parts.length, `${id} has parts`).toBeGreaterThan(0);
      if (fx.pal) expect(OBJ_PAL[fx.pal], `${id}.pal "${fx.pal}"`).toBeDefined();
      for (const p of fx.parts) {
        expect(FX_SPRITES[p.sprite], `${id} part sprite "${p.sprite}"`).toBeDefined();
        expect(p.from, `${id} from>=0`).toBeGreaterThanOrEqual(0);
        expect(p.to, `${id} from<to`).toBeGreaterThan(p.from);
        expect(p.to, `${id} to<=len`).toBeLessThanOrEqual(fx.len);
      }
    }
  });
});

describe('worldFxFrame (pure)', () => {
  it('draws something on frame 0 and nothing at len, for every id', () => {
    for (const id of WORLD_FX_IDS) {
      expect(worldFxFrame(id, 0).length, `${id} @0`).toBeGreaterThan(0);
      expect(worldFxFrame(id, WORLD_FX[id].len), `${id} @len`).toEqual([]);
    }
  });

  it('poof frame 0 is the single centre puff at (4,4) — hand-derived from the table', () => {
    expect(worldFxFrame('poof', 0)).toEqual([{ sprite: 'puff', dx: 4, dy: 4 }]);
  });

  it('heal part 0 rises 12px over its 9-frame life: dy 8 at t=0, 8-floor(12*8/9)=-2 at t=8, gone at t=9', () => {
    expect(worldFxFrame('heal', 0)).toEqual([{ sprite: 'spark', dx: 0, dy: 8 }]);
    const t8 = worldFxFrame('heal', 8).find((p) => p.dx === 0);
    expect(t8).toEqual({ sprite: 'spark', dx: 0, dy: -2 });
    expect(worldFxFrame('heal', 9).some((p) => p.dx === 0 && p.dy < 0)).toBe(false);
  });

  it('is deterministic — the same (id, t) twice is deep-equal', () => {
    for (const id of WORLD_FX_IDS) {
      const mid = Math.floor(WORLD_FX[id].len / 2);
      expect(worldFxFrame(id, mid)).toEqual(worldFxFrame(id, mid));
    }
  });
});

describe('queue: play / age / drop / clear', () => {
  const pal = BG_PAL.hq;

  it('playWorldFx queues at t=0 in tile coords; activeWorldFx is read-only', () => {
    playWorldFx('poof', 3, 4);
    expect(activeWorldFx()).toEqual([{ id: 'poof', x: 3, y: 4, t: 0 }]);
  });

  it('drawWorldFx draws in world space (tile*16 - cam + part offset) and ages one frame per draw', () => {
    playWorldFx('poof', 3, 4);
    drawWorldFx(16, 0, pal);
    // frame 0 = the centre puff: 3*16-16+4 = 36, 4*16-0+4 = 68
    expect(drawn).toEqual([{ x: 36, y: 68 }]);
    expect(activeWorldFx()[0].t).toBe(1);
  });

  it('an fx leaves the queue once t reaches len; several fx age independently', () => {
    playWorldFx('spark', 0, 0);
    playWorldFx('poof', 1, 1);
    for (let i = 0; i < WORLD_FX.spark.len; i++) drawWorldFx(0, 0, pal);
    expect(activeWorldFx().map((f) => f.id as WorldFxId)).toEqual(['poof']);
    for (let i = WORLD_FX.spark.len; i < WORLD_FX.poof.len; i++) drawWorldFx(0, 0, pal);
    expect(activeWorldFx()).toEqual([]);
  });

  it('clearWorldFx empties the queue (landAt calls it so a warp never carries a puff across maps)', () => {
    playWorldFx('heal', 2, 2);
    clearWorldFx();
    expect(activeWorldFx()).toEqual([]);
  });
});

// ── JCE.3: the guard beats that are NOT queued fx — pure schedules ────────
describe('alertPop (JCE.3): the sighting `!` pops 4px and settles over 8 frames', () => {
  it('is the dy to ADD to the glyph: -4 -4 -3 -3 -2 -2 -1 -1 then 0 forever', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 47].map(alertPop)).toEqual([-4, -4, -3, -3, -2, -2, -1, -1, 0, 0, 0]);
  });
  it('never returns a positive offset (the pop only ever lifts)', () => {
    for (let t = -5; t < 60; t++) expect(alertPop(t)).toBeLessThanOrEqual(0);
  });
});

describe('shakeOffset (JCE.3): a screen-space ±1px jolt while frames remain', () => {
  it('is 0 with nothing left, else alternates -1/+1 by parity so the camera never drifts', () => {
    expect(shakeOffset(0)).toBe(0);
    expect(shakeOffset(-3)).toBe(0);
    expect([6, 5, 4, 3, 2, 1].map(shakeOffset)).toEqual([-1, 1, -1, 1, -1, 1]);
  });
});
