// CH7.0 §2 — the LIVE FLOOR: hazard.ts's pure shock and the world call site.
// A `z` tile bites the lead mon 1 hp on ARRIVAL, floors at 1 hp (a tile
// never faints anything), and RUBBER BOOTS silence it — no hp, no sound, no
// spark, no flash. The world half drives worldUpdate on a fixture grid the
// way tests/world-encounter.test.ts does, with the engine IO stubbed (the
// intro.test idiom) so worldDraw can age the hit flash and the palette it
// asks for can be asserted.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sfxCalls: string[] = [];
const palsAsked: string[] = [];
vi.mock('../src/engine/renderer', () => ({
  ctx: { drawImage: vi.fn() },
  decode: vi.fn(),
  fill: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  textC: vi.fn(),
  glyph: vi.fn(() => null),
  miniText: vi.fn(),
  miniTextW: vi.fn(() => 0),
  MINI_BASELINE_DY: 0,
  startFade: (cb: () => void) => cb(),
  drawWindow: vi.fn(),
  clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
  W: 160,
  H: 144,
  TILE: 16,
}));
vi.mock('../src/engine/audio', () => ({
  Audio2: { play: vi.fn(), sfx: (n: string) => sfxCalls.push(n), stop: vi.fn() },
}));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (): boolean => false,
    hit: (): boolean => false,
    dirHeld: (): null => null,
  },
}));
vi.mock('../src/engine/charFrames', () => {
  const dirs = { up: [{}, {}, {}], down: [{}, {}, {}], left: [{}, {}, {}], right: [{}, {}, {}] };
  return {
    CHAR_FRAMES: { player: dirs, guard: dirs, myowth: dirs },
    ensurePlayerFrames: (_gear: string[], pal = 'player') => palsAsked.push(pal),
  };
});

import { shockLead, BOOTS_ITEM, SHOCK_DAMAGE } from '../src/systems/hazard';
import { worldUpdate, worldDraw, clearMapGuardRuntime, hurtFramesLeft, shakeFramesLeft, LIVE_TILE, HURT_FRAMES } from '../src/systems/world';
import { activeWorldFx, clearWorldFx } from '../src/systems/worldFx';
import { MAPS } from '../src/data/maps';
import { WALKABLE } from '../src/data/tiles';
import { G } from '../src/state';
import { quest, resetQuest } from '../src/systems/quest';
import { makeMon, maxHp } from '../src/systems/mon';
import { SPECIES } from '../src/data/mons';
import type { MapDef, MapId, MonInstance } from '../src/types';

function mon(hp: number): MonInstance {
  const m = makeMon(SPECIES.koffink, 5);
  m.hp = hp;
  return m;
}

describe('shockLead (pure)', () => {
  it('takes SHOCK_DAMAGE off the first mon with hp > 0 and returns it', () => {
    const party = [mon(0), mon(10), mon(10)];
    expect(shockLead(party, false)).toBe(SHOCK_DAMAGE);
    expect(party[0].hp).toBe(0);
    expect(party[1].hp).toBe(10 - SHOCK_DAMAGE);
    expect(party[2].hp).toBe(10);
  });
  it('floors at 1 hp — never faints from a tile', () => {
    const party = [mon(1)];
    expect(shockLead(party, false)).toBe(0);
    expect(party[0].hp).toBe(1);
    const two = [mon(2)];
    expect(shockLead(two, false)).toBe(1);
    expect(two[0].hp).toBe(1);
  });
  it('boots negate everything', () => {
    const party = [mon(10)];
    expect(shockLead(party, true)).toBe(0);
    expect(party[0].hp).toBe(10);
  });
  it('an all-fainted party takes nothing and does not crash', () => {
    const party = [mon(0), mon(0)];
    expect(shockLead(party, false)).toBe(0);
    expect(shockLead([], false)).toBe(0);
  });
  it('BOOTS_ITEM is the RUBBER BOOTS id', () => {
    expect(BOOTS_ITEM).toBe('RUBBER BOOTS');
  });
});

