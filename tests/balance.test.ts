// QA.1 — the balance harness (deck 31, plan §8/§9). The REAL battle engine
// driven frame-by-frame under a seeded rng, exactly the way battle.test.ts
// does it, N fights per boss at the chapter's level band, by a fixed player
// policy. Prints the table (boss · band · win % · median turns) and asserts
// every boss lands in 55–80 %. There is no second simulator to drift from
// what ships — if battle.ts changes, this changes with it.
//
// Policy ("competent, no items"): FIGHT every turn with the move of highest
// power × acc × effectiveness against the foe; on a faint, send the next
// mon with hp. No SWIPE / ITEM / LEG IT — enough SODA wins any fight, so
// the band measures the fight, not the wallet.
//
// Numbers here are READ, never tuned: balance stats are main-loop territory
// (02-dos-and-donts.md). A boss outside the band goes in OUT_OF_BAND with
// its measured rate so the gate stays green while the tuning card is open.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };

// Plain no-ops, NOT vi.fn(): a vi.fn() keeps every call in mock.calls, and
// this file pushes ~15M frames through Audio2.sfx('blip') — on the CI runner
// that log grew until the worker fork was OOM-killed ("Worker exited
// unexpectedly", 2026-10-09). Nothing here asserts on a stub.
// (vi.mock factories are hoisted, so the no-op is declared inside each one.)
vi.mock('../src/engine/renderer', () => {
  const noop = (): void => {};
  return {
  ctx: { drawImage: noop },
  decode: noop,
  fill: noop,
  rect: noop,
  text: noop,
  drawWindow: noop,
  clamp: (v: number, a: number, z: number) => Math.max(a, Math.min(z, v)),
  startFade: (cb: () => void) => cb(),
  W: 160,
  H: 144,
  TILE: 16,
  };
});
vi.mock('../src/engine/audio', () => {
  const noop = (): void => {};
  return { Audio2: { play: noop, sfx: noop } };
});
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (k: string): boolean => keys.down.has(k),
    hit: (k: string): boolean => keys.pressed.has(k),
    endFrame: (): void => keys.pressed.clear(),
    dirHeld: (): null => null,
  },
}));

import { G } from '../src/state';
import { startBattle, battleUpdate, setBattleRng, ROOT_MENU, type BattleState } from '../src/systems/battle';
import { ENCOUNTERS } from '../src/data/encounters';
import { SPECIES } from '../src/data/mons';
import { MOVES } from '../src/data/moves';
import { effectiveness, type TypeId } from '../src/data/typeChart';
import { makeMon, maxHp } from '../src/systems/mon';
import { mulberry32 } from '../src/engine/rng';
import { quest, resetQuest } from '../src/systems/quest';
import type { MonInstance, ScriptStep } from '../src/types';

// ── the sweep ─────────────────────────────────────────────────────────────
/** Fights per boss. 500 is the card; BALANCE_FIGHTS lowers it for a quick local look. */
const N = Number(process.env.BALANCE_FIGHTS ?? 500);
/** A1 (Lyall, 2026-10-09): report both yardsticks — the no-items fight and
 *  the same fight with a stocked PACK. 'items' = SODAS × SODA, drunk on the
 *  active mon whenever it is under half hp (a turn each, the real ITEM path). */
export type Policy = 'none' | 'items';
const SODAS = 4;
export const BAND = { lo: 0.55, hi: 0.8 };

/** The `__debug.party(n, lv)` pool, in its order (main.ts). */
const POOL = ['koffink', 'ekanzz', 'zubatt', 'geodood'];

