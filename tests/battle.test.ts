// Battle-engine tests (plan §4.9): whole battles driven frame-by-frame under
// a seeded RNG, with the engine IO modules (renderer/audio/input) stubbed.
// Registry mutations (test species/encounters) are safe: vitest isolates
// module state per test file.
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
  startFade: (cb: () => void) => cb(), // fades resolve instantly under test
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
import { startBattle, battleUpdate, setBattleRng, xpFromWin, lowLevelBoost, LOW_LV_BOOST_UNTIL, partyRow, rootHelp, moveInfo, encounterFlash, type BattleState } from '../src/systems/battle';
import { battleDraw } from '../src/systems/battleDraw';
import { BALL_ITEM } from '../src/data/items';
import { ENCOUNTERS } from '../src/data/encounters';
import { SPECIES } from '../src/data/mons';
import { MOVES } from '../src/data/moves';
import { makeMon, maxHp, xpFillSegs, gainXp, xpForLevel } from '../src/systems/mon';
import { EVO_END, EVO_SKIP_TO, EVO_SKIP_ARM, EVO_RAMP_END } from '../src/systems/battleFx';
import { effectiveness } from '../src/data/typeChart';
import { catchChance } from '../src/systems/catch';
import { damage } from '../src/systems/combat';
import { mulberry32 } from '../src/engine/rng';
import { quest, resetQuest } from '../src/systems/quest';
import { setHeat, calmHeat } from '../src/systems/heat';
import { rect } from '../src/engine/renderer';
import type { MoveDef, ScriptStep } from '../src/types';

// ── frame drivers ─────────────────────────────────────────────────────────
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
/** Fast-forward the current message (hold A) and dismiss it. */
function popMsg(): void {
  const s = b();
  const total = s.msg!.lines.join('').length;
  keys.down.add('a');
  let guard = 0;
  while (s.msgChars < total && guard++ < 500) frame();
  keys.down.delete('a');
  tap('a');
}
/** Frames until the battle is interactive again. Note: 'evolveScene' and
 *  'evoConfirm' count as interactive (A skips, B confirms), so settle()
 *  returns there instead of burning its guard on a 290-frame cinematic. */
function settle(): void {
  let guard = 0;
  while (G.battle && guard++ < 300) {
    const s = G.battle;
    if (s.msg) popMsg();
    else if (s.queue.length || s.phase === 'slide' || s.phase === 'open' || s.phase === 'anim') frame();
    else return; // menu / moves / switch / replace
  }
  if (G.battle) throw new Error('settle(): battle never became interactive');
}
/** FIGHT with the first move until the battle ends; returns turns taken. */
function fightItOut(): number {
  let turns = 0;
  settle();
  while (G.battle && turns++ < 25) {
    tap('a'); // FIGHT
    tap('a'); // first move
    settle();
  }
  return turns;
}

let follow: ScriptStep[] | null | undefined;
function begin(encId: string): void {
  follow = undefined;
  startBattle(encId, (f) => (follow = f));
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
});
// HRD.11: this file seeds battleRng throughout via setBattleRng(mulberry32(...));
// reset it after every test so a forgotten seed in one test can never leak an
// unseeded (Math.random-backed) battleRng into the next.
afterEach(() => {
  setBattleRng(Math.random);
});

// ── xp yield ──────────────────────────────────────────────────────────────
describe('xpFromWin', () => {
  it('is 2·lv² (flagged balance assumption in PLAN.md)', () => {
    expect(xpFromWin(4)).toBe(32);
    expect(xpFromWin(10)).toBe(200);
  });
});

// ── ONB.1: low-level recipients get a bigger post-win xp share ───────────
// Recorded BDD baseline (spec-derived, not re-asserted below — the pure
// table test plus the single-fight award test are the cheap equivalent):
// fresh starter koffink lv5 at 125 xp; spar_jessika (lv5 foe, pool 50) then
// guard_voltorbb (lv4, pool 32). BEFORE ONB.1: 125+50+32=207 xp → still lv5.
// AFTER: 125 + floor(50×2.25)=112 → 237 xp, crosses 216 (L6) on the first
// win; recipient is now lv6 (boost 2.0) → +floor(32×2.0)=64 → 301 xp, stays
// lv6 (< 343 for L7).
describe('lowLevelBoost (ONB.1)', () => {
  it('tapers linearly from ×3.25 at lv1 to exactly ×1 at LOW_LV_BOOST_UNTIL, flat above', () => {
    expect(LOW_LV_BOOST_UNTIL).toBe(10);
    expect(lowLevelBoost(1)).toBe(3.25);
    expect(lowLevelBoost(5)).toBe(2.25);
    expect(lowLevelBoost(9)).toBe(1.25);
    expect(lowLevelBoost(10)).toBe(1);
    expect(lowLevelBoost(11)).toBe(1);
    expect(lowLevelBoost(50)).toBe(1);
  });

  it('a lv5 recipient gains materially more than a lv12 one for the identical foe', () => {
    const gainFor = (lv: number): number => {
      setBattleRng(mulberry32(42));
      G.party = [makeMon(SPECIES.koffink, lv)];
      const before = G.party[0].xp;
      begin('guard_voltorbb'); // lv4 foe, xpFromWin(4)=32
      fightItOut();
      return G.party[0].xp - before;
    };
    const gained5 = gainFor(5);
    const gained12 = gainFor(12);
    expect(gained12).toBe(xpFromWin(4)); // lv12 ≥ LOW_LV_BOOST_UNTIL → boost is exactly ×1
    expect(gained5).toBe(Math.floor(xpFromWin(4) * lowLevelBoost(5))); // lv5 → ×2.25
    expect(gained5).toBeGreaterThan(gained12);
  });

  it('two same-level (lv≥10) recipients still split the pool evenly, unchanged from pre-ONB.1', () => {
    setBattleRng(mulberry32(9));
    G.party = [makeMon(SPECIES.koffink, 12), makeMon(SPECIES.voltorbb, 12)];
    const xp0 = G.party[0].xp;
    const xp1 = G.party[1].xp;
    begin('guard_voltorbb');
    settle();
    tap('down');
    tap('down'); // SWITCH
    tap('a');
    tap('down'); // bring in VOLTORBB — both slots are now participants
    tap('a');
    settle();
    tap('up'); // rootSel restored the cursor to SWITCH — walk back to FIGHT
    tap('up');
    fightItOut();
    expect(G.battle).toBeNull();
    // same-level recipients always split evenly; lv≥10 both sides also means
    // boost ×1, so the shares are unchanged from pre-ONB.1
    const share = Math.max(1, Math.floor(xpFromWin(4) / 2));
    expect(G.party[0].xp).toBe(xp0 + share);
    expect(G.party[1].xp).toBe(xp1 + share);
  });
});

// ── the Ch.1 guard battle, seeded end to end ─────────────────────────────
describe('guard battle (seed 42)', () => {
  it('FIGHT-only play wins, awards XP, hands onWin steps back', () => {
    setBattleRng(mulberry32(42));
    begin('guard_voltorbb');
    const turns = fightItOut();
    expect(G.battle).toBeNull();
    expect(follow).toEqual(ENCOUNTERS.guard_voltorbb.onWin);
    const me = G.party[0];
    expect(me.lv).toBe(5); // 125 + floor(32×2.25)=72 = 197 xp < 216 (L6) — ONB.1 boost at lv5
    expect(me.xp).toBe(125 + Math.floor(xpFromWin(4) * lowLevelBoost(5)));
    // regression pins from the first verified run of this seed:
    expect(me.hp).toBe(15); // 19 max; the guard's VOLTORBB chipped 4 off
    expect(turns).toBe(5); // 17 foe hp at 4-5 TACKLE dmg, one low/missed roll
  });
});

// ── SWIPE: trainer steal gag ─────────────────────────────────────────────
describe('SWIPE in a trainer battle', () => {
  it('steals 15 coins once, then has nothing left (no turn lost)', () => {
    setBattleRng(mulberry32(7));
    begin('guard_voltorbb');
    settle();
    tap('down'); // sel 1 = SWIPE
    tap('a');
    settle(); // steal message + enemy turn
    expect(quest.coins).toBe(15);
    const hpAfterFirst = G.party[0].hp;
    tap('a'); // sel still on SWIPE
    settle();
    expect(quest.coins).toBe(15);
    expect(G.party[0].hp).toBe(hpAfterFirst); // second swipe costs no turn
    expect(G.battle).not.toBeNull();
  });
});

// ── root-menu cursor after a resolved turn ───────────────────────────────
describe('root-menu cursor after a turn resolves', () => {
  it('returns to FIGHT after using move 2 (no move-index leak onto SWIPE)', () => {
    setBattleRng(mulberry32(42));
    begin('guard_voltorbb');
    settle();
    tap('a'); // FIGHT
    tap('down'); // move 2 = SMOG — the index that used to leak
    tap('a');
    settle(); // my move + the enemy turn resolve
    expect(b().phase).toBe('menu');
    expect(b().sel).toBe(0); // cursor back on FIGHT, not SWIPE
  });
});

