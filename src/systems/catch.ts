// Pure SWIPE catch-roll math (plan §4.4). RNG is injected so catch attempts
// are deterministic under a seeded generator (plan §4.9).
import type { Rng } from '../engine/rng';

/**
 * p = catchRate * (1 - (hp/max) * 0.7) * ballMod, clamped to [0, 1].
 * Full HP leaves the term at 0.3 of catchRate; zero HP collapses it to 1
 * (p equals catchRate). Extreme inputs/ballMod are clamped rather than
 * allowed to go negative or above certain capture.
 */
export function catchChance(catchRate: number, hp: number, max: number, ballMod = 1): number {
  const p = catchRate * (1 - (hp / max) * 0.7) * ballMod;
  return Math.min(1, Math.max(0, p));
}

/** True when the roll lands under p — the ball catches the mon. */
export function rollCatch(p: number, rng: Rng): boolean {
  return rng() < p;
}
