// F43 STA.1 — status effects wired into whole seeded battles (the ball.test
// idiom, copied per-file). Rolls are scripted through `seq()` rather than a
// mulberry32 seed search where a hand-picked sequence is clearer than a
// search would be (PLAN §2 tests). Every expected number is DERIVED from
// the same pure functions battle.ts calls (damage/poisonDamage/maxHp/
// catchChance), never captured from a run.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };

import { vi } from 'vitest';
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
import { startBattle, battleUpdate, setBattleRng, xpFromWin, lowLevelBoost, type BattleState } from '../src/systems/battle';
import { battleDraw } from '../src/systems/battleDraw';
import { BALL_ITEM } from '../src/data/items';
import { ENCOUNTERS } from '../src/data/encounters';
import { SPECIES } from '../src/data/mons';
import { MOVES } from '../src/data/moves';
import { makeMon, maxHp } from '../src/systems/mon';
import { damage } from '../src/systems/combat';
import { catchChance } from '../src/systems/catch';
import { poisonDamage, statusCatchMod } from '../src/systems/status';
import { effectiveness } from '../src/data/typeChart';
import { mulberry32 } from '../src/engine/rng';
import { quest, resetQuest } from '../src/systems/quest';
import { text } from '../src/engine/renderer';
import { Audio2 } from '../src/engine/audio';
import type { ScriptStep } from '../src/types';

// ── frame drivers (copied from ball.test.ts / battle.test.ts) ─────────────
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
function seedWhere(pred: (roll: number) => boolean): number {
  let s = 0;
  while (!pred(mulberry32(s)())) if (++s > 100_000) throw new Error('seedWhere: no seed satisfies pred');
  return s;
}
/** A scripted rng: returns each of `vals` in order, then 0.5 forever. */
function seq(vals: number[]): () => number {
  let i = 0;
  return () => vals[i++] ?? 0.5;
}
/** FIGHT → the move at `idx`. */
function useMoveAt(idx: number): void {
  tap('a'); // FIGHT
  for (let i = 0; i < idx; i++) tap('down');
  tap('a');
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
  ENCOUNTERS.test_sta = { foe: { species: 'voltorbb', lv: 3, moves: ['tackle'] }, winText: [], onWin: [{ setFlag: 'guardBeaten' }], onLose: [], onFlee: [] };
});
afterEach(() => {
  setBattleRng(Math.random);
  delete ENCOUNTERS.test_sta;
});

// ── (a) status-free parity pin ─────────────────────────────────────────────
describe('(a) a status-free fight rolls exactly as before the status wiring', () => {
  it('guard_voltorbb under seed 42 hits the exact pre-STA.1 pins (battle.test.ts)', () => {
    setBattleRng(mulberry32(42));
    begin('guard_voltorbb');
    let turns = 0;
    settle();
    while (G.battle && turns++ < 25) {
      tap('a'); // FIGHT
      tap('a'); // first move (tackle)
      settle();
    }
    expect(G.battle).toBeNull();
    expect(follow).toEqual(ENCOUNTERS.guard_voltorbb.onWin);
    const me = G.party[0];
    expect(me.lv).toBe(5);
    expect(me.xp).toBe(125 + Math.floor(xpFromWin(4) * lowLevelBoost(5)));
    expect(me.hp).toBe(15);
    expect(turns).toBe(5);
  });
});

// ── (b) SMOG poisons the foe; the tick lands after its next action ────────
describe('(b) SMOG poisons the foe; poison ticks at the end of its own action', () => {
  it('foe.status becomes PSN and its hp drops again after its turn', () => {
    begin('test_sta');
    settle();
    const koffinkSp = SPECIES.koffink;
    const voltorbbSp = SPECIES.voltorbb;
    const smog = MOVES.smog;
    // 1: player accuracy (hit) 2: player damage roll 3: inflict roll (<0.3)
    // 4: foe move index (only 1 move) 5: foe accuracy (hit) 6: foe damage roll
    setBattleRng(seq([0.1, 0.4, 0.1, 0.5, 0.1, 0.4]));
    const atkDmg = damage({ lv: 5, move: smog, atk: koffinkSp.atk, def: voltorbbSp.def, defTypes: voltorbbSp.type }, seq([0.4]));
    const foeMax = maxHp(voltorbbSp, 3);
    const poisonAmt = poisonDamage({ status: 'PSN' } as never, foeMax);
    useMoveAt(1); // smog is koffink's second learnset move (lv1 tackle, lv1 smog)
    settle();
    expect(b().foe.status).toBe('PSN');
    expect(b().foe.hp).toBe(Math.max(0, Math.max(0, foeMax - atkDmg) - poisonAmt));
  });
});