// ── SWIPE: wild catching ─────────────────────────────────────────────────
describe('SWIPE in a wild battle', () => {
  beforeEach(() => {
    ENCOUNTERS.test_wild = {
      foe: { species: 'voltorbb', lv: 3 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
  });

  function wildAtOneHp(): number {
    begin('test_wild');
    settle();
    b().foe.hp = 1;
    return catchChance(SPECIES.voltorbb.catchRate, 1, maxHp(SPECIES.voltorbb, 3));
  }
  /** Deterministically find a seed whose first roll is under/over p. */
  function seedWhere(pred: (roll: number) => boolean): number {
    let s = 0;
    while (!pred(mulberry32(s)())) s++;
    return s;
  }

  it('with no balls, tells you and costs no turn', () => {
    setBattleRng(mulberry32(3));
    wildAtOneHp();
    tap('down');
    tap('a');
    settle();
    expect(G.battle).not.toBeNull();
    expect(G.party[0].hp).toBe(maxHp(SPECIES.koffink, 5)); // enemy never moved
  });

  it('a good roll consumes the ball and adds the mon to the party', () => {
    quest.items.push(BALL_ITEM);
    const p = wildAtOneHp();
    setBattleRng(mulberry32(seedWhere((r) => r < p)));
    tap('down');
    tap('a');
    settle();
    expect(G.battle).toBeNull();
    expect(follow).toBeNull(); // onWin empty → null
    expect(quest.items).not.toContain(BALL_ITEM);
    expect(G.party).toHaveLength(2);
    expect(G.party[1].species).toBe('voltorbb');
    expect(G.party[1].hp).toBe(1); // caught at the hp it had
  });

  it('a bad roll still consumes the ball and the foe gets its turn', () => {
    quest.items.push(BALL_ITEM);
    const p = wildAtOneHp();
    setBattleRng(mulberry32(seedWhere((r) => r >= p)));
    tap('down');
    tap('a');
    settle();
    expect(G.battle).not.toBeNull();
    expect(quest.items).not.toContain(BALL_ITEM);
    expect(G.party).toHaveLength(1);
  });

  it('uncatchable encounters refuse the throw and keep the ball', () => {
    ENCOUNTERS.test_boss = {
      foe: { species: 'voltorbb', lv: 3 },
      uncatchable: true,
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
    quest.items.push(BALL_ITEM);
    setBattleRng(mulberry32(3));
    begin('test_boss');
    settle();
    tap('down');
    tap('a');
    settle();
    expect(G.battle).not.toBeNull();
    expect(quest.items).toContain(BALL_ITEM);
  });
});

// ── ITEM: use SODA / SMOKE BALL mid-battle (plan §4.5) ───────────────────
describe('battle ITEM menu', () => {
  /** From the root menu, open ITEM (index 3) and pick the first item. */
  function useFirstItem(): void {
    settle();
    tap('down'); // 0→1
    tap('down'); // 1→2
    tap('down'); // 2→3 = ITEM
    tap('a'); // open item submenu
    tap('a'); // use first item
    settle();
  }

  it('SODA heals the active mon and costs the turn (foe attacks)', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SODA');
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.party[0].hp = 1;
    begin('guard_voltorbb');
    useFirstItem();
    expect(b().phase).toBe('target'); // QOL.6: heal items ask who first
    expect(b().sel).toBe(0); // cursor starts on the active mon
    tap('a'); // confirm the active mon
    settle();
    expect(quest.items).not.toContain('SODA'); // consumed
    expect(G.party[0].hp).toBeGreaterThan(1); // healed (foe then chipped some back)
    expect(G.battle).not.toBeNull();
  });

  it('a full-hp target refuses SODA without consuming it', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SODA');
    G.party = [makeMon(SPECIES.koffink, 5)]; // starts at full hp
    begin('guard_voltorbb');
    useFirstItem();
    tap('a'); // confirm the (full-hp) active mon
    settle();
    expect(quest.items).toContain('SODA'); // untouched
    expect(G.party[0].hp).toBe(maxHp(SPECIES.koffink, 5)); // no turn passed either
    expect(G.battle).not.toBeNull();
  });

  it('QOL.6: heals a benched mon via the target list — still costs the turn', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SODA');
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 5)];
    G.party[1].hp = 1; // benched and hurt
    begin('guard_voltorbb');
    useFirstItem();
    expect(b().phase).toBe('target');
    tap('down'); // move to the benched mon
    tap('a');
    settle();
    expect(quest.items).not.toContain('SODA');
    expect(G.party[1].hp).toBe(Math.min(1 + 20, maxHp(SPECIES.voltorbb, 5))); // benched — foe can't chip it
    expect(G.party[0].hp).toBeLessThan(maxHp(SPECIES.koffink, 5)); // foe got its turn
    expect(G.battle).not.toBeNull();
  });

  it('QOL.6: a fainted target refuses (no revive) and consumes nothing', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SODA');
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 5)];
    G.party[1].hp = 0;
    begin('guard_voltorbb');
    useFirstItem();
    tap('down'); // the fainted mon
    tap('a');
    settle();
    expect(b().phase).toBe('target'); // bounced back to the list
    expect(quest.items).toContain('SODA');
    expect(G.party[1].hp).toBe(0);
    expect(G.party[0].hp).toBe(maxHp(SPECIES.koffink, 5)); // no turn passed
    tap('b'); // and B backs out to the item list
    expect(b().phase).toBe('item');
  });

  it('SMOKE BALL is a guaranteed getaway, handing back onFlee', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SMOKE BALL');
    begin('guard_voltorbb');
    useFirstItem();
    expect(G.battle).toBeNull();
    expect(follow).toBeNull(); // guard onFlee is empty
    expect(quest.items).not.toContain('SMOKE BALL'); // consumed
  });

  it('SMOKE BALL blows one stage off the map heat on the way out (1f.7)', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SMOKE BALL');
    G.heatState[G.map.id] = setHeat(calmHeat(), 3, 0); // lockdown armed
    begin('guard_voltorbb');
    useFirstItem();
    expect(G.battle).toBeNull();
    expect(G.heatState[G.map.id]?.stage).toBe(2);
    expect(G.heatState[G.map.id]?.lockdownAt).toBeNull(); // 3→2 cancels lockdown
    delete G.heatState[G.map.id];
  });
});

// ── SWITCH ───────────────────────────────────────────────────────────────
describe('SWITCH', () => {
  it('a voluntary switch gives the foe a free attack', () => {
    setBattleRng(mulberry32(9));
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 5)];
    begin('guard_voltorbb');
    settle();
    tap('down');
    tap('down'); // sel 2 = SWITCH
    tap('a');
    expect(b().phase).toBe('switch');
    tap('down'); // sel 1 = VOLTORBB
    tap('a');
    settle();
    expect(b().meIdx).toBe(1);
    // free attack landed (or missed) deterministically under seed 9:
    expect(G.party[1].hp).toBe(17); // 19 max; the free attack hit for 2
  });

  it('a faint forces a switch with no free attack, and B cannot back out', () => {
    setBattleRng(mulberry32(11));
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 5)];
    G.party[0].hp = 1;
    begin('guard_voltorbb');
    settle();
    let guard = 0;
    while (G.battle && b().phase !== 'switch' && guard++ < 10) {
      tap('a');
      tap('a');
      settle();
    }
    expect(b().phase).toBe('switch');
    expect(b().forced).toBe(true);
    tap('b'); // must not escape the forced switch
    expect(b().phase).toBe('switch');
    tap('a'); // confirm first alive (sel preset to it)
    settle();
    expect(b().meIdx).toBe(1);
    expect(G.party[1].hp).toBe(maxHp(SPECIES.voltorbb, 5)); // no free attack
  });
});

// ── whiteout ─────────────────────────────────────────────────────────────
describe('whiteout (plan §4.3)', () => {
  it('all mons down → 10% coins lost, party healed, back to last HQ', () => {
    setBattleRng(mulberry32(5));
    quest.coins = 100;
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.party[0].hp = 1;
    G.player.x = 3;
    G.player.y = 3;
    begin('guard_voltorbb');
    fightItOut();
    expect(G.battle).toBeNull();
    expect(follow).toBeNull(); // guard onLose is empty
    expect(quest.coins).toBe(90);
    expect(G.party[0].hp).toBe(maxHp(SPECIES.koffink, 5)); // healed (PLAN assumption)
    expect(G.map.id).toBe('hq');
    expect(G.player.x).toBe(9);
    expect(G.player.y).toBe(7);
    expect(G.state).toBe('worldwait'); // v2 ordering: fade cb ran, then worldwait
  });
});

