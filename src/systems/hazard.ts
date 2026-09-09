// LIVE FLOOR damage (CH7.0 §2) — pure module, no engine imports, so it unit
// tests in Node like heat.ts. The world's step handler calls it when a walk
// step lands on a `z` tile; RUBBER BOOTS in the PACK silence it entirely.
import type { MonInstance } from '../types';

export const BOOTS_ITEM = 'RUBBER BOOTS';
export const SHOCK_DAMAGE = 1;

/** Shock the lead mon (first with hp > 0) for SHOCK_DAMAGE, floored at 1 hp —
 *  a tile never faints anything (the GB poison convention; Lyall, CH7.0
 *  assumption 3). Returns the hp actually lost: 0 with boots on, at 1 hp
 *  already, or with the whole party down. Mutates the instance. */
export function shockLead(party: MonInstance[], hasBoots: boolean): number {
  if (hasBoots) return 0;
  const lead = party.find((m) => m.hp > 0);
  if (!lead) return 0;
  const lost = Math.min(SHOCK_DAMAGE, lead.hp - 1);
  lead.hp -= lost;
  return lost;
}