// ── (c) ZAP inflicts PAR; a PAR gate-skip loses the turn with no damage ───
describe('(c) ZAP inflicts PAR; a skipped PAR turn deals no damage', () => {
  it('a landed ZAP sets the player mon to PAR', () => {
    ENCOUNTERS.test_sta.foe.moves = ['zap'];
    begin('test_sta');
    settle();
    // 1: player accuracy (hit) 2: player damage roll 3: foe move index
    // 4: foe accuracy (hit, zap acc=1 always hits) 5: foe damage roll
    // 6: foe's inflict roll (<0.3)
    setBattleRng(seq([0.1, 0.4, 0.5, 0.1, 0.4, 0.1]));
    useMoveAt(0); // tackle
    settle();
    expect(G.party[0].status).toBe('PAR');
  });

  it('a PAR gate-skip loses the turn — the foe is untouched', () => {
    begin('test_sta');
    settle();
    G.party[0].status = 'PAR';
    const foeHpBefore = b().foe.hp;
    // 1: PAR gate roll (< PAR_SKIP=0.25 → skip) 2: foe move index
    // 3: foe accuracy (hit) 4: foe damage roll
    setBattleRng(seq([0.24, 0.5, 0.1, 0.4]));
    useMoveAt(0);
    settle();
    expect(b().foe.hp).toBe(foeHpBefore); // the player's move never fired
    expect(G.party[0].status).toBe('PAR'); // still PAR — no cure mid-battle
  });
});

// ── (d) SLP: two lost actions (skip, then wake), then a normal turn ───────
describe('(d) SLP loses exactly sleepT actions, then acts normally', () => {
  it('sleepT 2 → skip, wake, then a real hit', () => {
    G.party = [makeMon(SPECIES.koffink, 20)]; // hp buffer for 3 foe hits
    begin('test_sta');
    settle();
    const mon = G.party[0];
    mon.status = 'SLP';
    mon.sleepT = 2;
    setBattleRng(() => 0.5); // mid-value throughout: every acc check in this fixture hits
    useMoveAt(0);
    settle();
    expect(mon.status).toBe('SLP');
    expect(mon.sleepT).toBe(1);
    useMoveAt(0);
    settle();
    expect(mon.status).toBeUndefined();
    expect(mon.sleepT).toBeUndefined();
    const foeHpBefore = b().foe.hp;
    useMoveAt(0);
    settle();
    expect(b().foe.hp).toBeLessThan(foeHpBefore); // the third turn actually swings
  });
});

// ── (e) PSN can finish a fight off — xp/onWin still run ────────────────────
describe('(e) a PSN foe can faint from the tick, not a hit', () => {
  it('a missed player turn still lets the poison tick KO the 1-hp foe', () => {
    begin('test_sta');
    settle();
    b().foe.hp = 1;
    b().foe.status = 'PSN';
    const xpBefore = G.party[0].xp;
    // 1: player accuracy MISS (>acc=0.95) 2: foe move index 3: foe accuracy
    // (hit) 4: foe damage roll — no roll for the poison tick itself
    setBattleRng(seq([0.99, 0.5, 0.1, 0.4]));
    useMoveAt(0); // tackle — scripted to miss so the foe survives the swing at 1 hp
    settle();
    expect(G.battle).toBeNull();
    expect(follow).toEqual([{ setFlag: 'guardBeaten' }]);
    expect(G.party[0].xp).toBeGreaterThan(xpBefore);
  });
});

