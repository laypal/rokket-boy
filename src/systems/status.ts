// F43 STA.0/1 — status effects as a mechanic (PSN / PAR / SLP). Pure and
// engine-free: rng is injected (plan §4.9) so seeded battle tests stay
// deterministic, and every rng() call here happens ONLY when a status is
// actually in play — a fight with no statused mon and no status move rolls
// exactly as it did before this module existed (the battle.ts hard rule).
// Contract: .paul/PLAN.md §2 (2026-09-09).
import type { MonInstance, MoveDef, StatusId } from '../types';
import { rollInt, type Rng } from '../engine/rng';

/** Hp a PSN mon loses at the end of each of its actions, as a fraction of max (min 1). */
export const POISON_FRAC = 1 / 8;
/** Chance a PAR mon loses its action. No speed half — nothing reads spd in a fight (PLAN A5). */
export const PAR_SKIP = 0.25;
/** SLP lasts 1..3 of the sleeper's actions, rolled at infliction. */
export const SLEEP_MIN = 1;
export const SLEEP_MAX = 3;
/** catchChance's statusMod (catch.ts): a sleeper is twice as easy, the rest ×1.5. */
export const STATUS_CATCH_MOD: Record<StatusId, number> = { SLP: 2, PAR: 1.5, PSN: 1.5 };

export function statusCatchMod(s: StatusId | undefined): number {
  return s ? STATUS_CATCH_MOD[s] : 1;
}

/** Roll `mv.status` on a hit that landed. False when the move has none, the
 *  target already carries a status, or the roll misses. Consumes rng only
 *  when a roll is made (chance < 1), plus one rollInt for a SLP duration. */
export function tryInflict(mon: MonInstance, mv: MoveDef, rng: Rng): boolean {
  const st = mv.status;
  if (!st || mon.status) return false;
  if (st.chance < 1 && rng() >= st.chance) return false;
  mon.status = st.id;
  if (st.id === 'SLP') mon.sleepT = rollInt(SLEEP_MIN, SLEEP_MAX, rng);
  return true;
}

/** Damage a PSN mon takes at the end of its action; 0 for any other state. */
export function poisonDamage(mon: MonInstance, max: number): number {
  return mon.status === 'PSN' ? Math.max(1, Math.floor(max * POISON_FRAC)) : 0;
}

/** Start-of-action gate. 'act' → proceed. 'skip' → the action is lost (a
 *  PAR roll under PAR_SKIP, or SLP with turns still left after this one).
 *  'wake' → the last SLP turn just elapsed: status cleared, action still
 *  lost. Consumes rng only for PAR. */
export function beforeAction(mon: MonInstance, rng: Rng): 'act' | 'skip' | 'wake' {
  if (mon.status === 'SLP') {
    mon.sleepT = Math.max(0, (mon.sleepT ?? 1) - 1);
    if (mon.sleepT > 0) return 'skip';
    mon.status = undefined;
    mon.sleepT = undefined;
    return 'wake';
  }
  if (mon.status === 'PAR' && rng() < PAR_SKIP) return 'skip';
  return 'act';
}

/** Battle-box lines (≤3 × 17 glyphs with any ≤10-glyph name — pinned by
 *  tests/status.test.ts against every species name, a 10-char nick, and a
 *  "Wild "/"Enemy " prefixed foe label). The name goes ALONE on line 1 so a
 *  prefixed foe label ("Enemy VOLTORBB") fits without wrapping mid-word. */
export const STATUS_LINES = {
  inflict: {
    PSN: (name: string): string[] => [name, 'was poisoned!'],
    PAR: (name: string): string[] => [name, 'was paralysed!'],
    SLP: (name: string): string[] => [name, 'fell asleep!'],
  } as Record<StatusId, (name: string) => string[]>,
  skip: {
    PAR: (name: string): string[] => [name, 'is paralysed!', "It can't move!"],
    SLP: (name: string): string[] => [name, 'is fast asleep!'],
  } as Record<'PAR' | 'SLP', (name: string) => string[]>,
  wake: (name: string): string[] => [name, 'woke up!'],
  poison: (name: string): string[] => [name, 'hurt by poison!'],
};
