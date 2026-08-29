// Pure mon-instance logic: XP curve, HP scaling, instance factory, level-ups
// and move learning (plan §4.1). No data imports — callers pass MonSpecies.
import type { MonInstance, MonSpecies, MoveId } from '../types';

export const LEVEL_CAP = 50;

export interface LevelUpEvent {
  lv: number;
  learned: MoveId[]; // auto-learned (mon had a free slot)
  offered: MoveId[]; // needs a replace prompt (mon already knows 4) — UI is 1b
  evolvesTo?: string; // species id — carried on EVERY level ≥ the threshold,
  // EXCEPT for a mon whose player confirmed a refusal (UX2.4: mon.noEvolve).
  // Refusal is permanent; before UX2.4 a cancelled evolution re-offered free.
}

/** Medium-fast curve: total xp required to BE level lv. */
export function xpForLevel(lv: number): number {
  return lv * lv * lv;
}

/** Inverse of the curve, clamped to [1, LEVEL_CAP]. */
export function levelForXp(xp: number): number {
  // epsilon guards cbrt precision at exact cubes (e.g. cbrt(125000) ≈ 49.999…)
  const lv = Math.floor(Math.cbrt(Math.max(0, xp)) + 1e-9);
  return Math.min(LEVEL_CAP, Math.max(1, lv));
}

/** UX2.1/MNU.1: fraction of the way from the current level's total-xp floor
 *  to the next level's. Fresh level → 0, one-below-next → ~1; clamped to
 *  [0, 1]. At LEVEL_CAP the bar reads full — a maxed mon shows 1. */
export function xpProgress(mon: { lv: number; xp: number }): number {
  if (mon.lv >= LEVEL_CAP) return 1;
  const base = xpForLevel(mon.lv);
  const next = xpForLevel(mon.lv + 1);
  return Math.min(1, Math.max(0, (mon.xp - base) / (next - base)));
}

export interface XpFillSeg {
  from: number;
  to: number;
}

/** UX2.1: the fill journey a gain takes across the xp bar — each crossed
 *  level contributes a fill-to-1 segment (the flash point), then the bar
 *  restarts at 0; the final segment lands on the new progress. Derived
 *  entirely from xpForLevel, so the drawn journey IS the awarded xp. */
export function xpFillSegs(fromLv: number, fromXp: number, toLv: number, toXp: number): XpFillSeg[] {
  const segs: XpFillSeg[] = [];
  for (let lv = fromLv; lv < toLv; lv++) {
    segs.push({ from: xpProgress({ lv, xp: lv === fromLv ? fromXp : xpForLevel(lv) }), to: 1 });
  }
  segs.push({ from: segs.length ? 0 : xpProgress({ lv: fromLv, xp: fromXp }), to: xpProgress({ lv: toLv, xp: toXp }) });
  return segs;
}

/** Gen-1-flavored HP scaling; the only stat that grows with level. */
export function maxHp(species: MonSpecies, lv: number): number {
  return Math.floor((2 * species.baseHp * lv) / 100) + lv + 10;
}

export type HpBand = 'ok' | 'hurt';

/** FLW.2: which colour band an hp readout belongs to. The threshold is the
 *  battle HP bar's own `cur / max > 0.5` split (`battleDraw.ts:44`) — the
 *  player has already learned where that line sits, so the menus use it too
 *  rather than inventing a second one. 'hurt' draws in the palette's ALERT
 *  slot (`palettes.ts`, index 4). Fainted is NOT a band: that branch is
 *  older than this helper and keeps its own pal[2] colour. */
export function hpBand(hp: number, max: number): HpBand {
  return hp / max > 0.5 ? 'ok' : 'hurt';
}

/** The (up to 4) most recently learnable moves at a level. */
export function movesAtLevel(species: MonSpecies, lv: number): MoveId[] {
  return species.moves.filter((m) => m.lv <= lv).slice(-4).map((m) => m.move);
}

/** GRUNTDEX count (§4.7): unique species across owned mons (party + box),
 *  each crediting its whole line back to the base form — an evolved mon
 *  proves the player held its pre-evolutions, so evolving never drops the
 *  count. Derived, never persisted — recomputed from what the player holds.
 *  Assumes lines are linear (no two species evolve into the same target). */
export function dexCount(mons: { species: string }[], species: Record<string, MonSpecies>): number {
  const preOf = new Map<string, string>(); // child id -> its pre-evolution's id
  for (const sp of Object.values(species)) {
    if (sp.evolvesTo) preOf.set(sp.evolvesTo.id, sp.id);
  }
  const seen = new Set<string>();
  for (const m of mons) {
    let id: string | undefined = m.species;
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      id = preOf.get(id); // multi-hop walk; seen-guard doubles as cycle brake
    }
  }
  return seen.size;
}

/** CH5.0 §5: the dex denominator — the registry minus boss-only species
 *  (MAROWL; MYOOTOO-0 later), which no ball can ever hold. Both readers
 *  (STATUS `DEX n/n`, the `dexComplete` Cond) divide by this, never by the
 *  raw key count. */
export function dexTotal(species: Record<string, MonSpecies>): number {
  return Object.values(species).filter((s) => !s.bossOnly).length;
}

/**
 * Apply an evolution in place (SPR.0). Hp carries by the max-hp delta (the
 * damage-kept policy level-ups use), clamped to [1, new max]. Moves are NOT
 * rewritten — the new species' learnset applies to future level-ups only
 * (GB behaviour). lv/xp/nick/status untouched.
 */
export function evolveMon(mon: MonInstance, from: MonSpecies, to: MonSpecies): void {
  const cap = maxHp(to, mon.lv);
  mon.species = to.id;
  mon.hp = Math.min(cap, Math.max(1, mon.hp + cap - maxHp(from, mon.lv)));
}

export function makeMon(species: MonSpecies, lv: number): MonInstance {
  const l = Math.min(LEVEL_CAP, Math.max(1, Math.floor(lv)));
  return {
    species: species.id,
    lv: l,
    hp: maxHp(species, l),
    xp: xpForLevel(l),
    moves: movesAtLevel(species, l),
  };
}

/**
 * Add xp, applying every level-up it pays for. Mutates the instance (any
 * level gained FULL-HEALS — the UX2.1-FB rule, Lyall 2026-08-09: the
 * level-up moment is the reward beat; free move slots fill automatically).
 * Returns one event per level gained so the UI can announce/prompt.
 */
export function gainXp(mon: MonInstance, species: MonSpecies, amount: number): LevelUpEvent[] {
  const events: LevelUpEvent[] = [];
  mon.xp = Math.min(xpForLevel(LEVEL_CAP), mon.xp + amount);
  const target = levelForXp(mon.xp);
  while (mon.lv < target) {
    mon.lv += 1;
    mon.hp = maxHp(species, mon.lv);
    const ev: LevelUpEvent = { lv: mon.lv, learned: [], offered: [] };
    if (species.evolvesTo && mon.lv >= species.evolvesTo.lv && !mon.noEvolve) ev.evolvesTo = species.evolvesTo.id;
    for (const { lv, move } of species.moves) {
      if (lv !== mon.lv || mon.moves.includes(move)) continue;
      if (mon.moves.length < 4) {
        mon.moves.push(move);
        ev.learned.push(move);
      } else {
        ev.offered.push(move);
      }
    }
    events.push(ev);
  }
  return events;
}