// ── DRAIN heals the attacker (QOL.5) ─────────────────────────────────────
describe('DRAIN heals the attacker (QOL.5)', () => {
  /** Seed whose (n+1)-th roll satisfies pred — lets tests aim a specific
   *  rng call (0-indexed) without pinning unrelated values. */
  function seedWhereN(n: number, pred: (roll: number) => boolean): number {
    for (let s = 0; ; s++) {
      const r = mulberry32(s);
      for (let i = 0; i < n; i++) r();
      if (pred(r())) return s;
    }
  }

  beforeEach(() => {
    // acc 0 → the foe always misses, so my hp only moves by the drain heal
    // and every assertion is derivable (no pins).
    MOVES.test_whiff = { id: 'test_whiff', name: 'WHIFF', type: 'NORMAL', power: 35, acc: 0, anim: 'lunge', desc: 'A TEST WHIFF.' };
    SPECIES.test_drainer = {
      id: 'test_drainer',
      name: 'DRAINER',
      type: ['POISON'],
      baseHp: 60,
      atk: 65,
      def: 65,
      spd: 50,
      moves: [{ lv: 1, move: 'drain' }],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    SPECIES.test_whiffer = {
      ...SPECIES.test_drainer,
      id: 'test_whiffer',
      name: 'WHIFFER',
      baseHp: 100,
      moves: [{ lv: 1, move: 'test_whiff' }],
    };
    ENCOUNTERS.test_drain_vs_whiffer = {
      foe: { species: 'test_whiffer', lv: 5 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
    ENCOUNTERS.test_drainer_foe = {
      foe: { species: 'test_drainer', lv: 5 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
  });

  it("my drain move heals me by max(1, floor(dmg/2)) after the hit", () => {
    // roll 0 = my acc roll — must hit (≤ 0.9)
    setBattleRng(mulberry32(seedWhereN(0, (r) => r < 0.9)));
    G.party = [makeMon(SPECIES.test_drainer, 5)];
    G.party[0].hp = 5;
    begin('test_drain_vs_whiffer');
    settle();
    tap('a'); // FIGHT
    tap('a'); // drain (only move)
    settle();
    const d = maxHp(SPECIES.test_whiffer, 5) - b().foe.hp;
    expect(d).toBeGreaterThan(0);
    expect(G.party[0].hp).toBe(5 + Math.max(1, Math.floor(d / 2)));
  });

  it('the drain heal clamps to my max hp', () => {
    setBattleRng(mulberry32(seedWhereN(0, (r) => r < 0.9)));
    const max = maxHp(SPECIES.test_drainer, 5);
    G.party = [makeMon(SPECIES.test_drainer, 5)];
    G.party[0].hp = max - 1;
    begin('test_drain_vs_whiffer');
    settle();
    tap('a');
    tap('a');
    settle();
    expect(G.party[0].hp).toBe(max); // healed exactly the 1 missing, not floor(dmg/2)
  });

  it("a foe's drain heals the foe too (free attack on a voluntary switch)", () => {
    // free-attack rng calls: 0 = foe move pick (rollInt), 1 = foe acc roll
    setBattleRng(mulberry32(seedWhereN(1, (r) => r < 0.9)));
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 5)];
    begin('test_drainer_foe');
    settle();
    b().foe.hp = 3; // pre-damaged so the heal is observable
    tap('down');
    tap('down'); // SWITCH
    tap('a');
    tap('down'); // pick VOLTORBB
    tap('a');
    settle();
    const d = maxHp(SPECIES.voltorbb, 5) - G.party[1].hp;
    expect(d).toBeGreaterThan(0); // the free drain landed
    expect(b().foe.hp).toBe(3 + Math.max(1, Math.floor(d / 2)));
  });
});

// ── XP split among participants (QOL.7) ──────────────────────────────────
describe('XP split among participants (QOL.7)', () => {
  it('a mid-fight switch splits the pool evenly between both mons', () => {
    setBattleRng(mulberry32(9));
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 5)];
    const xp0 = G.party[0].xp;
    const xp1 = G.party[1].xp;
    begin('guard_voltorbb');
    settle();
    tap('down');
    tap('down'); // SWITCH
    tap('a');
    tap('down'); // bring in VOLTORBB — both slots are now participants
    tap('a');
    settle();
    tap('up'); // rootSel restored the cursor to SWITCH — walk back to FIGHT
    tap('up');
    fightItOut();
    expect(G.battle).toBeNull();
    // lv4 foe → base 16 each, then ONB.1 boost ×2.25 (both recipients lv5) → 36 each
    const share = Math.max(1, Math.floor(Math.floor(xpFromWin(4) / 2) * lowLevelBoost(5)));
    expect(G.party[0].xp).toBe(xp0 + share);
    expect(G.party[1].xp).toBe(xp1 + share);
  });

  it('a fainted participant gets nothing; the survivor takes the full pool', () => {
    setBattleRng(mulberry32(11));
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 5)];
    G.party[0].hp = 1;
    const xp0 = G.party[0].xp;
    const xp1 = G.party[1].xp;
    begin('guard_voltorbb');
    settle();
    // fight until KOFFINK drops and the forced switch opens
    let guard = 0;
    while (G.battle && b().phase !== 'switch' && guard++ < 10) {
      tap('a');
      tap('a');
      settle();
    }
    expect(b().forced).toBe(true);
    tap('a'); // send VOLTORBB
    settle();
    fightItOut();
    expect(G.battle).toBeNull();
    expect(G.party[0].xp).toBe(xp0); // fainted at win time — no share
    // sole recipient → full pool (32), then ONB.1 boost ×2.25 at lv5 → 72
    expect(G.party[1].xp).toBe(xp1 + Math.floor(xpFromWin(4) * lowLevelBoost(5)));
  });
});

// ── encounter transition flash (QOL.3) ───────────────────────────────────
describe('encounterFlash (QOL.3)', () => {
  it('wild battles get 4 alternating inversion beats over the first 12 frames', () => {
    // 3-frame beats: bg shade, dark, bg, dark — Gen-1 style
    expect(encounterFlash(0, true)).toBe(3);
    expect(encounterFlash(2, true)).toBe(3);
    expect(encounterFlash(3, true)).toBe(0);
    expect(encounterFlash(5, true)).toBe(0);
    expect(encounterFlash(6, true)).toBe(3);
    expect(encounterFlash(9, true)).toBe(0);
    expect(encounterFlash(11, true)).toBe(0);
  });

  it('ends after frame 11 and never fires for trainer battles', () => {
    expect(encounterFlash(12, true)).toBeNull();
    expect(encounterFlash(40, true)).toBeNull();
    for (let t = 0; t < 15; t++) expect(encounterFlash(t, false)).toBeNull();
  });
});

