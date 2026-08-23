// Pure resolvers shared by the QA.6 (`levelTo`) and QA.8 (`skipIntro`/`setHp`)
// __debug hooks (src/main.ts) — kept out of main.ts so they're unit-testable
// without the engine. No engine imports: callers pass the party/values in.
import { xpForLevel, LEVEL_CAP } from './mon';
import type { MonInstance } from '../types';

/** Find a party instance by slot index (number) or species id (string, first
 *  match). Returns undefined on a miss — callers log and no-op. */
export function findPartyMon(party: MonInstance[], key: string | number): MonInstance | undefined {
  if (typeof key === 'number') return party[key];
  return party.find((m) => m.species === key);
}

/** QA.6: total xp one hp short of `lv`'s floor, clamped to [2, LEVEL_CAP] —
 *  so the NEXT battle win's gainXp crosses the boundary and fires the real
 *  level-up pipeline instead of landing already on it. */
export function xpToReach(lv: number): number {
  const clamped = Math.min(LEVEL_CAP, Math.max(2, lv));
  return xpForLevel(clamped) - 1;
}

/** QA.8: `arg < 1` reads as a fraction of `max` (so 0.25 = a quarter);
 *  `arg >= 1` reads as an absolute hp value (so 1 = 1 hp, not full — a
 *  fractional 1.0 is indistinguishable from the absolute value 1 and loses
 *  to it; callers wanting full pass `max` itself). Always clamped [0, max]. */
export function hpFromArg(max: number, arg: number): number {
  const raw = arg < 1 ? Math.round(max * arg) : arg;
  return Math.min(max, Math.max(0, raw));
}
