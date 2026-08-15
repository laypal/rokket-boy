// Wild encounters (§6 CH2, card CH2.1): pure roll math over MapDef.encounters.
// world.ts consults stepEncounter() when a WALK step completes on a `~` tile;
// warp arrivals never roll (the check lives in the movement branch only, after
// tryWarp), scripts can't move the player, and standing still never re-rolls.
import type { EncounterDef, EncounterTable, MapDef } from '../types';
import { rollInt, type Rng } from '../engine/rng';

/** Tile char that can roll a wild battle (registered walkable in tiles.ts). */
export const ENCOUNTER_TILE = '~';

export interface WildRoll {
  species: string;
  lv: number;
}

/** One roll against a table. Frozen rng order (the seeded-test contract):
 *  miss = exactly 1 call (strict `rng() < rate`); hit = exactly 3 calls —
 *  rate, weighted species pick (strict `r < cumulative`), rollInt level
 *  (inclusive both ends). */
export function rollEncounter(t: EncounterTable, rng: Rng): WildRoll | null {
  if (!(rng() < t.rate)) return null;
  let total = 0;
  for (const e of t.entries) total += e.weight;
  const r = rng() * total;
  let cum = 0;
  let picked = t.entries[t.entries.length - 1];
  for (const e of t.entries) {
    cum += e.weight;
    if (r < cum) {
      picked = e;
      break;
    }
  }
  return { species: picked.species, lv: rollInt(picked.lv[0], picked.lv[1], rng) };
}

// Injectable rng (plan §4.9, same pattern as battle.ts's setBattleRng). Its
// OWN stream on purpose: wild rolls must never consume battleRng — the seeded
// battle snapshots are the determinism gate (same class of rule as
// FX-never-consumes-rng).
let encounterRng: Rng = Math.random;
export function setEncounterRng(rng: Rng): void {
  encounterRng = rng;
}

/** Roll for the map the player just stepped in. No table -> no roll (and the
 *  rng stream is not consulted at all). */
export function stepEncounter(map: MapDef): WildRoll | null {
  return map.encounters ? rollEncounter(map.encounters, encounterRng) : null;
}

/** Trainer-less EncounterDef shell around a roll — battle.ts already speaks
 *  wild (1b): SWIPE throws a ball, LEG IT always works, exits restore the
 *  world with the player on the tile that rolled. winText stays empty; the
 *  wild win path only says it when non-empty. */
export function wildEncounter(roll: WildRoll): EncounterDef {
  return {
    foe: { species: roll.species, lv: roll.lv },
    winText: [],
    onWin: [],
    onLose: [],
    onFlee: [],
  };
}
