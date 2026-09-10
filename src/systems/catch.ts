// Pure SWIPE catch-roll math (plan §4.4). RNG is injected so catch attempts
// are deterministic under a seeded generator (plan §4.9).
import type { Rng } from '../engine/rng';

/** The "red bar" — hp at or under a third of max (the same line the ONB.5
 *  lowHp coaching beat uses). Lyall (2026-09-09, VOLTRAWK at 14/60 with
 *  three PRO BALLs and nothing to show): a catch has to get MUCH likelier
 *  once the bar is red, not 3.3× across the whole range. */
export const RED_BAR = 1 / 3;
export const RED_BAR_MOD = 2;

/**
 * p = catchRate * (1 - (hp/max) * 0.7) * ballMod, ×RED_BAR_MOD when the hp
 * bar is red (hp/max ≤ RED_BAR), clamped to [0, 1]. Full HP leaves the hp
 * term at 0.3 of catchRate; zero HP collapses it to 1, so p = 2·catchRate
 * with a plain ball. Extreme inputs/ballMod are clamped rather than allowed
 * to go negative or above certain capture.
 */
export function catchChance(catchRate: number, hp: number, max: number, ballMod = 1, statusMod = 1): number {
  const red = hp / max <= RED_BAR ? RED_BAR_MOD : 1;
  // F43 STA.0: statusMod is systems/status.ts statusCatchMod(foe.status) —
  // SLP ×2, PAR/PSN ×1.5, 1 when healthy. Same clamp, one more factor.
  const p = catchRate * (1 - (hp / max) * 0.7) * ballMod * red * statusMod;
  return Math.min(1, Math.max(0, p));
}

/** True when the roll lands under p — the ball catches the mon. */
export function rollCatch(p: number, rng: Rng): boolean {
  return rng() < p;
}
