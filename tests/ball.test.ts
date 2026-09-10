// F43 BALL.0/1 — the PRO BALL — and CH7.0 §5's `EncounterDef.onCatch`.
// Whole battles under a seeded rng with the engine IO stubbed (the
// battle.test idiom, copied per-file). Pins: the ITEM menu lists a ball with
// ballMod > 1 and throws it through the SAME path as SWIPE (one rng call,
// the mod the only difference); SWIPE throws the one ball kind held or opens
// a balls-only pick when there are two; a trainer's mon and an uncatchable refuse the PRO BALL without
// consuming it; and a catch prefers onCatch over onWin when one exists.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  ctx: { drawImage: vi.fn() },
  decode: vi.fn(),
  fill: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  drawWindow: vi.fn(),
  clamp: (v: number, a: number, z: number) => Math.max(a, Math.min(z, v)),
  startFade: (cb: () => void) => cb(),
  W: 160,
  H: 144,
  TILE: 16,
}));
vi.mock('../src/engine/audio', () => ({
  Audio2: { play: vi.fn(), sfx: vi.fn() },
}));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (k: string): boolean => keys.down.has(k),
    hit: (k: string): boolean => keys.pressed.has(k),
    endFrame: (): void => keys.pressed.clear(),
    dirHeld: (): null => null,
  },
}));

import { G } from '../src/state';
import { startBattle, battleUpdate, setBattleRng, battleItems, type BattleState } from '../src/systems/battle';
import { BALL_ITEM, ITEMS } from '../src/data/items';
import { ENCOUNTERS } from '../src/data/encounters';
import { SPECIES } from '../src/data/mons';
import { makeMon, maxHp } from '../src/systems/mon';
import { catchChance } from '../src/systems/catch';
import { usableInBattle } from '../src/systems/inventory';
import { mulberry32 } from '../src/engine/rng';
import { quest, resetQuest } from '../src/systems/quest';
import type { ScriptStep } from '../src/types';

const PRO = 'PRO BALL';

function frame(): void {
  battleUpdate();
  keys.pressed.clear();
}
function tap(k: string): void {
  keys.pressed.add(k);
  frame();
}
function b(): BattleState {
  return G.battle!;
}
function popMsg(): void {
  const s = b();
  const total = s.msg!.lines.join('').length;
  keys.down.add('a');
  let guard = 0;
  while (s.msgChars < total && guard++ < 500) frame();
  keys.down.delete('a');
  tap('a');
}
function settle(): void {
  let guard = 0;
  while (G.battle && guard++ < 300) {
    const s = G.battle;
    if (s.msg) popMsg();
    else if (s.queue.length || s.phase === 'slide' || s.phase === 'open' || s.phase === 'anim') frame();
    else return;
  }
  if (G.battle) throw new Error('settle(): battle never became interactive');
}
let follow: ScriptStep[] | null | undefined;
function begin(encId: string): void {
  follow = undefined;
  startBattle(encId, (f) => (follow = f));
}
/** Deterministically find a seed whose first roll satisfies pred. */
function seedWhere(pred: (roll: number) => boolean): number {
  let s = 0;
  while (!pred(mulberry32(s)())) if (++s > 100_000) throw new Error('seedWhere: no seed satisfies pred — is p clamped to 0 or 1?');
  return s;
}
/** ITEM (root index 3) → the first pack row → A. */
function throwFromPack(): void {
  tap('down');
  tap('down');
  tap('down'); // sel 3 = ITEM
  tap('a');
  expect(b().phase).toBe('item');
  tap('a'); // row 0
}

beforeEach(() => {
  resetQuest();
  G.party = [makeMon(SPECIES.koffink, 5)];
  G.box = [];
  G.lastHq = { map: 'hq', x: 9, y: 7 };
  G.battle = null;
  G.state = 'world';
  keys.down.clear();
  keys.pressed.clear();
  ENCOUNTERS.test_wild = { foe: { species: 'voltorbb', lv: 3 }, winText: [], onWin: [], onLose: [], onFlee: [] };
  ENCOUNTERS.test_catch = {
    foe: { species: 'voltorbb', lv: 3 },
    winText: [],
    onWin: [{ setFlag: 'ch7Beaten' }],
    onCatch: [{ setFlag: 'ch7Caught' }],
    onLose: [],
    onFlee: [{ setFlag: 'ch7Fled' }],
  };
});
afterEach(() => {
  setBattleRng(Math.random);
  delete ENCOUNTERS.test_wild;
  delete ENCOUNTERS.test_catch;
});