// ── world call site ────────────────────────────────────────────────────────
const STRIP = ['########', '#zzzzz #', '########'];
function makeMap(rows: string[]): MapDef {
  return {
    id: 'corner' as MapId,
    name: 'TEST',
    pal: MAPS.corner.pal,
    music: MAPS.corner.music,
    grid: rows.map((r) => r.split('')),
    w: rows[0].length,
    h: rows.length,
    npcs: [],
    warps: {},
    signs: {},
    items: {},
    scripts: {},
  };
}
/** Complete one WALK step west onto the tile at (x-1, y). */
function stepLeftOnto(): void {
  G.player.dir = 'left';
  G.player.moving = true;
  G.player.prog = 15;
  G.player.step = 0;
  worldUpdate();
}
/** Age every draw-only counter (the flash, the jolt) to zero. */
function drain(): void {
  let guard = 0;
  while ((hurtFramesLeft() > 0 || shakeFramesLeft() > 0) && guard++ < 50) worldDraw();
}

describe('walking onto LIVE_TILE (world.ts)', () => {
  beforeEach(() => {
    resetQuest();
    G.heatState = {};
    G.state = 'world';
    G.battle = null;
    G.frame = 0;
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.map = makeMap(STRIP);
    G.player.x = 6;
    G.player.y = 1;
    sfxCalls.length = 0;
    palsAsked.length = 0;
    clearWorldFx();
    clearMapGuardRuntime('corner');
    drain();
  });
  afterEach(() => {
    drain();
    G.map = MAPS.hq;
    G.state = 'world';
    G.battle = null;
    clearWorldFx();
  });

  it('LIVE_TILE is `z`; `z` and `e` are registered walkable', () => {
    expect(LIVE_TILE).toBe('z');
    expect(WALKABLE.has('z')).toBe(true);
    expect(WALKABLE.has('e')).toBe(true);
  });

  it('five steps, no boots: the lead loses 5 hp — a hurt sound, a flash, a jolt and a spark each time', () => {
    const full = maxHp(SPECIES.koffink, 5);
    for (let i = 1; i <= 5; i++) {
      stepLeftOnto();
      expect(G.player.x).toBe(6 - i);
      expect(G.party[0].hp).toBe(full - i);
      expect(hurtFramesLeft()).toBe(HURT_FRAMES);
      expect(shakeFramesLeft()).toBeGreaterThan(0);
      expect(activeWorldFx().some((f) => f.id === 'spark' && f.x === 6 - i && f.y === 1)).toBe(true);
      drain();
    }
    expect(sfxCalls.filter((n) => n === 'hurt')).toHaveLength(5);
    expect(G.state).toBe('world');
  });

  it('stops at 1 hp: the strip never faints the lead, and a hit that costs nothing shows nothing', () => {
    G.party[0].hp = 2;
    stepLeftOnto();
    expect(G.party[0].hp).toBe(1);
    expect(hurtFramesLeft()).toBe(HURT_FRAMES);
    drain();
    sfxCalls.length = 0;
    stepLeftOnto();
    expect(G.party[0].hp).toBe(1);
    expect(hurtFramesLeft()).toBe(0);
    expect(sfxCalls).not.toContain('hurt');
  });

  it('with RUBBER BOOTS: no hp, no sound, no flash, no spark', () => {
    quest.items.push(BOOTS_ITEM);
    const full = maxHp(SPECIES.koffink, 5);
    for (let i = 1; i <= 5; i++) stepLeftOnto();
    expect(G.player.x).toBe(1);
    expect(G.party[0].hp).toBe(full);
    expect(hurtFramesLeft()).toBe(0);
    expect(sfxCalls).not.toContain('hurt');
    expect(activeWorldFx()).toHaveLength(0);
  });

  it('a plain floor tile never shocks', () => {
    G.map = makeMap(['#######', '#     #', '#######']);
    G.player.x = 5;
    const full = maxHp(SPECIES.koffink, 5);
    stepLeftOnto();
    expect(G.party[0].hp).toBe(full);
    expect(hurtFramesLeft()).toBe(0);
  });

  it('the player is drawn in the hurt palette for HURT_FRAMES draws, then the player palette returns', () => {
    stepLeftOnto();
    palsAsked.length = 0;
    for (let i = 0; i < HURT_FRAMES + 2; i++) worldDraw();
    expect(palsAsked.slice(0, HURT_FRAMES).every((p) => p === 'hurt')).toBe(true);
    expect(palsAsked[HURT_FRAMES]).toBe('player');
    expect(palsAsked[HURT_FRAMES + 1]).toBe('player');
  });
});