// ── (f) a SLP foe is easier to catch — statusCatchMod composes ────────────
describe('(f) SLP composes into the catch roll via statusCatchMod', () => {
  it('a roll that fails a healthy foe catches an SLP one, matching catchChance', () => {
    quest.items.push(BALL_ITEM);
    begin('test_sta');
    settle();
    const hp = 10; // above the red bar (voltorbb lv3 max 15)
    b().foe.hp = hp;
    b().foe.status = 'SLP';
    const max = maxHp(SPECIES.voltorbb, 3);
    const pPlain = catchChance(SPECIES.voltorbb.catchRate, hp, max); // statusMod defaults to 1
    const pSlp = catchChance(SPECIES.voltorbb.catchRate, hp, max, 1, statusCatchMod('SLP'));
    expect(pSlp).toBeGreaterThan(pPlain);
    expect(pSlp).toBeLessThan(1);
    const seed = seedWhere((r) => r >= pPlain && r < pSlp);
    setBattleRng(mulberry32(seed));
    tap('down'); // sel 1 = SWIPE (one ball kind held — throws straight away)
    tap('a');
    settle();
    expect(G.battle).toBeNull(); // caught: the SLP mod is what made this roll a catch
    expect(G.party).toHaveLength(2);
  });
});

// ── (g) HUD: FB round — the level text is OVERWRITTEN by the status, not
//      shared beside it (glyphs advance 8px; a status glyph at a fixed x
//      offset overdrew any 6+-glyph name) ─────────────────────────────────
describe('(g) HUD: status replaces the level text (GB parity)', () => {
  it('a PSN foe draws PSN at (72,8), never L<lv> there', () => {
    begin('test_sta');
    settle();
    b().foe.status = 'PSN';
    vi.mocked(text).mockClear();
    battleDraw();
    expect(text).toHaveBeenCalledWith('PSN', 72, 8, expect.any(String));
    expect(text).not.toHaveBeenCalledWith('L' + b().foe.lv, 72, 8, expect.any(String));
  });
  it('a healthy foe draws L<lv> at (72,8)', () => {
    begin('test_sta');
    settle();
    vi.mocked(text).mockClear();
    battleDraw();
    expect(text).toHaveBeenCalledWith('L' + b().foe.lv, 72, 8, expect.any(String));
  });
  it('a PAR player mon draws PAR at (138,64); healthy draws L<lv> there', () => {
    begin('test_sta');
    settle();
    G.party[0].status = 'PAR';
    vi.mocked(text).mockClear();
    battleDraw();
    expect(text).toHaveBeenCalledWith('PAR', 136, 64, expect.any(String)); // 2px left of the level: the third glyph's leg would clip at x 160
    G.party[0].status = undefined;
    vi.mocked(text).mockClear();
    battleDraw();
    expect(text).toHaveBeenCalledWith('L' + G.party[0].lv, 138, 64, expect.any(String));
  });
});

// ── (h) FB round: the poison tick no longer clobbers the hit's own float —
//      it waits for the hit's queued messages to actually drain first ─────
describe('(h) the poison tick defers behind the hit\'s own messages', () => {
  it('the float is still the hit\'s right after it lands, and only becomes the poison tick once the queue reaches it', () => {
    begin('test_sta');
    settle();
    const mon = G.party[0];
    mon.status = 'PSN'; // the PLAYER carries PSN — its own tick is what we're timing
    const koffinkSp = SPECIES.koffink;
    const voltorbbSp = SPECIES.voltorbb;
    const smog = MOVES.smog;
    // poisonTick applies the drop in the poison line's `show` hook, so even a
    // neutral tackle defers it to the next dequeue. SMOG is used because its
    // own "was poisoned!" page sits in the queue first — that makes the
    // MULTI-message deferral observable (the hit's float survives across a
    // whole queued page before the tick lands), not just a one-frame gap.
    // 1: player accuracy (hit) 2: player damage roll 3: inflict roll on the
    // foe (<0.3, succeeds — queues its own "was poisoned!" message first)
    setBattleRng(seq([0.1, 0.4, 0.1]));
    const hitDmg = damage({ lv: 5, move: smog, atk: koffinkSp.atk, def: voltorbbSp.def, defTypes: voltorbbSp.type }, seq([0.4]));
    const poisonAmt = poisonDamage(mon, maxHp(koffinkSp, 5));
    const hpBeforeTick = mon.hp;

    useMoveAt(1); // smog is koffink's second learnset move
    let guard = 0;
    while (b().float?.side !== 'foe' && guard++ < 200) {
      if (b().msg) popMsg();
      else frame();
    }
    expect(b().float).toMatchObject({ side: 'foe', amt: hitDmg });
    expect(mon.hp).toBe(hpBeforeTick); // the poison tick hasn't touched hp yet

    guard = 0;
    while (b().float?.side !== 'me' && G.battle && guard++ < 200) {
      if (b().msg) popMsg();
      else frame();
    }
    expect(b().float).toMatchObject({ side: 'me', amt: poisonAmt, mult: 1 });
    expect(mon.hp).toBe(hpBeforeTick - poisonAmt); // hp only drops once the tick's own float is on screen
  });
});

