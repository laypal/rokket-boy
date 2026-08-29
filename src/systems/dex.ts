// SIDE.4: GRUNTDEX completion. One rule, the STATUS readout's own — the
// SPR.0 line-credit count against the registry size. Derived from what the
// player holds, never persisted; scripts reach it through the
// `{ dexComplete: true }` Cond (quest.ts).
import type { MonSpecies } from '../types';
import { dexCount, dexTotal } from './mon';

/** Complete ⇔ STATUS would read n/n (boss-only species excluded, CH5.0 §5). */
export function dexComplete(mons: { species: string }[], species: Record<string, MonSpecies>): boolean {
  return dexCount(mons, species) === dexTotal(species);
}
