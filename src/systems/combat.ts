// Pure damage math (plan §4.1). RNG is injected so battles are deterministic
// under a seeded generator (plan §4.9).
import type { MoveDef } from '../types';
import { effectiveness, type TypeId } from '../data/typeChart';
import type { Rng } from '../engine/rng';

export interface DamageInput {
  lv: number;
  move: MoveDef;
  atk: number;               // attacker species base atk
  def: number;               // defender species base def
  defTypes: readonly TypeId[];
}

/**
 * dmg = floor( floor(((2·lv/5+2) · power · atk/def)/50 + 2) · typeMult · roll )
 * The roll is 1 − rng()·0.15 → (0.85, 1.0], so max damage lands when rng()=0
 * and the outer floor keeps HP integral. Immune defenders always take 0.
 */
export function damage(input: DamageInput, rng: Rng): number {
  const mult = effectiveness(input.move.type, input.defTypes);
  if (mult === 0) return 0;
  // def floored to 1 (HRD.8): def:0 would divide by zero and leak Infinity
  // into callers' UI (the on-screen float). Data lints forbid def:0 species,
  // but the formula itself must not trust that.
  const base = Math.floor((((2 * input.lv) / 5 + 2) * input.move.power * (input.atk / Math.max(1, input.def))) / 50 + 2);
  const roll = 1 - rng() * 0.15;
  return Math.floor(base * mult * roll);
}

/** Hp a 'drain' move returns to its attacker (QOL.5). Callers only invoke
 *  this for dmg > 0 — an immune hit drains nothing — and clamp the result
 *  to the attacker's max hp. */
export function drainHeal(dmg: number): number {
  return Math.max(1, Math.floor(dmg / 2));
}