// ── move learning: the offered/replace prompt ────────────────────────────
describe('level-up move replacement', () => {
  beforeEach(() => {
    SPECIES.test_learner = {
      id: 'test_learner',
      name: 'LEARNER',
      type: ['NORMAL'],
      baseHp: 80,
      atk: 200,
      def: 200,
      spd: 50,
      moves: [
        { lv: 1, move: 'tackle' },
        { lv: 1, move: 'smog' },
        { lv: 1, move: 'screech' },
        { lv: 1, move: 'sludge' },
        { lv: 6, move: 'zap' },
      ],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    // lv7 foe → xpFromWin(7)=98 xp → ONB.1 boost ×2.25 at lv5 → floor(98×2.25)=220
    // → 125+220=345 ≥ 343 (L7) → crosses L6 (zap offered, knows 4) en route to L7
    ENCOUNTERS.test_learn = {
      trainer: 'DUMMY',
      foe: { species: 'voltorbb', lv: 7 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
    G.party = [makeMon(SPECIES.test_learner, 5)];
  });

  function fightToReplacePrompt(): void {
    settle();
    let guard = 0;
    while (G.battle && b().phase !== 'replace' && guard++ < 10) {
      tap('a');
      tap('a');
      settle();
    }
    expect(b().phase).toBe('replace');
  }

  it('A replaces the selected move with the offered one', () => {
    setBattleRng(mulberry32(13));
    begin('test_learn');
    fightToReplacePrompt();
    tap('a'); // forget slot 0 (tackle) → learn zap
    settle();
    expect(G.battle).toBeNull();
    expect(G.party[0].lv).toBe(7); // ONB.1: the boosted award crosses L6 AND L7 in one gainXp call
    expect(G.party[0].moves).toEqual(['zap', 'smog', 'screech', 'sludge']);
  });

  it('B declines and keeps the old moves', () => {
    setBattleRng(mulberry32(13));
    begin('test_learn');
    fightToReplacePrompt();
    tap('b');
    settle();
    expect(G.battle).toBeNull();
    expect(G.party[0].lv).toBe(7); // ONB.1: the boosted award crosses L6 AND L7 in one gainXp call
    expect(G.party[0].moves).toEqual(['tackle', 'smog', 'screech', 'sludge']);
  });
});

// ── partyRow: SWITCH-list hp/status readout formatter (QOL.12) ───────────
describe('partyRow', () => {
  it('formats name + hp/maxHp with no active marker', () => {
    const mon = makeMon(SPECIES.koffink, 5); // maxHp 19
    mon.hp = 12;
    expect(partyRow(mon, SPECIES.koffink, false)).toBe('KOFFINK 12/19');
  });

  it('prefixes the active mon with *', () => {
    const mon = makeMon(SPECIES.ratikatt, 5);
    expect(partyRow(mon, SPECIES.ratikatt, true)).toBe(
      '*RATIKATT ' + mon.hp + '/' + maxHp(SPECIES.ratikatt, 5),
    );
  });

  it('appends the status tag when one is set', () => {
    const mon = makeMon(SPECIES.koffink, 5);
    mon.hp = 12;
    mon.status = 'PSN';
    expect(partyRow(mon, SPECIES.koffink, false)).toBe('KOFFINK 12/19 PSN');
  });

  it('prefers the nickname over the species name', () => {
    const mon = makeMon(SPECIES.koffink, 5);
    mon.hp = 12;
    mon.nick = 'STINKY';
    expect(partyRow(mon, SPECIES.koffink, false)).toBe('STINKY 12/19');
  });

  it('every real species at lv5 fits the 15-char wide-list column without status', () => {
    for (const sp of Object.values(SPECIES)) {
      const mon = makeMon(sp, 5);
      const row = partyRow(mon, sp, false);
      expect(row.length).toBeLessThanOrEqual(15);
    }
  });
});

// ── rootHelp: battle root-menu help-bar blurb (QOL.10) ───────────────────
describe('rootHelp', () => {
  it('FIGHT', () => {
    expect(rootHelp(0, false)).toBe('PICK A MOVE.');
  });
  it('SWIPE in a wild battle throws a ball', () => {
    expect(rootHelp(1, false)).toBe('THROWS A BALL.');
  });
  it('SWIPE in a trainer battle pickpockets', () => {
    expect(rootHelp(1, true)).toBe('PICKPOCKET COINS.');
  });
  it('SWITCH', () => {
    expect(rootHelp(2, false)).toBe('SWAP ACTIVE MON.');
  });
  it('ITEM', () => {
    expect(rootHelp(3, false)).toBe('USE A PACK ITEM.');
  });
  it('LEG IT', () => {
    expect(rootHelp(4, false)).toBe('FLEE THE BATTLE.');
  });
  it('every entry fits the help bar (≤17 chars), both SWIPE contexts', () => {
    for (let sel = 0; sel < 5; sel++) {
      expect(rootHelp(sel, false).length).toBeLessThanOrEqual(17);
      expect(rootHelp(sel, true).length).toBeLessThanOrEqual(17);
      expect(rootHelp(sel, true, true).length).toBeLessThanOrEqual(17); // ONB.5-FB spent state
    }
  });
  // ONB.5-FB: SWIPE is once per trainer battle, and the help bar used to keep
  // advertising it after it was spent — the only way to find out was to waste
  // a press on the refusal.
  it('SWIPE reads as spent once it has been used', () => {
    expect(rootHelp(1, true, true)).toBe('ALREADY SWIPED.');
  });
  it('the spent state changes nothing else on the bar', () => {
    for (const sel of [0, 2, 3, 4]) {
      expect(rootHelp(sel, true, true)).toBe(rootHelp(sel, true, false));
    }
  });
});

// ── moveInfo: MOVES-menu hover lines (QOL.10, reshaped by UX2.2) ──────────
// UX2.2: the stat line became [type, desc] — power/acc stay in the DATA
// (combat reads them); only the hover presentation changed. Type is still
// shown (card rule), on its own line above the flavour desc.
describe('moveInfo', () => {
  it('returns the type line and the desc line from MoveDef', () => {
    expect(moveInfo(MOVES.zap)).toEqual(['ELECTRIC', 'A QUICK JOLT.']);
    expect(moveInfo(MOVES.tackle)).toEqual(['NORMAL', 'A PLAIN BODY SLAM.']);
  });
  it('every move in the registry fits the help bar (both lines ≤18 chars)', () => {
    for (const mv of Object.values(MOVES)) {
      for (const line of moveInfo(mv)) {
        expect(line.length, `${mv.id}: "${line}"`).toBeLessThanOrEqual(18);
      }
    }
  });
});

// ── QOL.11: b.float state (seeded) ────────────────────────────────────────
// Custom species/move with acc=1 (always hits, regardless of rng) so the
// exact hp delta is deterministic under any seed — the rng value only feeds
// the damage roll's (0.85, 1] multiplier, which never zeroes a 40-power hit.
describe('QOL.11 float damage state (seeded)', () => {
  beforeEach(() => {
    MOVES.test_certain = { id: 'test_certain', name: 'CERTAIN', type: 'NORMAL', power: 40, acc: 1, anim: 'lunge', desc: 'A TEST HIT.' };
    SPECIES.test_floater = {
      id: 'test_floater',
      name: 'FLOATER',
      type: ['NORMAL'],
      baseHp: 60,
      atk: 60,
      def: 40,
      spd: 50,
      moves: [{ lv: 1, move: 'test_certain' }],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    ENCOUNTERS.test_float = {
      foe: { species: 'test_floater', lv: 5 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
    G.party = [makeMon(SPECIES.test_floater, 5)];
  });

  it("my hit sets b.float {side:'foe', amt === the rolled dmg === the hp drop, mult}", () => {
    setBattleRng(mulberry32(1));
    begin('test_float');
    settle();
    const startHp = b().foe.hp;
    tap('a'); // FIGHT
    tap('a'); // CERTAIN — only move, always hits
    frame(); // shift "used CERTAIN!" into b.msg
    popMsg(); // pop it and run its after() — starts the me-side fx
    let guard = 0;
    while (b().foe.hp === startHp && guard++ < 60) frame(); // tick the fx to completion
    expect(guard).toBeLessThan(60);
    expect(b().float).toBeTruthy();
    expect(b().float!.side).toBe('foe');
    expect(b().float!.amt).toBe(startHp - b().foe.hp);
    expect(b().float!.mult).toBe(effectiveness('NORMAL', ['NORMAL']));
  });

  it("the foe's hit overwrites b.float to side 'me' with its own rolled dmg", () => {
    setBattleRng(mulberry32(1));
    begin('test_float');
    settle();
    const foeStart = b().foe.hp;
    const meStart = G.party[0].hp;
    tap('a');
    tap('a');
    frame();
    popMsg();
    let guard = 0;
    while (b().foe.hp === foeStart && guard++ < 60) frame(); // my hit lands
    expect(b().float!.side).toBe('foe'); // sanity: overwrite hasn't happened yet
    guard = 0;
    while (G.party[0].hp === meStart && guard++ < 200) {
      const s = b();
      if (s.msg) popMsg();
      else frame();
    }
    expect(guard).toBeLessThan(200);
    expect(b().float!.side).toBe('me');
    expect(b().float!.amt).toBe(meStart - G.party[0].hp);
  });
});

// ── UX2.3: super-effective float emphasis (message-queue pin, seeded) ──────
describe('UX2.3 super-effective float emphasis', () => {
  beforeEach(() => {
    // FIGHTING->NORMAL is 2x (typeChart.ts); NORMAL->NORMAL is neutral (1x).
    // Both moves live on the same test mon so FIGHT always opens the same
    // two-move list; index 0 = super-effective, index 1 = neutral.
    MOVES.test_fighting = { id: 'test_fighting', name: 'CHOP', type: 'FIGHTING', power: 40, acc: 1, anim: 'lunge', desc: 'A TEST HIT.' };
    MOVES.test_normal = { id: 'test_normal', name: 'BONK', type: 'NORMAL', power: 40, acc: 1, anim: 'lunge', desc: 'A TEST HIT.' };
    SPECIES.test_uxfloater = {
      id: 'test_uxfloater',
      name: 'UXFLOAT',
      type: ['NORMAL'],
      baseHp: 60,
      atk: 60,
      def: 40,
      spd: 50,
      moves: [
        { lv: 1, move: 'test_fighting' },
        { lv: 1, move: 'test_normal' },
      ],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    ENCOUNTERS.test_ux23 = {
      foe: { species: 'test_uxfloater', lv: 5 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
    G.party = [makeMon(SPECIES.test_uxfloater, 5)];
  });

  it('a super-effective hit queues "It\'s super" + "effective!" and sets b.float with mult >= 2', () => {
    setBattleRng(mulberry32(1));
    begin('test_ux23');
    settle();
    const startHp = b().foe.hp;
    tap('a'); // FIGHT
    tap('a'); // move 1 = CHOP (FIGHTING, super-effective vs NORMAL)
    frame(); // shift "used CHOP!" into b.msg
    popMsg(); // pop it and run its after() — starts the me-side fx
    let guard = 0;
    while (b().foe.hp === startHp && guard++ < 60) frame(); // tick the fx to completion
    expect(guard).toBeLessThan(60);
    expect(b().float).toBeTruthy();
    expect(b().float!.mult).toBeGreaterThanOrEqual(2);
    // sayEffectiveness queues the pair before enemyTurn's own message.
    expect(b().queue[0]?.lines).toEqual(["It's super", 'effective!']);
  });

  it('a neutral hit does not queue the effectiveness pair', () => {
    setBattleRng(mulberry32(1));
    begin('test_ux23');
    settle();
    const startHp = b().foe.hp;
    tap('a'); // FIGHT
    tap('down'); // move 2 = BONK (NORMAL, neutral vs NORMAL)
    tap('a');
    frame(); // shift "used BONK!" into b.msg
    popMsg();
    let guard = 0;
    while (b().foe.hp === startHp && guard++ < 60) frame();
    expect(guard).toBeLessThan(60);
    expect(b().float).toBeTruthy();
    expect(b().float!.mult).toBe(1);
    const queuedThePair = b().queue.some((m) => m.lines.length === 2 && m.lines[0] === "It's super" && m.lines[1] === 'effective!');
    expect(queuedThePair).toBe(false);
  });
});

// ── QOL.4: b.hpAnim state (seeded) ─────────────────────────────────────────
describe('QOL.4 hp-tween state (seeded)', () => {
  it('SODA on the active mon sets hpAnim with from = the pre-heal hp', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SODA');
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.party[0].hp = 1;
    begin('guard_voltorbb');
    settle();
    tap('down'); // 0->1
    tap('down'); // 1->2
    tap('down'); // 2->3 = ITEM
    tap('a'); // open item submenu
    tap('a'); // pick SODA — opens the target list (QOL.6)
    const preHp = G.party[0].hp; // still 1, unhealed
    tap('a'); // confirm the active mon as the target
    expect(G.party[0].hp).toBeGreaterThan(preHp); // heal already applied instantly
    expect(b().hpAnim).toBeTruthy();
    expect(b().hpAnim!.side).toBe('me');
    expect(b().hpAnim!.from).toBe(preHp);
  });

  it('a benched heal target does NOT set hpAnim (not the on-screen mon)', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SODA');
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 5)];
    G.party[1].hp = 1;
    begin('guard_voltorbb');
    settle();
    tap('down');
    tap('down');
    tap('down'); // ITEM
    tap('a');
    tap('a'); // pick SODA — target list, cursor starts on active (slot 0)
    tap('down'); // move to the benched mon
    tap('a'); // confirm
    expect(b().hpAnim).toBeUndefined();
  });

  it("a drain heal sets hpAnim on the healer's side", () => {
    MOVES.test_whiff2 = { id: 'test_whiff2', name: 'WHIFF2', type: 'NORMAL', power: 35, acc: 0, anim: 'lunge', desc: 'A TEST WHIFF.' };
    SPECIES.test_drainer2 = {
      id: 'test_drainer2',
      name: 'DRAINER2',
      type: ['POISON'],
      baseHp: 60,
      atk: 65,
      def: 65,
      spd: 50,
      moves: [{ lv: 1, move: 'drain' }],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    SPECIES.test_whiffer2 = {
      ...SPECIES.test_drainer2,
      id: 'test_whiffer2',
      name: 'WHIFFER2',
      baseHp: 100,
      moves: [{ lv: 1, move: 'test_whiff2' }],
    };
    ENCOUNTERS.test_drain_hpanim = {
      foe: { species: 'test_whiffer2', lv: 5 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
    // roll 0 = my acc check — must hit (≤0.9, drain's acc)
    let s = 0;
    while (!(mulberry32(s)() < 0.9)) s++;
    setBattleRng(mulberry32(s));
    G.party = [makeMon(SPECIES.test_drainer2, 5)];
    G.party[0].hp = 5;
    begin('test_drain_hpanim');
    settle();
    tap('a'); // FIGHT
    tap('a'); // drain (only move)
    settle();
    expect(G.party[0].hp).toBeGreaterThan(5); // the drain heal landed
    expect(b().hpAnim).toBeTruthy();
    expect(b().hpAnim!.side).toBe('me');
  });
});

// ── UX2.1: post-win xp fill is armed for the active mon ───────────────────
describe('battle xp fill (UX2.1)', () => {
  it('arms a draw-only xpAnim carrying exactly the awarded share', () => {
    setBattleRng(mulberry32(42));
    begin('guard_voltorbb');
    let seen: { from: number; to: number }[] | null = null;
    let guard = 0;
    while (G.battle && guard++ < 2000) {
      const s = G.battle;
      if (s.xpAnim && !seen) seen = s.xpAnim.segs.map((x) => ({ ...x }));
      if (s.msg) popMsg();
      else if (s.queue.length || s.phase === 'slide' || s.phase === 'open' || s.phase === 'anim') frame();
      else {
        tap('a'); // FIGHT
        tap('a'); // first move
      }
    }
    expect(G.battle).toBeNull();
    // seed-42 pin: L5 koffink at 125 xp gains floor(xpFromWin(4)×lowLevelBoost(5))=72
    // (ONB.1) — 197 xp, still < 216 (L6) — no level cross.
    expect(seen).toEqual(xpFillSegs(5, 125, 5, 125 + Math.floor(xpFromWin(4) * lowLevelBoost(5))));
  });
});

// ── UX2.4: evolution cinematic ─────────────────────────────────────────────
describe('UX2.4 evolution cinematic', () => {
  // ADAPTATION: ENCOUNTERS.guard1 does not exist in src/data/encounters.ts
  // (only guard_voltorbb and brad_ratikatt are registered). Registered here
  // the same way the SWIPE-in-a-wild-battle describe above registers
  // test_wild — a wild foe atEvolvePrompt() pins to 1 hp for a one-hit win.
  beforeEach(() => {
    ENCOUNTERS.guard1 = {
      foe: { species: 'voltorbb', lv: 3 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
  });
  afterEach(() => {
    delete ENCOUNTERS.guard1;
  });

  /** Put a battle into the evolve prompt with a real evolving species. */
  function atEvolvePrompt(): BattleState {
    resetQuest();
    const mon = makeMon(SPECIES.ratikatt, 15);
    // one win short of the evolve threshold — derived so a UX2.5 rebalance
    // (see mon-data-lint.test.ts's pinned evolution thresholds) can't
    // silently hollow this test out.
    mon.xp = xpForLevel(SPECIES.ratikatt.evolvesTo!.lv) - 1;
    G.party = [mon];
    setBattleRng(mulberry32(1));
    // ADAPTATION: startBattle needs a done callback (the ScriptHooks contract
    // is off-limits) — begin() already exists in this file for that.
    begin('guard1');
    settle();
    // ADAPTATION: pin the foe at 1 hp (the wildAtOneHp() idiom above) so one
    // hit ends the fight — a real 2-turn fight burns ~150 frame-driven ticks
    // (fx timelines + messages), well past this loop's 60-iteration budget.
    b().foe.hp = 1;
    // knock the foe out with repeated FIGHT turns
    let guard = 0;
    while (G.battle && b().phase !== 'evolve' && guard++ < 60) {
      if (b().phase === 'menu') {
        b().sel = 0;
        tap('a');
      }
      if (b().phase === 'moves') {
        b().sel = 0;
        tap('a');
      }
      if (b().msg) popMsg();
      else frame();
    }
    expect(b().phase, 'battle reached the evolve prompt').toBe('evolve');
    return b();
  }

  /** Advance the scene n frames without pressing anything. */
  function runScene(n: number): void {
    for (let i = 0; i < n; i++) frame();
  }

  it('EVOLVE enters the cinematic instead of evolving instantly', () => {
    const s = atEvolvePrompt();
    s.sel = 0; // EVOLVE
    tap('a');
    expect(s.phase).toBe('evolveScene');
    expect(s.evoScene).toBeDefined();
    expect(G.party[0].species).toBe('ratikatt'); // not evolved yet
  });

  it('holds the reveal until A confirms — no auto-continue (UX2.4-FB re-pin)', () => {
    // deliberately flipped from "completes on its own": Lyall's playtest
    // wanted the scene to sit on the revealed mon (name boxed) until A
    const s = atEvolvePrompt();
    s.sel = 0;
    tap('a');
    runScene(EVO_END + 60);
    expect(s.phase).toBe('evolveScene'); // still holding
    expect(G.party[0].species).toBe('ratikatt'); // not committed yet
    tap('a');
    expect(G.party[0].species).toBe('ratikate');
    expect(s.phase).not.toBe('evolveScene');
  });

  it('A skips to the reveal without changing the outcome', () => {
    const s = atEvolvePrompt();
    s.sel = 0;
    tap('a');
    runScene(EVO_SKIP_ARM); // arm the skip
    tap('a');
    expect(b().t - b().evoScene!.start).toBeGreaterThanOrEqual(EVO_SKIP_TO);
    runScene(EVO_END - EVO_SKIP_TO + 1);
    tap('a'); // UX2.4-FB: the held reveal needs its confirming press
    expect(G.party[0].species).toBe('ratikate');
  });

  it('A does nothing once already in the reveal — no infinite skip loop', () => {
    const s = atEvolvePrompt();
    s.sel = 0;
    tap('a');
    runScene(EVO_SKIP_ARM); // arm the skip
    tap('a'); // skip into the reveal
    const start = b().evoScene!.start;
    tap('a'); // mashed again, now inside the reveal — must NOT rebase start
    expect(b().evoScene!.start).toBe(start);
    expect(s.phase).toBe('evolveScene');
    runScene(EVO_END - (b().t - start) + 1);
    tap('a'); // UX2.4-FB: the held reveal needs its confirming press
    expect(G.party[0].species).toBe('ratikate');
  });

  it('A does nothing before the dead-zone expires', () => {
    const s = atEvolvePrompt();
    s.sel = 0;
    tap('a'); // this is the press that STARTED the scene
    const before = b().t - b().evoScene!.start;
    tap('a'); // a mashed second press, still inside the dead-zone
    expect(b().t - b().evoScene!.start).toBeLessThan(EVO_SKIP_TO);
    expect(b().t - b().evoScene!.start).toBeGreaterThan(before);
    expect(s.phase).toBe('evolveScene');
  });

  it('B opens a confirmation and does not cancel on its own', () => {
    const s = atEvolvePrompt();
    s.sel = 0;
    tap('a');
    runScene(60);
    tap('b');
    expect(s.phase).toBe('evoConfirm');
    expect(s.sel).toBe(0); // defaults to NO
    expect(G.party[0].noEvolve).toBeUndefined();
  });

  it('answering NO resumes the scene where it paused', () => {
    const s = atEvolvePrompt();
    s.sel = 0;
    tap('a');
    runScene(60);
    // ADAPTATION: pausedAt is read AFTER tap('b'), not before. b.t++ happens
    // at the top of battleUpdate, so the frame that processes the B press is
    // also the frame that freezes evoScene.pausedAt — reading elapsed one
    // frame earlier (as the frozen spec's literal ordering did) is 1 short
    // of what actually gets frozen, and the assertion below failed by
    // exactly 1 until this line moved past the tap.
    tap('b');
    const pausedAt = b().t - b().evoScene!.start;
    runScene(10); // time passes while the prompt is up
    s.sel = 0; // NO
    tap('a');
    expect(s.phase).toBe('evolveScene');
    expect(b().t - b().evoScene!.start).toBe(pausedAt);
  });

  it('answering YES cancels permanently and never offers again', () => {
    const s = atEvolvePrompt();
    s.sel = 0;
    tap('a');
    runScene(60);
    tap('b');
    s.sel = 1; // YES
    tap('a');
    expect(G.party[0].species).toBe('ratikatt');
    expect(G.party[0].noEvolve).toBe(true);
    // and the offer is dead at the source
    const evs = gainXp(G.party[0], SPECIES.ratikatt, xpForLevel(20) - G.party[0].xp);
    expect(evs.every((e) => e.evolvesTo === undefined)).toBe(true);
  });

  it('STOP at the prompt routes through the same confirmation', () => {
    const s = atEvolvePrompt();
    s.sel = 1; // STOP
    tap('a');
    expect(s.phase).toBe('evoConfirm');
    expect(G.party[0].noEvolve).toBeUndefined();
    s.sel = 1; // YES
    tap('a');
    expect(G.party[0].noEvolve).toBe(true);
  });

  it('answering NO at the prompt returns to EVOLVE/STOP, not into the scene', () => {
    const s = atEvolvePrompt();
    s.sel = 1; // STOP
    tap('a');
    s.sel = 0; // NO
    tap('a');
    expect(s.phase).toBe('evolve');
    expect(s.evoScene).toBeUndefined();
  });

  it('B past the whiteout is ignored — the evolution has committed', () => {
    const s = atEvolvePrompt();
    s.sel = 0;
    tap('a');
    runScene(EVO_RAMP_END + 5);
    tap('b');
    expect(s.phase).toBe('evolveScene');
  });
});

// ── HRD.8: battle round-trip edge tests ───────────────────────────────────
// pins the untested boundaries that protect real players' progression
// (docs/tasks/34-release-hardening/tier-d-test-debt.md).

// ── SWIPE catch overflow to the MON LOCKER (battle.ts:468-472) ────────────
describe('SWIPE catch overflow to the MON LOCKER (battle.ts:468-472)', () => {
  /** Deterministic seed whose first roll lands under a wild catch's p. */
  function seedUnder(p: number): number {
    let s = 0;
    while (!(mulberry32(s)() < p)) s++;
    return s;
  }

  it('a full party (4) sends a caught wild mon to G.box, not a 5th party slot', () => {
    ENCOUNTERS.test_full_catch = {
      foe: { species: 'voltorbb', lv: 3 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.koffink, 5), makeMon(SPECIES.koffink, 5), makeMon(SPECIES.koffink, 5)];
    quest.items.push(BALL_ITEM);
    begin('test_full_catch');
    settle();
    b().foe.hp = 1;
    const p = catchChance(SPECIES.voltorbb.catchRate, 1, maxHp(SPECIES.voltorbb, 3));
    setBattleRng(mulberry32(seedUnder(p)));
    tap('down'); // SWIPE
    tap('a');
    settle();
    expect(G.battle).toBeNull();
    expect(G.party).toHaveLength(4); // unchanged — never overflows into a 5th slot
    expect(G.box).toHaveLength(1);
    expect(G.box[0].species).toBe('voltorbb');
    expect(G.box[0].hp).toBe(1); // caught at the hp it had, same as the party path
  });

  it('a non-full party (<4) still adds the caught mon directly to G.party', () => {
    ENCOUNTERS.test_room_catch = {
      foe: { species: 'voltorbb', lv: 3 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
    G.party = [makeMon(SPECIES.koffink, 5)];
    quest.items.push(BALL_ITEM);
    begin('test_room_catch');
    settle();
    b().foe.hp = 1;
    const p = catchChance(SPECIES.voltorbb.catchRate, 1, maxHp(SPECIES.voltorbb, 3));
    setBattleRng(mulberry32(seedUnder(p)));
    tap('down');
    tap('a');
    settle();
    expect(G.party).toHaveLength(2);
    expect(G.box).toHaveLength(0);
  });
});

// ── overkill damage floors hp at exactly 0 (battle.ts hpBar never negative) ─
describe('overkill damage floors hp at exactly 0', () => {
  it('a ~250-power overkill hit clamps foe hp to 0, and the hp-bar fill width never goes negative', () => {
    MOVES.test_nuke = { id: 'test_nuke', name: 'NUKE', type: 'NORMAL', power: 250, acc: 1, anim: 'lunge', desc: 'OVERKILL TEST.' };
    SPECIES.test_nuker = {
      id: 'test_nuker',
      name: 'NUKER',
      type: ['NORMAL'],
      baseHp: 60,
      atk: 999,
      def: 40,
      spd: 50,
      moves: [{ lv: 1, move: 'test_nuke' }],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    SPECIES.test_squishy = {
      id: 'test_squishy',
      name: 'SQUISHY',
      type: ['NORMAL'],
      baseHp: 10,
      atk: 10,
      def: 1,
      spd: 10,
      moves: [{ lv: 1, move: 'tackle' }],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    ENCOUNTERS.test_overkill = { foe: { species: 'test_squishy', lv: 5 }, winText: [], onWin: [], onLose: [], onFlee: [] };
    setBattleRng(mulberry32(1));
    G.party = [makeMon(SPECIES.test_nuker, 5)];
    begin('test_overkill');
    settle();
    const startHp = b().foe.hp;
    tap('a'); // FIGHT
    tap('a'); // NUKE — only move
    frame(); // shift "used NUKE!" into b.msg
    popMsg(); // pop it and run its after() — starts the me-side fx
    let guard = 0;
    while (b().foe.hp === startHp && guard++ < 60) frame(); // tick the fx to completion
    expect(guard).toBeLessThan(60);
    expect(b().foe.hp).toBe(0); // Math.max(0, ...) clamps despite the overkill power
    (rect as ReturnType<typeof vi.fn>).mockClear();
    battleDraw();
    const widths = (rect as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[2] as number);
    expect(widths.length).toBeGreaterThan(0); // sanity: the draw actually ran
    expect(widths.every((w) => w >= 0)).toBe(true); // no rect (incl. the hp-bar fill) ever gets a negative width
  });
});

// ── empty battle inventory refuses ITEM (battle.ts:490-495) ───────────────
describe('empty battle inventory refuses ITEM (battle.ts:490-495)', () => {
  it('opening ITEM with nothing usable shows a refusal and costs no turn', () => {
    setBattleRng(mulberry32(42));
    quest.items = []; // nothing usable
    begin('guard_voltorbb');
    settle();
    tap('down'); // 0→1
    tap('down'); // 1→2
    tap('down'); // 2→3 = ITEM
    tap('a');
    expect(b().phase).toBe('anim'); // openItemMenu bails before entering 'item'
    frame(); // shift the refusal message into b.msg
    expect(b().msg!.lines).toEqual(['No usable', 'items!']);
    popMsg();
    expect(b().phase).toBe('menu'); // bounced back, no turn spent
    expect(G.party[0].hp).toBe(maxHp(SPECIES.koffink, 5)); // enemy never moved
  });
});

// ── lv-50 mon wins a battle (no-events award path, battle.ts:663-676) ─────
describe('lv-50 mon wins a battle (no-events award path, battle.ts:663-676)', () => {
  it('a maxed mon still wins cleanly, with gainXp yielding zero level-up events', () => {
    setBattleRng(mulberry32(3));
    G.party = [makeMon(SPECIES.koffink, 50)];
    const xpBefore = G.party[0].xp;
    begin('guard_voltorbb');
    fightItOut();
    expect(G.battle).toBeNull();
    expect(follow).toEqual(ENCOUNTERS.guard_voltorbb.onWin);
    expect(G.party[0].lv).toBe(50); // capped — gainXp's while(mon.lv < target) loop never runs
    expect(G.party[0].xp).toBe(xpBefore); // xp is already at the L50 ceiling; gainXp no-ops
  });
});

// ── maybeEvolve degrades on an unregistered target (battle.ts:689) ────────
describe('maybeEvolve degrades cleanly on an unregistered evolvesTo target (battle.ts:689)', () => {
  it('an evolvesTo id with no matching SPECIES entry skips the evolve prompt instead of crashing', () => {
    SPECIES.test_typo_evolver = {
      id: 'test_typo_evolver',
      name: 'TYPOMON',
      type: ['NORMAL'],
      baseHp: 60,
      atk: 200,
      def: 40,
      spd: 50,
      moves: [{ lv: 1, move: 'tackle' }],
      evolvesTo: { id: 'no_such_species', lv: 6 }, // typo'd/unregistered target
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    ENCOUNTERS.test_typo_evolve = { foe: { species: 'voltorbb', lv: 7 }, winText: [], onWin: [], onLose: [], onFlee: [] };
    setBattleRng(mulberry32(13));
    G.party = [makeMon(SPECIES.test_typo_evolver, 5)];
    begin('test_typo_evolve');
    fightItOut();
    expect(G.battle).toBeNull(); // never got stuck in an evolve prompt
    expect(G.party[0].species).toBe('test_typo_evolver'); // unchanged — no crash, no silent swap
    // lv7 foe → xpFromWin(7)=98 → ONB.1 boost ×2.25 at lv5 → floor(98×2.25)=220
    // → 125+220=345 ≥ 343 (L7): the boosted award crosses L6 (evolvesTo fires,
    // unregistered target skipped) AND L7 in one gainXp call.
    expect(G.party[0].lv).toBe(7); // the level-up itself still landed
  });
});

// ── a benched participant can evolve (battle.ts:723 comment) ──────────────
describe('a benched participant can evolve (battle.ts:723 comment)', () => {
  it('finishEvolve operates on the leveling mon even though a different mon is active', () => {
    setBattleRng(mulberry32(9));
    const bench = makeMon(SPECIES.ratikatt, 15);
    bench.xp = xpForLevel(16) - 1; // one point below the evolve threshold
    G.party = [makeMon(SPECIES.koffink, 5), bench];
    begin('guard_voltorbb'); // lv4 foe, xpFromWin(4)=32 → base 16 each once split;
    // RATIKATT is lv15 (boost ×1, stays 16) — koffink's share differs under
    // ONB.1 but isn't asserted here, only species/level below.
    settle();
    // Switch to the benched mon and back — QOL.7: this is the only way to add
    // a slot to `participants` without leaving it active at win time.
    tap('down'); tap('down'); tap('a'); // ROOT: SWITCH (index 2)
    tap('down'); tap('a'); // switch-list: RATIKATT (index 1), confirm
    settle(); // free attack + "Go!" resolve
    tap('a'); // ROOT: SWITCH again (cursor parked there via rootSel)
    tap('up'); tap('a'); // switch-list: KOFFINK (index 0), confirm
    settle(); // free attack + "Go!" resolve
    tap('up'); tap('up'); // walk the cursor from SWITCH(2) back to FIGHT(0)
    let guard = 0;
    while (G.battle && b().phase !== 'evolve' && guard++ < 20) {
      settle();
      if (G.battle && b().phase === 'menu') { tap('a'); tap('a'); } // FIGHT + first move
    }
    expect(b().phase, 'battle reached the evolve prompt').toBe('evolve');
    expect(b().meIdx).toBe(0); // KOFFINK is active — the offer is for the OTHER slot
    expect(b().evolve!.mon).toBe(G.party[1]); // the benched RATIKATT instance, by reference
    b().sel = 0; // EVOLVE
    tap('a');
    for (let i = 0; i < EVO_END + 5; i++) frame(); // run the cinematic to the held reveal
    tap('a'); // confirm the held reveal
    expect(G.party[1].species).toBe('ratikate'); // the benched mon evolved
    expect(G.party[0].species).toBe('koffink'); // the active mon is untouched
  });
});

// ── evolve + move-replace offer in the same win ────────────────────────────
describe('evolve + move-replace offer in the same win', () => {
  it('resolves the move-replace prompt first, then offers evolution', () => {
    SPECIES.test_evolve_learner = {
      id: 'test_evolve_learner',
      name: 'EVOLEARN',
      type: ['NORMAL'],
      baseHp: 80,
      atk: 200,
      def: 200,
      spd: 50,
      moves: [
        { lv: 1, move: 'tackle' },
        { lv: 1, move: 'smog' },
        { lv: 1, move: 'screech' },
        { lv: 1, move: 'sludge' },
        { lv: 6, move: 'zap' }, // offered — the mon already knows 4
      ],
      evolvesTo: { id: 'ratikate', lv: 6 }, // same level as the move offer
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    // lv7 foe → 98 xp → 125+98=223 ≥ 216(L6) — same recipe as "level-up move
    // replacement" above, now paired with an evolvesTo at the same level.
    ENCOUNTERS.test_evolve_learn = {
      trainer: 'DUMMY',
      foe: { species: 'voltorbb', lv: 7 },
      winText: [],
      onWin: [],
      onLose: [],
      onFlee: [],
    };
    setBattleRng(mulberry32(13));
    G.party = [makeMon(SPECIES.test_evolve_learner, 5)];
    begin('test_evolve_learn');
    settle();
    let guard = 0;
    while (G.battle && b().phase !== 'replace' && guard++ < 10) {
      tap('a');
      tap('a');
      settle();
    }
    expect(b().phase, 'reached the replace prompt').toBe('replace');
    tap('a'); // forget slot 0 (tackle) → learn zap
    settle();
    expect(b().phase, 'the evolve prompt follows the replace prompt').toBe('evolve');
    expect(G.party[0].moves).toEqual(['zap', 'smog', 'screech', 'sludge']); // the move swap already landed
    expect(G.party[0].species).toBe('test_evolve_learner'); // not evolved yet
    b().sel = 0; // EVOLVE
    tap('a');
    for (let i = 0; i < EVO_END + 5; i++) frame();
    tap('a'); // confirm the held reveal
    settle(); // drain the "evolved into RATIKATE!" message through to winBattle
    expect(G.party[0].species).toBe('ratikate');
    expect(G.battle).toBeNull();
  });
});

// ── trainer-flee branch (battle.ts:597) ────────────────────────────────────
describe('trainer-flee branch (battle.ts:597)', () => {
  it('LEG IT from a trainer battle appends "...<TRAINER> is still there" to the flee message', () => {
    setBattleRng(mulberry32(1));
    begin('guard_voltorbb'); // trainer: 'GUARD'
    settle();
    tap('down'); tap('down'); tap('down'); tap('down'); // sel 4 = LEG IT
    tap('a');
    frame(); // shift the queued flee message into b.msg
    // CH4 playtest: word-wrapped at 17 now (wrapWords), not hand-split —
    // same words, the break moved so SECURITY CHIEF can't clip mid-word.
    expect(b().msg!.lines).toEqual(['Got away safely!', '...GUARD is still', 'there.']);
    settle();
    expect(G.battle).toBeNull();
    expect(follow).toBeNull(); // guard_voltorbb.onFlee is empty → null
  });

  it('a wild flee has no trainer-name line at all', () => {
    ENCOUNTERS.test_wild_flee = { foe: { species: 'voltorbb', lv: 3 }, winText: [], onWin: [], onLose: [], onFlee: [] };
    setBattleRng(mulberry32(1));
    begin('test_wild_flee');
    settle();
    tap('down'); tap('down'); tap('down'); tap('down'); // LEG IT
    tap('a');
    frame();
    expect(b().msg!.lines).toEqual(['Got away safely!']);
  });
});

// ── damage() extremes (def, lv boundaries — HRD.8) ─────────────────────────
describe('damage() extremes (def, lv boundaries)', () => {
  const flatMove: MoveDef = { id: 'test_flat', name: 'FLAT', type: 'NORMAL', power: 40, acc: 1, anim: 'lunge', desc: 'A TEST HIT.' };

  it('def===0 is floored to 1 inside damage() — never Infinity', () => {
    // the raw atk/def term divides by zero at def:0; damage() floors def to 1
    // so the result equals the def:1 case instead of leaking Infinity.
    const atZero = damage({ lv: 5, move: flatMove, atk: 60, def: 0, defTypes: ['NORMAL'] }, () => 0);
    expect(Number.isFinite(atZero)).toBe(true);
    expect(atZero).toBe(damage({ lv: 5, move: flatMove, atk: 60, def: 1, defTypes: ['NORMAL'] }, () => 0));
  });

  it('def:1 at lv1 stays finite and matches the hand-derived formula', () => {
    // dmg = floor(floor(((2·lv/5+2)·power·atk/def)/50+2)·mult·roll); mult=1
    // (NORMAL v NORMAL, neutral), roll=1 (rng()=0 → 1-0·0.15).
    // lv1: (2·1/5+2)=2.4; 2.4·40·60=5760; /50=115.2; +2=117.2; floor=117.
    expect(damage({ lv: 1, move: flatMove, atk: 60, def: 1, defTypes: ['NORMAL'] }, () => 0)).toBe(117);
  });

  it('def:1 at lv50 stays finite and matches the hand-derived formula', () => {
    // lv50: (2·50/5+2)=22; 22·40·60=52800; /50=1056; +2=1058; floor=1058.
    expect(damage({ lv: 50, move: flatMove, atk: 60, def: 1, defTypes: ['NORMAL'] }, () => 0)).toBe(1058);
  });

  it('the def floor keeps a def:0 defender\'s float number finite (foe side)', () => {
    MOVES.test_zerodef_hit = { id: 'test_zerodef_hit', name: 'ZDHIT', type: 'NORMAL', power: 40, acc: 1, anim: 'lunge', desc: 'A TEST HIT.' };
    SPECIES.test_zerodef = {
      id: 'test_zerodef',
      name: 'ZERODEF',
      type: ['NORMAL'],
      baseHp: 60,
      atk: 60,
      def: 0, // the boundary under test
      spd: 50,
      moves: [{ lv: 1, move: 'tackle' }],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    SPECIES.test_attacker = {
      id: 'test_attacker',
      name: 'ATKER',
      type: ['NORMAL'],
      baseHp: 60,
      atk: 60,
      def: 40,
      spd: 50,
      moves: [{ lv: 1, move: 'test_zerodef_hit' }],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    ENCOUNTERS.test_zerodef_enc = { foe: { species: 'test_zerodef', lv: 5 }, winText: [], onWin: [], onLose: [], onFlee: [] };
    setBattleRng(mulberry32(1));
    G.party = [makeMon(SPECIES.test_attacker, 5)];
    begin('test_zerodef_enc');
    settle();
    const startHp = b().foe.hp;
    tap('a'); tap('a');
    frame();
    popMsg();
    let guard = 0;
    while (b().foe.hp === startHp && guard++ < 60) frame();
    expect(guard).toBeLessThan(60);
    expect(b().float).toBeTruthy();
    expect(b().float!.side).toBe('foe');
    expect(Number.isFinite(b().float!.amt)).toBe(true); // never "-Infinity" on screen
  });

  it('the def floor also protects the party side (me side)', () => {
    MOVES.test_whiff3 = { id: 'test_whiff3', name: 'WHIFF3', type: 'NORMAL', power: 35, acc: 0, anim: 'lunge', desc: 'A TEST WHIFF.' };
    MOVES.test_zerodef_hit2 = { id: 'test_zerodef_hit2', name: 'ZDHIT2', type: 'NORMAL', power: 40, acc: 1, anim: 'lunge', desc: 'A TEST HIT.' };
    SPECIES.test_zerodef_me = {
      id: 'test_zerodef_me',
      name: 'ZDEFME',
      type: ['NORMAL'],
      baseHp: 200, // high hp — survives repeated foe hits while my own move always whiffs
      atk: 60,
      def: 0, // the boundary under test
      spd: 50,
      moves: [{ lv: 1, move: 'test_whiff3' }], // acc 0 — my own attack never lands, foe always gets its turn
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    SPECIES.test_zerodef_foe = {
      id: 'test_zerodef_foe',
      name: 'ZDEFFOE',
      type: ['NORMAL'],
      baseHp: 60,
      atk: 60,
      def: 40,
      spd: 50,
      moves: [{ lv: 1, move: 'test_zerodef_hit2' }],
      front: SPECIES.koffink.front,
      back: SPECIES.koffink.back,
      pal: SPECIES.koffink.pal,
      catchRate: 0.5,
      heightM: 0.5,
      weightKg: 1.0,
      dex: ['TEST.'],
    };
    ENCOUNTERS.test_zerodef_enc2 = { foe: { species: 'test_zerodef_foe', lv: 5 }, winText: [], onWin: [], onLose: [], onFlee: [] };
    setBattleRng(mulberry32(2));
    G.party = [makeMon(SPECIES.test_zerodef_me, 5)];
    begin('test_zerodef_enc2');
    settle();
    const startHp = G.party[0].hp;
    tap('a'); tap('a'); // FIGHT, only move (guaranteed miss)
    let guard = 0;
    while (G.party[0].hp === startHp && guard++ < 200) {
      const s = b();
      if (s.msg) popMsg();
      else frame();
    }
    expect(guard).toBeLessThan(200);
    expect(b().float).toBeTruthy();
    expect(b().float!.side).toBe('me');
    expect(Number.isFinite(b().float!.amt)).toBe(true); // never "-Infinity" on screen
  });
});

// ── SIDE.5: spar battles — the training exemption ────────────────────────
describe('spar battles (SIDE.5 training exemption)', () => {
  afterEach(() => {
    delete ENCOUNTERS.test_spar;
  });

  it('losing a spar: no coin loss, no warp, party healed, onLose is a true epilogue', () => {
    // same foe + seed as the whiteout test, so the loss is guaranteed;
    // only the exit differs — that difference IS the contract
    setBattleRng(mulberry32(5));
    ENCOUNTERS.test_spar = {
      ...ENCOUNTERS.guard_voltorbb,
      spar: true,
      onLose: [{ setFlag: 'briefed' }],
    };
    quest.coins = 100;
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.party[0].hp = 1;
    G.player.x = 3;
    G.player.y = 3;
    const mapBefore = G.map.id;
    begin('test_spar');
    fightItOut();
    expect(G.battle).toBeNull();
    expect(quest.coins).toBe(100); // no 10% disgrace tax
    expect(G.party[0].hp).toBe(maxHp(SPECIES.koffink, 5)); // patched up like the whiteout heals
    expect(G.map.id).toBe(mapBefore); // no HQ warp
    expect(G.player.x).toBe(3);
    expect(G.player.y).toBe(3);
    expect(G.state).toBe('world'); // winBattle-style exit, no fade
    expect(follow).toEqual([{ setFlag: 'briefed' }]); // runs AFTER the exit, not post-whiteout
  });

  it('a non-spar loss still whiteouts (the exemption is opt-in)', () => {
    setBattleRng(mulberry32(5));
    quest.coins = 100;
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.party[0].hp = 1;
    begin('guard_voltorbb');
    fightItOut();
    expect(quest.coins).toBe(90);
    expect(G.map.id).toBe('hq');
    expect(G.state).toBe('worldwait');
  });

  it('winning a spar exits normally with onWin (spar only changes the loss path)', () => {
    setBattleRng(mulberry32(42)); // the seed the guard-battle golden wins with
    ENCOUNTERS.test_spar = {
      ...ENCOUNTERS.guard_voltorbb,
      spar: true,
      onWin: [{ setFlag: 'guardBeaten' }],
    };
    begin('test_spar');
    fightItOut();
    expect(G.battle).toBeNull();
    expect(follow).toEqual([{ setFlag: 'guardBeaten' }]);
  });
});

// ── ONB.5-FB: per-encounter foe moveset ───────────────────────────────────
describe('EncounterDef.foe.moves override', () => {
  afterEach(() => {
    delete ENCOUNTERS.test_moves;
  });

  it('replaces the learnset for that encounter only, leaving stats alone', () => {
    setBattleRng(mulberry32(42));
    ENCOUNTERS.test_moves = {
      ...ENCOUNTERS.guard_voltorbb,
      foe: { species: 'ekanzz', lv: 5, moves: ['chomp'] },
    };
    begin('test_moves');
    expect(b().foe.moves).toEqual(['chomp']);
    // level and therefore hp/xp yield are untouched — the whole point of
    // overriding moves rather than raising the level
    expect(b().foe.lv).toBe(5);
    expect(b().foe.hp).toBe(maxHp(SPECIES.ekanzz, 5));
  });

  it('without an override the learnset still decides', () => {
    setBattleRng(mulberry32(42));
    ENCOUNTERS.test_moves = {
      ...ENCOUNTERS.guard_voltorbb,
      foe: { species: 'ekanzz', lv: 5 },
    };
    begin('test_moves');
    expect(b().foe.moves).toEqual(['wrap']);
  });

  it('the override is copied, so a battle can never mutate the encounter data', () => {
    setBattleRng(mulberry32(42));
    const moves: ('chomp' | 'bite')[] = ['chomp'];
    ENCOUNTERS.test_moves = {
      ...ENCOUNTERS.guard_voltorbb,
      foe: { species: 'ekanzz', lv: 5, moves },
    };
    begin('test_moves');
    b().foe.moves.push('bite');
    expect(moves).toEqual(['chomp']); // the shipped table is untouched
  });
});

// ── ONB.5: mid-battle coaching — the spar-only beat table ─────────────────
// The beats are content (EncounterDef.coach); these pin the ENGINE contract:
// when each beat fires, that it fires at most once, that `unless` suppresses
// a nudge the player has already outgrown, and that a real fight can never
// coach even with a table attached.
describe('battle coaching (ONB.5)', () => {
  const FRAME = ['Just a drill.'];
  const HURT = ['You are hurt!'];
  const HEALED = ['Now SWIPE me!'];
  const LOW = ['SODA, now!'];

  afterEach(() => {
    delete ENCOUNTERS.test_coach;
  });

  /** settle(), but returning every message page it dismissed on the way. */
  function record(): string[] {
    const seen: string[] = [];
    let guard = 0;
    while (G.battle && guard++ < 400) {
      const s = G.battle;
      if (s.msg) {
        seen.push(s.msg.lines.join(' '));
        popMsg();
      } else if (s.queue.length || s.phase === 'slide' || s.phase === 'open' || s.phase === 'anim') frame();
      else return seen;
    }
    return seen;
  }
  /** One FIGHT turn with the first move; returns the pages it produced. */
  function fightTurn(): string[] {
    tap('a'); // FIGHT
    tap('a'); // first move
    return record();
  }
  function coached(on: 'firstTurn' | 'playerHurt' | 'itemUsed' | 'lowHp', say: string[], unless?: 'swiped' | 'itemUsed'): void {
    ENCOUNTERS.test_coach = {
      ...ENCOUNTERS.guard_voltorbb,
      spar: true,
      coach: [{ on, say, ...(unless ? { unless } : {}) }],
    };
  }

  it('firstTurn coaching lands before the player ever reaches the menu', () => {
    setBattleRng(mulberry32(42));
    coached('firstTurn', FRAME);
    begin('test_coach');
    const seen = record();
    expect(seen).toContain(FRAME.join(' '));
    expect(seen.indexOf(FRAME.join(' '))).toBe(seen.length - 1); // after "Go! …", last thing said
    expect(b().phase).toBe('menu'); // and the turn is handed over normally
  });

  it('a coach table on a NON-spar encounter never fires (training only)', () => {
    setBattleRng(mulberry32(42));
    ENCOUNTERS.test_coach = {
      ...ENCOUNTERS.guard_voltorbb, // no spar: true
      coach: [{ on: 'firstTurn', say: FRAME }],
    };
    begin('test_coach');
    expect(record()).not.toContain(FRAME.join(' '));
  });

  it('playerHurt fires on the first damage taken and never again', () => {
    setBattleRng(mulberry32(5)); // the seed whose foe reliably connects
    coached('playerHurt', HURT);
    G.party = [makeMon(SPECIES.koffink, 5)];
    begin('test_coach');
    const seen = record();
    for (let i = 0; i < 3 && G.battle; i++) seen.push(...fightTurn());
    expect(seen.filter((l) => l === HURT.join(' '))).toHaveLength(1);
  });

  it('itemUsed fires when a heal actually lands', () => {
    setBattleRng(mulberry32(42));
    coached('itemUsed', HEALED);
    quest.items.push('SODA');
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.party[0].hp = 1;
    begin('test_coach');
    record();
    tap('down');
    tap('down');
    tap('down'); // ITEM
    tap('a'); // open
    tap('a'); // first item
    record();
    tap('a'); // confirm the active mon
    expect(record()).toContain(HEALED.join(' '));
  });

  it('a refused heal does not count as itemUsed (no turn passed, nothing learned)', () => {
    setBattleRng(mulberry32(42));
    coached('itemUsed', HEALED);
    quest.items.push('SODA');
    G.party = [makeMon(SPECIES.koffink, 5)]; // full hp — the heal refuses
    begin('test_coach');
    record();
    tap('down');
    tap('down');
    tap('down');
    tap('a');
    tap('a');
    record();
    tap('a'); // confirm the full-hp mon
    expect(record()).not.toContain(HEALED.join(' '));
  });

  it("unless: 'itemUsed' suppresses a nudge the player has already outgrown", () => {
    setBattleRng(mulberry32(5));
    coached('playerHurt', HURT, 'itemUsed');
    quest.items.push('SODA');
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.party[0].hp = 1;
    begin('test_coach');
    record();
    tap('down');
    tap('down');
    tap('down');
    tap('a');
    tap('a');
    record();
    tap('a'); // heal lands, and the foe's counter-attack follows
    const seen = record();
    expect(G.party[0].hp).toBeGreaterThan(1); // the heal really happened
    expect(seen).not.toContain(HURT.join(' ')); // …so "you are hurt" is old news
  });

  it("unless: 'swiped' suppresses a SWIPE nudge once the player has swiped", () => {
    setBattleRng(mulberry32(42));
    coached('playerHurt', HEALED, 'swiped');
    G.party = [makeMon(SPECIES.koffink, 5)];
    begin('test_coach');
    record();
    tap('down'); // sel 1 = SWIPE
    tap('a');
    const seen = record();
    for (let i = 0; i < 3 && G.battle; i++) seen.push(...fightTurn());
    expect(quest.coins).toBeGreaterThan(0); // the swipe landed
    expect(seen).not.toContain(HEALED.join(' '));
  });

  it('lowHp waits for the mon to actually be in trouble, and yields to playerHurt', () => {
    setBattleRng(mulberry32(5));
    ENCOUNTERS.test_coach = {
      ...ENCOUNTERS.guard_voltorbb,
      spar: true,
      coach: [
        { on: 'playerHurt', say: HURT },
        { on: 'lowHp', say: LOW },
      ],
    };
    G.party = [makeMon(SPECIES.koffink, 5)];
    begin('test_coach');
    const first = record();
    const turn1 = fightTurn();
    // the first hit teaches playerHurt; lowHp must not double up on that beat
    expect(turn1).toContain(HURT.join(' '));
    expect(turn1).not.toContain(LOW.join(' '));
    const rest: string[] = [...first, ...turn1];
    for (let i = 0; i < 6 && G.battle; i++) rest.push(...fightTurn());
    // koffink is worn down over the fight, so the fallback nudge does arrive —
    // exactly once, and only after playerHurt has had its turn
    expect(rest.filter((l) => l === LOW.join(' ')).length).toBeLessThanOrEqual(1);
  });

  it('coachIf gates the whole table — a rematch gets no coaching at all', () => {
    setBattleRng(mulberry32(42));
    ENCOUNTERS.test_coach = {
      ...ENCOUNTERS.guard_voltorbb,
      spar: true,
      coach: [{ on: 'firstTurn', say: FRAME }],
      coachIf: { notFlag: 'drillBattleDone' },
    };
    quest.flags.drillBattleDone = true; // the veteran's rematch
    begin('test_coach');
    expect(record()).not.toContain(FRAME.join(' '));
    expect(b().coachOn).toBe(false);
  });

  it('coachIf passing lets the table through (the teaching run)', () => {
    setBattleRng(mulberry32(42));
    ENCOUNTERS.test_coach = {
      ...ENCOUNTERS.guard_voltorbb,
      spar: true,
      coach: [{ on: 'firstTurn', say: FRAME }],
      coachIf: { notFlag: 'drillBattleDone' },
    };
    quest.flags.drillBattleDone = false;
    begin('test_coach');
    expect(record()).toContain(FRAME.join(' '));
  });

  it('coachIf is resolved once at battle start, not re-read mid-fight', () => {
    setBattleRng(mulberry32(42));
    ENCOUNTERS.test_coach = {
      ...ENCOUNTERS.guard_voltorbb,
      spar: true,
      coach: [{ on: 'playerHurt', say: HURT }],
      coachIf: { notFlag: 'drillBattleDone' },
    };
    quest.flags.drillBattleDone = false;
    G.party = [makeMon(SPECIES.koffink, 5)];
    begin('test_coach');
    record();
    // an encounter's own onWin sets this flag — it must not silence coaching
    // that is already underway in the same battle
    quest.flags.drillBattleDone = true;
    const seen: string[] = [];
    for (let i = 0; i < 3 && G.battle; i++) seen.push(...fightTurn());
    expect(seen).toContain(HURT.join(' '));
  });

  it('an encounter with no coach table queues byte-identical messages (zero-diff)', () => {
    setBattleRng(mulberry32(42));
    begin('guard_voltorbb');
    const seen = record();
    expect(seen).toEqual(['GUARD sent out VOLTORBB!', 'Go! KOFFINK!']);
    expect(b().phase).toBe('menu');
  });
});