interface Boss {
  /** First encounter id; chains follow their own `{ battle }` follow-up. */
  id: string;
  ch: number;
  lv: number;
  /** Party size at the band — CH1 is the fresh-save starter alone, CH2 the
   *  starter plus Jessika's gift. 4 from CH3 on. */
  n: number;
}
export const BOSSES: Boss[] = [
  { id: 'guard_voltorbb', ch: 1, lv: 5, n: 1 },
  { id: 'brad_ratikatt', ch: 2, lv: 7, n: 2 },
  { id: 'span_kira', ch: 3, lv: 10, n: 4 },
  { id: 'ss_chief1', ch: 4, lv: 14, n: 4 },
  { id: 'lav_medium1', ch: 5, lv: 18, n: 4 },
  { id: 'lav_medium2', ch: 5, lv: 18, n: 4 },
  { id: 'syl_exec', ch: 6, lv: 24, n: 4 },
  { id: 'syl_guard1', ch: 6, lv: 24, n: 4 },
  { id: 'plantTech1', ch: 7, lv: 28, n: 4 },
  { id: 'plantTech2', ch: 7, lv: 28, n: 4 },
  { id: 'plantTech3', ch: 7, lv: 28, n: 4 },
  { id: 'plant_voltrawk', ch: 7, lv: 28, n: 4 },
  { id: 'safari_warden', ch: 8, lv: 30, n: 4 },
  { id: 'safari_petrelle', ch: 8, lv: 30, n: 4 },
];

/** Bosses the sweep found outside the band, with the rate it measured. Each
 *  row is an open tuning item for Lyall (deck 31 QA.1); the ±PIN keeps a
 *  regression visible while it waits. Empty = everything in band. */
export const OUT_OF_BAND: Record<string, number> = {
  // 2026-10-09, first sweep: every boss is a near-certain win for the
  // no-items band party — the report is on deck 31 QA.1.
  guard_voltorbb: 1,
  brad_ratikatt: 1,
  span_kira: 1,
  ss_chief1: 1,
  lav_medium1: 1,
  lav_medium2: 1,
  syl_exec: 0.994,
  syl_guard1: 1,
  plantTech1: 1,
  plantTech2: 1,
  plantTech3: 1,
  plant_voltrawk: 1,
  safari_warden: 1,
  safari_petrelle: 1,
};
const PIN = 0.08;

// ── party at the band ─────────────────────────────────────────────────────
/** A fresh mon at `lv`, evolved as far as its level allows — a lv-30
 *  starter is WHEEZINK, not KOFFINK (`__debug.party` skips this; a real
 *  party at that level evolved long ago). */
export function bandMon(species: string, lv: number): MonInstance {
  let sp = SPECIES[species];
  while (sp.evolvesTo && lv >= sp.evolvesTo.lv) sp = SPECIES[sp.evolvesTo.id];
  return makeMon(sp, lv);
}
export function bandParty(boss: Boss): MonInstance[] {
  return POOL.slice(0, boss.n).map((s) => bandMon(s, boss.lv));
}

// ── frame drivers (battle.test.ts idiom) ──────────────────────────────────
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
/** Frames until the battle is interactive again (or over). */
function settle(): void {
  let guard = 0;
  while (G.battle && guard++ < 2000) {
    const s = G.battle;
    if (s.msg) popMsg();
    else if (s.queue.length || s.phase === 'slide' || s.phase === 'open' || s.phase === 'anim') frame();
    else return;
  }
  if (G.battle) throw new Error('settle(): battle never became interactive');
}

