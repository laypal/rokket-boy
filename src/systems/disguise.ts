// CH4.1 — the SAILOR disguise (plan §6 CH4; contract frozen in .paul/PLAN.md
// CH4.0 §3). Pure over quest.flags: no state/world/renderer imports, so it
// unit-tests in Node. The world owns the SELECT toggle, the sighting gate in
// heatTick and the palette swap; this module only answers the questions.
import type { Flags, MapDef } from '../types';

type DisguiseMap = Pick<MapDef, 'disguise'>;

/** The loot window: safe cracked, chief not yet beaten. Guards see straight
 *  through a sailor lugging the captain's takings. */
export function carryingLoot(f: Flags): boolean {
  return f.ch4Safe && !f.ch4Done;
}

/** Does the suit hide the player from a sighting RIGHT NOW? Not while
 *  running (B held) — sailors don't sprint the deck — and not with the loot. */
export function disguiseCovers(f: Flags, running: boolean): boolean {
  return f.disguised && !running && !carryingLoot(f);
}

/** SELECT: flip the suit on/off. Only with the suit owned and only on a map
 *  that declares a disguise palette. Returns whether anything changed so the
 *  caller can play the sfx once. */
export function toggleDisguise(f: Flags, map: DisguiseMap): boolean {
  if (!map.disguise || !f.ch4Suit) return false;
  f.disguised = !f.disguised;
  return true;
}

/** Landing on a map with no disguise declared takes the suit off — no
 *  "change back" chore, and HQ's drill guard can never be fooled by it. */
export function dropDisguise(f: Flags, dest: DisguiseMap): void {
  if (!dest.disguise) f.disguised = false;
}