describe('BALL.0 data', () => {
  it('PRO BALL is a priced ball with ballMod 2.5; the ROKKET BALL has no mod', () => {
    expect(ITEMS[PRO]).toMatchObject({ kind: 'ball', ballMod: 2.5 });
    expect(ITEMS[PRO].price).toBeGreaterThan(0);
    expect(ITEMS[BALL_ITEM].ballMod).toBeUndefined();
  });
  it('only a ball with ballMod > 1 is usable from the battle pack', () => {
    expect(usableInBattle(PRO)).toBe(true);
    expect(usableInBattle(BALL_ITEM)).toBe(false);
    expect(usableInBattle(PRO, ['BONE CHARM'])).toBe(true); // an unwinnable fight still lists it (its own refusal handles it)
  });
  it('the numbers: VOLTRAWK-class 0.05 at 10% hp (the red bar, ×2) ≈ 23% a throw, 3.75% at full', () => {
    expect(catchChance(0.05, 10, 100, 2.5)).toBeCloseTo(0.2325, 5);
    expect(catchChance(0.05, 100, 100, 2.5)).toBeCloseTo(0.0375, 5);
    expect(catchChance(0.05, 10, 100)).toBeCloseTo(0.093, 5);
  });
});

describe('BALL.1 the ITEM-menu throw', () => {
  /** The foe at `hp` (default 1). NOTE the red bar (catch.ts): at 1 hp a
   *  PRO BALL on VOLTORBB-class 0.35 clamps to p = 1, so a test that needs a
   *  LOSING roll must pin the hp above a third of max — seedWhere would
   *  otherwise search forever (it did, 2026-09-09: a 2.5-hour hang). */
  function wildAt(hp = 1): { p1: number; p25: number } {
    begin('test_wild');
    settle();
    b().foe.hp = hp;
    const max = maxHp(SPECIES.voltorbb, 3);
    return { p1: catchChance(SPECIES.voltorbb.catchRate, hp, max), p25: catchChance(SPECIES.voltorbb.catchRate, hp, max, 2.5) };
  }
  function wildAtOneHp(): { p1: number; p25: number } {
    return wildAt(1);
  }

  it('lists the PRO BALL in a wild fight and throws it with the 2.5× mod (a roll the ROKKET BALL would lose)', () => {
    quest.items.push(PRO);
    const { p1, p25 } = wildAt(10); // 10/15 hp, above the red bar: p1 ≈ 0.19, p25 ≈ 0.47, so the band [p1, p25) is real
    expect(p25).toBeGreaterThan(p1);
    expect(p25).toBeLessThan(1);
    expect(battleItems().map((e) => e.id)).toEqual([PRO]);
    setBattleRng(mulberry32(seedWhere((r) => r >= p1 && r < p25)));
    throwFromPack();
    settle();
    expect(G.battle).toBeNull();
    expect(quest.items).not.toContain(PRO);
    expect(G.party).toHaveLength(2);
    expect(G.party[1].species).toBe('voltorbb');
  });

  it('a bad roll consumes the ball and the foe gets its turn', () => {
    quest.items.push(PRO);
    const { p25 } = wildAt(maxHp(SPECIES.voltorbb, 3)); // full hp: p25 ≈ 0.26, a losing roll exists
    expect(p25).toBeLessThan(1);
    setBattleRng(mulberry32(seedWhere((r) => r >= p25)));
    throwFromPack();
    settle();
    expect(G.battle).not.toBeNull();
    expect(quest.items).not.toContain(PRO);
    expect(G.party).toHaveLength(1);
  });

  it('SWIPE with two kinds of ball opens a balls-only pick; B goes back to SWIPE; picking the PRO BALL throws it', () => {
    quest.items.push(PRO, BALL_ITEM, 'SODA');
    const { p1, p25 } = wildAt(10); // 10/15 hp: above the red bar so p1 < p25 < 1 and a roll between them exists
    expect(p1).toBeLessThan(p25);
    expect(p25).toBeLessThan(1);
    tap('down'); // sel 1 = SWIPE
    tap('a');
    expect(b().phase).toBe('item');
    expect(battleItems().map((e) => e.id)).toEqual([PRO, BALL_ITEM]); // balls only — no SODA
    tap('b');
    expect(b().phase).toBe('menu');
    expect(b().sel).toBe(1); // back on SWIPE, not ITEM
    expect(battleItems().map((e) => e.id)).toEqual([PRO, 'SODA']); // the pick is over: the ITEM list is itself again
    tap('a');
    expect(b().phase).toBe('item');
    setBattleRng(mulberry32(seedWhere((r) => r >= p1 && r < p25)));
    tap('a'); // row 0 = PRO BALL
    settle();
    expect(G.battle).toBeNull();
    expect(quest.items).toEqual([BALL_ITEM, 'SODA']); // the PRO BALL went
  });

  it('SWIPE with only PRO BALLs held throws one straight away (Lyall, 2026-09-09)', () => {
    quest.items.push(PRO);
    const { p25 } = wildAtOneHp();
    setBattleRng(mulberry32(seedWhere((r) => r < p25)));
    tap('down');
    tap('a');
    settle();
    expect(G.battle).toBeNull();
    expect(quest.items).toEqual([]);
    expect(G.party).toHaveLength(2);
  });

  it('F43 BALL.2: SWIPE with two ball kinds opens the pick; the MAZTER BALL catches regardless of the seed', () => {
    quest.items.push(BALL_ITEM, 'MAZTER BALL');
    wildAt(10); // above the red bar — an ordinary ball would be a coin flip; the MAZTER BALL is certain
    tap('down'); // sel 1 = SWIPE
    tap('a');
    expect(b().phase).toBe('item');
    expect(battleItems().map((e) => e.id)).toEqual([BALL_ITEM, 'MAZTER BALL']);
    setBattleRng(() => 0.999999); // pinned: no ordinary ball could win this roll — only Infinity clamps to 1
    tap('down'); // row 1 = MAZTER BALL
    tap('a');
    settle();
    expect(G.battle).toBeNull();
    expect(quest.items).toEqual([BALL_ITEM]); // the MAZTER BALL went, the ROKKET BALL stayed
    expect(G.party).toHaveLength(2);
    expect(G.party[1].species).toBe('voltorbb');
  });

  it("a trainer's mon refuses the PRO BALL without consuming it", () => {
    quest.items.push(PRO);
    begin('guard_voltorbb');
    settle();
    throwFromPack();
    settle();
    expect(G.battle).not.toBeNull();
    expect(quest.items).toEqual([PRO]);
    expect(b().phase).toBe('menu');
  });

  it('an uncatchable refuses it the same way', () => {
    quest.items.push(PRO);
    ENCOUNTERS.test_boss = { foe: { species: 'voltorbb', lv: 3 }, uncatchable: true, winText: [], onWin: [], onLose: [], onFlee: [] };
    begin('test_boss');
    settle();
    throwFromPack();
    settle();
    expect(G.battle).not.toBeNull();
    expect(quest.items).toEqual([PRO]);
    delete ENCOUNTERS.test_boss;
  });

  it('F43 BALL.2: an uncatchable refuses the MAZTER BALL too, without consuming it', () => {
    quest.items.push('MAZTER BALL');
    ENCOUNTERS.test_boss = { foe: { species: 'voltorbb', lv: 3 }, uncatchable: true, winText: [], onWin: [], onLose: [], onFlee: [] };
    begin('test_boss');
    settle();
    throwFromPack();
    settle();
    expect(G.battle).not.toBeNull();
    expect(quest.items).toEqual(['MAZTER BALL']);
    delete ENCOUNTERS.test_boss;
  });
});