// ── (i) HYPNO — the power-0 branch, never exercised until this FB round ───
describe('(i) HYPNO actually executes (power-0 branch)', () => {
  it('a landed HYPNO from the player puts the foe to sleep: no damage, no hit sfx', () => {
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.party[0].moves = ['hypno'];
    begin('guard_voltorbb');
    settle();
    const foeHpBefore = b().foe.hp;
    vi.mocked(Audio2.sfx).mockClear();
    // 1: player accuracy (hypno acc 0.7 — <=0.7 hits) 2: sleep roll (rollInt
    // 1..3, chance is 1 so no chance roll is spent). The foe's own turn
    // gates to 'skip' (sleepT just set > 0) and never reaches its move/acc/
    // damage rolls, so nothing more is scripted.
    setBattleRng(seq([0.5, 0.5]));
    useMoveAt(0); // koffink's only move is hypno
    settle();
    expect(b().foe.status).toBe('SLP');
    // rollInt(1,3, rng=0.5) = 2 at infliction; the foe's own turn (gated to
    // 'skip' — "fast asleep!", not damage) decrements it once more to 1.
    expect(b().foe.sleepT).toBe(1);
    expect(b().foe.hp).toBe(foeHpBefore); // power-0 — no damage
    expect(Audio2.sfx).not.toHaveBeenCalledWith('hit');
  });

  it('a foe HYPNO puts the player mon to sleep: hp unchanged', () => {
    ENCOUNTERS.test_sta.foe.moves = ['hypno'];
    begin('test_sta');
    settle();
    const mon = G.party[0];
    const hpBefore = mon.hp;
    // 1: player accuracy (tackle, hit) 2: player damage roll 3: foe move
    // index (only 1 move) 4: foe accuracy (hypno acc 0.7, hit) 5: foe
    // damage roll (rolled but unused — power 0) 6: sleep roll
    setBattleRng(seq([0.1, 0.4, 0.5, 0.5, 0.4, 0]));
    useMoveAt(0); // tackle
    settle();
    expect(mon.status).toBe('SLP');
    expect(mon.sleepT).toBeGreaterThanOrEqual(1);
    expect(mon.sleepT).toBeLessThanOrEqual(3);
    expect(mon.hp).toBe(hpBefore);
  });
});