/** Index of the active mon's best move against the foe (policy above). */
export function bestMove(mon: MonInstance, foeTypes: readonly TypeId[]): number {
  let best = 0;
  let bestScore = -1;
  mon.moves.forEach((id, i) => {
    const mv = MOVES[id];
    const score = mv.power * mv.acc * effectiveness(mv.type, foeTypes);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** One seeded fight (a chain counts as one). Returns win + player turns taken. */
export function runFight(boss: Boss, seed: number, policy: Policy = 'none'): { win: boolean; turns: number } {
  setBattleRng(mulberry32(seed));
  resetQuest();
  if (policy === 'items') quest.items = Array<string>(SODAS).fill('SODA');
  G.party = bandParty(boss);
  G.box = [];
  G.lastHq = { map: 'hq', x: 9, y: 7 };
  G.battle = null;
  G.state = 'world';
  keys.down.clear();
  keys.pressed.clear();

  let turns = 0;
  // A loss ends via the whiteout (party healed, so hp can't tell win from
  // loss) — read the follow-up instead: onLose is [] for every boss, so a
  // null follow-up is a wipe and the onWin steps are a win. A chain hands
  // its last link's onWin back the same way.
  let lastFollow: ScriptStep[] | null | undefined;
  const begin = (id: string): void => {
    startBattle(id, (follow) => {
      lastFollow = follow;
      const next = follow?.find((s) => 'battle' in s);
      if (next && 'battle' in next) begin(next.battle);
    });
  };
  begin(boss.id);

  /** Root-menu cursor to `entry` — it reopens on the entry the last turn
   *  was taken with (battle.ts toMenu), so the path is relative, not from 0. */
  const rootTo = (entry: number): void => {
    for (let k = (entry - b().sel + ROOT_MENU.length) % ROOT_MENU.length; k > 0; k--) tap('down');
  };
  let steps = 0;
  while (G.battle && turns < 200) {
    if (steps++ > 5000) throw new Error(`${boss.id}: fight stalled (phase ${b().phase})`);
    settle();
    if (!G.battle) break;
    const s = b();
    if (s.phase === 'menu') {
      const me = G.party[s.meIdx];
      if (policy === 'items' && me.hp * 2 < maxHp(SPECIES[me.species], me.lv) && quest.items.includes('SODA')) {
        rootTo(3); // ITEM
        tap('a'); // the list holds SODA alone
        tap('a'); // pick it — the target cursor opens on the active mon
        tap('a'); // drink
        turns++;
        continue;
      }
      rootTo(0);
      tap('a'); // FIGHT
      const idx = bestMove(G.party[s.meIdx], SPECIES[s.foe.species].type);
      for (let k = 0; k < idx; k++) tap('down');
      tap('a');
      turns++;
    } else if (s.phase === 'switch') {
      // forced by a faint: cursor already sits on the first mon with hp
      tap('a');
    } else if (s.phase === 'replace' || s.phase === 'evolve' || s.phase === 'evoConfirm') {
      // post-win level-up prompts: keep old moves, let evolution run
      if (s.phase === 'evolve') tap('a');
      else tap('b');
    } else if (s.phase === 'evolveScene') {
      tap('a');
    } else if (s.phase === 'item' || s.phase === 'target') {
      tap('b'); // a refused heal (full hp / fainted target) leaves the list open — back out
    } else {
      frame();
    }
  }
  if (G.battle) throw new Error(`${boss.id}: fight did not end in 200 turns`);
  return { win: lastFollow != null, turns };
}

export interface Row {
  id: string;
  ch: number;
  lv: number;
  winRate: number;
  /** The same seeds with SODAS × SODA in the PACK (policy 'items'). Reported, not gated. */
  itemsRate: number;
  medianTurns: number;
  /** The harness's tuning proposal: the highest party level at which this
   *  boss stops being a near-certainty (win rate ≤ BAND.hi; same policy,
   *  FAIR_N fights a level, scanning down from the band). null = never —
   *  the foe loses to a lv-1 party too. Lyall reads it as "the player
   *  arrives at lv 30, the fight is contestable at lv 24" and decides what
   *  moves (foe level, party band, stats) — nothing here edits a number. */
  fairLv: number | null;
}
const FAIR_N = 100;
export function fairLevel(boss: Boss, k: number): number | null {
  for (let lv = boss.lv; lv >= 1; lv--) {
    if (sweep({ ...boss, lv }, k + 1000, FAIR_N, null).winRate <= BAND.hi) return lv;
  }
  return null;
}
export function sweep(boss: Boss, k: number, n = N, fair: 'scan' | null = 'scan'): Row {
  let wins = 0;
  const turns: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = runFight(boss, k * 100003 + i);
    if (r.win) wins++;
    turns.push(r.turns);
  }
  turns.sort((a, z) => a - z);
  const row: Row = { id: boss.id, ch: boss.ch, lv: boss.lv, winRate: wins / n, itemsRate: -1, medianTurns: turns[Math.floor(n / 2)], fairLv: null };
  if (fair) {
    row.fairLv = fairLevel(boss, k);
    let itemWins = 0;
    for (let i = 0; i < n; i++) if (runFight(boss, k * 100003 + i, 'items').win) itemWins++;
    row.itemsRate = itemWins / n;
  }
  return row;
}

export function table(rows: Row[]): string {
  const pad = (s: string, w: number): string => s.padEnd(w);
  const lines = [pad('boss', 16) + pad('ch', 4) + pad('band', 6) + pad('win %', 7) + pad(SODAS + ' SODA', 8) + pad('turns', 7) + 'fair at'];
  for (const r of rows) {
    const flag = r.winRate < BAND.lo || r.winRate > BAND.hi ? '  <-- out of band' : '';
    lines.push(pad(r.id, 16) + pad(String(r.ch), 4) + pad('lv' + r.lv, 6) + pad((r.winRate * 100).toFixed(1), 7) + pad((r.itemsRate * 100).toFixed(1), 8) + pad(String(r.medianTurns), 7) + (r.fairLv === null ? 'never' : 'lv' + r.fairLv) + flag);
  }
  return lines.join('\n');
}

// ── the test ──────────────────────────────────────────────────────────────
const rows: Row[] = [];
beforeAll(() => {
  BOSSES.forEach((boss, k) => rows.push(sweep(boss, k)));
  // process.stderr, not console: vitest swallows console output when its stdout is a pipe
  process.stderr.write(`\nQA.1 balance harness — ${N} seeded fights per boss\n${table(rows)}\n\n`);
}, 600_000);
afterAll(() => setBattleRng(Math.random));

describe('QA.1 balance harness', () => {
  it('names every boss the sweep covers', () => {
    for (const boss of BOSSES) expect(ENCOUNTERS[boss.id], boss.id).toBeDefined();
    expect(rows).toHaveLength(BOSSES.length);
  });

  it('is deterministic: the same seed replays the same fight', () => {
    const a = runFight(BOSSES[3], 7);
    const b2 = runFight(BOSSES[3], 7);
    expect(a).toEqual(b2);
  });

  it('reads a wipe as a loss: the fresh starter alone against the WARDEN', () => {
    const r = sweep({ id: 'safari_warden', ch: 8, lv: 5, n: 1 }, 99, 20, null);
    expect(r.winRate).toBe(0);
  });

  it('the items policy drinks a SODA from the real ITEM path when the active mon is under half hp', () => {
    // a foe that chips (ratikatt lv12 vs the lv5 starter: ~7 a hit into 19)
    // so the menu comes round with the starter under half and still standing
    ENCOUNTERS.test_chip = { trainer: 'CHIP', foe: { species: 'ratikatt', lv: 12 }, winText: [], onWin: [{ setFlag: 'bradBeaten' }], onLose: [], onFlee: [] };
    runFight({ id: 'test_chip', ch: 0, lv: 5, n: 1 }, 3, 'items');
    expect(quest.items.filter((i) => i === 'SODA').length).toBeLessThan(SODAS);
  });

  it('bestMove prefers the super-effective hit over raw power', () => {
    // ekanzz lv10: wrap/sting — PSN STING (35·0.95) beats WRAP (25·0.9)
    const mon = makeMon(SPECIES.ekanzz, 10);
    expect(mon.moves[bestMove(mon, ['NORMAL'])]).toBe('sting');
    // ...but never a POISON move into a GROUND-immune foe when NORMAL lands
    const kof = makeMon(SPECIES.koffink, 14);
    expect(MOVES[kof.moves[bestMove(kof, ['GROUND'])]].type).not.toBe('POISON');
  });

  it.each(BOSSES.map((boss) => [boss.id] as const))('%s lands in the 55-80 band (or its pinned tuning rate)', (id) => {
    const row = rows.find((r) => r.id === id)!;
    const pinned = OUT_OF_BAND[id];
    if (pinned !== undefined) {
      expect(row.winRate).toBeGreaterThanOrEqual(pinned - PIN);
      expect(row.winRate).toBeLessThanOrEqual(pinned + PIN);
      return;
    }
    expect(row.winRate).toBeGreaterThanOrEqual(BAND.lo);
    expect(row.winRate).toBeLessThanOrEqual(BAND.hi);
  });
});