describe('CH7.0 §5 onCatch', () => {
  it('a catch runs onCatch, not onWin, when the encounter has one', () => {
    quest.items.push(BALL_ITEM);
    begin('test_catch');
    settle();
    b().foe.hp = 1;
    const p = catchChance(SPECIES.voltorbb.catchRate, 1, maxHp(SPECIES.voltorbb, 3));
    setBattleRng(mulberry32(seedWhere((r) => r < p)));
    tap('down');
    tap('a');
    settle();
    expect(G.battle).toBeNull();
    expect(follow).toEqual([{ setFlag: 'ch7Caught' }]);
  });
  it('a knockout still runs onWin', () => {
    setBattleRng(mulberry32(7));
    begin('test_catch');
    settle();
    b().foe.hp = 1;
    let turns = 0;
    while (G.battle && turns++ < 25) {
      tap('a'); // FIGHT
      tap('a'); // first move
      settle();
    }
    expect(G.battle).toBeNull();
    expect(follow).toEqual([{ setFlag: 'ch7Beaten' }]);
  });
  it('a catch on an encounter WITHOUT onCatch runs onWin as before', () => {
    quest.items.push(BALL_ITEM);
    ENCOUNTERS.test_wild.onWin = [{ setFlag: 'ch7Beaten' }];
    begin('test_wild');
    settle();
    b().foe.hp = 1;
    const p = catchChance(SPECIES.voltorbb.catchRate, 1, maxHp(SPECIES.voltorbb, 3));
    setBattleRng(mulberry32(seedWhere((r) => r < p)));
    tap('down');
    tap('a');
    settle();
    expect(follow).toEqual([{ setFlag: 'ch7Beaten' }]);
  });
});