// ── (j) F43-FB A6: PAR wears off on every battle exit that keeps the party
//      as-is; PSN and SLP persist through a win ──────────────────────────
describe('(j) F43-FB A6: PAR shakes off at battle end; PSN/SLP persist', () => {
  it('a win clears the player mon\'s PAR', () => {
    begin('test_sta');
    settle();
    const mon = G.party[0];
    mon.status = 'PAR';
    b().foe.hp = 1; // any landed tackle kills it
    // 1: PAR gate (>=0.25 -> act) 2: player accuracy (hit) 3: player damage roll
    setBattleRng(seq([0.5, 0.1, 0.99]));
    useMoveAt(0); // tackle — no status on this move, no inflict roll
    settle();
    expect(G.battle).toBeNull();
    expect(mon.status).toBeUndefined();
  });

  it('a win (via a catch, so the player mon never has to act) leaves PSN and SLP with sleepT untouched', () => {
    // A catch ends the fight through SWIPE/ITEM, not FIGHT — it never
    // touches beforeAction, so the player mon's own status is irrelevant to
    // how the win happens; only whether shakeOffParalysis (PAR-only) leaves
    // it alone is under test.
    quest.items.push(BALL_ITEM);
    begin('test_sta');
    settle();
    const mon = G.party[0];
    mon.status = 'PSN';
    const hp = 1;
    b().foe.hp = hp;
    const max = maxHp(SPECIES.voltorbb, 3);
    const p = catchChance(SPECIES.voltorbb.catchRate, hp, max);
    setBattleRng(mulberry32(seedWhere((r) => r < p)));
    tap('down'); // SWIPE
    tap('a');
    settle();
    expect(G.battle).toBeNull();
    expect(mon.status).toBe('PSN');
  });

  it('a win (via a catch) leaves SLP and its sleepT untouched', () => {
    resetQuest();
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.box = [];
    G.battle = null;
    G.state = 'world';
    quest.items.push(BALL_ITEM);
    begin('test_sta');
    settle();
    const mon = G.party[0];
    mon.status = 'SLP';
    mon.sleepT = 3;
    const hp = 1;
    b().foe.hp = hp;
    const max = maxHp(SPECIES.voltorbb, 3);
    const p = catchChance(SPECIES.voltorbb.catchRate, hp, max);
    setBattleRng(mulberry32(seedWhere((r) => r < p)));
    tap('down'); // SWIPE
    tap('a');
    settle();
    expect(G.battle).toBeNull();
    expect(mon.status).toBe('SLP');
    expect(mon.sleepT).toBe(3);
  });

  it('LEG IT (flee) clears PAR', () => {
    begin('test_sta');
    settle();
    const mon = G.party[0];
    mon.status = 'PAR';
    tap('down'); tap('down'); tap('down'); tap('down'); // FIGHT->SWIPE->SWITCH->ITEM->LEG IT
    tap('a');
    settle();
    expect(G.battle).toBeNull();
    expect(mon.status).toBeUndefined();
  });

  it('catching the foe clears its PAR before it joins the party', () => {
    quest.items.push(BALL_ITEM);
    begin('test_sta');
    settle();
    const hp = 1;
    b().foe.hp = hp;
    b().foe.status = 'PAR';
    const max = maxHp(SPECIES.voltorbb, 3);
    const p = catchChance(SPECIES.voltorbb.catchRate, hp, max);
    const seed = seedWhere((r) => r < p);
    setBattleRng(mulberry32(seed));
    tap('down'); // sel 1 = SWIPE (one ball kind held — throws straight away)
    tap('a');
    settle();
    expect(G.battle).toBeNull();
    expect(G.party).toHaveLength(2);
    expect(G.party[1].status).toBeUndefined();
  });
});

// ── (k) F43-FB A6: a move's target immune to its TYPE can never be
//      statused by it — no rng consumed on the immune path ────────────────
describe('(k) F43-FB A6: type immunity blocks a move\'s own status too', () => {
  it('THUNDER/SLUDGE carry the data pins used above', () => {
    expect(MOVES.thunder.status).toEqual({ id: 'PAR', chance: 0.2 });
    expect(MOVES.sludge.status).toEqual({ id: 'PSN', chance: 0.3 });
  });

  it('ELECTRIC has no effect on GROUND — the type chart pin this test relies on', () => {
    expect(effectiveness('ELECTRIC', ['GROUND'])).toBe(0);
  });

  it('a GEODOOD hit by ZAP never gets PAR, even under a seed the 30% roll would pass, and consumes no extra rng', () => {
    G.party = [makeMon(SPECIES.geodood, 10)];
    ENCOUNTERS.test_sta.foe.moves = ['zap'];
    begin('test_sta');
    settle();
    const mon = G.party[0];
    const calls: number[] = [];
    const wrapped = seq([0.1, 0.4, 0.5, 0.1, 0.4, 0.1]); // last value: the inflict roll that WOULD pass (<0.3)
    setBattleRng(() => {
      const v = wrapped();
      calls.push(v);
      return v;
    });
    useMoveAt(0); // tackle
    settle();
    expect(mon.status).toBeUndefined(); // GROUND is immune to ELECTRIC — no PAR, ever
    // 1 player acc, 2 player dmg, 3 foe move idx, 4 foe acc — combat.ts's
    // damage() already short-circuits its OWN roll on a 0-effectiveness hit
    // (mult===0 returns before touching rng), so the foe damage roll never
    // fires either; the 6th scripted value (the inflict roll) is skipped on
    // top of that by inflictLine's own immunity check — two independent
    // reasons the same "GROUND is immune to ELECTRIC" fact matters, so this
    // asserts the total is 4, not 5: no roll for the miss, none for a
    // status this move could never land.
    expect(calls.length).toBe(4);
  });
});
